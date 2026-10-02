'use strict';

const PAPER = ['#ffe27a', '#ffb7c8', '#a9e8c8', '#a8d6ff', '#d7c0ff', '#ffc9a3'];
const $ = (s) => document.querySelector(s);
const stage = $('#stage'), pill = $('#pill'), deck = $('#deck'), sheet = $('#sheet');

let notes = [], openId = null, ignoring = true;
let closeTimer = null, saveTimer = null, hideTimer = null;

const uid = () => Math.random().toString(36).slice(2, 9);
const newItem = () => ({ id: uid(), text: '', done: false });
const find = (id) => notes.find((n) => n.id === id);
const stats = (n) => {
  const real = n.items.filter((i) => i.text.trim());
  return { total: real.length, done: real.filter((i) => i.done).length };
};

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  el.append(...kids.filter((k) => k != null && k !== false));
  return el;
}

/* ---------- persistence ---------- */
const flush = () => { clearTimeout(saveTimer); api.save(notes); };
const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); };

/* ---------- click-through: only the widget itself catches the mouse ---------- */
function setIgnore(v) { if (v !== ignoring) { ignoring = v; api.ignore(v); } }
function cancelClose() { clearTimeout(closeTimer); closeTimer = null; }
function scheduleClose(ms) {
  if (closeTimer) return;
  closeTimer = setTimeout(() => { closeTimer = null; if (!openId) closeAll(); }, ms);
}

document.addEventListener('mousemove', (e) => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const hit = el && el.closest('.hit');
  setIgnore(!hit);
  if (hit) {
    cancelClose();
    if (el.closest('#pill')) openDeck();
  } else if (stage.classList.contains('open') && !openId) {
    scheduleClose(450);
  }
});
document.addEventListener('contextmenu', (e) => { e.preventDefault(); api.menu(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeAll(); api.release(); }
});

/* ---------- pill + deck ---------- */
function renderPill() {
  pill.replaceChildren(...(notes.length
    ? notes.map((n) => h('i', { style: `background:${PAPER[n.color]}` }))
    : [h('i', { class: 'none' })]));
}

function layoutDeck() {
  deck.style.top = Math.max(8, (stage.clientHeight - deck.offsetHeight) / 2) + 'px';
}

function renderDeck() {
  stage.style.setProperty('--n', notes.length + 1);
  deck.replaceChildren(
    ...notes.map((n, i) => {
      const { done, total } = stats(n);
      return h('button', {
        class: 'tab' + (n.id === openId ? ' on' : ''),
        'data-id': n.id,
        style: `--p:${PAPER[n.color]};--d:${i * 26}ms`,
        onclick: () => openNote(n.id),
      },
      h('span', { class: 't' }, n.title || 'Untitled'),
      h('span', { class: 'c' }, total ? `${done}/${total}` : 'empty'));
    }),
    h('button', { class: 'tab add', style: `--d:${notes.length * 26}ms`, title: 'New note (Ctrl+Alt+N)', onclick: newNote }, '+'),
  );
  layoutDeck();
}

function openDeck() {
  cancelClose();
  if (!stage.classList.contains('open')) { layoutDeck(); stage.classList.add('open'); }
}

function markOpen() {
  deck.querySelectorAll('.tab[data-id]').forEach((t) => t.classList.toggle('on', t.dataset.id === openId));
}

function closeAll() {
  cancelClose();
  openId = null;
  stage.classList.remove('open');
  markOpen();
  hideSheet();
  flush();
}

function updateTab(n) {
  const t = deck.querySelector(`.tab[data-id="${n.id}"]`);
  if (!t) return;
  const { done, total } = stats(n);
  t.querySelector('.t').textContent = n.title || 'Untitled';
  t.querySelector('.c').textContent = total ? `${done}/${total}` : 'empty';
}

function updateMeta(n) {
  const { done, total } = stats(n);
  const bar = sheet.querySelector('.bar i'), count = sheet.querySelector('.count');
  if (bar) bar.style.width = total ? `${(done / total) * 100}%` : '0%';
  if (count) count.textContent = total ? `${done} of ${total} done` : 'Nothing yet';
}

function touch(n) { persist(); updateTab(n); updateMeta(n); }

/* ---------- the note sheet ---------- */
function openNote(id) {
  if (openId === id) { openId = null; markOpen(); hideSheet(); return; }
  openId = id;
  openDeck();
  markOpen();
  renderSheet();
  api.focus();
}

function showSheet() {
  clearTimeout(hideTimer);
  const wasHidden = sheet.hidden;
  sheet.hidden = false;
  const t = deck.querySelector(`.tab[data-id="${openId}"]`);
  const want = deck.offsetTop + (t ? t.offsetTop : 0) - 12;
  sheet.style.top = Math.max(10, Math.min(want, stage.clientHeight - sheet.offsetHeight - 10)) + 'px';
  if (wasHidden) void sheet.offsetWidth;
  sheet.classList.add('show');
}

