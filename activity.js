'use strict';
/* PresetFlow — aktivitas pencarian real-time (Supabase). Hanya menampilkan data asli; tersembunyi bila belum dikonfigurasi. */
(function () {
  const cfg = window.PRESETFLOW_CONFIG || {};
  const box = document.getElementById('activity'), setup = document.getElementById('activitySetup');
  const dev = /^(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(location.hostname);
  window.PFActivity = { log() {} };
  const showSetup = (msg) => { if (dev && setup) { if (msg) document.getElementById('setupMsg').textContent = msg; setup.hidden = false; } };
  if (!box || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) { showSetup(); return; }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 5 } } });
  const $ = (id) => document.getElementById(id);
  const TZ = 'Asia/Jakarta', DAYS = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'], MAX_FEED = 6;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => Number(n).toLocaleString('id-ID');
  const dayKey = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
  const timeStr = (t) => new Date(t).toLocaleTimeString('id-ID', { timeZone: TZ, hour12: false });
  const state = { total: 0, found: null, today: 0, days: [] }, seen = new Set();
  let chartKey = '';

  function countUp(el, to) {
    const from = Number(el.dataset.v) || 0; el.dataset.v = to;
    if (reduce || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 700;
    (function f(n) { const p = Math.min((n - t0) / dur, 1); el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(f); })(t0);
  }
  function renderStats() {
    countUp($('statTotal'), state.total); countUp($('statToday'), state.today);
    $('capTotal').textContent = 'Pencarian berhasil · seluruh waktu';
    const y = state.days.length > 1 ? state.days[state.days.length - 2].c : 0, d = state.today - y, el = $('delta');
    el.hidden = false; el.className = 'delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'same');
    el.textContent = d > 0 ? '▲ ' + d + ' dari kemarin' : d < 0 ? '▼ ' + Math.abs(d) + ' dari kemarin' : 'sama seperti kemarin';
    const chip = $('liveChip'); if (chip) { $('liveChipText').replaceChildren(Object.assign(document.createElement('b'), { textContent: fmt(state.today) }), document.createTextNode(' pencarian hari ini · ' + fmt(state.total) + ' total')); chip.hidden = false; }
  }
  function renderSpark() {
    const c = state.days.map((d) => d.c), max = Math.max(1, ...c), n = c.length; if (n < 2) return;
    const pts = c.map((v, i) => [i / (n - 1) * 100, 30 - v / max * 26]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const sp = $('spark'); sp.querySelector('.line').setAttribute('d', line); sp.querySelector('.area').setAttribute('d', line + 'L100 32L0 32Z');
  }
  function renderChart() {
    const chart = $('chart'), max = Math.max(1, ...state.days.map((d) => d.c)), key = state.days.map((d) => d.d).join();
    if (key !== chartKey) {
      chartKey = key; chart.replaceChildren();
      state.days.forEach((d, i) => {
        const col = document.createElement('div'); col.className = 'col' + (i === state.days.length - 1 ? ' today' : '');
        const val = document.createElement('span'); val.className = 'val';
        const track = document.createElement('div'); track.className = 'track';
        const bar = document.createElement('div'); bar.className = 'bar'; bar.style.transitionDelay = (i * 70) + 'ms';
        track.append(bar);
        const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = DAYS[new Date(d.d + 'T00:00:00Z').getUTCDay()];
        col.append(val, track, lbl); chart.append(col);
      });
    }
    [...chart.children].forEach((col, i) => {
      const c = state.days[i].c; col.querySelector('.val').textContent = c;
      const bar = col.querySelector('.bar'), h = Math.max(c / max * 100, 4) + '%';
      if (reduce) bar.style.height = h; else requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.height = h; }));
    });
    const sum = state.days.reduce((a, d) => a + d.c, 0); $('chartMeta').textContent = 'RATA-RATA ' + (sum / (state.days.length || 1)).toFixed(1).replace('.', ',') + '/HARI';
    renderSpark();
  }
  function feedItem(r, isNew) {
    const li = document.createElement('li'); li.className = 'feed-item ' + r.status + (isNew ? ' new' : '');
    const dot = document.createElement('i'), txt = document.createElement('span'), tm = document.createElement('time');
    txt.textContent = r.status === 'found' ? 'Preset ditemukan · ' + r.result_count + ' link' : r.status === 'empty' ? 'Tidak ada preset' : 'Pencarian gagal';
    tm.textContent = timeStr(r.created_at); tm.dateTime = r.created_at;
    li.append(dot, txt, tm); return li;
  }
  function addFeed(r, isNew) {
    const list = $('feed'); $('feedEmpty').hidden = true;
    list.prepend(feedItem(r, isNew));
    while (list.children.length > MAX_FEED) list.lastChild.remove();
  }
  function setLive(status) {
    const live = status === 'SUBSCRIBED', b = $('liveBadge');
    b.classList.toggle('off', !live); b.querySelector('span').textContent = live ? 'LIVE' : (status === 'CONNECTING' ? 'MENGHUBUNGKAN' : 'MENYAMBUNG ULANG');
  }
  async function load() {
    const [s, f] = await Promise.all([
      sb.rpc('search_stats'),
      sb.from('search_logs').select('id,status,result_count,created_at').eq('status', 'found').order('created_at', { ascending: false }).limit(MAX_FEED)
    ]);
    if (s.error || f.error) throw (s.error || f.error);
    Object.assign(state, { total: s.data.total, today: s.data.today, days: s.data.days, found: typeof s.data.found === 'number' ? s.data.found : null });
    $('feed').replaceChildren(); seen.clear();
    $('feedEmpty').hidden = f.data.length > 0;
    f.data.slice().reverse().forEach((r) => { seen.add(r.id); addFeed(r, false); });
    box.hidden = false; if (setup) setup.hidden = true; renderStats(); renderChart(); observe();
  }
  function onInsert(r) {
    if (!r || r.status !== 'found' || seen.has(r.id)) return; seen.add(r.id); // hanya pencarian berhasil
    state.total++; if (state.found != null && r.status === 'found') state.found++;
    const k = dayKey(r.created_at), d = state.days.find((x) => x.d === k);
    if (d) { d.c++; if (k === state.days[state.days.length - 1].d) state.today++; } else { load().catch(() => {}); return; }
    addFeed(r, true); renderStats(); renderChart();
  }
  let observed = false;
  function observe() {
    if (observed) return; observed = true;
    const els = box.querySelectorAll('.reveal'); if (reduce || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('shown')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }), { threshold: 0.15 });
    els.forEach((e, i) => { e.style.setProperty('--r', i); io.observe(e); });
  }

  load().then(() => {
    sb.channel('search-activity').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'search_logs' }, (p) => onInsert(p.new)).subscribe(setLive);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load().catch(() => {}); });
    setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 300000);
  }).catch((e) => { console.warn('PresetFlow activity unavailable (sudah jalankan supabase.sql?):', e); showSetup('Tidak bisa membaca Supabase. Pastikan supabase.sql sudah dijalankan dan URL/anon key di config.js benar. Pesan ini hanya tampil di localhost.'); });

  window.PFActivity = {
    log(status, count) { if (status !== 'found') return; try { sb.from('search_logs').insert({ status, result_count: Math.min(count || 0, 200) }).then(({ error }) => { if (error) console.warn('log failed', error.message); }); } catch {} }
  };
})();
