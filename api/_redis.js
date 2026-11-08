// Tiny Upstash Redis REST client — plain fetch, no dependencies.
// Works with the env vars Vercel's Upstash integration creates.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function assertConfig() {
  if (!URL_ || !TOKEN) {
    throw new Error('Redis is not connected. Add the Upstash Redis integration in Vercel → Storage.');
  }
}

// Run a single command, e.g. redis(['HGET', 'links', 'abc'])
export async function redis(command) {
  assertConfig();
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// Run several commands in one round trip. Returns an array of results.
export async function pipeline(commands) {
  assertConfig();
  const res = await fetch(`${URL_.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const data = await res.json();
  return data.map((d) => {
    if (d.error) throw new Error(d.error);
    return d.result;
  });
}
