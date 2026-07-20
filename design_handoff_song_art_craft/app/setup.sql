-- Song Art & Craft — one-time setup for the redesigned deployment
-- Run this in Supabase Dashboard → SQL Editor → project "Product_Tracking"
-- It (1) rotates the API's RPC secret and (2) re-seeds the demo logins
-- from the handoff README so they work with the new API's bcrypt verification.

-- 1) Rotate the RPC secret (the new Vercel API signs requests with this)
update app_runtime_settings
set value = encode(extensions.digest('sacRpc_v2_kQ7mXe9ZtB4nLhJ6yWc8QdF3gAuS5oKiM1NpE0Tz', 'sha256'), 'hex'),
    updated_at = now()
where key = 'rpc_secret_sha256';

-- 2) Re-seed staff passkeys (from README seed data: 123456 / 4021 / 778812)
update employees set
  passkey_hash   = extensions.crypt('123456', extensions.gen_salt('bf', 10)),
  passkey_lookup = encode(extensions.digest('123456', 'sha256'), 'hex'),
  updated_at = now()
where first_name = 'Sovrat';

update employees set
  passkey_hash   = extensions.crypt('4021', extensions.gen_salt('bf', 10)),
  passkey_lookup = encode(extensions.digest('4021', 'sha256'), 'hex'),
  updated_at = now()
where first_name = 'Amelia';

update employees set
  passkey_hash   = extensions.crypt('778812', extensions.gen_salt('bf', 10)),
  passkey_lookup = encode(extensions.digest('778812', 'sha256'), 'hex'),
  updated_at = now()
where first_name = 'Priya';

-- 3) Re-seed the admin password (from README seed data)
update admins set
  password_hash = extensions.crypt('$Aurabh2695', extensions.gen_salt('bf', 10)),
  updated_at = now()
where email = 'admin@songartcraft.com';

-- Done. Verify: all four statements should report 1 row updated.
