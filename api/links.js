// Admin API for the dashboard. Every request needs the x-admin-key header
// to match the ADMIN_PASSWORD environment variable.
//   GET    /api/links            → list all links with click counts
//   POST   /api/links            → { url, slug?, overwrite? } create or update
//   DELETE /api/links?slug=abc   → delete a link
import crypto from 'node:crypto';
import { redis, pipeline } from './_redis.js';

const RESERVED = new Set(['api', 'admin', 'index', '404', 'favicon', 'robots', 'public']);
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function authorized(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const given = String(req.headers['x-admin-key'] || '');
  if (!expected || !given) return false;
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function randomSlug(len = 6) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'; // no look-alikes (l/1, o/0)
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

export default async function handler(req, res) {
  if (!authorized(req)) return send(res, 401, { error: 'Wrong password' });

  try {
    if (req.method === 'GET') {
      const [links, clicks] = await pipeline([['HGETALL', 'links'], ['HGETALL', 'clicks']]);
      // Upstash returns HGETALL as a flat [field, value, field, value...] array
      const clickMap = {};
      for (let i = 0; i < (clicks || []).length; i += 2) clickMap[clicks[i]] = Number(clicks[i + 1]);
      const list = [];
      for (let i = 0; i < (links || []).length; i += 2) {
        const slug = links[i];
        const data = JSON.parse(links[i + 1]);
        list.push({ slug, ...data, clicks: clickMap[slug] || 0 });
      }
      list.sort((a, b) => (b.created || 0) - (a.created || 0));
      return send(res, 200, { links: list });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      let url = String(body.url || '').trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      try {
        const u = new URL(url);
        if (!u.hostname.includes('.')) throw new Error();
      } catch {
        return send(res, 400, { error: 'That doesn’t look like a valid URL' });
      }

      let slug = String(body.slug || '').trim().toLowerCase().replace(/\s+/g, '-');
      if (slug) {
        if (!SLUG_RE.test(slug)) {
          return send(res, 400, { error: 'Slugs can use letters, numbers, - and _ (max 64 characters)' });
        }
        if (RESERVED.has(slug)) return send(res, 400, { error: `“${slug}” is reserved — pick another` });
      } else {
        // Generate a random slug that isn't taken
        do { slug = randomSlug(); } while (await redis(['HEXISTS', 'links', slug]));
      }

      const existingRaw = await redis(['HGET', 'links', slug]);
      if (existingRaw && !body.overwrite) {
        return send(res, 409, { error: `“${slug}” is already taken`, slug });
      }
      const existing = existingRaw ? JSON.parse(existingRaw) : null;
      const record = { url, created: existing?.created || Date.now(), updated: Date.now() };
      await redis(['HSET', 'links', slug, JSON.stringify(record)]);
      return send(res, existing ? 200 : 201, { slug, ...record });
    }

    if (req.method === 'DELETE') {
      const slug = String(req.query.slug || '').toLowerCase();
      if (!slug) return send(res, 400, { error: 'Missing slug' });
      await pipeline([['HDEL', 'links', slug], ['HDEL', 'clicks', slug]]);
      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}
