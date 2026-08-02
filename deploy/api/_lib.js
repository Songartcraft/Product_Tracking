// Shared helpers for Song Art & Craft API (Vercel serverless functions)
const crypto = require('crypto');

// Config from Vercel env vars: SUPABASE_URL, SUPABASE_ANON_KEY, APP_RPC_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RPC_SECRET = process.env.APP_RPC_SECRET || '';
const COOKIE = 'sac_session';

function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

async function callRpc(fn, action, payload) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      authorization: 'Bearer ' + ANON_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_secret: RPC_SECRET, p_action: action, p_payload: payload || {} }),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (!r.ok) {
    const msg = (data && (data.message || data.hint || data.details)) || 'Database error';
    const err = new Error(msg);
    err.code = data && data.code;
    err.status = r.status;
    throw err;
  }
  return data;
}
const rpc = (action, payload) => callRpc('app_rpc', action, payload);
const rpc2 = (action, payload) => callRpc('app_rpc2', action, payload);
const rpc3 = (action, payload) => callRpc('app_rpc3', action, payload);
const rpc4 = (action, payload) => callRpc('app_rpc4', action, payload);

function sign(value) {
  return crypto.createHmac('sha256', RPC_SECRET + ':cookie').update(value).digest('base64url');
}

function setSession(res, obj) {
  const raw = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const val = raw + '.' + sign(raw);
  res.setHeader('Set-Cookie', COOKIE + '=' + val + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000');
}

function clearSession(res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
}

function readSession(req) {
  const header = req.headers.cookie || '';
  const m = header.split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!m) return null;
  const val = m.slice(COOKIE.length + 1);
  const dot = val.lastIndexOf('.');
  if (dot < 0) return null;
  const raw = val.slice(0, dot);
  const sig = val.slice(dot + 1);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(raw)))) return null;
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

function fail(res, status, message) {
  res.status(status).json({ error: message });
}

module.exports = { rpc, rpc2, rpc3, rpc4, sha256hex, setSession, clearSession, readSession, fail };
