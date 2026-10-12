// PresetFlow server — zero dependencies (Node 18+). Serves the app and proxies /api/amfinder to the real API.
const http = require('http'), fs = require('fs'), path = require('path');
const { getPreview } = require('./preview-core');
const PORT = process.env.PORT || 3000, UPSTREAM = 'https://apiii-xrina.my.id/search/amfinder?url=';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const ROOT = __dirname, PUBLIC = new Set(['index.html', 'style.css', 'script.js', 'fx.js', 'qr.js', 'activity.js', 'config.js', 'service-worker.js', 'manifest.webmanifest']);
const hits = new Map(); // naive per-IP rate limit: 90 requests / minute
const limited = (ip) => { const n = Date.now(), a = (hits.get(ip) || []).filter((t) => n - t < 60000); a.push(n); hits.set(ip, a); return a.length > 90; };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const isTikTok = (u) => { try { const h = new URL(u).hostname; return /^(www\.|m\.|vm\.|vt\.)?tiktok\.com$/.test(h); } catch { return false; } };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/health') return send(res, 200, { ok: true });
  if (u.pathname === '/api/amfinder') {
    const target = u.searchParams.get('url');
    if (!target || target.length > 500 || !isTikTok(target)) return send(res, 400, { status: false, error: 'Invalid TikTok url' });
    if (limited(req.socket.remoteAddress)) return send(res, 429, { status: false, error: 'Too many requests' });
    try {
      const up = await fetch(UPSTREAM + encodeURIComponent(target), { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      return send(res, up.status, await up.text()); // passed through as-is; the browser validates the shape
    } catch (e) { console.error('[amfinder] upstream error:', e && e.message, e && e.cause && (e.cause.code || e.cause.message)); return send(res, 502, { status: false, error: 'Upstream unavailable: ' + ((e && e.cause && e.cause.code) || (e && e.name) || 'error') }); }
  }
  if (u.pathname === '/api/preview') { // thumbnail/title for one Alight Motion share link (Open Graph tags)
    if (limited(req.socket.remoteAddress)) return send(res, 429, { status: false, error: 'Too many requests' });
    try { return send(res, 200, await getPreview(u.searchParams.get('url') || '')); } catch { return send(res, 200, { status: false, error: 'Preview unavailable' }); }
  }
  if (u.pathname === '/config.js' && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) // env overrides the file
    return send(res, 200, 'window.PRESETFLOW_CONFIG=' + JSON.stringify({ SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY }) + ';', 'text/javascript');
  const name = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
  if (!PUBLIC.has(name) && !/^icons\/icon-(192|512)\.png$/.test(name)) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(path.join(ROOT, name), (err, buf) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, MIME[path.extname(name)] || 'application/octet-stream'));
}).listen(PORT, () => console.log('PresetFlow running on http://localhost:' + PORT));
