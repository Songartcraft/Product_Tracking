// Cloudflare R2 (S3-compatible) presigned uploads.
// Hand-rolled AWS SigV4 so we add zero dependencies to the serverless bundle.
//
// Required Vercel environment variables:
//   R2_ACCOUNT_ID          e.g. 0905570537ab...          (from the R2 dashboard)
//   R2_ACCESS_KEY_ID       from "Manage R2 API Tokens"
//   R2_SECRET_ACCESS_KEY   from "Manage R2 API Tokens"
//   R2_BUCKET              e.g. songartcraft-photos
//   R2_PUBLIC_BASE_URL     e.g. https://pub-xxxx.r2.dev  (no trailing slash)
//
// Until all five are set, isEnabled() returns false and the app transparently
// falls back to storing base64 in Postgres, so nothing breaks mid-rollout.
const crypto = require('crypto');

const ACCOUNT = process.env.R2_ACCOUNT_ID || '';
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID || '';
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const BUCKET = process.env.R2_BUCKET || '';
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const HOST = ACCOUNT ? ACCOUNT + '.r2.cloudflarestorage.com' : '';
const REGION = 'auto';
const SERVICE = 's3';

function isEnabled() {
  return !!(ACCOUNT && ACCESS_KEY && SECRET_KEY && BUCKET && PUBLIC_BASE);
}

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// RFC 3986 encoding — encodeURIComponent leaves !'()* alone, S3 does not
function uriEncode(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
const encodeKey = (key) => String(key).split('/').map(uriEncode).join('/');

function signingKey(dateStamp) {
  let k = hmac('AWS4' + SECRET_KEY, dateStamp);
  k = hmac(k, REGION);
  k = hmac(k, SERVICE);
  return hmac(k, 'aws4_request');
}

/**
 * Presigned PUT URL. Only `host` is signed, so the browser is free to send
 * whatever Content-Type it likes without invalidating the signature.
 */
function presignPut(key, expiresSeconds) {
  if (!isEnabled()) throw new Error('R2 is not configured');
  const expires = Math.min(Math.max(parseInt(expiresSeconds, 10) || 600, 60), 3600);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credential = ACCESS_KEY + '/' + dateStamp + '/' + REGION + '/' + SERVICE + '/aws4_request';

  const canonicalUri = '/' + BUCKET + '/' + encodeKey(key);
  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', 'host'],
  ]
    .map(([k, v]) => [uriEncode(k), uriEncode(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalQuery = query.map(([k, v]) => k + '=' + v).join('&');

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    'host:' + HOST + '\n',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    dateStamp + '/' + REGION + '/' + SERVICE + '/aws4_request',
    sha256hex(canonicalRequest),
  ].join('\n');

  const signature = crypto.createHmac('sha256', signingKey(dateStamp)).update(stringToSign).digest('hex');

  return {
    uploadUrl: 'https://' + HOST + canonicalUri + '?' + canonicalQuery + '&X-Amz-Signature=' + signature,
    publicUrl: PUBLIC_BASE + '/' + encodeKey(key),
    key,
    expires,
  };
}

function extFor(contentType) {
  const t = String(contentType || '').toLowerCase();
  if (t.indexOf('png') >= 0) return 'png';
  if (t.indexOf('webp') >= 0) return 'webp';
  if (t.indexOf('heic') >= 0 || t.indexOf('heif') >= 0) return 'heic';
  return 'jpg';
}

// Unguessable object key. Date prefix keeps the bucket browsable by month.
function makeKey(folder, contentType) {
  const d = new Date();
  const month = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  const safe = /^[a-z0-9_-]+$/.test(String(folder || '')) ? folder : 'misc';
  return safe + '/' + month + '/' + crypto.randomUUID() + '.' + extFor(contentType);
}

// Server-side upload, used by the one-off migration of existing base64 photos.
async function putBuffer(key, buffer, contentType) {
  const { uploadUrl, publicUrl } = presignPut(key, 600);
  const r = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType || 'image/jpeg' },
    body: buffer,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error('R2 upload failed (' + r.status + ') ' + text.slice(0, 200));
  }
  return publicUrl;
}

// Accepts a data: URL and pushes the decoded bytes to R2.
async function putDataUrl(dataUrl, folder) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (!m) throw new Error('Not a data URL');
  const contentType = m[1] || 'image/jpeg';
  const buffer = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  return putBuffer(makeKey(folder, contentType), buffer, contentType);
}

const isDataUrl = (s) => typeof s === 'string' && s.startsWith('data:');
const isR2Url = (s) => typeof s === 'string' && !!PUBLIC_BASE && s.startsWith(PUBLIC_BASE);

module.exports = { isEnabled, presignPut, makeKey, putBuffer, putDataUrl, isDataUrl, isR2Url, PUBLIC_BASE };
