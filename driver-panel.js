(() => {
  'use strict';
  const API = 'https://cementownia-admin.onrender.com';
  const RETURN_DESTINATION = 'Beton Łagów, ul. Opatowska 21a, 26-025 Łagów';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names = {
    assigned:'Oczekuje na zgodę administratora',
    issued:'Gotowy do rozpoczęcia',
    in_transit:'W drodze',
    closed:'Na miejscu',
    delivered:'WZ podpisane',
    returning:'Wracam do bazy',
    returned:'Powrót potwierdzony',
    problem:'Problem'
  };
  const token = () => localStorage.getItem('betonDriverToken') || '';
  let transports = [];
  let selectedId = null;
  const setMessage = (text) => { $('loginMsg').textContent = text; };

  function stageIcon(status, mirrored = false) {
    const flip = mirrored ? ' style="transform:scaleX(-1)"' : '';
    if (status === 'closed') return '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4"><path d="M32 57s17-16 17-32a17 17 0 1 0-34 0c0 16 17 32 17 32Z"/><circle cx="32" cy="25" r="6"/><path d="M22 46h20"/></svg>';
    if (status === 'delivered') return '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4"><path d="M15 8h28l8 8v40H15Z"/><path d="M43 8v10h10M23 29h20M23 38h13"/><path d="m35 50 15-15 5 5-15 15-7 2Z"/></svg>';
    return `<svg viewBox="0 0 72 64" fill="none" stroke="currentColor" stroke-width="4"${flip}><path d="M5 18h15M2 28h16M8 38h10"/><path d="M20 18h29v25H20Z"/><path d="m49 26 9 2 8 10v5H49Z"/><circle cx="31" cy="47" r="6"/><circle cx="58" cy="47" r="6"/><circle cx="35" cy="30" r="9"/><path d="m29 24 12 12M41 24 29 36"/></svg>`;
  }

  function actionIcon(nextStatus) {
    if (nextStatus === 'closed') return stageIcon('in_transit');
    if (nextStatus === 'delivered') return stageIcon('delivered');
    if (nextStatus === 'returning' || nextStatus === 'returned') return stageIcon('returning', true);
    return stageIcon('in_transit');
  }

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
    if (x.status === 'in_transit' && !x.wait_seconds) return ['closed', 'Jestem na miejscu'];
    if (x.status === 'closed') return ['delivered', 'Podpisz WZ'];
    if (x.status === 'delivered') return ['returning', 'Wracam do bazy'];
    if (x.status === 'returning' && !x.wait_seconds) return ['returned', 'Potwierdź powrót'];
    return null;
  }

  function listCard(x) {
    const departure = x.planned_departure_time ? x.planned_departure_time : 'bez godziny';
    return `<article class="card delivery-row" data-action="open" data-id="${x.id}"><b>${esc(departure)} · ${esc(x.customer_name)}</b> <span class="badge">${esc(names[x.status] || x.status)}</span><div class="muted" style="margin-top:8px">${esc(x.transport_no)} · WZ ${esc(x.wz_no || '—')} · ${esc(x.registration_no || '')}</div></article>`;
  }

  function detailCard(x) {
    const action = nextAction(x);
    const departure = x.planned_departure_time ? `Wyjazd: ${x.planned_departure_time}` : 'Wyjazd: nie ustalono';
    const date = x.planned_date ? ` · ${x.planned_date}` : '';
    const isReturning = x.status === 'returning';
    const destination = isReturning ? RETURN_DESTINATION : String(x.destination || '').trim();
    const mapsUrl = destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving` : '';
    const signedWzPhoto = x.status === 'delivered' ? `<div class="actions" style="margin-top:10px"><input id="photo-${x.id}" type="file" accept="image/*" capture="environment" style="display:none"><button id="camera-${x.id}" class="btn" data-action="camera" data-id="${x.id}">${x.has_signed_wz_photo ? 'Zrób ponownie' : 'Zrób zdjęcie podpisanego WZ'}</button></div>` : '';
    const completed = x.status === 'returned' ? '<div class="muted" style="margin-top:14px;font-weight:700;color:#18804b">Dostawa zakończona.</div>' : '';
    const waiting = !action && (x.status === 'assigned' || (x.status === 'issued' && !x.can_start)) ? '<div class="muted" style="margin-top:14px;font-weight:700">Oczekuje na zgodę administratora na rozpoczęcie.</div>' : '';
    const timedWaiting = !action && x.wait_seconds ? `<div class="muted" style="margin-top:14px;font-weight:700">Następny etap będzie dostępny za około ${Math.max(1, Math.ceil(x.wait_seconds / 60))} min.</div>` : '';
    const mapsButton = mapsUrl && x.status !== 'returned' ? `<a class="btn" href="${esc(mapsUrl)}" target="_blank" rel="noopener">${isReturning ? 'Trasa powrotna do Beton Łagów' : 'Otwórz trasę w Google Maps'}</a>` : '';
    return `<article class="card"><div><b>${esc(x.transport_no)}</b> <span class="badge">${esc(names[x.status] || x.status)}</span></div><h2>${esc(x.customer_name)}</h2><div>WZ: <b>${esc(x.wz_no || '—')}</b></div><div style="margin-top:8px">Adres: <b>${esc(x.destination || 'Brak adresu')}</b></div><div style="margin-top:8px">Auto: <b>${esc(x.registration_no || '—')}</b></div><div class="muted" style="margin-top:12px"><b>${esc(departure)}</b>${esc(date)}</div><div class="stage-visual" aria-hidden="true">${stageIcon(x.status, x.status === 'returning' || x.status === 'returned')}</div><div class="actions">${mapsButton}${action ? `<button class="btn primary btn-icon" data-action="status" data-id="${x.id}" data-status="${action[0]}">${actionIcon(action[0])}<span>${action[1]}</span></button>` : ''}</div>${waiting}${timedWaiting}${signedWzPhoto}${completed}</article>`;
  }

  function showList() {
    selectedId = null;
    $('detail').classList.add('hidden');
    $('list').innerHTML = transports.length ? transports.map(listCard).join('') : '<div class="card">Brak niezakończonych dostaw na dzisiaj.</div>';
  }

  function showDetail(id) {
    const x = transports.find((item) => String(item.id) === String(id));
    if (!x) return showList();
    selectedId = x.id;
    $('detailContent').innerHTML = detailCard(x);
    $('detail').classList.remove('hidden');
  }

  async function load() {
    $('list').innerHTML = '<div class="card">Ładowanie transportów…</div>';
    try {
      const data = await (await api('/api/driver/transports')).json();
      transports = data.transports || [];
      if (selectedId && transports.some((x) => String(x.id) === String(selectedId))) showDetail(selectedId);
      else showList();
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
        if (button.dataset.action === 'open') showDetail(button.dataset.id);
        if (button.dataset.action === 'back') showList();
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