function hideSheet() {
  sheet.classList.remove('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (!openId) sheet.hidden = true; }, 260);
}

function renderSheet() {
  const n = find(openId);
  if (!n) return hideSheet();
  const keep = sheet.querySelector('.list')?.scrollTop || 0;
  sheet.style.setProperty('--p', PAPER[n.color]);

  const title = h('input', { class: 'title', placeholder: 'Untitled', maxlength: '60', dir: 'auto', spellcheck: 'false' });
  title.value = n.title;
  title.addEventListener('input', () => { n.title = title.value; touch(n); });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); focusRow(n.items[0].id); }
  });

  const { done } = stats(n);
  sheet.replaceChildren(
    title,
    h('div', { class: 'bar' }, h('i')),
    h('div', { class: 'list' }, ...n.items.map((it) => row(n, it))),
    h('button', { class: 'ghost addline', onclick: () => addRow(n, null) }, 'Add a line'),
    h('div', { class: 'foot' },
      h('span', { class: 'count' }),
      h('span', { class: 'grow' }),
      done ? h('button', { class: 'ghost', onclick: () => clearDone(n) }, 'Clear done') : null),
    h('div', { class: 'foot' },
      h('div', { class: 'swatches' }, ...PAPER.map((c, i) => h('button', {
        class: 'dot' + (i === n.color ? ' on' : ''),
        style: `background:${c}`,
        'aria-label': `Paper colour ${i + 1}`,
        onclick: () => { n.color = i; persist(); renderPill(); renderDeck(); renderSheet(); },
      }))),
      h('span', { class: 'grow' }),
      deleteBtn(n)),
  );
  sheet.querySelector('.list').scrollTop = keep;
  updateMeta(n);
  showSheet();
}

function row(n, it) {
  const ta = h('textarea', { rows: '1', placeholder: 'To do', dir: 'auto', spellcheck: 'false' });
  ta.value = it.text;
  ta.addEventListener('input', () => { it.text = ta.value; touch(n); });
  ta.addEventListener('keydown', (e) => onKey(e, n, it, ta));
  return h('div', { class: 'row' + (it.done ? ' done' : ''), 'data-id': it.id },
    h('button', { class: 'box', 'aria-label': 'Toggle done', onclick: () => toggle(n, it) }),
    ta);
}

function toggle(n, it) { it.done = !it.done; touch(n); renderSheet(); }

function onKey(e, n, it, ta) {
  const i = n.items.indexOf(it);
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault(); toggle(n, it); focusRow(it.id);
  } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault(); addRow(n, i);
  } else if (e.key === 'Backspace' && !ta.value && n.items.length > 1) {
    e.preventDefault();
    n.items.splice(i, 1);
    touch(n); renderSheet();
    focusRow(n.items[Math.max(0, i - 1)].id);
  } else if (e.key === 'ArrowUp' && ta.selectionStart === 0 && i > 0) {
    e.preventDefault(); focusRow(n.items[i - 1].id);
  } else if (e.key === 'ArrowDown' && ta.selectionEnd === ta.value.length && i < n.items.length - 1) {
    e.preventDefault(); focusRow(n.items[i + 1].id);
  }
}

function focusRow(id) {
  const ta = sheet.querySelector(`.row[data-id="${id}"] textarea`);
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

function addRow(n, i) {
  const it = newItem();
  n.items.splice(i == null ? n.items.length : i + 1, 0, it);
  touch(n); renderSheet(); focusRow(it.id);
}

function clearDone(n) {
  n.items = n.items.filter((i) => !i.done);
  if (!n.items.length) n.items.push(newItem());
  touch(n); renderSheet();
}

function deleteBtn(n) {
  let armed = false, timer;
  const b = h('button', { class: 'ghost' }, 'Delete note');
  b.onclick = () => {
    if (!armed) {
      armed = true; b.textContent = 'Really delete?'; b.classList.add('warn');
      timer = setTimeout(() => { armed = false; b.textContent = 'Delete note'; b.classList.remove('warn'); }, 2500);
      return;
    }
    clearTimeout(timer);
    notes = notes.filter((x) => x.id !== n.id);
    openId = null;
    persist(); hideSheet(); renderPill(); renderDeck();
  };
  return b;
}

function newNote() {
  const n = {
    id: uid(),
    title: new Date().toLocaleDateString(undefined, { weekday: 'long' }),
    color: notes.length % PAPER.length,
    items: [newItem()],
  };
  notes.push(n);
  persist(); renderPill(); renderDeck(); openDeck();
  openNote(n.id);
  const t = sheet.querySelector('.title');
  t.focus(); t.select();
}

/* ---------- messages from the main process ---------- */
api.on('blur', closeAll);
api.on('left', () => { if (!openId) scheduleClose(250); });
api.on('peek', () => { openDeck(); scheduleClose(2500); });
api.on('new-note', newNote);
api.on('edge', (edge) => { closeAll(); stage.dataset.edge = edge; });

api.load().then(({ edge, notes: saved }) => {
  stage.dataset.edge = edge;
  notes = saved.map((n) => ({
    id: n.id || uid(),
    title: n.title || '',
    color: Number.isInteger(n.color) ? n.color % PAPER.length : 0,
    items: Array.isArray(n.items) && n.items.length ? n.items : [newItem()],
  }));
  renderPill();
  renderDeck();
});
