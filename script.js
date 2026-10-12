'use strict';
/* PresetFlow — vanilla JS. Real API only; no dummy results. */
const API = 'https://apiii-xrina.my.id/search/amfinder?url=';
const PROXY = '/api/amfinder?url='; // optional same-origin proxy (see README)
const TIMEOUT_MS = 45000; // cukup untuk 1x percobaan ulang otomatis
const HISTORY_KEY = 'presetflow.history.v1';
const FAV_KEY = 'presetflow.favs.v1', FAV_MAX = 100; // Koleksi favorit (localStorage, tanpa akun)
const MAX_BATCH = 5; // maks. link TikTok per pencarian
const CLIP_KEY = 'presetflow.clip.last'; // link clipboard terakhir yang sudah ditangani (agar banner tidak muncul terus)
// Only links on Alight Motion hosts are treated as preset links (edit here if the API uses others).
const AM_HOSTS = ['alight.link', 'alightmotion.com', 'alightcreative.com'];

const $ = (id) => document.getElementById(id);
const log = (status, n) => { try { window.PFActivity && window.PFActivity.log(status, n); } catch {} }; // real-time activity (optional)
const els = { input: $('urlInput'), row: $('inputRow'), hint: $('hint'), find: $('findBtn'), paste: $('pasteBtn'), clear: $('clearBtn'),
  results: $('results'), histBox: $('historyBox'), histList: $('historyList'), toast: $('toast'), install: $('installBtn'),
  colBtn: $('colBtn'), favCount: $('favCount'), col: $('collection'), colList: $('colList'), colCount: $('colCount'), colClear: $('colClear') };
const HINT = 'Paste a TikTok link — or up to 5 at once.';
let busy = false, controller = null;

/* ---------- helpers ---------- */
const ICONS = {
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm5 11.5 4 4',
  warn: 'M12 4 3 19h18L12 4Zm0 6v4m0 3h.01',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  off: 'M3 3l18 18M8.5 8.5A8 8 0 0 0 4 12m16 0a8 8 0 0 0-3-5.5M12 18h.01',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  share: 'M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'
};
function svg(path, cls) {
  const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); if (cls) s.setAttribute('class', cls);
  p.setAttribute('d', path); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.7'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.appendChild(p); return s;
}
function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) { if (k === 'class') n.className = v; else n.setAttribute(k, v); }
  kids.forEach((k) => n.append(k)); return n;
}
let toastTimer;
function toast(msg, action) {
  els.toast.textContent = msg;
  if (action) { const b = h('button', { type: 'button' }, action.label); b.onclick = () => { els.toast.classList.remove('show'); action.fn(); }; els.toast.append(b); }
  els.toast.classList.add('show'); clearTimeout(toastTimer);
  const ttl = action ? action.ttl : 2200; // an action toast without ttl stays until dismissed (e.g. "Update available")
  if (ttl) toastTimer = setTimeout(() => els.toast.classList.remove('show'), ttl);
}

/* ---------- URL validation ---------- */
function parseTikTok(raw) {
  let u; try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const ok = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'].includes(host);
  if (!ok || u.pathname.length < 3) return null;
  u.search = ''; u.hash = ''; // parameter pelacak (?_r=1&share_app_id=...) tidak dibutuhkan dan bisa membuat API menolak
  return u.href;
}
/* Finds the first TikTok link inside any text (share sheets send "caption + link", the clipboard may hold anything). */
const TT_RE = /https?:\/\/(?:www\.|m\.|vm\.|vt\.)?tiktok\.com\/[^\s"'<>]+/i;
function findTikTok(text) { const m = String(text || '').match(TT_RE); return m ? parseTikTok(m[0].replace(/[.,;!?)\]]+$/, '')) : null; }
function findAllTikTok(text) { // semua link TikTok unik dalam teks (maks. MAX_BATCH)
  const out = [], re = new RegExp(TT_RE.source, 'gi'); let m;
  while ((m = re.exec(String(text || '')))) { const l = parseTikTok(m[0].replace(/[.,;!?)\]]+$/, '')); if (l && !out.includes(l)) out.push(l); }
  return out.slice(0, MAX_BATCH);
}
function normalizeLink(raw) {
  try {
    const u = new URL(raw); u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((p) => u.searchParams.delete(p));
    let s = u.href; if (s.endsWith('/')) s = s.slice(0, -1); return s;
  } catch { return null; }
}
function isAM(href) {
  try { const u = new URL(href); return /^https?:$/.test(u.protocol) && AM_HOSTS.some((d) => u.hostname === d || u.hostname.endsWith('.' + d)); } catch { return false; }
}

/* ---------- API response parsing ----------
   The response shape is not assumed. We (1) detect explicit failure flags, then (2) walk every string in the
   JSON, pull out http(s) URLs with a regex, keep only Alight Motion hosts, normalize and de-duplicate. */
