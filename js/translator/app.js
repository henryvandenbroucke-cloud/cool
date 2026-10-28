import { LANGUAGES, POPULAR, getLang, isRTL } from './languages.js';
import { translateText, lookupWord } from './engine.js';

const $ = (s) => document.querySelector(s);
const els = {
  input: $('#input'), output: $('#output'), go: $('#go'), swap: $('#swap'), status: $('#status'),
  chars: $('#char-count'), words: $('#word-count'), detected: $('#detected'), detectedName: $('#detected-name'),
  engine: $('#engine-badge'), thinking: $('#thinking'), toast: $('#toast'), recents: $('#recents'),
  extras: $('#extras'), altWrap: $('#alternatives-wrap'), alternatives: $('#alternatives'),
  dictWrap: $('#dict-wrap'), dictBody: $('#dict-body'), star: $('#star'),
  historyList: $('#history-list'), favList: $('#fav-list'),
};
const state = { from: 'auto', to: 'es', lastResult: '', lastDetected: null, timer: null, seq: 0, speaking: false };
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('babel:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('babel:' + k, JSON.stringify(v)); } catch {} },
};
let history = store.get('history', []);
let favourites = store.get('favs', []);
let recents = store.get('recents', ['en', 'es', 'fr', 'de']);

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

/* ---------- language pickers ---------- */
function langItem(code, current) {
  const l = getLang(code);
  return `<button class="lang-opt" role="option" data-code="${code}" aria-selected="${code === current}">
    <span aria-hidden="true">${l.flag}</span><span>${l.name}</span><small>${l.native}</small></button>`;
}
function renderList(side, filter = '') {
  const list = $(`#${side}-list`);
  const current = side === 'from' ? state.from : state.to;
  const q = filter.trim().toLowerCase();
  const match = (l) => !q || l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
  const all = LANGUAGES.map(([code, name, native, flag]) => ({ code, name, native, flag })).filter(match);
  let html = '';
  if (side === 'from' && (!q || 'auto detect'.includes(q))) {
    html += `<h4>Detect</h4><button class="lang-opt" role="option" data-code="auto" aria-selected="${current === 'auto'}"><span>✨</span><span>Auto detect</span><small>magic</small></button>`;
  }
  if (!q) {
    html += `<h4>Popular</h4>` + POPULAR.map((c) => langItem(c, current)).join('');
    html += `<h4>All languages · ${LANGUAGES.length}</h4>`;
  }
  html += all.map((l) => langItem(l.code, current)).join('') || `<p style="padding:.8rem;color:var(--muted)">No language matches “${filter}” 🌍</p>`;
  list.innerHTML = html;
  list.querySelectorAll('.lang-opt').forEach((btn) => btn.addEventListener('click', () => { selectLang(side, btn.dataset.code); closePickers(); }));
}
function paintPickers() {
  const f = state.from === 'auto' ? { flag: '✨', name: 'Auto detect' } : getLang(state.from);
  const t = getLang(state.to);
  $('#from-flag').textContent = f.flag; $('#from-name').textContent = f.name;
  $('#to-flag').textContent = t.flag; $('#to-name').textContent = t.name;
  els.input.dir = state.from !== 'auto' && isRTL(state.from) ? 'rtl' : 'auto';
  els.output.dir = isRTL(state.to) ? 'rtl' : 'auto';
  renderRecents();
}
function selectLang(side, code) {
  state[side] = code;
  recents = [code, ...recents.filter((c) => c !== code && c !== 'auto')].slice(0, 6);
  store.set('recents', recents);
  paintPickers();
  syncURL();
  schedule();
}
function renderRecents() {
  const chips = recents.filter((c) => c !== state.from && c !== state.to).slice(0, 4);
  els.recents.innerHTML = chips.length ? `<span style="color:var(--muted);font-size:.78rem;align-self:center">Recent:</span>` +
    chips.map((c) => { const l = getLang(c); return `<button type="button" data-code="${c}">${l.flag} ${l.name}</button>`; }).join('') : '';
  els.recents.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => selectLang('to', b.dataset.code)));
}
function closePickers() {
  document.querySelectorAll('.picker__panel').forEach((p) => (p.hidden = true));
  document.querySelectorAll('.picker__btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
for (const side of ['from', 'to']) {
  const btn = $(`#${side}-btn`), panel = $(`#${side}-panel`), search = $(`#${side}-search`);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.hidden;
    closePickers();
    if (open) { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); renderList(side, search.value); setTimeout(() => search.focus(), 30); }
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  search.addEventListener('input', () => renderList(side, search.value));
}
document.addEventListener('click', closePickers);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePickers(); });

