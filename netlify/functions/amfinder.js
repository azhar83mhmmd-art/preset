// Netlify function proxy. Fixed upstream host, TikTok URLs only.
exports.handler = async (event) => {
  const url = (event.queryStringParameters || {}).url;
  const json = (c, b) => ({ statusCode: c, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
  let ok = false; try { ok = /^(www\.|m\.|vm\.|vt\.)?tiktok\.com$/.test(new URL(url).hostname) && url.length <= 500; } catch {}
  if (!ok) return json(400, { status: false, error: 'Invalid TikTok url' });
  try { const up = await fetch('https://apiii-xrina.my.id/search/amfinder?url=' + encodeURIComponent(url), { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }); return json(up.status, await up.text()); }
  catch (e) { console.error('[amfinder] upstream error:', e && e.message); return json(502, { status: false, error: 'Upstream unavailable: ' + ((e && e.cause && e.cause.code) || (e && e.name) || 'error') }); }
};