class ApiError extends Error {}
// Balasan "gagal" dari API yang sebenarnya artinya hanya tidak ada hasil -> bukan error, jangan dihitung gagal.
const EMPTY_RE = /no[ _-]?(result|preset|link|data|match)|not[ _-]?found|tidak (ada|ditemukan)|kosong|empty|0 (result|link)/i;
const IMG_RE = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i;
const isHttp = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);
const asUrl = (v) => isHttp(v) ? v : (v && typeof v === 'object' ? (v.url || v.src || (Array.isArray(v.url_list) && v.url_list[0]) || (Array.isArray(v) && v[0]) || null) : null);
const pick = (o, re, test) => { for (const k of Object.keys(o)) if (re.test(k)) { const v = o[k]; if (test(v)) return v; } return null; };
/* Pull display metadata (title, thumbnail, size, author) out of the object that holds the link, if the API provides any. */
function metaFrom(o) {
  const m = {}; if (!o || typeof o !== 'object' || Array.isArray(o)) return m;
  const t = pick(o, /^(title|name|preset_?name|label)$/i, (v) => typeof v === 'string' && v.trim() && !isHttp(v)); if (t) m.title = t.trim();
  const img = pick(o, /thumb|cover|image|img|preview|poster|picture|photo/i, (v) => isHttp(asUrl(v))); if (img) m.image = asUrl(img);
  const sz = pick(o, /^(size|file_?size|filesize|bytes)$/i, (v) => typeof v === 'number' || (typeof v === 'string' && v.trim())); if (sz != null) m.size = sz;
  const au = pick(o, /^(author|username|user_?name|uploader|creator|owner|nickname|unique_?id|user)$/i, (v) => typeof v === 'string' || (v && typeof v === 'object'));
  if (au) { const n = typeof au === 'string' ? au : (au.unique_id || au.username || au.nickname || au.name); if (typeof n === 'string' && n.trim()) m.author = n.trim(); }
  return m;
}
/* Walks any JSON, finds Alight Motion links, and attaches whatever metadata sits next to each link. */
function extractItems(data) {
  const found = new Map(), re = /https?:\/\/[^\s"'<>\\)\]]+/gi;
  (function walk(v, trail) {
    if (trail.length > 12 || v == null) return;
    if (typeof v === 'string') {
      (v.match(re) || []).forEach((m) => {
        const n = normalizeLink(m.replace(/[.,;!?]+$/, '')); if (!n || !isAM(n)) return;
        let meta = {}; for (let i = trail.length - 1; i >= Math.max(0, trail.length - 3) && !meta.image && !meta.title; i--) meta = { ...metaFrom(trail[i]), ...meta };
        const prev = found.get(n); found.set(n, prev ? { ...meta, ...prev } : { link: n, ...meta });
      });
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, trail.concat([v])));
    else if (typeof v === 'object') Object.values(v).forEach((x) => walk(x, trail.concat([v])));
  })(data, []);
  return [...found.values()];
}
function checkEnvelope(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (data.status === false || data.success === false || data.ok === false || (typeof data.status === 'string' && /^(error|fail)/i.test(data.status))) {
      throw new ApiError('API: ' + (data.message || data.error || 'melaporkan kegagalan'));
    }
    if (data.error && typeof data.error === 'string') throw new ApiError('API: ' + data.error);
  }
}

/* ---------- request ----------
   1) proxy same-origin, 2) satu kali ulang otomatis kalau gagal sementara (jaringan/5xx/429/bukan JSON),
   3) API langsung (hanya berhasil kalau host API mengizinkan CORS). Pesan error menyebut penyebab sebenarnya. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function request(url, signal, setStatus) {
  const opts = { signal, headers: { Accept: 'application/json' } };
  const attempt = async (base) => {
    try {
      const res = await fetch(base + encodeURIComponent(url), opts);
      setStatus('Processing your TikTok link...');
      const text = await res.text(); setStatus('Checking available results...');
      let data = null; try { data = JSON.parse(text); } catch {}
      return { res, data };
    } catch (err) { if (err.name === 'AbortError') throw err; return { err }; }
  };
  const transient = (r) => r.err || r.res.status >= 500 || r.res.status === 429 || r.data === null;
  let r = await attempt(PROXY);
  const noProxy = !r.err && (r.res.status === 404 || r.res.status === 405); // hosting statis tanpa proxy
  if (!noProxy && transient(r)) { setStatus('Mencoba lagi...'); await sleep(1000); r = await attempt(PROXY); }
  if (noProxy || transient(r)) {
    const d = await attempt(API);
    if ((!d.err && d.data !== null) || noProxy) r = d; // kalau proxy hidup tapi upstream bermasalah, laporkan masalah proxy, bukan CORS
  }
  if (r.err) throw new ApiError('Tidak bisa terhubung ke server (' + (r.err.message || 'jaringan/CORS') + ')');
  if (r.data === null) throw new ApiError('Respons server bukan JSON (HTTP ' + r.res.status + ')');
  if (!r.res.ok && !extractItems(r.data).length) {
    const m = r.data && (r.data.message || r.data.error);
    throw new ApiError('HTTP ' + r.res.status + (typeof m === 'string' && m ? ': ' + m.slice(0, 120) : ''));
  }
  return r.data;
}

/* ---------- UI states ---------- */
function setResults(node) { els.results.replaceChildren(node); els.results.setAttribute('aria-busy', 'false'); }
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function focusResults() { // hasil/loader di bawah layar (terutama HP) -> gulir halus ke sana
  const r = els.results.getBoundingClientRect(); if (r.top > innerHeight * 0.5) els.results.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}