els.swap.addEventListener('click', swap);
function swap() {
  if (state.from === 'auto') {
    if (!state.lastDetected) { toast('Translate something first, then I can swap ✨'); return; }
    state.from = state.to; state.to = state.lastDetected;
  } else { [state.from, state.to] = [state.to, state.from]; }
  const current = els.input.value;
  if (state.lastResult) { els.input.value = state.lastResult; }
  paintPickers(); updateCounts(); syncURL(); schedule();
  toast(`Swapped ${getLang(state.from).flag} → ${getLang(state.to).flag}`);
}

/* ---------- quick pairs ---------- */
const PAIRS = [['en','es'],['en','fr'],['en','ja'],['en','de'],['es','en'],['en','ar'],['en','hi'],['en','zh-CN'],['en','ko'],['uk','en']];
$('#quick-pairs').innerHTML = PAIRS.map(([a,b]) => `<button class="chip" data-a="${a}" data-b="${b}">${getLang(a).flag} ${getLang(a).name} → ${getLang(b).flag} ${getLang(b).name}</button>`).join('');
$('#quick-pairs').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
  state.from = c.dataset.a; state.to = c.dataset.b; paintPickers(); syncURL(); schedule(); els.input.focus();
  if (!els.input.value) { els.input.value = 'Hello! How are you today?'; updateCounts(); schedule(); }
}));

/* ---------- phrasebook ---------- */
const PHRASES = [
  ['Hello 👋','Hello'],['Thank you 🙏','Thank you very much'],['Please 🙇','Please'],['Excuse me ✋','Excuse me'],
  ['Where is…? 🗺️','Where is the nearest station?'],['How much? 💶','How much does this cost?'],['Help! 🆘','Help! I need help'],
  ['I love you ❤️','I love you'],['Good morning ☀️','Good morning'],['Good night 🌙','Good night'],
  ['See you later 👋','See you later'],['I don’t understand 🤔','I don’t understand'],['Do you speak English? 🗣️','Do you speak English?'],
  ['Cheers! 🥂','Cheers!'],['Happy birthday 🎂','Happy birthday!'],['Welcome 🎉','Welcome!'],
];
$('#phrases').innerHTML = PHRASES.map(([label, text]) => `<button class="phrase" data-text="${text.replace(/"/g,'&quot;')}">${label}<small>${text}</small></button>`).join('');
$('#phrases').querySelectorAll('.phrase').forEach((b) => b.addEventListener('click', () => {
  els.input.value = b.dataset.text; updateCounts(); schedule(); document.getElementById('translator').scrollIntoView({ behavior: 'smooth', block: 'center' });
}));

/* ---------- translation ---------- */
function updateCounts() {
  const v = els.input.value;
  els.chars.textContent = v.length.toLocaleString();
  els.words.textContent = (v.trim() ? v.trim().split(/\s+/).length : 0).toLocaleString();
}
function setStatus(msg, err = false) { els.status.textContent = msg; els.status.classList.toggle('err', err); }

function schedule() { clearTimeout(state.timer); state.timer = setTimeout(run, 450); }
els.input.addEventListener('input', () => { updateCounts(); schedule(); });
els.input.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });
document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); swap(); } });
els.go.addEventListener('click', run);

