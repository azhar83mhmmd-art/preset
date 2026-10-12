// Vercel serverless: GET = 10 preset terbaru, POST = simpan pencarian yang berhasil
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const hits = new Map(); // rate limit sederhana per IP (best-effort)
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 20;
}
const https = u => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const r = await fetch(
        `${SB}/rest/v1/recent_presets?select=id,title,thumbnail,preset_link,created_at&order=created_at.desc,id.desc&limit=10`,
        { headers: H });
      const items = await r.json();
      res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=20');
      return res.status(200).json({ items: Array.isArray(items) ? items : [] });
    }

    if (req.method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
      if (limited(ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan' });

      const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!https(b.preset_link) || (b.thumbnail && !https(b.thumbnail)))
        return res.status(400).json({ error: 'Data tidak valid' });

      const row = {
        source_url: b.source_url ? String(b.source_url).slice(0, 500) : null,
        title: String(b.title || 'Preset').slice(0, 120),
        thumbnail: b.thumbnail ? String(b.thumbnail).slice(0, 800) : null,
        preset_link: String(b.preset_link).slice(0, 800),
        created_at: new Date().toISOString(),   // preset yang sama naik lagi ke paling atas
      };
      const r = await fetch(`${SB}/rest/v1/recent_presets?on_conflict=preset_link`, {
        method: 'POST',
        headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
};
