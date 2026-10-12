// Vercel serverless: thumbnail/title for one Alight Motion share link.
const { getPreview } = require('../preview-core');
module.exports = async (req, res) => {
  try { res.status(200).setHeader('Cache-Control', 's-maxage=600').json(await getPreview((req.query && req.query.url) || '')); }
  catch { res.status(200).json({ status: false, error: 'Preview unavailable' }); }
};