async function run() {
  const text = els.input.value.trim();
  const seq = ++state.seq;
  if (!text) {
    state.lastResult = ''; els.output.innerHTML = '<span class="output__placeholder">Your translation appears here — in any of 200+ languages ✨</span>';
    els.engine.textContent = ''; els.extras.hidden = true; els.detected.hidden = true; setStatus(''); return;
  }
  if (state.from !== 'auto' && state.from === state.to) {
    state.lastResult = text; els.output.textContent = text; els.engine.textContent = 'Same language 💡'; setStatus('Source and target are the same — try another language!'); return;
  }
  els.thinking.hidden = false; setStatus('');
  try {
    const res = await translateText(text, state.from, state.to);
    if (seq !== state.seq) return;
    state.lastResult = res.text;
    state.lastDetected = res.detected ? normaliseDetected(res.detected) : (state.from !== 'auto' ? state.from : null);
    els.output.textContent = res.text;
    els.output.dir = isRTL(state.to) ? 'rtl' : 'auto';
    els.engine.textContent = `via ${res.engine}`;
    els.star.textContent = isFavourited(text, res.text) ? '★' : '☆';
    els.star.classList.toggle('is-on', isFavourited(text, res.text));
    if (state.lastDetected && state.from === 'auto') {
      els.detected.hidden = false;
      els.detectedName.textContent = `${getLang(state.lastDetected).flag} ${getLang(state.lastDetected).name}`;
    } else els.detected.hidden = state.from !== 'auto';
    if (state.from !== 'auto') { els.detected.hidden = false; els.detectedName.textContent = `${getLang(state.from).flag} ${getLang(state.from).name}`; }
    // alternatives + dictionary
    const hasAlt = res.alternatives?.length > 0;
    els.altWrap.hidden = !hasAlt;
    if (hasAlt) els.alternatives.innerHTML = res.alternatives.map((a) => `<button type="button">${escapeHtml(a)}</button>`).join('');
    els.alternatives.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.lastResult = b.textContent; els.output.textContent = b.textContent; }));
    els.dictWrap.hidden = true;
    const single = text.match(/^[A-Za-z][A-Za-z'-]{1,30}$/);
    const dictLang = state.lastDetected || state.from;
    if (single && (dictLang === 'en' || dictLang === 'auto')) {
      lookupWord(single[0].toLowerCase()).then((d) => {
        if (!d || seq !== state.seq) return;
        els.dictWrap.hidden = false; els.extras.hidden = false;
        els.dictBody.innerHTML = `<strong>${escapeHtml(text)}</strong> ${escapeHtml(d.phonetic)} <em>${escapeHtml(d.partOfSpeech)}</em> — ${escapeHtml(d.definition)}${d.example ? `<br><span style="color:var(--muted)">“${escapeHtml(d.example)}”</span>` : ''}`;
      }).catch(() => {});
    }
    els.extras.hidden = !(hasAlt || !els.dictWrap.hidden);
    pushHistory(text, res.text);
    setStatus(`${getLang(state.from === 'auto' ? (state.lastDetected || 'en') : state.from).name} → ${getLang(state.to).name} · ${res.text.length} characters`);
  } catch (err) {
    if (seq !== state.seq) return;
    els.output.innerHTML = '<span class="output__placeholder">Hmm — all engines are unreachable right now. Check your connection and try again 🌍</span>';
    setStatus('Translation failed — engines unreachable. Retrying usually fixes it.', true);
  } finally {
    if (seq === state.seq) els.thinking.hidden = true;
  }
}
function normaliseDetected(code) {
  if (!code) return null;
  const exact = LANGUAGES.find(([c]) => c.toLowerCase() === String(code).toLowerCase());
  if (exact) return exact[0];
  const base = LANGUAGES.find(([c]) => c.split('-')[0] === String(code).split('-')[0]);
  return base ? base[0] : code;
}
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

