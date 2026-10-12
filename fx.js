'use strict';
/* PresetFlow — efek visual: tema aksen, jaringan partikel interaktif, cursor glow, progress scroll, tilt 3D kartu,
   ripple tombol, konfeti, animasi kata judul, placeholder mengetik. Murni dekoratif; mati otomatis bila reduced-motion. */
(function () {
  const $ = (id) => document.getElementById(id), root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const KEY = 'presetflow.theme.v1', THEMES = ['mint', 'violet', 'sunset', 'ocean', 'rose'];
  let rgb = '120,221,176';
  const readColor = () => { rgb = (getComputedStyle(root).getPropertyValue('--emr') || '').trim() || '120,221,176'; };

  /* ---------- tema aksen ---------- */
  const themeBtn = $('themeBtn'), pop = $('themePop');
  function markTheme(t) { pop.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', b.dataset.t === t ? 'true' : 'false')); }
  function applyTheme(t, animate) {
    if (!THEMES.includes(t)) t = 'mint';
    const go = () => { root.dataset.theme = t; try { localStorage.setItem(KEY, t); } catch {} markTheme(t); readColor(); };
    if (animate && !reduce && document.startViewTransition) document.startViewTransition(go); else go();
  }
  let saved = 'mint'; try { saved = localStorage.getItem(KEY) || 'mint'; } catch {}
  markTheme(THEMES.includes(saved) ? saved : 'mint'); readColor();
  const closePop = () => { pop.hidden = true; themeBtn.setAttribute('aria-expanded', 'false'); };
  themeBtn.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; themeBtn.setAttribute('aria-expanded', String(!pop.hidden)); });
  pop.addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) { applyTheme(b.dataset.t, true); closePop(); } });
  document.addEventListener('click', (e) => { if (!pop.hidden && !e.target.closest('.theme-wrap')) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { closePop(); themeBtn.focus(); } });

  /* ---------- scroll progress ---------- */
  const prog = $('prog');
  if (prog) {
    let tick = false;
    const upd = () => { tick = false; const m = document.documentElement.scrollHeight - innerHeight; prog.style.transform = 'scaleX(' + (m > 0 ? Math.min(1, scrollY / m) : 0) + ')'; };
    addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true }); upd();
  }

  /* ---------- hero: kata muncul satu per satu ---------- */
  const h1 = document.querySelector('h1');
  if (h1 && !reduce) {
    let i = 0;
    [...h1.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((t) => { if (!t) return; if (!t.trim()) { frag.append(t); return; } const s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--wi', i++); s.textContent = t; frag.append(s); });
        n.replaceWith(frag);
      } else if (n.nodeName === 'EM') { const w = document.createElement('span'); w.className = 'w'; w.style.setProperty('--wi', i++); n.replaceWith(w); w.append(n); }
    });
  }

  /* ---------- placeholder mengetik ---------- */
  const inp = $('urlInput');
  if (inp && !reduce) {
    const phr = ['Paste your TikTok video link...', 'https://vt.tiktok.com/ZS...', 'https://www.tiktok.com/@user/video/...', 'Paste up to 5 links at once...'];
    let pi = 0, ci = 0, del = false;
    (function tick() {
      if (inp.value || document.activeElement === inp || document.hidden) { inp.placeholder = phr[0]; ci = 0; del = false; setTimeout(tick, 1500); return; }
      const ph = phr[pi]; ci += del ? -1 : 1; inp.placeholder = ph.slice(0, ci) + '▏';
      let d = del ? 22 : 55;
      if (!del && ci >= ph.length) { del = true; d = 1700; } else if (del && ci <= 0) { del = false; pi = (pi + 1) % phr.length; d = 380; }
      setTimeout(tick, d);
    })();
  }

  /* ---------- ripple tombol ---------- */
  document.addEventListener('pointerdown', (e) => {
    if (reduce) return; const b = e.target.closest && e.target.closest('.btn-primary,.btn-open,.btn-ghost'); if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span'); s.className = 'rip';
    s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    b.append(s); s.addEventListener('animationend', () => s.remove());
  }, { passive: true });

  /* ---------- tilt 3D + kilau pada kartu (mouse saja) ---------- */
  document.addEventListener('animationend', (e) => { const t = e.target; if (t.classList && t.classList.contains('pcard') && e.animationName === 'rise') t.classList.add('settled'); });
  if (fine && !reduce) {
    let last = null; const reset = (c) => { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); };
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const c = e.target.closest && e.target.closest('.pcard.settled');
      if (last && last !== c) reset(last); last = c || null; if (!c) return;
      const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      c.style.setProperty('--ry', ((px - 0.5) * 6).toFixed(2) + 'deg'); c.style.setProperty('--rx', ((0.5 - py) * 4).toFixed(2) + 'deg');
      c.style.setProperty('--gx', (px * 100).toFixed(1) + '%'); c.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => { if (last) { reset(last); last = null; } });
  }

  /* ---------- konfeti + hitung naik ---------- */
  function confetti(x, y, n) {
    if (reduce) return; n = n || 48;
    const c = document.createElement('canvas'); c.className = 'confetti'; c.width = innerWidth; c.height = innerHeight; document.body.append(c);
    const g = c.getContext('2d'), cols = ['rgb(' + rgb + ')', '#ffffff', '#E3B55C', 'rgba(' + rgb + ',.55)'];
    const ps = Array.from({ length: n }, () => { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 4 + Math.random() * 8; return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 4 + Math.random() * 5, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0], life: 70 + Math.random() * 40 }; });
    let f = 0;
    (function step() {
      g.clearRect(0, 0, c.width, c.height); let alive = 0;
      ps.forEach((p) => { if (p.life <= 0) return; alive++; p.vy += 0.24; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--; g.save(); g.globalAlpha = Math.min(1, p.life / 30); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      if (alive && ++f < 240) requestAnimationFrame(step); else c.remove();
    })();
  }
  function celebrate(countEl) {
    if (!countEl) return; const to = parseInt(countEl.textContent, 10) || 0;
    if (!reduce && to > 0) { const t0 = performance.now(); countEl.classList.add('bump'); (function f(n) { const p = Math.min((n - t0) / 700, 1); countEl.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(f); else countEl.textContent = String(to); })(t0); }
    requestAnimationFrame(() => { const r = countEl.getBoundingClientRect(); confetti(Math.min(Math.max(r.left + r.width / 2, 20), innerWidth - 20), Math.min(Math.max(r.top + r.height / 2, 80), innerHeight - 40)); });
  }
  window.PFX = { celebrate, confetti };

  /* ---------- jaringan partikel + cursor glow ---------- */
  const cv = $('fx'), glow = $('glow');
  if (!cv || reduce) { if (cv) cv.hidden = true; if (glow) glow.hidden = true; return; }
  const ctx = cv.getContext('2d'); let W = 0, H = 0, dpr = 1, pts = [], run = true;
  const mouse = { x: -9999, y: -9999 }, gl = { x: innerWidth / 2, y: innerHeight / 3, tx: innerWidth / 2, ty: innerHeight / 3 };
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr);
    const n = Math.round(Math.min(64, (innerWidth * innerHeight) / 17000));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.28 * dpr, vy: (Math.random() - 0.5) * 0.28 * dpr, r: (Math.random() * 1.3 + 0.6) * dpr }));
  }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(size, 150); });
  addEventListener('pointermove', (e) => { mouse.x = e.clientX * dpr; mouse.y = e.clientY * dpr; gl.tx = e.clientX; gl.ty = e.clientY; if (glow && fine) glow.classList.add('on'); }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { mouse.x = mouse.y = -9999; if (glow) glow.classList.remove('on'); });
  document.addEventListener('visibilitychange', () => { run = !document.hidden; if (run) requestAnimationFrame(frame); });
  function frame() {
    if (!run) return; ctx.clearRect(0, 0, W, H); const L = 125 * dpr, M = 170 * dpr;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; p.x += p.vx; p.y += p.vy; if (p.x < 0) p.x = W; else if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; else if (p.y > H) p.y = 0;
      const mx = mouse.x - p.x, my = mouse.y - p.y, md = Math.hypot(mx, my);
      if (md < M) { p.x += mx * 0.004; p.y += my * 0.004; ctx.strokeStyle = 'rgba(' + rgb + ',' + ((1 - md / M) * 0.4).toFixed(3) + ')'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
      for (let j = i + 1; j < pts.length; j++) { const q = pts[j], d = Math.hypot(p.x - q.x, p.y - q.y); if (d < L) { ctx.strokeStyle = 'rgba(' + rgb + ',' + ((1 - d / L) * 0.2).toFixed(3) + ')'; ctx.lineWidth = dpr * 0.8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
      ctx.fillStyle = 'rgba(' + rgb + ',.55)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
    if (glow && fine) { gl.x += (gl.tx - gl.x) * 0.12; gl.y += (gl.ty - gl.y) * 0.12; glow.style.transform = 'translate3d(' + gl.x.toFixed(1) + 'px,' + gl.y.toFixed(1) + 'px,0)'; }
    requestAnimationFrame(frame);
  }
  size(); requestAnimationFrame(frame);
})();
