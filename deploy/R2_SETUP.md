# Photo storage (Cloudflare R2)

Photos used to be stored as base64 text inside Postgres, which grows the database
fast (~100 KB per photo). They now live in Cloudflare R2 object storage, and the
database only stores the URL.

## Required environment variables (Vercel → Settings → Environment Variables)

| Key | Cloudflare calls it | Example |
|---|---|---|
| `R2_ACCOUNT_ID` | Account ID | `0905570537ab...` |
| `R2_ACCESS_KEY_ID` | Access Key ID | from *Manage R2 API Tokens* |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key | shown once, at token creation |
| `R2_BUCKET` | bucket name | `songartcraft-photos` |
| `R2_PUBLIC_BASE_URL` | Public Development URL | `https://pub-xxxx.r2.dev` (no trailing slash) |

### Checklist if `/api/health` reports `"r2": false`

1. **All five** must be present — the integration stays off until every one is set.
2. Each must be enabled for the **Production** environment, not just Preview/Development.
3. Environment variables only apply to **new builds**. After adding them, redeploy.
4. Check for stray spaces or a trailing `/` on `R2_PUBLIC_BASE_URL`.
5. Key names are case-sensitive and must match the table exactly.

When correctly configured, `/api/health` returns `{"ok":true,"db":true,"r2":true}`.

## How uploads work

1. The app asks `POST /api/uploads/sign` for a short-lived signed link.
2. The phone uploads the image straight to R2 — bytes never pass through Vercel,
   so there is no serverless payload limit to hit.
3. The public `pub-...r2.dev` URL is saved against the purchase or product.

Object keys are random UUIDs under a `folder/YYYY-MM/` prefix, so public URLs are
not guessable.

## Migrating the old base64 photos

Admin console → Settings → **Photo storage** → *Move photos to cloud storage*.
Runs in small batches, is safe to re-run, and skips anything already moved.

Equivalent API, admin session required:

- `GET  /api/admin/migrate-photos` — how many are left
- `POST /api/admin/migrate-photos` — move the next batch

## Free tier

10 GB storage, 1M writes/month, 10M reads/month, and **no egress charges**.
At roughly 100 KB per photo that is comfortably over 100,000 photos.
