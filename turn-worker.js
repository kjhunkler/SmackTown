const ALLOWED_ORIGINS = new Set([
  'https://smacktownarena.com',
  'https://kjhunkler.github.io',
]);
const TURN_TTL_SECONDS = 86400;

function corsHeaders(origin) {
  return ALLOWED_ORIGINS.has(origin) ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  } : { 'Vary': 'Origin' };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'origin not allowed' }, 403, origin);
    }

    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 403, headers: corsHeaders(origin) });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, origin);
    }

    if (!env.TURN_API_TOKEN || !env.TURN_TOKEN_ID) {
      return json({ error: 'TURN Worker secrets are not configured' }, 500, origin);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.TURN_ISSUANCE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: 'too many credential requests' }, 429, origin);

    const cf = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_TOKEN_ID}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.TURN_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
      });

    let body;
    try { body = await cf.json(); }
    catch (_) { body = { error: 'invalid Cloudflare response' }; }

    if (!cf.ok) {
      return json({ error: 'turn credential generation failed' }, cf.status, origin);
    }

    const iceServers = Array.isArray(body?.iceServers) ? body.iceServers : [];
    if (!iceServers.length) return json({ error: 'no ICE servers returned' }, 502, origin);
    return json({ iceServers, ttl: TURN_TTL_SECONDS }, 200, origin);
  },
};
