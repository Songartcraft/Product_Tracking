// Shared helpers for Song Art & Craft API (Vercel serverless functions)
const crypto = require('crypto');

// All config comes from Vercel project environment variables:
//   SUPABASE_URL      — the Supabase project URL
//   SUPABASE_ANON_KEY — the Supabase anon (publishable) key
//   APP_RPC_SECRET    — server secret; its SHA-256 must match
//                       app_runtime_settings.rpc_secret_sha256
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RPC_SECRET = process.env.APP_RPC_SECRET || '';
const COOKIE = 'sac_session';

function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

async function rpc(action, payload) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/app_rpc', {
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

async function rpc2(action, payload) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/app_rpc2', {
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

function fail(res, status, message) {
  res.status(status).json({ error: message });
}

module.exports = { rpc, rpc2, sha256hex, setSession, clearSession, readSession, fail };