/* ---------- history & favourites ---------- */
function isFavourited(from, to) { return favourites.some((f) => f.fromText === from && f.toText === to); }
function pushHistory(fromText, toText) {
  const entry = { fromText, toText, from: state.from, to: state.to, detected: state.lastDetected, at: Date.now() };
  if (history[0] && history[0].fromText === fromText && history[0].toText === toText) return;
  history = [entry, ...history.filter((h) => h.fromText !== fromText || h.toText !== toText)].slice(0, 30);
  store.set('history', history); renderLists();
}
function entryHtml(h, kind) {
  const f = getLang(h.from === 'auto' ? (h.detected || 'en') : h.from), t = getLang(h.to);
  return `<div class="from">${f.flag} ${escapeHtml(h.fromText)}</div><div class="to">${t.flag} ${escapeHtml(h.toText)}</div>
    <div class="meta"><span>${f.name} → ${t.name}</span><span>${new Date(h.at).toLocaleDateString([], { month: 'short', day: 'numeric' })} ${new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    <button class="del" data-kind="${kind}" data-at="${h.at}" aria-label="Delete entry" title="Delete">✕</button></div>`;
}
function renderLists() {
  els.historyList.innerHTML = history.length
    ? history.map((h) => `<li data-kind="history" data-at="${h.at}">${entryHtml(h, 'history')}</li>`).join('')
    : '<li class="empty">Nothing yet — your translations will live here.</li>';
  els.favList.innerHTML = favourites.length
    ? favourites.map((h) => `<li data-kind="favs" data-at="${h.at}">${entryHtml(h, 'favs')}</li>`).join('')
    : '<li class="empty">Star a translation to keep it forever.</li>';
  document.querySelectorAll('.cards-list li[data-at]').forEach((li) => li.addEventListener('click', (e) => {
    const kind = li.dataset.kind, at = Number(li.dataset.at);
    if (e.target.closest('.del')) {
      if (kind === 'history') { history = history.filter((h) => h.at !== at); store.set('history', history); }
      else { favourites = favourites.filter((h) => h.at !== at); store.set('favs', favourites); }
      renderLists(); toast('Removed'); return;
    }
    const item = (kind === 'history' ? history : favourites).find((h) => h.at === at);
    if (!item) return;
    state.from = item.from; state.to = item.to; els.input.value = item.fromText;
    paintPickers(); updateCounts(); run();
    document.getElementById('translator').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
}
$('#clear-history').addEventListener('click', () => { history = []; store.set('history', history); renderLists(); toast('History cleared'); });
$('#clear-favs').addEventListener('click', () => { favourites = []; store.set('favs', favourites); renderLists(); toast('Saved cleared'); });
$('#nav-history').addEventListener('click', () => document.getElementById('hist-title').scrollIntoView({ behavior: 'smooth' }));
$('#nav-favs').addEventListener('click', () => document.getElementById('fav-title').scrollIntoView({ behavior: 'smooth' }));
els.star.addEventListener('click', () => {
  const fromText = els.input.value.trim();
  if (!fromText || !state.lastResult) { toast('Translate something first ☆'); return; }
  if (isFavourited(fromText, state.lastResult)) {
    favourites = favourites.filter((f) => !(f.fromText === fromText && f.toText === state.lastResult));
    toast('Removed from Saved');
  } else {
    favourites = [{ fromText, toText: state.lastResult, from: state.from, to: state.to, detected: state.lastDetected, at: Date.now() }, ...favourites].slice(0, 50);
    toast('Saved ★ Find it below any time');
  }
  store.set('favs', favourites); renderLists();
  const on = isFavourited(fromText, state.lastResult);
  els.star.textContent = on ? '★' : '☆'; els.star.classList.toggle('is-on', on);
});

/* ---------- tools: copy / speak / listen / paste / file / share ---------- */
async function copyText(text, msg) {
  if (!text) { toast('Nothing to copy yet'); return; }
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(msg); }
}
$('#copy').addEventListener('click', () => copyText(state.lastResult, 'Translation copied ⧉'));
$('#paste').addEventListener('click', async () => {
  try { const t = await navigator.clipboard.readText(); if (t) { els.input.value = t.slice(0, 5000); updateCounts(); schedule(); toast('Pasted 📋'); } }
  catch { toast('Clipboard blocked — press Ctrl+V instead'); els.input.focus(); }
});
$('#clear').addEventListener('click', () => { els.input.value = ''; state.lastResult = ''; updateCounts(); run(); els.input.focus(); });
$('#download').addEventListener('click', () => {
  if (!state.lastResult) { toast('Nothing to download yet'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([state.lastResult], { type: 'text/plain;charset=utf-8' }));
  a.download = `babel-${state.to}.txt`; a.click(); URL.revokeObjectURL(a.href); toast('Downloaded ⬇');
});
$('#share').addEventListener('click', async () => { syncURL(); await copyText(location.href, 'Share link copied 🔗 Anyone opening it sees this translation'); });
$('#upload').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then((t) => { els.input.value = t.slice(0, 5000); updateCounts(); schedule(); toast(`Loaded ${f.name} 📄`); });
});

function speak(text, langCode) {
  if (!text) { toast('Nothing to listen to yet'); return; }
  if (!('speechSynthesis' in window)) { toast('Your browser has no voice 🥺'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = langCode === 'auto' ? 'en' : langCode;
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find((v) => v.lang === u.lang) || voices.find((v) => v.lang.startsWith(u.lang.split('-')[0])) || null;
  u.rate = 0.96;
  speechSynthesis.speak(u);
}
$('#listen-in').addEventListener('click', () => speak(els.input.value.trim(), state.from === 'auto' ? (state.lastDetected || 'en') : state.from));
$('#listen-out').addEventListener('click', () => speak(state.lastResult, state.to));
if ('speechSynthesis' in window) speechSynthesis.getVoices();

const micBtn = $('#mic');
const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recog) micBtn.style.display = 'none';
else {
  const rec = new Recog();
  rec.interimResults = true;
  micBtn.addEventListener('click', () => {
    rec.lang = state.from === 'auto' ? (navigator.language || 'en') : state.from;
    try { rec.start(); micBtn.classList.add('is-live'); micBtn.textContent = '🔴'; toast('Listening… speak now 🎙️'); } catch {}
  });
  rec.addEventListener('result', (e) => {
    const txt = [...e.results].map((r) => r[0].transcript).join('');
    els.input.value = txt.slice(0, 5000); updateCounts(); schedule();
  });
  const stopMic = () => { micBtn.classList.remove('is-live'); micBtn.textContent = '🎙️'; };
  rec.addEventListener('end', stopMic);
  rec.addEventListener('error', () => { stopMic(); toast('Mic unavailable — check permission 🎙️'); });
}

/* ---------- URL sharing / boot ---------- */
function syncURL() {
  const p = new URLSearchParams();
  if (els.input.value) p.set('q', els.input.value);
  p.set('sl', state.from); p.set('tl', state.to);
  window.history.replaceState(null, '', `${location.pathname}?${p}`);
}
els.input.addEventListener('change', syncURL);

function boot() {
  const p = new URLSearchParams(location.search);
  if (p.get('sl') && (p.get('sl') === 'auto' || getLang(p.get('sl')).code === p.get('sl'))) state.from = p.get('sl');
  if (p.get('tl') && LANGUAGES.some(([c]) => c === p.get('tl'))) state.to = p.get('tl');
  if (!p.get('sl')) {
    const nav = (navigator.language || 'en').split('-')[0];
    if (nav !== 'en') state.to = nav === 'zh' ? 'zh-CN' : nav;
  }
  $('#lang-count').textContent = LANGUAGES.length;
  document.title = `BABEL° — Speak every language · ${LANGUAGES.length} languages`;
  paintPickers(); renderLists(); updateCounts();
  if (p.get('q')) { els.input.value = p.get('q').slice(0, 5000); updateCounts(); run(); }
}
boot();
