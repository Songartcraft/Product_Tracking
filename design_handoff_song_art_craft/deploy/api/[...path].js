// Song Art & Craft — single catch-all API router (all endpoints in one Serverless Function)
// Consolidated from the original /api/*.js handlers to stay within Vercel Hobby's 12-function limit.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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
const isDup = (e) => e.code === '23505' || /duplicate|unique/i.test(e.message || '');

module.exports = async (req, res) => {
  const seg = [].concat(req.query.path || []);
  const n = seg.length;
  const m = req.method;
  const b = req.body || {};
  try {
    // ---- Public / session ----
    if (n === 1 && seg[0] === 'health') {
      const makers = await rpc('list_makers');
      return res.status(200).json({ ok: true, db: true, makers: (makers || []).length });
    }
    if (n === 1 && seg[0] === 'logout') {
      clearSession(res);
      return res.status(200).json({ ok: true });
    }
    if (n === 1 && seg[0] === 'bootstrap') {
      const session = readSession(req);
      let categories = [];
      let shopName = 'Song Art & Craft';
      let logoUrl = '';
      try {
        const [cats, branding] = await Promise.all([rpc2('list_categories'), rpc2('get_branding')]);
        categories = cats || [];
        shopName = (branding && branding.shop_name) || shopName;
        logoUrl = (branding && branding.logo_url) || '';
      } catch (e) { /* pre-migration fallback */ }
      if (!categories.length) {
        categories = [
          { id: 'c1', name: 'Glass Flower' },
          { id: 'c2', name: 'Glass Petals' },
          { id: 'c3', name: 'Glass Artifact' },
        ];
      }
      if (!session) return res.status(200).json({ session: null, categories, shop_name: shopName, logo_url: logoUrl });
      const [makers, purchases] = await Promise.all([rpc('list_makers'), rpc('list_purchases')]);
      const out = { session, makers, purchases, categories, shop_name: shopName, logo_url: logoUrl };
      try { out.delete_requests = await rpc2('list_delete_requests'); } catch (e) { out.delete_requests = []; }
      if (session.t === 'admin') {
        out.employees = await rpc('list_employees');
        try { out.admins = await rpc2('list_admins'); } catch (e) { out.admins = []; }
      }
      return res.status(200).json(out);
    }

    // ---- Staff auth ----
    if (n === 2 && seg[0] === 'staff' && seg[1] === 'login') {
      if (m !== 'POST') return fail(res, 405, 'Method not allowed');
      const passkey = String(b.passkey || '');
      if (!/^\d{4,6}$/.test(passkey)) return fail(res, 401, 'Passkey not recognised. Try again.');
      const emp = await rpc('find_employee_for_passkey', { passkey_lookup: sha256hex(passkey) });
      if (!emp || !emp.passkey_hash) return fail(res, 401, 'Passkey not recognised. Try again.');
      const ok = await bcrypt.compare(passkey, emp.passkey_hash);
      if (!ok) return fail(res, 401, 'Passkey not recognised. Try again.');
      const employee = {
        id: emp.id, first_name: emp.first_name, last_name: emp.last_name,
        name: emp.first_name + ' ' + emp.last_name, role: emp.role,
      };
      setSession(res, { t: 'staff', id: emp.id, name: employee.name, role: emp.role });
      try { await rpc2('store_passkey_enc', { id: emp.id, passkey }); } catch (e) {}
      return res.status(200).json({ employee });
    }

    // ---- Purchases ----
    if (n === 1 && seg[0] === 'purchases') {
      const session = readSession(req);
      if (!session) return fail(res, 401, 'Not signed in');
      if (m !== 'POST') return fail(res, 405, 'Method not allowed');
      if (session.t !== 'staff') return fail(res, 403, 'Only staff can log purchases');
      if (!b.category) return fail(res, 400, 'Select a category');
      if (!(Number(b.price) > 0)) return fail(res, 400, 'Enter a valid price');
      const purchase = await rpc('create_purchase', {
        photo_url: b.photo_url || '', photo_path: '', category: b.category,
        price: String(Number(b.price)), quantity: String(Math.max(1, parseInt(b.quantity, 10) || 1)),
        payment: b.payment === 'Online' ? 'Online' : 'Cash', note: (b.note || '').trim(),
        maker_id: b.maker_id, employee_id: session.id,
      });
      return res.status(200).json({ purchase });
    }
    if (n === 2 && seg[0] === 'purchases') {
      const session = readSession(req);
      if (!session) return fail(res, 401, 'Not signed in');
      const id = seg[1];
      if (m === 'GET') {
        const purchase = await rpc('get_purchase', { id });
        return res.status(200).json({ purchase });
      }
      if (m === 'PATCH') {
        const payload = { id, actor: { type: session.t === 'admin' ? 'admin' : 'staff', subject: session.id } };
        if (b.category !== undefined) payload.category = b.category;
        if (b.price !== undefined) payload.price = String(Number(b.price));
        if (b.quantity !== undefined) payload.quantity = String(Math.max(1, parseInt(b.quantity, 10) || 1));
        if (b.payment !== undefined) payload.payment = b.payment === 'Online' ? 'Online' : 'Cash';
        if (b.note !== undefined) payload.note = (b.note || '').trim();
        if (b.maker_id !== undefined) payload.maker_id = b.maker_id;
        if (b.photo_url !== undefined) payload.photo_url = b.photo_url || '';
        const purchase = await rpc('update_purchase', payload);
        return res.status(200).json({ purchase });
      }
      if (m === 'DELETE') {
        await rpc('delete_purchase', { id });
        return res.status(200).json({ ok: true });
      }
      return fail(res, 405, 'Method not allowed');
    }
    if (n === 3 && seg[0] === 'purchases' && seg[2] === 'delete-request') {
      const session = readSession(req);
      if (!session) return fail(res, 401, 'Not signed in');
      if (m !== 'POST') return fail(res, 405, 'Method not allowed');
      await rpc2('create_delete_request', {
        purchase_id: seg[1], requested_by: session.t === 'staff' ? session.id : '',
      });
      return res.status(200).json({ ok: true });
    }

    // ---- Admin ----
    if (seg[0] === 'admin') {
      // admin login is the only admin route without a prior session
      if (n === 2 && seg[1] === 'login') {
        if (m !== 'POST') return fail(res, 405, 'Method not allowed');
        const email = String(b.email || '').trim().toLowerCase();
        const password = String(b.password || '');
        if (!email || !password) return fail(res, 401, 'Incorrect ID or password.');
        const admin = await rpc('find_admin_by_email', { email });
        if (!admin || !admin.password_hash) return fail(res, 401, 'Incorrect ID or password.');
        const ok = await bcrypt.compare(password, admin.password_hash);
        if (!ok) return fail(res, 401, 'Incorrect ID or password.');
        setSession(res, { t: 'admin', id: admin.id, email: admin.email });
        return res.status(200).json({ admin: { id: admin.id, email: admin.email } });
      }

      const session = readSession(req);
      if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');

      if (n === 2 && seg[1] === 'account') {
        if (m !== 'PATCH') return fail(res, 405, 'Method not allowed');
        const payload = { id: session.id };
        const email = String(b.email || '').trim().toLowerCase();
        const password = String(b.password || '');
        if (!email && !password) return fail(res, 400, 'Nothing to change');
        if (email) payload.email = email;
        if (password) {
          if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
          payload.password_hash = await bcrypt.hash(password, 10);
        }
        try {
          const admin = await rpc2('update_admin', payload);
          setSession(res, { t: 'admin', id: admin.id, email: admin.email });
          return res.status(200).json({ admin });
        } catch (e) {
          if (isDup(e)) return fail(res, 409, 'That email is already an admin.');
          throw e;
        }
      }

      if (n === 2 && seg[1] === 'settings') {
        if (m !== 'PATCH') return fail(res, 405, 'Method not allowed');
        const out = { ok: true };
        if (b.shop_name !== undefined) {
          const name = String(b.shop_name || '').trim();
          if (!name) return fail(res, 400, 'Enter a shop name');
          await rpc2('set_shop_name', { value: name });
          out.shop_name = name;
        }
        if (b.logo_url !== undefined) {
          const logo = String(b.logo_url || '');
          if (logo && !/^data:image\//.test(logo)) return fail(res, 400, 'Invalid image');
          if (logo.length > 400000) return fail(res, 400, 'Image too large — pick a smaller one.');
          await rpc2('set_logo', { value: logo });
          out.logo_url = logo;
        }
        return res.status(200).json(out);
      }

      if (seg[1] === 'makers') {
        if (n === 2) {
          if (m !== 'POST') return fail(res, 405, 'Method not allowed');
          const name = String(b.name || '').trim();
          if (!name) return fail(res, 400, 'Enter a maker name');
          const makers = await rpc('list_makers');
          if ((makers || []).some((mk) => mk.name.toLowerCase() === name.toLowerCase())) {
            return fail(res, 409, 'That maker already exists');
          }
          const maker = await rpc('create_maker', { name });
          return res.status(200).json({ maker });
        }
        if (n === 3) {
          const id = seg[2];
          try {
            if (m === 'PATCH') {
              const name = String(b.name || '').trim();
              if (!name) return fail(res, 400, 'Enter a maker name');
              const maker = await rpc2('update_maker', { id, name });
              return res.status(200).json({ maker });
            }
            if (m === 'DELETE') {
              await rpc('delete_maker', { id });
              return res.status(200).json({ ok: true });
            }
            return fail(res, 405, 'Method not allowed');
          } catch (e) { return fail(res, 400, e.message || 'Request failed'); }
        }
      }

      if (seg[1] === 'categories') {
        if (n === 2) {
          if (m === 'GET') return res.status(200).json({ categories: await rpc2('list_categories') });
          if (m === 'POST') {
            const name = String(b.name || '').trim();
            if (!name) return fail(res, 400, 'Enter a category name');
            try {
              const category = await rpc2('create_category', { name });
              return res.status(200).json({ category });
            } catch (e) {
              if (isDup(e)) return fail(res, 409, 'That category already exists');
              throw e;
            }
          }
          return fail(res, 405, 'Method not allowed');
        }
        if (n === 3) {
          const id = seg[2];
          try {
            if (m === 'PATCH') {
              const name = String(b.name || '').trim();
              if (!name) return fail(res, 400, 'Enter a category name');
              try {
                const category = await rpc2('rename_category', { id, name });
                return res.status(200).json({ category });
              } catch (e) {
                if (isDup(e)) return fail(res, 409, 'That category already exists');
                throw e;
              }
            }
            if (m === 'DELETE') {
              await rpc2('delete_category', { id });
              return res.status(200).json({ ok: true });
            }
            return fail(res, 405, 'Method not allowed');
          } catch (e) { return fail(res, 400, e.message || 'Request failed'); }
        }
      }

      if (seg[1] === 'employees') {
        if (n === 2) {
          if (m !== 'POST') return fail(res, 405, 'Method not allowed');
          const first = String(b.first_name || '').trim();
          const last = String(b.last_name || '').trim();
          const passkey = String(b.passkey || '');
          if (!first || !last) return fail(res, 400, 'First and last name are required.');
          if (!/^\d{4,6}$/.test(passkey)) return fail(res, 400, 'Passkey must be 4 to 6 digits.');
          const hash = await bcrypt.hash(passkey, 10);
          try {
            const employee = await rpc('create_employee', {
              first_name: first, last_name: last, email: (b.email || '').trim(), phone: (b.phone || '').trim(),
              passkey_hash: hash, passkey_lookup: sha256hex(passkey),
              role: b.role === 'Manager' ? 'Manager' : 'Employee',
              status: b.status === 'Inactive' ? 'Inactive' : 'Active',
            });
            try { await rpc2('store_passkey_enc', { id: employee.id, passkey }); } catch (e) {}
            return res.status(200).json({ employee });
          } catch (e) {
            if (isDup(e)) return fail(res, 409, 'That passkey is already in use.');
            throw e;
          }
        }
        if (n === 4 && seg[3] === 'reveal') {
          if (m !== 'POST') return fail(res, 405, 'Method not allowed');
          const out = await rpc2('reveal_passkey', { id: seg[2] });
          if (!out || !out.passkey) {
            return fail(res, 404, 'Not stored yet — it will appear after their next sign-in, or set a new one via Edit.');
          }
          return res.status(200).json({ passkey: out.passkey });
        }
        if (n === 3) {
          const id = seg[2];
          if (m === 'PATCH') {
            const payload = { id };
            if (b.first_name !== undefined) payload.first_name = String(b.first_name).trim();
            if (b.last_name !== undefined) payload.last_name = String(b.last_name).trim();
            if (b.email !== undefined) payload.email = String(b.email).trim();
            if (b.phone !== undefined) payload.phone = String(b.phone).trim();
            if (b.role !== undefined) payload.role = b.role === 'Manager' ? 'Manager' : 'Employee';
            if (b.status !== undefined) payload.status = b.status === 'Inactive' ? 'Inactive' : 'Active';
            if (b.passkey) {
              if (!/^\d{4,6}$/.test(String(b.passkey))) return fail(res, 400, 'Passkey must be 4 to 6 digits.');
              payload.passkey_hash = await bcrypt.hash(String(b.passkey), 10);
              payload.passkey_lookup = sha256hex(String(b.passkey));
            }
            try {
              const employee = await rpc('update_employee', payload);
              if (b.passkey) { try { await rpc2('store_passkey_enc', { id, passkey: String(b.passkey) }); } catch (e) {} }
              return res.status(200).json({ employee });
            } catch (e) {
              if (isDup(e)) return fail(res, 409, 'That passkey is already in use.');
              throw e;
            }
          }
          if (m === 'DELETE') {
            try {
              await rpc('delete_employee', { id });
              return res.status(200).json({ ok: true });
            } catch (e) {
              if (e.code === '23503' || /foreign key/i.test(e.message || '')) {
                return fail(res, 409, 'They have logged purchases, so they were kept. Set them Inactive instead.');
              }
              throw e;
            }
          }
          return fail(res, 405, 'Method not allowed');
        }
      }

      if (seg[1] === 'admins') {
        if (n === 2) {
          if (m === 'GET') return res.status(200).json({ admins: await rpc2('list_admins') });
          if (m === 'POST') {
            const email = String(b.email || '').trim().toLowerCase();
            const password = String(b.password || '');
            if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Enter a valid email.');
            if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
            try {
              const admin = await rpc2('create_admin', { email, password_hash: await bcrypt.hash(password, 10) });
              return res.status(200).json({ admin });
            } catch (e) {
              if (isDup(e)) return fail(res, 409, 'That email is already an admin.');
              throw e;
            }
          }
          return fail(res, 405, 'Method not allowed');
        }
        if (n === 3) {
          if (m !== 'DELETE') return fail(res, 405, 'Method not allowed');
          if (seg[2] === session.id) return fail(res, 400, 'You cannot remove your own admin account.');
          try {
            await rpc2('delete_admin', { id: seg[2] });
            return res.status(200).json({ ok: true });
          } catch (e) { return fail(res, 400, e.message || 'Request failed'); }
        }
      }

      if (seg[1] === 'delete-requests' && n === 3) {
        if (m !== 'DELETE') return fail(res, 405, 'Method not allowed');
        try {
          await rpc2('reject_delete_request', { id: seg[2] });
          return res.status(200).json({ ok: true });
        } catch (e) { return fail(res, 400, e.message || 'Request failed'); }
      }
    }

    return fail(res, 404, 'Not found');
  } catch (e) {
    return fail(res, 500, e.message || 'Request failed');
  }
};
