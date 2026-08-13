(() => {
  'use strict';
  const API = 'https://cementownia-admin.onrender.com';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names = {
    assigned:'Oczekuje na zgodę administratora',
    issued:'Gotowy do rozpoczęcia',
    in_transit:'W drodze',
    closed:'Na miejscu',
    delivered:'WZ podpisane',
    returned:'Powrót do bazy',
    problem:'Problem'
  };
  const token = () => localStorage.getItem('betonDriverToken') || '';
  const setMessage = (text) => { $('loginMsg').textContent = text; };

  async function api(path, options = {}) {
    const headers = {Authorization:`Bearer ${token()}`, ...(options.headers || {})};
    if (!(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(API + path, {...options, headers});
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        localStorage.removeItem('betonDriverToken');
        $('app').classList.add('hidden');
        $('login').classList.remove('hidden');
        setMessage('Sesja wygasła lub została unieważniona. Zaloguj się ponownie.');
      }
      throw Error(data.error || `Błąd połączenia HTTP ${response.status}.`);
    }
    return response;
  }

  async function signIn() {
    const username = $('loginName').value.trim();
    const password = $('password').value;
    if (!username) return setMessage('Wpisz login.');
    if (!password) return setMessage('Wpisz hasło.');
    $('loginButton').disabled = true;
    setMessage('Łączenie z panelem administracyjnym…');
    try {
      const response = await fetch(API + '/api/driver/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token) throw Error(data.error || `Logowanie odrzucone (HTTP ${response.status}).`);
      localStorage.setItem('betonDriverToken', data.access_token);
      $('login').classList.add('hidden');
      $('app').classList.remove('hidden');
      await load();
    } catch (error) {
      const isNetwork = error instanceof TypeError || /Failed to fetch|NetworkError/i.test(String(error.message || ''));
      setMessage(isNetwork ? 'Brak połączenia z Render. Sprawdź, czy usługa Render działa. [DRIVER-NETWORK]' : error.message);
    } finally {
      $('loginButton').disabled = false;
    }
  }

  function nextAction(x) {
    if (x.status === 'issued' && x.can_start) return ['in_transit', 'Rozpocznij dostawę'];
    if (x.status === 'in_transit') return ['closed', 'Jestem na miejscu'];
    if (x.status === 'closed') return ['delivered', 'Podpisz WZ'];
    if (x.status === 'delivered') return ['returned', 'Zakończ dostawę / wracam'];
    return null;
  }

  function card(x) {
    const action = nextAction(x);
    const departure = x.planned_departure_time ? `Wyjazd: ${x.planned_departure_time}` : 'Wyjazd: nie ustalono';
    const date = x.planned_date ? ` · ${x.planned_date}` : '';
    const destination = String(x.destination || '').trim();
    const mapsUrl = destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving` : '';
    const signedWzPhoto = x.status === 'delivered' ? `<div class="actions" style="margin-top:10px"><input id="photo-${x.id}" type="file" accept="image/*" capture="environment" style="display:none"><button id="camera-${x.id}" class="btn" data-action="camera" data-id="${x.id}">${x.has_signed_wz_photo ? 'Zrób ponownie' : 'Zrób zdjęcie podpisanego WZ'}</button></div>` : '';
    const completed = x.status === 'returned' ? '<div class="muted" style="margin-top:14px;font-weight:700;color:#18804b">Dostawa zakończona.</div>' : '';
    const waiting = !action && (x.status === 'assigned' || (x.status === 'issued' && !x.can_start)) ? '<div class="muted" style="margin-top:14px;font-weight:700">Oczekuje na zgodę administratora na rozpoczęcie.</div>' : '';
    const mapsButton = mapsUrl && x.status !== 'returned' ? `<a class="btn" href="${esc(mapsUrl)}" target="_blank" rel="noopener">Otwórz trasę w Google Maps</a>` : '';
    return `<article class="card"><div><b>${esc(x.transport_no)}</b> <span class="badge">${esc(names[x.status] || x.status)}</span></div><h3>${esc(x.customer_name)}</h3><div class="muted">WZ: ${esc(x.wz_no || '—')} · ${esc(x.destination || 'Brak adresu')} · ${esc(x.registration_no || '')}</div><div class="muted" style="margin-top:8px"><b>${esc(departure)}</b>${esc(date)}</div><div class="actions">${mapsButton}${action ? `<button class="btn primary" data-action="status" data-id="${x.id}" data-status="${action[0]}">${action[1]}</button>` : ''}</div>${waiting}${signedWzPhoto}${completed}</article>`;
  }

  async function load() {
    $('list').innerHTML = '<div class="card">Ładowanie transportów…</div>';
    try {
      const data = await (await api('/api/driver/transports')).json();
      $('list').innerHTML = data.transports?.length ? data.transports.map(card).join('') : '<div class="card">Brak przypisanych transportów.</div>';
    } catch (error) {
      $('list').innerHTML = `<div class="card error">${esc(error.message)}</div>`;
    }
  }

  async function uploadSignedWzPhoto(transportId) {
    const photo = $(`photo-${transportId}`)?.files?.[0];
    if (!photo) return;
    const form = new FormData();
    form.append('photo', photo);
    await api(`/api/driver/transports/${transportId}/photos`, {method:'POST', body:form});
    const cameraButton = $(`camera-${transportId}`);
    if (cameraButton) cameraButton.textContent = 'Zrób ponownie';
    alert('Zdjęcie podpisanego WZ zostało zapisane.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('loginButton').addEventListener('click', signIn);
    $('logoutButton').addEventListener('click', () => { localStorage.removeItem('betonDriverToken'); location.reload(); });
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      try {
        if (button.dataset.action === 'status') {
          await api(`/api/driver/transports/${button.dataset.id}/status`, {method:'POST', body:JSON.stringify({status:button.dataset.status})});
          await load();
        }
        if (button.dataset.action === 'camera') $(`photo-${button.dataset.id}`)?.click();
      } catch (error) {
        alert(error.message);
      }
    });
    document.addEventListener('change', async (event) => {
      if (!event.target.matches('input[id^="photo-"]') || !event.target.files?.length) return;
      try {
        await uploadSignedWzPhoto(event.target.id.replace('photo-', ''));
      } catch (error) {
        alert(error.message);
      }
    });
    if (token()) {
      $('login').classList.add('hidden');
      $('app').classList.remove('hidden');
      load();
    }
  });
})();
