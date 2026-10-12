// Shared by server.js, api/preview.js (Vercel) and netlify/functions/preview.js.
// Fetches an Alight Motion share page and returns its Open Graph metadata (title, image, description).
// Only Alight Motion hosts are fetched, and every redirect hop is re-checked (no SSRF to other hosts).
const AM_HOSTS = ['alight.link', 'alightmotion.com', 'alightcreative.com'];
const okHost = (h) => AM_HOSTS.some((d) => h === d || h.endsWith('.' + d));
const cache = new Map(); // url -> { t, data } (10 min, best effort)
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/g, '/').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

function parseMeta(html, base) {
  const meta = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
    if (key && val != null && !(key.toLowerCase() in meta)) meta[key.toLowerCase()] = decode(val);
  }
  const t = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  let image = meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || '';
  try { if (image) image = new URL(image, base).href; } catch { image = ''; }
  if (!/^https:\/\//i.test(image)) image = image.replace(/^http:\/\//i, 'https://');
  return { title: meta['og:title'] || meta['twitter:title'] || (t ? decode(t.trim()) : ''), description: meta['og:description'] || meta['description'] || meta['twitter:description'] || '', image };
}

async function getPreview(raw) {
  let u; try { u = new URL(raw); } catch { return { status: false, error: 'Invalid url' }; }
  if (!/^https?:$/.test(u.protocol) || !okHost(u.hostname) || raw.length > 600) return { status: false, error: 'Unsupported host' };
  const hit = cache.get(u.href); if (hit && Date.now() - hit.t < 600000) return hit.data;
  let cur = u.href, res;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(cur, { redirect: 'manual', signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PresetFlow/2.0; link preview)', Accept: 'text/html,application/xhtml+xml' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), cur);
      if (!/^https?:$/.test(next.protocol) || !okHost(next.hostname)) return { status: false, error: 'Blocked redirect' };
      cur = next.href; continue;
    }
    break;
  }
  if (!res || !res.ok) return { status: false, error: 'HTTP ' + (res && res.status) };
  const html = (await res.text()).slice(0, 400000);
  const data = { status: true, ...parseMeta(html, cur) };
  if (cache.size > 300) cache.clear();
  cache.set(u.href, { t: Date.now(), data });
  return data;
}
module.exports = { getPreview, parseMeta };