function panel(icon, title, desc, cls, retry, detail) {
  const p = h('div', { class: 'glass panel enter ' + (cls || '') }, svg(ICONS[icon], 'big'), h('h2', {}, title), h('p', {}, desc));
  if (detail) p.append(h('small', { class: 'detail' }, detail));
  if (retry) { const b = h('button', { class: 'btn-ghost', type: 'button' }, retry.label); b.onclick = retry.fn; p.append(b); }
  return p;
}
const emptyState = () => panel('search', 'Ready to discover?', 'Your preset links will appear here once you search a TikTok video.');
function showLoading() {
  const status = h('p', { class: 'status', role: 'status' }, 'Connecting to PresetFlow...');
  const cancel = h('button', { class: 'btn-text', type: 'button' }, 'Cancel'); cancel.onclick = () => controller && controller.abort();
  const orbit = h('div', { class: 'orbit', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('b'));
  const steps = h('ol', { class: 'steps', 'aria-hidden': 'true' }, ...['Connect', 'Read comments', 'Filter links', 'Build results'].map((t) => h('li', {}, t)));
  const box = h('div', { class: 'glass scan enter' }, h('div', { class: 'scan-in' }, orbit, status, steps, cancel));
  setResults(box); els.results.setAttribute('aria-busy', 'true'); focusResults();
  const lis = [...steps.children]; let cur = -1;
  const go = (i) => { if (i <= cur) return; cur = i; lis.forEach((li, k) => { li.className = k < cur ? 'done' : k === cur ? 'on' : ''; }); };
  go(0); const t0 = Date.now(), iv = setInterval(() => { if (!box.isConnected) { clearInterval(iv); return; } const e = Date.now() - t0; go(e > 9000 ? 3 : e > 4500 ? 2 : e > 1400 ? 1 : 0); }, 400);
  return (t) => { status.textContent = t; if (/Processing/i.test(t)) go(1); else if (/Checking/i.test(t)) go(2); };
}
const sizeLabel = (v) => {
  if (v == null) return ''; if (typeof v === 'string' && /[a-z]/i.test(v)) return v.trim().toUpperCase();
  const n = Number(v); if (!isFinite(n) || n <= 0) return '';
  return n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1).replace(/\.0$/, '') + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
};
const cleanTitle = (t) => (t || '').replace(/\s*[|\-–—·]\s*Alight (Motion|Creative).*$/i, '').replace(/^\s*(Alight Motion\s*[:|\-–—]\s*)/i, '').trim();
const COVER = 'M4 5h16v14H4zM4 15l4.5-4.5 3.5 3.5 3-3L20 16M9 9.2h.01';
function thumbBox() {
  const box = h('div', { class: 'thumb loading' }, h('div', { class: 'ph' }, svg(COVER)), h('span', { class: 'fmt' }, 'AM'));
  return box;
}
function setThumb(box, src) {
  if (!src || box.querySelector('img')) return;
  const img = new Image(); img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
  img.onload = () => { box.dataset.src = src; box.querySelector('.ph') && box.querySelector('.ph').remove(); box.append(img); box.classList.remove('loading'); requestAnimationFrame(() => img.classList.add('in')); };
  img.onerror = () => box.classList.remove('loading');
  img.src = src;
}
/* ---------- clipboard / share / QR ---------- */
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch { const ta = h('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok; }
}
async function shareItem(link, name) {
  const data = { title: name || 'Alight Motion Preset', text: (name || 'Preset Alight Motion') + ' · via PresetFlow', url: link };
  if (navigator.share) { try { await navigator.share(data); } catch (e) { if (e && e.name !== 'AbortError') { await copyText(link); toast('Link disalin'); } } return; }
  await copyText(link); toast('Link disalin (browser ini tanpa menu Bagikan)');
}
function openQR(link, name) {
  const d = $('qrDialog'); $('qrTitle').textContent = name || ''; $('qrLink').textContent = link;
  try { $('qrBox').innerHTML = window.PFQR.svg(link, { fg: '#0B1210', bg: '#ffffff' }); } catch { toast('QR tidak bisa dibuat untuk link ini'); return; }
  $('qrSave').onclick = async () => { try { const b = await window.PFQR.png(link, 640), a = h('a', { href: URL.createObjectURL(b), download: 'presetflow-qr.png' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch { toast('Gagal membuat PNG'); } };
  d.showModal();
}
$('qrClose').onclick = () => $('qrDialog').close();
$('qrDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

/* ---------- cek status link (halaman share Alight Motion bisa dijangkau atau tidak) ---------- */
const statusCache = new Map();
async function checkStatus(link) {
  if (statusCache.has(link)) return statusCache.get(link);
  let out = { state: 'unknown', info: null };
  try {
    const r = await fetch('/api/preview?url=' + encodeURIComponent(link), { headers: { Accept: 'application/json' } });
    if (r.ok) { const info = await r.json(); out = info && info.status !== false ? { state: 'ok', info } : { state: /HTTP (404|410)\b/.test((info && info.error) || '') ? 'dead' : 'unknown', info: null }; }
  } catch {}
  if (out.state !== 'unknown') statusCache.set(link, out); // hanya hasil pasti yang disimpan
  return out;
}
function paintStatus(el, state) {
  el.dataset.s = state; el.hidden = state === 'unknown';
  el.textContent = state === 'ok' ? 'Link aktif' : state === 'dead' ? 'Mungkin kedaluwarsa' : state === 'checking' ? 'Mengecek…' : '';
}
async function enrich(item, card, refs) {
  const { state, info } = await checkStatus(item.link);
  refs.thumb.classList.remove('loading'); paintStatus(refs.status, state);
  if (!info) return;
  if (!item.title && info.title) { const t = cleanTitle(info.title); if (t) refs.title.textContent = t; }
  if (!item.image && info.image) setThumb(refs.thumb, info.image);
  const d = (info.description || '') + ' ' + (info.title || '');
  if (!item.size) { const m = d.match(/(\d+(?:[.,]\d+)?)\s?(KB|MB|GB)\b/i); if (m) { refs.size.textContent = m[1].replace(',', '.') + m[2].toUpperCase(); refs.size.hidden = false; } }
  if (!item.author) { const m = d.match(/@([\w.]{2,30})/); if (m) { refs.author.textContent = '@' + m[1]; refs.author.hidden = false; } }
}
function presetCard(item, idx, opts = {}) {
  const copy = h('button', { class: 'btn-ghost', type: 'button' }, 'Copy link');
  copy.onclick = async () => { await copyText(item.link); copy.textContent = 'Copied'; copy.classList.add('done'); toast('Link copied'); setTimeout(() => { copy.textContent = 'Copy link'; copy.classList.remove('done'); }, 1800); };
  const open = h('a', { class: 'btn-open', href: item.link, target: '_blank', rel: 'noopener noreferrer' }, 'Open preset');
  const thumb = thumbBox(); if (item.image) setThumb(thumb, item.image);
  const title = h('h3', { class: 'p-title' }, cleanTitle(item.title) || 'Alight Motion Preset');
  const size = h('span', { class: 'badge' }, sizeLabel(item.size)); size.hidden = !sizeLabel(item.size);
  const status = h('span', { class: 'badge st' }); paintStatus(status, opts.collection ? 'unknown' : 'checking');
  const author = h('p', { class: 'p-author' }, item.author ? '@' + item.author.replace(/^@/, '') : ''); author.hidden = !item.author;
  const url = h('p', { class: 'p-url' }, item.link);
  const getData = () => ({ link: item.link, title: title.textContent, image: thumb.dataset.src || item.image || '', size: size.hidden ? '' : size.textContent, author: author.hidden ? '' : author.textContent });
  const fav = favButton(item.link, getData, !!opts.collection);
  const qr = h('button', { class: 'btn-ghost', type: 'button', 'aria-label': 'Tampilkan QR code' }, svg(ICONS.qr), h('span', { class: 'lbl' }, 'QR'));
  qr.onclick = () => openQR(item.link, title.textContent);
  const share = h('button', { class: 'btn-ghost', type: 'button', 'aria-label': 'Bagikan preset' }, svg(ICONS.share), h('span', { class: 'lbl' }, 'Bagikan'));
  share.onclick = () => shareItem(item.link, title.textContent);
  const card = h('article', { class: 'glass pcard', style: '--i:' + idx, 'data-link': item.link },
    h('a', { class: 'thumb-link', href: item.link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open preset' }, thumb),
    h('div', { class: 'p-body' }, title, h('div', { class: 'badges' }, size, status), author, url, h('div', { class: 'actions' }, open, copy), h('div', { class: 'actions tools' }, fav, qr, share)));
  card._data = getData;
  if (!opts.collection) enrich(item, card, { thumb, title, size, author, status });
  return card;
}
function showResults(items, opts = {}) {
  const cards = items.map((it, idx) => presetCard(it, idx)), grid = h('div', { class: 'res-grid' }, ...cards);
  const copyAll = h('button', { class: 'btn-ghost sm', type: 'button' }, 'Salin semua');
  copyAll.onclick = async () => { await copyText(items.map((i) => i.link).join('\n')); toast(items.length + ' link disalin'); };
  const saveAll = h('button', { class: 'btn-ghost sm', type: 'button' }, 'Simpan semua');
  saveAll.onclick = () => {
    const a = loadFavs(); let n = 0;
    for (const c of cards.slice().reverse()) { const d = c._data(); if (a.length >= FAV_MAX) break; if (!a.some((f) => f.link === d.link)) { a.unshift({ ...d, t: Date.now() }); n++; } }
    if (saveFavs(a)) { syncHearts(); toast(n ? n + ' preset disimpan ke Koleksi' : 'Semua sudah ada di Koleksi'); }
  };
  const count = h('span', { class: 'count' }, String(items.length));
  const wrap = h('div', { class: 'enter' }, h('div', { class: 'res-head' }, h('span', { class: 'accent-line', 'aria-hidden': 'true' }), h('h2', {}, 'Preset links'), count, h('span', { class: 'spacer' }), copyAll, saveAll));
  if (opts.note) wrap.append(h('p', { class: 'res-note' }, opts.note));
  wrap.append(grid); setResults(wrap); focusResults();
  if (window.PFX && window.PFX.celebrate) window.PFX.celebrate(count);
}

/* ---------- search (1 link atau sampai MAX_BATCH link sekaligus) ---------- */
function setFindLabel() { const n = findAllTikTok(els.input.value).length; els.find.querySelector('.btn-label').textContent = n > 1 ? 'Find ' + n + ' Links' : 'Find Presets'; }
async function search(raw) {
  if (busy) return;
  const urls = findAllTikTok(raw);
  if (!urls.length) { markInput(false, 'Please enter a valid TikTok video URL before searching.'); setResults(panel('warn', 'Invalid TikTok Link', 'Please enter a valid TikTok video URL before searching.', 'err')); return; }
  urls.forEach((u) => markClip(normalizeLink(u))); hideClip();
  const retry = { label: 'Try Again', fn: () => search(els.input.value) };
  if (!navigator.onLine) { setResults(panel('off', 'You are offline', 'Searching needs an internet connection. Reconnect and try again.', 'err', retry)); return; }
  busy = true; els.find.disabled = true; els.find.querySelector('.btn-label').textContent = 'Searching...';
  controller = new AbortController(); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS * urls.length);
  const setStatus = showLoading(), multi = urls.length > 1;
  try {
    const merged = new Map(); let okN = 0, lastErr = null;
    for (let i = 0; i < urls.length; i++) {
      const tag = multi ? '[' + (i + 1) + '/' + urls.length + '] ' : ''; setStatus(tag + 'Connecting to PresetFlow...');
      try {
        const data = await request(urls[i], controller.signal, (t) => setStatus(tag + t));
        const links = extractItems(data);
        if (!links.length) { try { checkEnvelope(data); } catch (e) { if (!(e instanceof ApiError) || !EMPTY_RE.test(e.message)) throw e; } } // gagal sungguhan -> error; "tidak ada hasil" -> kosong
        saveHistory(urls[i]);
        if (links.length) { okN++; log('found', links.length); links.forEach((it) => { if (!merged.has(it.link)) merged.set(it.link, it); }); } // aktivitas hanya dihitung kalau pencarian BERHASIL
      } catch (e) { if (e.name === 'AbortError' || !multi) throw e; lastErr = e; } // mode banyak link: satu gagal tidak membatalkan yang lain
    }
    const items = [...merged.values()];
    if (items.length) showResults(items, multi ? { note: okN + ' dari ' + urls.length + ' link menghasilkan preset' + (okN < urls.length ? ' · sisanya kosong atau gagal' : '') } : {});
    else if (lastErr) throw lastErr;
    else setResults(panel('search', 'No Presets Found', "We couldn't find any preset links in the available search results for " + (multi ? 'these videos.' : 'this video.'), '', retry));
  } catch (err) {
    if (err.name === 'AbortError') {
      setResults(timedOut ? panel('warn', 'Search Timed Out', 'The search is taking too long. Please try again in a moment.', 'err', retry) : panel('search', 'Search cancelled', 'You can start a new search whenever you are ready.', '', retry));
    } else {
      console.error('PresetFlow search error:', err);
      const detail = err instanceof ApiError ? err.message : (err && err.name ? err.name + ': ' + err.message : '');
      setResults(panel('warn', 'Search Temporarily Unavailable', 'Something went wrong while searching. Please check your connection and try again.', 'err', retry, detail));
    }
  } finally {
    clearTimeout(timer); busy = false; controller = null; els.find.disabled = false; setFindLabel();
  }
}

/* ---------- input + history ---------- */
function markInput(valid, msg) {
  els.row.classList.toggle('valid', valid === true); els.row.classList.toggle('invalid', valid === false);
  els.hint.textContent = msg || HINT; els.hint.classList.toggle('bad', valid === false);
}
function onInput() {
  const v = els.input.value.trim(); els.clear.hidden = !v; const n = findAllTikTok(v).length;
  if (!v) markInput(null); else if (n > 1) markInput(true, n + ' TikTok links detected — all will be searched.'); else markInput(n === 1, n === 1 ? 'Looks good.' : 'This does not look like a TikTok video link.');
  setFindLabel();
}
function loadHistory() { try { const a = JSON.parse(localStorage.getItem(HISTORY_KEY)); return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 5) : []; } catch { return []; } }
function saveHistory(url) { try { const a = [url, ...loadHistory().filter((x) => x !== url)].slice(0, 5); localStorage.setItem(HISTORY_KEY, JSON.stringify(a)); } catch {} renderHistory(); }
function renderHistory() {
  const a = loadHistory(); els.histBox.hidden = !a.length;
  els.histList.replaceChildren(...a.map((u) => { const b = h('button', { type: 'button', title: u }, u); b.onclick = () => { els.input.value = u; onInput(); search(u); }; return h('li', {}, b); }));
}
$('clearHistory').onclick = () => { try { localStorage.removeItem(HISTORY_KEY); } catch {} renderHistory(); };
els.input.addEventListener('input', onInput);
els.input.addEventListener('paste', (e) => { // beberapa link (baris baru) dari clipboard -> satu baris, siap dicari semuanya
  const t = (e.clipboardData || window.clipboardData || { getData: () => '' }).getData('text'), all = findAllTikTok(t);
  if (all.length > 1) { e.preventDefault(); els.input.value = all.join('  '); onInput(); }
});
els.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(els.input.value); });
els.find.onclick = () => search(els.input.value);
els.clear.onclick = () => { els.input.value = ''; onInput(); els.input.focus(); };
if (navigator.clipboard && navigator.clipboard.readText) {
  els.paste.hidden = false;
  els.paste.onclick = async () => {
    try { const t = (await navigator.clipboard.readText()).trim(), all = findAllTikTok(t); els.input.value = all.length > 1 ? all.join('  ') : (all[0] || t); onInput(); }
    catch { toast('Clipboard access was blocked. Paste the link manually.'); els.input.focus(); }
  };
}


/* ---------- Koleksi favorit (localStorage, tanpa akun) ---------- */
function loadFavs() {
  try { const a = JSON.parse(localStorage.getItem(FAV_KEY)); return Array.isArray(a) ? a.filter((x) => x && typeof x.link === 'string' && isAM(x.link)) : []; } catch { return []; }
}
function saveFavs(a) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(a.slice(0, FAV_MAX))); updateFavCount(); return true; }
  catch { toast('Gagal menyimpan Koleksi. Penyimpanan penuh atau diblokir browser.'); return false; }
}
function updateFavCount() { const n = loadFavs().length; els.favCount.textContent = String(n); els.favCount.hidden = !n; }
function paintFav(b, on) { const l = b.querySelector('.lbl'); if (l) l.textContent = on ? 'Tersimpan' : 'Simpan'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', on ? 'Hapus dari Koleksi' : 'Simpan ke Koleksi'); b.title = on ? 'Hapus dari Koleksi' : 'Simpan ke Koleksi'; }
function favButton(link, getData, inCollection) {
  const b = h('button', { class: 'btn-ghost fav-btn', type: 'button', 'data-link': link }, svg(ICONS.heart), h('span', { class: 'lbl' }, 'Simpan'));
  paintFav(b, isFavLink(link));
  b.onclick = () => {
    const a = loadFavs(), i = a.findIndex((f) => f.link === link);
    if (i >= 0) { // remove
      const [gone] = a.splice(i, 1); if (!saveFavs(a)) return;
      if (inCollection) {
        renderCollection();
        toast('Dihapus dari Koleksi', { label: 'Urungkan', ttl: 5000, fn: () => { const c = loadFavs(); c.splice(Math.min(i, c.length), 0, gone); if (saveFavs(c)) renderCollection(); } });
      } else { paintFav(b, false); toast('Dihapus dari Koleksi'); }
      return;
    }
    if (a.length >= FAV_MAX) { toast('Koleksi penuh (maks. ' + FAV_MAX + '). Hapus beberapa dulu.'); return; }
    a.unshift({ ...getData(), t: Date.now() }); if (!saveFavs(a)) return;
    paintFav(b, true); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); toast('Disimpan ke Koleksi');
  };
  return b;
}
const isFavLink = (link) => loadFavs().some((f) => f.link === link);
function syncHearts() { const set = new Set(loadFavs().map((f) => f.link)); document.querySelectorAll('.fav-btn[data-link]').forEach((b) => paintFav(b, set.has(b.dataset.link))); }
let colQ = '', colSort = 'new';
function renderCollection() {
  const all = loadFavs(); let a = all.slice(); const q = colQ.trim().toLowerCase();
  if (q) a = a.filter((f) => ((f.title || '') + ' ' + (f.author || '') + ' ' + f.link).toLowerCase().includes(q));
  if (colSort === 'old') a.reverse(); else if (colSort === 'az') a.sort((x, y) => (x.title || '').localeCompare(y.title || ''));
  els.colCount.textContent = all.length ? String(all.length) : ''; els.colClear.hidden = !all.length; document.querySelector('.col-tools').hidden = !all.length;
  els.colList.replaceChildren(...(a.length ? a.map((f, i) => presetCard(f, i, { collection: true }))
    : all.length ? [panel('search', 'Tidak ada hasil', 'Tidak ada preset di Koleksi yang cocok dengan "' + colQ.trim() + '".')]
    : [panel('heart', 'Koleksi masih kosong', 'Tekan tombol Simpan pada kartu preset untuk menyimpannya di sini. Tersimpan di perangkat ini, tanpa akun.')]));
}
$('colSearch').addEventListener('input', (e) => { colQ = e.target.value; renderCollection(); });
$('colSort').addEventListener('change', (e) => { colSort = e.target.value; renderCollection(); });
$('colCopy').onclick = async () => { const a = loadFavs(); if (!a.length) return; await copyText(a.map((f) => f.link).join('\n')); toast(a.length + ' link disalin'); };
$('colExport').onclick = () => {
  const a = loadFavs(); if (!a.length) { toast('Koleksi masih kosong'); return; }
  const blob = new Blob([JSON.stringify({ app: 'presetflow', v: 1, items: a }, null, 2)], { type: 'application/json' });
  const l = h('a', { href: URL.createObjectURL(blob), download: 'presetflow-koleksi.json' }); document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 4000); toast('Koleksi diekspor');
};
$('colImport').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text()), src = Array.isArray(j) ? j : j.items; if (!Array.isArray(src)) throw new Error('bad');
    const a = loadFavs(), have = new Set(a.map((x) => x.link)); let n = 0;
    for (const x of src) {
      if (!x || typeof x.link !== 'string' || !isAM(x.link) || have.has(x.link) || a.length >= FAV_MAX) continue;
      const str = (v, m) => (typeof v === 'string' ? v.slice(0, m) : '');
      a.push({ link: x.link, title: str(x.title, 200), image: isHttp(x.image) ? x.image.slice(0, 500) : '', size: str(x.size, 12), author: str(x.author, 60), t: Number(x.t) || Date.now() }); have.add(x.link); n++;
    }
    if (saveFavs(a)) { renderCollection(); toast(n ? n + ' preset diimpor' : 'Tidak ada preset baru di file itu'); }
  } catch { toast('File tidak valid. Pakai file hasil Ekspor PresetFlow.'); }
};
document.querySelector('label[for="colImport"]').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('colImport').click(); } });
$('colCheck').onclick = async () => {
  const btn = $('colCheck'), cards = [...els.colList.querySelectorAll('.pcard[data-link]')]; if (!cards.length || btn.disabled) return;
  btn.disabled = true; btn.textContent = 'Mengecek…'; cards.forEach((c) => paintStatus(c.querySelector('.badge.st'), 'checking'));
  let i = 0, dead = 0, ok = 0; const worker = async () => { while (i < cards.length) { const c = cards[i++], r = await checkStatus(c.dataset.link); paintStatus(c.querySelector('.badge.st'), r.state); if (r.state === 'dead') dead++; else if (r.state === 'ok') ok++; } };
  await Promise.all([worker(), worker(), worker()]); btn.disabled = false; btn.textContent = 'Cek status';
  toast(dead ? dead + ' link mungkin kedaluwarsa' : ok ? 'Semua link yang bisa dicek masih aktif' : 'Status tidak bisa dicek (server preview tidak tersedia)');
};
function route() { // #koleksi = halaman Koleksi (tombol Back Android ikut bekerja)
  const on = location.hash === '#koleksi';
  document.body.classList.toggle('view-col', on); els.col.hidden = !on;
  if (on) { renderCollection(); window.scrollTo(0, 0); } else syncHearts();
}
window.addEventListener('hashchange', route);
els.colBtn.onclick = () => { location.hash = 'koleksi'; };
$('colBack').onclick = () => { history.pushState(null, '', location.pathname + location.search); route(); };
els.colClear.onclick = () => { if (confirm('Hapus semua preset dari Koleksi?')) { try { localStorage.removeItem(FAV_KEY); } catch {} updateFavCount(); renderCollection(); } };
window.addEventListener('storage', (e) => { if (e.key === FAV_KEY) { updateFavCount(); if (!els.col.hidden) renderCollection(); else syncHearts(); } });

