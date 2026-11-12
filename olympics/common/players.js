// Foxino Olympics players: several children can play on one phone or one classroom board, and each keeps their own
// progress (Sprint stages, medals, best times; Streetball wins). Everything is in localStorage under 'olympics-players':
//   { current: id, list: [{ id, name, fur }], data: { [id]: { sprint: {...}, ball: {...}, level, packs } } }
// mountProfile(button, onChange) turns a button into the player chip that opens the "Who is playing?" sheet.
const KEY = 'olympics-players';
const FURS = ['foxino', 'blaze', 'frost', 'shadow', 'rosa'];
const FUR_CSS = { foxino: '#8f52d9', blaze: '#d8452b', frost: '#7fb0e0', shadow: '#4a4a5e', rosa: '#f28fb8' };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  if (!s || !Array.isArray(s.list) || !s.list.length) s = { current: 'p1', list: [{ id: 'p1', name: 'Player 1', fur: 'foxino' }], data: {} };
  s.data = s.data || {};
  if (!s.list.some((p) => p.id === s.current)) s.current = s.list[0].id;
  return s;
}
let S = load();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: progress lasts this visit */ } }
// another tab (the Olympics hub and a game) may change the players
addEventListener('storage', (e) => { if (e.key === KEY) S = load(); });

export const Players = {
  list: () => S.list.slice(),
  current: () => S.list.find((p) => p.id === S.current),
  select(id) { if (S.list.some((p) => p.id === id)) { S.current = id; persist(); } },
  add(name) {
    name = String(name || '').trim().slice(0, 16) || `Player ${S.list.length + 1}`;
    const id = 'p' + Date.now().toString(36);
    S.list.push({ id, name, fur: FURS[S.list.length % FURS.length] });
    S.current = id; persist(); return id;
  },
  rename(id, name) { const p = S.list.find((x) => x.id === id); if (p && String(name).trim()) { p.name = String(name).trim().slice(0, 16); persist(); } },
  remove(id) {
    if (S.list.length < 2) return;
    S.list = S.list.filter((p) => p.id !== id); delete S.data[id];
    if (S.current === id) S.current = S.list[0].id;
    persist();
  },
  // this player's saved object for one game (created on first use); call Players.save() after changing it
  data(game) { const d = (S.data[S.current] = S.data[S.current] || {}); return (d[game] = d[game] || {}); },
  prefs() { return (S.data[S.current] = S.data[S.current] || {}); },
  save: persist,
  furCss: (p) => FUR_CSS[(p || Players.current()).fur] || FUR_CSS.foxino,
};

// a tiny fox face (SVG) in the player's colour
export function foxFace(color) {
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 4l9 9h10l9-9-1 17c0 9-6 15-13 15S7 30 7 21z" fill="${color}"/><path d="M11 22c3 0 5 2 9 2s6-2 9-2c0 7-4 11-9 11s-9-4-9-11z" fill="#fff1df"/><circle cx="15" cy="19" r="2.6" fill="#1a1a2a"/><circle cx="25" cy="19" r="2.6" fill="#1a1a2a"/><ellipse cx="20" cy="26" rx="2.4" ry="1.7" fill="#3d1d1c"/></svg>`;
}

// the chip + the sheet
export function mountProfile(btn, onChange = () => {}) {
  const paint = () => {
    const p = Players.current();
    btn.innerHTML = `<span class="pf-face">${foxFace(Players.furCss(p))}</span><span class="pf-name">${esc(p.name)}</span>`;
    btn.setAttribute('aria-label', `Player: ${p.name}. Change player`);
  };
  paint();
  let sheet = null;
  function close() { if (sheet) { sheet.remove(); sheet = null; } }
  function open() {
    close();
    sheet = document.createElement('div');
    sheet.className = 'pf-sheet';
    sheet.innerHTML = `<div class="pf-box" role="dialog" aria-label="Who is playing?">
      <h3>Who is playing?</h3>
      <p class="pf-sub">Every player keeps their own progress on this device.</p>
      <div class="pf-list"></div>
      <form class="pf-new"><input maxlength="16" placeholder="New player's name" aria-label="New player's name"><button type="submit">ADD</button></form>
      <button type="button" class="pf-done">DONE</button></div>`;
    document.body.appendChild(sheet);
    const list = sheet.querySelector('.pf-list');
    const draw = () => {
      list.innerHTML = Players.list().map((p) => `<div class="pf-row${p.id === Players.current().id ? ' on' : ''}">
        <button type="button" class="pf-pick" data-id="${p.id}"><span class="pf-face">${foxFace(Players.furCss(p))}</span><b>${esc(p.name)}</b></button>
        ${Players.list().length > 1 ? `<button type="button" class="pf-del" data-del="${p.id}" aria-label="Remove ${esc(p.name)}">✕</button>` : ''}</div>`).join('');
    };
    draw();
    list.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-id]'), del = e.target.closest('[data-del]');
      if (pick) { Players.select(pick.dataset.id); draw(); paint(); onChange(); }
      if (del) {
        const p = Players.list().find((x) => x.id === del.dataset.del);
        if (p && confirm(`Remove ${p.name} and their progress?`)) { Players.remove(p.id); draw(); paint(); onChange(); }
      }
    });
    sheet.querySelector('.pf-new').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = sheet.querySelector('.pf-new input');
      if (!inp.value.trim()) { inp.focus(); return; }
      Players.add(inp.value); inp.value = ''; draw(); paint(); onChange();
    });
    sheet.querySelector('.pf-done').addEventListener('click', close);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  }
  btn.addEventListener('click', open);
  return { paint, open, close };
}
