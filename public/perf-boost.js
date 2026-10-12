/* PresetFlow perf-boost: pasang PALING ATAS di <head>, sebelum script lain, tanpa defer.
   Tidak menghapus elemen apa pun. Matikan sementara untuk dibandingkan: tambah ?perf=off di URL. */
(() => {
  'use strict';
  if (/[?&]perf=off\b/.test(location.search)) return;

  const OPT = { dprCap: 1, bgFps: 30, pauseOnScroll: true };
  const root = document.documentElement;
  root.classList.add('pf-lite');

  // 1) Batasi devicePixelRatio: canvas latar (partikel) di HP bisa 7x lebih berat tanpa batas ini.
  try {
    const real = window.devicePixelRatio || 1;
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => Math.min(real, OPT.dprCap) });
  } catch {}

  // 2) Tandai saat sedang scroll (dipakai CSS untuk menjeda animasi tak berujung).
  let scrolling = false, timer = 0;
  const onScroll = () => {
    if (!scrolling) { scrolling = true; root.classList.add('is-scrolling'); }
    clearTimeout(timer);
    timer = setTimeout(() => { scrolling = false; root.classList.remove('is-scrolling'); }, 150);
  };
  addEventListener('scroll', onScroll, { passive: true, capture: true });
  addEventListener('touchmove', onScroll, { passive: true });

  // 3) Loop requestAnimationFrame (animasi canvas dsb.): maks ~30fps dan ditunda selama scroll.
  const nat = window.requestAnimationFrame.bind(window);
  const natCancel = window.cancelAnimationFrame.bind(window);
  const minGap = 1000 / OPT.bgFps - 5;
  const lastRun = new WeakMap();
  const live = new Map();
  let uid = 0;

  window.requestAnimationFrame = cb => {
    const h = ++uid;
    const step = ts => {
      const prev = lastRun.get(cb) || 0;
      if ((OPT.pauseOnScroll && scrolling) || ts - prev < minGap) { live.set(h, nat(step)); return; }
      live.delete(h);
      lastRun.set(cb, ts);
      cb(ts);
    };
    live.set(h, nat(step));
    return h;
  };
  window.cancelAnimationFrame = h => {
    if (live.has(h)) { natCancel(live.get(h)); live.delete(h); } else natCancel(h);
  };
})();