/* ---------- Share langsung dari TikTok (Web Share Target, GET) ----------
   manifest.webmanifest mengarahkan menu Bagikan ke /?title=..&text=..&url=.. ; link TikTok diambil dari salah satunya. */
function handleShare() {
  const q = new URLSearchParams(location.search);
  if (!q.has('url') && !q.has('text') && !q.has('title')) return false;
  const link = findTikTok(q.get('url')) || findTikTok(q.get('text')) || findTikTok(q.get('title'));
  history.replaceState(null, '', location.pathname + location.hash); // bersihkan URL agar reload tidak mencari ulang
  if (!link) { toast('Tidak ada link TikTok pada yang dibagikan.'); return true; }
  els.input.value = link; onInput(); search(link); return true;
}

/* ---------- Deteksi clipboard ----------
   Hanya di browser yang mendukung izin clipboard-read (Chrome/Edge/Android). Di browser lain tombol paste tetap tersedia. */
const clip = { banner: $('clipBanner'), url: $('clipUrl'), link: null, norm: null };
let clipAsked = false, clipTimer = null;
const hideClip = () => { clip.banner.hidden = true; };
function markClip(norm) { if (!norm) return; try { localStorage.setItem(CLIP_KEY, norm); } catch {} }
async function checkClipboard() {
  if (busy || document.visibilityState !== 'visible' || location.hash === '#koleksi' || !navigator.clipboard || !navigator.clipboard.readText || !navigator.permissions) return;
  try {
    const p = await navigator.permissions.query({ name: 'clipboard-read' });
    if (p.state === 'denied') return;
    if (p.state === 'prompt') { if (clipAsked) return; clipAsked = true; } // minta izin paling banyak sekali per sesi
  } catch { return; }
  let text; try { text = await navigator.clipboard.readText(); } catch { return; }
  const link = findTikTok(text); if (!link) return;
  const norm = normalizeLink(link); let last = ''; try { last = localStorage.getItem(CLIP_KEY) || ''; } catch {}
  const cur = findTikTok(els.input.value); if (norm === last || (cur && normalizeLink(cur) === norm)) return;
  clip.link = link; clip.norm = norm; clip.url.textContent = link; clip.banner.hidden = false;
}
const scheduleClipCheck = () => { clearTimeout(clipTimer); clipTimer = setTimeout(checkClipboard, 350); };
$('clipGo').onclick = () => { hideClip(); els.input.value = clip.link; onInput(); search(clip.link); };
$('clipNo').onclick = () => { markClip(clip.norm); hideClip(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleClipCheck(); });
window.addEventListener('focus', scheduleClipCheck);

