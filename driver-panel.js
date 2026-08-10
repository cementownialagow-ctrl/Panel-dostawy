(() => {
  'use strict';
  const API = 'https://cementownia-admin.onrender.com';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names = {assigned:'Przypisany',issued:'Towar wydany',in_transit:'W drodze',delivered:'Dostarczony',returned:'Powrót',closed:'Zamknięty',problem:'Problem'};
  const next = {assigned:['issued','Potwierdź wydanie'],issued:['in_transit','Potwierdź wyjazd'],in_transit:['delivered','Potwierdź dostawę'],delivered:['returned','Potwierdź powrót']};
  const token = () => localStorage.getItem('betonDriverToken') || '';
  const setMessage = (text) => { $('loginMsg').textContent = text; };
  async function api(path, options = {}) {
    const headers = {Authorization:`Bearer ${token()}`, ...(options.headers || {})};
    if (!(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(API + path, {...options, headers});
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
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
      $('login').classList.add('hidden'); $('app').classList.remove('hidden');
      await load();
    } catch (error) {
      const isNetwork = error instanceof TypeError || /Failed to fetch|NetworkError/i.test(String(error.message || ''));
      setMessage(isNetwork ? 'Brak połączenia z Render. Sprawdź, czy usługa Render działa. [DRIVER-NETWORK]' : error.message);
    } finally { $('loginButton').disabled = false; }
  }
  function card(x) {
    const action = next[x.status];
    return `<article class="card"><div><b>${esc(x.transport_no)}</b> <span class="badge">${esc(names[x.status] || x.status)}</span></div><h3>${esc(x.customer_name)}</h3><div class="muted">WZ: ${esc(x.wz_no || '—')} · ${esc(x.destination || 'Brak adresu')} · ${esc(x.registration_no || '')}</div><div class="actions">${x.invoice_id ? `<button class="btn" data-action="invoice" data-id="${x.id}">Pobierz fakturę</button>` : ''}${action ? `<button class="btn primary" data-action="status" data-id="${x.id}" data-status="${action[0]}">${action[1]}</button>` : ''}</div></article>`;
  }
  async function load() {
    $('list').innerHTML = '<div class="card">Ładowanie transportów…</div>';
    try {
      const data = await (await api('/api/driver/transports')).json();
      $('list').innerHTML = data.transports?.length ? data.transports.map(card).join('') : '<div class="card">Brak przypisanych transportów.</div>';
    } catch (error) { $('list').innerHTML = `<div class="card error">${esc(error.message)}</div>`; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('loginButton').addEventListener('click', signIn);
    $('logoutButton').addEventListener('click', () => { localStorage.removeItem('betonDriverToken'); location.reload(); });
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]'); if (!button) return;
      try {
        if (button.dataset.action === 'invoice') { const r = await api(`/api/driver/transports/${button.dataset.id}/invoice`); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'faktura.pdf'; a.click(); }
        if (button.dataset.action === 'status') { await api(`/api/driver/transports/${button.dataset.id}/status`, {method:'POST', body:JSON.stringify({status:button.dataset.status})}); await load(); }
      } catch (error) { alert(error.message); }
    });
    if (token()) { $('login').classList.add('hidden'); $('app').classList.remove('hidden'); load(); }
  });
})();
