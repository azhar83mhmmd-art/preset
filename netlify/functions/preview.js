// Netlify function: thumbnail/title for one Alight Motion share link.
const { getPreview } = require('../../preview-core');
exports.handler = async (event) => {
  let body; try { body = await getPreview((event.queryStringParameters || {}).url || ''); } catch { body = { status: false, error: 'Preview unavailable' }; }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' }, body: JSON.stringify(body) };
};
