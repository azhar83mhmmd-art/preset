// Vercel serverless proxy. Fixed upstream host, TikTok URLs only.
module.exports = async (req, res) => {
  const url = req.query && req.query.url;
  let ok = false; try { ok = /^(www\.|m\.|vm\.|vt\.)?tiktok\.com$/.test(new URL(url).hostname) && url.length <= 500; } catch {}
  if (!ok) return res.status(400).json({ status: false, error: 'Invalid TikTok url' });
  try {
    const up = await fetch('https://apiii-xrina.my.id/search/amfinder?url=' + encodeURIComponent(url), { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    res.status(up.status).setHeader('Content-Type', 'application/json; charset=utf-8').setHeader('Cache-Control', 'no-store').send(await up.text());
  } catch (e) { console.error('[amfinder] upstream error:', e && e.message); res.status(502).json({ status: false, error: 'Upstream unavailable: ' + ((e && e.cause && e.cause.code) || (e && e.name) || 'error') }); }
};