/* ---------- PWA ---------- */
let deferred = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (!standalone()) els.install.hidden = false; });
window.addEventListener('appinstalled', () => { deferred = null; els.install.hidden = true; toast('PresetFlow installed'); });
els.install.onclick = async () => {
  if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; els.install.hidden = true; }
  else showInstallHelp();
};
function showInstallHelp() {
  $('installText').textContent = /iphone|ipad/i.test(navigator.userAgent)
    ? 'In Safari, tap Share, then "Add to Home Screen".'
    : 'Open your browser menu (the three dots in Chrome) and choose "Install app" or "Add to Home screen". Not every browser supports this.';
  $('installDialog').showModal();
}
$('closeInstall').onclick = () => $('installDialog').close();
if (!standalone()) setTimeout(() => { if (els.install.hidden && !deferred) els.install.hidden = false; }, 1500);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Update available', { label: 'Reload', fn: () => w.postMessage('SKIP_WAITING') }); });
    });
  }).catch(() => { /* single-file deploy: no service-worker.js next to index.html, offline caching is skipped */ }));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!window.__reloading) { window.__reloading = true; location.reload(); } });
}
window.addEventListener('offline', () => toast('You are offline. Searching needs a connection.'));

renderHistory(); setResults(emptyState()); updateFavCount(); route();
if (!handleShare()) setTimeout(checkClipboard, 700);

/* ---- Pointer spotlight on the search card (desktop only) ---- */
(function () {
  const card = document.getElementById('searchCard');
  if (!card || !matchMedia('(hover:hover)').matches) return;
  card.addEventListener('pointermove', (e) => { const r = card.getBoundingClientRect(); card.style.setProperty('--mx', (e.clientX - r.left) + 'px'); card.style.setProperty('--my', (e.clientY - r.top) + 'px'); card.style.setProperty('--o', 1); });
  card.addEventListener('pointerleave', () => card.style.setProperty('--o', 0));
})();

/* ---- Pintasan: tekan "/" untuk fokus ke kotak link ---- */
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || !els.col.hidden || $('qrDialog').open) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  e.preventDefault(); els.input.focus(); els.input.select();
});
