// Handles every short link: /my-slug → looks it up → redirects.
import { pipeline } from './_redis.js';

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').toLowerCase();

  try {
    const [raw] = await pipeline([['HGET', 'links', slug]]);
    if (!raw) {
      res.statusCode = 302;
      res.setHeader('Location', `/404.html?s=${encodeURIComponent(slug)}`);
      return res.end();
    }

    const link = JSON.parse(raw);
    // Count the click (don't make the visitor wait on it failing)
    pipeline([['HINCRBY', 'clicks', slug, 1]]).catch(() => {});

    // 302 (not 301) so browsers don't cache it forever — lets you edit a link later.
    res.statusCode = 302;
    res.setHeader('Location', link.url);
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('Something went wrong: ' + err.message);
  }
}
