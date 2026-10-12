// Feed "Baru dicari": 10 preset terbaru dari pencarian user, sama untuk semua pengunjung.
(() => {
  const API = '/api/recent', MAX = 10, POLL = 15000;
  const root = document.getElementById('recentList');
  if (!root) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isHttp = u => /^https?:\/\//i.test(u || '');
  const ago = t => {
    const s = Math.max(1, (Date.now() - new Date(t)) / 1000 | 0);
    if (s < 60) return 'baru saja';
    const m = s / 60 | 0; if (m < 60) return m + ' mnt lalu';
    const h = m / 60 | 0; return h < 24 ? h + ' jam lalu' : (h / 24 | 0) + ' hari lalu';
  };

  function card(p) {
    const link = isHttp(p.preset_link) ? p.preset_link : '';
    const el = document.createElement('article');
    el.className = 'rcard';
    el.dataset.id = p.id;
    el.dataset.link = link;
    el.innerHTML = `<div class="thumb"><img width="300" height="400" alt="" decoding="async" loading="lazy" referrerpolicy="no-referrer"></div>
      <div class="meta"><h3>${esc(p.title || 'Preset')}</h3>
      <time data-t="${esc(p.created_at)}">${ago(p.created_at)}</time>
      <div class="acts"><a class="btn pri" target="_blank" rel="noopener">Import</a>
      <button class="btn" type="button" data-copy>Salin tautan</button></div></div>`;
    const a = el.querySelector('a'); if (link) a.href = link; else a.removeAttribute('target');
    const img = el.querySelector('img'), box = el.querySelector('.thumb');
    img.addEventListener('load', () => img.classList.add('ok'));
    img.addEventListener('error', () => box.classList.add('bad'));
    if (isHttp(p.thumbnail)) img.src = p.thumbnail; else box.classList.add('bad');
    return el;
  }

  let first = true, sig = '';

  function render(items) {
    items = items.slice(0, MAX);
    root.querySelector('.pf-empty')?.remove();

    const live = [...root.querySelectorAll('.rcard:not(.leave)')];
    const have = new Map(live.map(e => [e.dataset.id, e]));
    const before = reduce ? null : new Map(live.map(e => [e, e.getBoundingClientRect()]));
    const ids = new Set(items.map(p => String(p.id)));

    live.forEach(e => {
      if (ids.has(e.dataset.id)) return;
      if (reduce) return e.remove();
      e.classList.add('leave');
      e.addEventListener('animationend', () => e.remove(), { once: true });
    });
    if (first) root.innerHTML = ''; // hapus skeleton

    const order = items.map((p, i) => {
      let el = have.get(String(p.id));
      if (!el) {
        el = card(p);
        if (!reduce) {
          el.classList.add('enter');
          el.style.setProperty('--d', first ? i * 50 + 'ms' : '0ms');
          if (!first) el.classList.add('fresh');
          el.addEventListener('animationend', ev => {
            if (ev.animationName === 'pfIn') el.classList.remove('enter');
            else if (ev.animationName === 'pfRing') el.classList.remove('fresh');
          });
        }
      }
      return el;
    });

    let ref = root.firstElementChild;
    order.forEach(el => { if (el === ref) ref = ref.nextElementSibling; else root.insertBefore(el, ref); });

    // geser halus kartu lama (hanya saat data berubah, bukan saat scroll)
    if (before) order.forEach(el => {
      const b = before.get(el); if (!b) return;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (dx || dy) el.animate(
        [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
        { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });

    if (!items.length) root.innerHTML = '<p class="pf-empty">Belum ada preset. Cari dari link TikTok, hasilnya akan muncul di sini.</p>';
    first = false;
  }

  async function refresh() {
    if (document.hidden) return;
    try {
      const r = await fetch(API, { cache: 'no-store' });
      if (!r.ok) return;
      const items = (await r.json()).items || [];
      const s = items.map(p => p.id).join(',');
      if (s !== sig) { sig = s; render(items); }
    } catch { /* coba lagi di polling berikutnya */ }
  }

  // Panggil setelah pencarian berhasil (jika pencarian berjalan di klien)
  async function report(p) {
    try {
      await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    } catch {}
    refresh();
  }
  window.PresetFeed = { refresh, report };

  // Salin tautan
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const link = b.closest('.rcard')?.dataset.link; if (!link) return;
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; }
    catch {
      const t = document.createElement('textarea');
      t.value = link; t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select();
      try { ok = document.execCommand('copy'); } catch {}
      t.remove();
    }
    b.textContent = ok ? 'Tersalin ✓' : 'Gagal menyalin';
    b.classList.toggle('done', ok);
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.textContent = 'Salin tautan'; b.classList.remove('done'); }, 1600);
  });

  root.innerHTML = '<div class="pf-skel"></div>'.repeat(4);
  refresh();
  setInterval(refresh, POLL);
  document.addEventListener('visibilitychange', refresh);
  setInterval(() => root.querySelectorAll('time[data-t]').forEach(t => t.textContent = ago(t.dataset.t)), 60000);
})();
