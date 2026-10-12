/* PresetFlow: kartu "Aktivitas Terbaru" menampilkan PRESET (thumbnail + Import + Salin tautan),
   maks 10 terbaru, sama untuk semua pengunjung. Tidak ada elemen yang dihapus (baris lama hanya disembunyikan). */
(() => {
  'use strict';
  const CFG = Object.assign({
    api: '/api/recent', max: 10, poll: 15000,
    target: null,                      // isi mis. '#activityList' jika auto-deteksi gagal
    heading: /aktivitas\s+terbaru/i,   // judul kartu yang dipakai
    keepOld: false,                    // true = baris aktivitas lama tetap tampil di bawah daftar preset
    localKey: 'pf_recent_local',
    mock: null
  }, window.PF_FEED || {});
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isHttp = u => /^https?:\/\//i.test(u || '');
  const isImg = u => /^(https?:\/\/|data:image\/)/i.test(u || '');
  const ago = t => {
    const s = Math.max(1, (Date.now() - new Date(t)) / 1000 | 0);
    if (s < 60) return 'baru saja';
    const m = s / 60 | 0; if (m < 60) return m + ' mnt lalu';
    const h = m / 60 | 0; return h < 24 ? h + ' jam lalu' : (h / 24 | 0) + ' hari lalu';
  };

  let list = null, cardRef = null, headRef = null, mo = null;
  let first = true, sig = '', lastItems = [], started = false;

  /* ---------- cari & pasang di kartu "Aktivitas Terbaru" ---------- */
  const titleLike = root => [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,[class*="title"],[class*="heading"]')]
    .filter(e => !e.closest('.pfa-list'));

  function hideOld() {
    if (CFG.keepOld || !cardRef) return;
    [...cardRef.children].forEach(c => {
      if (c !== headRef && c !== list && !c.hasAttribute('data-pfa-old')) c.setAttribute('data-pfa-old', '');
    });
  }
  function watch() {
    mo && mo.disconnect();
    if (!cardRef) return;
    mo = new MutationObserver(() => {
      if (!list || !list.isConnected) { if (mount()) { first = true; sig = ''; render(lastItems); } }
      else hideOld();
    });
    mo.observe(cardRef, { childList: true });
  }
  function mount() {
    if (list && list.isConnected) return true;
    if (CFG.target) {
      const t = document.querySelector(CFG.target);
      if (!t) return false;
      list = t; list.classList.add('pfa-list'); list.addEventListener('click', onClick);
      return true;
    }
    const hits = titleLike(document).filter(e => CFG.heading.test(e.textContent || ''));
    if (!hits.length) return false;
    const h = hits.reduce((a, b) => (b.textContent.length < a.textContent.length ? b : a));
    let card = h.parentElement, steps = 0;
    while (card && card.parentElement && card.parentElement !== document.body && steps < 4) {
      if (titleLike(card.parentElement).length > 1) break;   // naik lagi = masuk kartu lain
      card = card.parentElement; steps++;
    }
    if (!card) return false;
    headRef = [...card.children].find(c => c.contains(h)) || h;
    cardRef = card;
    list = document.createElement('div');
    list.className = 'pfa-list';
    list.addEventListener('click', onClick);
    headRef.insertAdjacentElement('afterend', list);
    hideOld(); watch();
    return true;
  }

  /* ---------- data ---------- */
  const loadLocal = () => { try { return JSON.parse(localStorage.getItem(CFG.localKey) || '[]'); } catch { return []; } };
  const saveLocal = a => { try { localStorage.setItem(CFG.localKey, JSON.stringify(a.slice(0, CFG.max))); } catch {} };

  async function fetchItems() {
    if (CFG.mock) return CFG.mock;
    try {
      const r = await fetch(CFG.api, { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j.items)) return j.items; }
    } catch {}
    return loadLocal();   // server belum siap: tetap tampil dari perangkat ini
  }

  const pick = (o, keys) => { for (const k of keys) if (o && o[k]) return o[k]; return ''; };
  function normalize(x, src) {
    if (!x) return null;
    if (typeof x === 'string') x = { link: x };
    const link = pick(x, ['preset_link', 'link', 'url', 'shareLink', 'share_link', 'import_url', 'importUrl', 'href']);
    if (!isHttp(link)) return null;
    return {
      source_url: pick(x, ['source_url', 'source', 'tiktok_url', 'input']) || src || '',
      title: pick(x, ['title', 'name', 'caption', 'desc', 'description']) || 'Preset',
      thumbnail: pick(x, ['thumbnail', 'thumb', 'cover', 'image', 'preview', 'poster']) || '',
      preset_link: link
    };
  }

  // Panggil saat preset BERHASIL ditemukan. Menerima objek hasil, string link, atau array.
  async function report(x, src) {
    for (const item of (Array.isArray(x) ? x : [x])) {
      const p = normalize(item, src); if (!p) continue;
      let ok = false;
      try {
        const r = await fetch(CFG.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
        ok = r.ok;
      } catch {}
      if (!ok) {
        const arr = loadLocal().filter(i => i.preset_link !== p.preset_link);
        arr.unshift({ id: 'l' + Date.now() + Math.random().toString(36).slice(2, 6), title: p.title, thumbnail: p.thumbnail, preset_link: p.preset_link, created_at: new Date().toISOString() });
        saveLocal(arr);
      }
    }
    refresh(true);
  }

  /* ---------- tampilan ---------- */
  function item(p) {
    const link = isHttp(p.preset_link) ? p.preset_link : '';
    const el = document.createElement('article');
    el.className = 'pfa-item';
    el.dataset.id = p.id; el.dataset.link = link;
    el.innerHTML = `<div class="pfa-main"><div class="pfa-thumb"><img width="116" height="154" alt="" decoding="async" loading="lazy" referrerpolicy="no-referrer"></div>
      <div class="pfa-txt"><h4 class="pfa-name">${esc(p.title || 'Preset')}</h4>
      <div class="pfa-sub"><span class="pfa-dot"></span><span>Preset ditemukan</span><span>&middot;</span><time data-t="${esc(p.created_at)}">${ago(p.created_at)}</time></div></div></div>
      <div class="pfa-acts"><a class="pfa-btn pri" target="_blank" rel="noopener">Import</a>
      <button class="pfa-btn" type="button" data-copy>Salin tautan</button></div>`;
    const a = el.querySelector('a'); if (link) a.href = link; else a.removeAttribute('target');
    const img = el.querySelector('img'), box = el.querySelector('.pfa-thumb');
    img.addEventListener('load', () => img.classList.add('ok'));
    img.addEventListener('error', () => box.classList.add('bad'));
    if (isImg(p.thumbnail)) img.src = p.thumbnail; else box.classList.add('bad');
    return el;
  }

  function render(items) {
    items = items.slice(0, CFG.max);
    lastItems = items;
    list.querySelector('.pfa-empty')?.remove();

    const live = [...list.querySelectorAll('.pfa-item:not(.leave)')];
    const have = new Map(live.map(e => [e.dataset.id, e]));
    const before = reduce ? null : new Map(live.map(e => [e, e.getBoundingClientRect()]));
    const ids = new Set(items.map(p => String(p.id)));

    live.forEach(e => {
      if (ids.has(e.dataset.id)) return;
      if (reduce) return e.remove();
      e.classList.add('leave');
      e.addEventListener('animationend', ev => { if (ev.animationName === 'pfaOut') e.remove(); });
    });
    if (first) list.innerHTML = '';

    const order = items.map((p, i) => {
      let el = have.get(String(p.id));
      if (!el) {
        el = item(p);
        if (!reduce) {
          el.classList.add('enter');
          el.style.setProperty('--d', first ? i * 50 + 'ms' : '0ms');
          if (!first) el.classList.add('fresh');
          el.addEventListener('animationend', ev => {
            if (ev.animationName === 'pfaIn') el.classList.remove('enter');
            else if (ev.animationName === 'pfaRing') el.classList.remove('fresh');
          });
        }
      }
      return el;
    });

    let ref = list.firstElementChild;
    order.forEach(el => { if (el === ref) ref = ref.nextElementSibling; else list.insertBefore(el, ref); });

    if (before) order.forEach(el => {          // geser halus (hanya saat data berubah)
      const b = before.get(el); if (!b) return;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
        { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });

    if (!items.length) list.innerHTML = '<div class="pfa-empty">Belum ada preset. Cari dari link TikTok, hasilnya muncul di sini.</div>';
    first = false;
  }

  async function refresh(force) {
    if (document.hidden && force !== true) return;
    if (!list || !list.isConnected) { list = null; if (!mount()) return; first = true; sig = ''; }
    hideOld();
    const items = await fetchItems();
    const s = items.map(p => p.id).join(',');
    if (force === true || s !== sig) { sig = s; render(items); }
  }

  async function onClick(e) {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const link = b.closest('.pfa-item')?.dataset.link; if (!link) return;
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; }
    catch {
      const t = document.createElement('textarea');
      t.value = link; t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select();
      try { ok = document.execCommand('copy'); } catch {}
      t.remove();
    }
    b.textContent = ok ? 'Tersalin \u2713' : 'Gagal menyalin';
    b.classList.toggle('done', ok);
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.textContent = 'Salin tautan'; b.classList.remove('done'); }, 1600);
  }

  function start() {
    if (started) return; started = true;
    refresh(true);
    setInterval(refresh, CFG.poll);
    document.addEventListener('visibilitychange', () => refresh());
    setInterval(() => list && list.querySelectorAll('time[data-t]').forEach(t => t.textContent = ago(t.dataset.t)), 60000);
  }

  function boot() {
    let tries = 0;
    const attempt = () => {
      if (mount()) return start();
      if (++tries < 24) return setTimeout(attempt, 500);
      console.warn('[PresetFeed] Kartu "Aktivitas Terbaru" tidak ditemukan. Set window.PF_FEED = { target: "#idDaftarAktivitas" } sebelum script ini.');
    };
    attempt();
  }

  window.PresetFeed = { report, refresh: () => refresh(true) };
  document.addEventListener('presetflow:found', e => report(e.detail));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
