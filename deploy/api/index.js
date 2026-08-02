// Single consolidated API router.
// Vercel Hobby allows max 12 serverless functions, so every endpoint lives here.
// vercel.json rewrites /api/(.*) -> /api?path=$1
const bcrypt = require('bcryptjs');
const {
  rpc, rpc2, rpc3, rpc4, sha256hex, setSession, clearSession, readSession, fail,
} = require('./_lib.js');

const seg = (p) => String(p || '').split('?')[0].split('/').filter(Boolean);
const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

// Accept either a photos[] array or a single photo_url, always return an array
function photoList(x) {
  if (Array.isArray(x.photos)) return x.photos.filter((p) => typeof p === 'string' && p);
  if (x.photo_url) return [x.photo_url];
  return [];
}

function requireSession(req, res) {
  const s = readSession(req);
  if (!s) { fail(res, 401, 'Not signed in'); return null; }
  return s;
}
function requireAdmin(req, res) {
  const s = readSession(req);
  if (!s || s.t !== 'admin') { fail(res, 401, 'Admin only'); return null; }
  return s;
}
async function findProduct(id) {
  const all = await rpc3('list_products');
  return (all || []).find((p) => p.id === id) || null;
}

module.exports = async (req, res) => {
  const m = req.method;
  const parts = seg((req.query && req.query.path) || '');
  const a = parts[0] || '';
  const b = parts[1] || '';
  const c = parts[2] || '';
  const d = parts[3] || '';

  try {
    /* ---------- public ---------- */
    if (a === 'health') {
      const makers = await rpc('list_makers');
      return res.status(200).json({ ok: true, db: true, makers: (makers || []).length });
    }
    if (a === 'logout') { clearSession(res); return res.status(200).json({ ok: true }); }

    if (a === 'staff' && b === 'login' && m === 'POST') {
      const passkey = String(body(req).passkey || '');
      if (!/^\d{4,6}$/.test(passkey)) return fail(res, 401, 'Passkey not recognised. Try again.');
      const emp = await rpc('find_employee_for_passkey', { passkey_lookup: sha256hex(passkey) });
      if (!emp || !emp.passkey_hash) return fail(res, 401, 'Passkey not recognised. Try again.');
      if (!(await bcrypt.compare(passkey, emp.passkey_hash))) return fail(res, 401, 'Passkey not recognised. Try again.');
      const name = emp.first_name + ' ' + emp.last_name;
      setSession(res, { t: 'staff', id: emp.id, name, role: emp.role });
      try { await rpc2('store_passkey_enc', { id: emp.id, passkey }); } catch (e) {}
      return res.status(200).json({ employee: { id: emp.id, first_name: emp.first_name, last_name: emp.last_name, name, role: emp.role } });
    }

    if (a === 'admin' && b === 'login' && m === 'POST') {
      const email = String(body(req).email || '').trim().toLowerCase();
      const password = String(body(req).password || '');
      if (!email || !password) return fail(res, 401, 'Incorrect ID or password.');
      const admin = await rpc('find_admin_by_email', { email });
      if (!admin || !admin.password_hash) return fail(res, 401, 'Incorrect ID or password.');
      if (!(await bcrypt.compare(password, admin.password_hash))) return fail(res, 401, 'Incorrect ID or password.');
      setSession(res, { t: 'admin', id: admin.id, email: admin.email });
      return res.status(200).json({ admin: { id: admin.id, email: admin.email } });
    }

    /* ---------- bootstrap ---------- */
    if (a === 'bootstrap') {
      const session = readSession(req);
      let categories = [];
      let shopName = 'Song Art & Craft';
      let logoUrl = '';
      try {
        const [cats, branding] = await Promise.all([rpc2('list_categories'), rpc2('get_branding')]);
        categories = cats || [];
        shopName = (branding && branding.shop_name) || shopName;
        logoUrl = (branding && branding.logo_url) || '';
      } catch (e) {}
      if (!categories.length) {
        categories = [{ id: 'c1', name: 'Glass Flower' }, { id: 'c2', name: 'Glass Petals' }, { id: 'c3', name: 'Glass Artifact' }];
      }
      let productCategories = [];
      let roles = [];
      try { productCategories = (await rpc3('list_product_categories')) || []; } catch (e) {}
      try { roles = (await rpc3('list_roles')) || []; } catch (e) {}

      if (!session) {
        return res.status(200).json({ session: null, categories, shop_name: shopName, logo_url: logoUrl, product_categories: productCategories });
      }
      const [makers, purchases] = await Promise.all([rpc('list_makers'), rpc('list_purchases')]);
      let products = [];
      try { products = (await rpc3('list_products')) || []; } catch (e) {}
      const out = { session, makers, purchases, categories, shop_name: shopName, logo_url: logoUrl, product_categories: productCategories, products, roles };
      try { out.delete_requests = await rpc2('list_delete_requests'); } catch (e) { out.delete_requests = []; }
      if (session.t === 'admin') {
        out.employees = await rpc('list_employees');
        try { out.admins = await rpc2('list_admins'); } catch (e) { out.admins = []; }
      }
      return res.status(200).json(out);
    }

    /* ---------- purchases ---------- */
    if (a === 'purchases') {
      const s = requireSession(req, res); if (!s) return;

      if (!b && m === 'POST') {
        if (s.t !== 'staff') return fail(res, 403, 'Only staff can log purchases');
        const x = body(req);
        if (!x.category) return fail(res, 400, 'Please choose a category before saving.');
        if (!(Number(x.price) > 0)) return fail(res, 400, 'Enter a price greater than zero.');
        const photos = photoList(x);
        const purchase = await rpc('create_purchase', {
          photo_url: photos[0] || '', photo_path: '', category: x.category,
          price: String(Number(x.price)),
          quantity: String(Math.max(1, parseInt(x.quantity, 10) || 1)),
          payment: x.payment === 'Online' ? 'Online' : 'Cash',
          note: (x.note || '').trim(), maker_id: x.maker_id, employee_id: s.id,
        });
        if (photos.length > 1 && purchase && purchase.id) {
          try { await rpc4('set_purchase_photos', { id: purchase.id, photos }); } catch (e) {}
        }
        return res.status(200).json({ purchase });
      }

      if (b && c === 'delete-request' && m === 'POST') {
        await rpc2('create_delete_request', { purchase_id: b, requested_by: s.t === 'staff' ? s.id : '' });
        return res.status(200).json({ ok: true });
      }
      if (b && m === 'GET') return res.status(200).json({ purchase: await rpc('get_purchase', { id: b }) });

      if (b && m === 'PATCH') {
        const x = body(req);
        const payload = { id: b, actor: { type: s.t === 'admin' ? 'admin' : 'staff', subject: s.id } };
        if (x.category !== undefined) payload.category = x.category;
        if (x.price !== undefined) payload.price = String(Number(x.price));
        if (x.quantity !== undefined) payload.quantity = String(Math.max(1, parseInt(x.quantity, 10) || 1));
        if (x.payment !== undefined) payload.payment = x.payment === 'Online' ? 'Online' : 'Cash';
        if (x.note !== undefined) payload.note = (x.note || '').trim();
        if (x.maker_id !== undefined) payload.maker_id = x.maker_id;

        const hasPhotos = x.photos !== undefined || x.photo_url !== undefined;
        const photos = photoList(x);
        if (hasPhotos) payload.photo_url = photos[0] || '';

        const purchase = await rpc('update_purchase', payload);
        if (hasPhotos) {
          try { await rpc4('set_purchase_photos', { id: b, photos }); } catch (e) {}
          try { return res.status(200).json({ purchase: await rpc('get_purchase', { id: b }) }); } catch (e) {}
        }
        return res.status(200).json({ purchase });
      }

      if (b && m === 'DELETE') {
        if (s.t !== 'admin') return fail(res, 403, 'Only the admin can delete. Use Request delete instead.');
        await rpc('delete_purchase', { id: b });
        return res.status(200).json({ ok: true });
      }
    }

    /* ---------- products ---------- */
    if (a === 'products') {
      const s = requireSession(req, res); if (!s) return;

      if (!b && m === 'GET') return res.status(200).json({ products: await rpc3('list_products') });

      if (!b && m === 'POST') {
        const x = body(req);
        const name = String(x.name || '').trim();
        if (!name) return fail(res, 400, 'Give the product a name before saving.');
        if (!(Number(x.price) > 0)) return fail(res, 400, 'Enter a price greater than zero.');
        const product = await rpc3('create_product', {
          photo_url: x.photo_url || '', name, price: String(Number(x.price)),
          note: (x.note || '').trim(), category_id: x.category_id || '',
          employee_id: s.t === 'staff' ? s.id : (x.employee_id || ''),
        });
        return res.status(200).json({ product });
      }

      if (b && c === 'sell' && m === 'POST') {
        const x = body(req);
        if (!(Number(x.sold_price) > 0)) return fail(res, 400, 'Enter a sold price greater than zero.');
        await rpc3('sell_product', {
          id: b, sold_price: String(Number(x.sold_price)),
          sold_by: s.t === 'staff' ? s.id : '',
        });
        return res.status(200).json({ ok: true });
      }

      if (b && c === 'unsell' && m === 'POST') {
        await rpc3('unsell_product', { id: b });
        return res.status(200).json({ ok: true });
      }

      if (b && m === 'PATCH') {
        if (s.t === 'staff') {
          const p = await findProduct(b);
          if (!p) return fail(res, 404, 'Product not found.');
          if (p.employee_id !== s.id) return fail(res, 403, 'You can only edit products you added.');
        }
        const x = body(req);
        const payload = { id: b };
        if (x.name !== undefined) {
          const n = String(x.name).trim();
          if (!n) return fail(res, 400, 'Give the product a name before saving.');
          payload.name = n;
        }
        if (x.price !== undefined) {
          if (!(Number(x.price) > 0)) return fail(res, 400, 'Enter a price greater than zero.');
          payload.price = String(Number(x.price));
        }
        if (x.note !== undefined) payload.note = (x.note || '').trim();
        if (x.category_id !== undefined) payload.category_id = x.category_id || '';
        if (x.photo_url !== undefined) payload.photo_url = x.photo_url || '';
        await rpc3('update_product', payload);
        return res.status(200).json({ ok: true });
      }

      if (b && m === 'DELETE') {
        if (s.t === 'staff') {
          const p = await findProduct(b);
          if (!p) return fail(res, 404, 'Product not found.');
          if (p.employee_id !== s.id) return fail(res, 403, 'You can only delete products you added.');
        }
        await rpc3('delete_product', { id: b });
        return res.status(200).json({ ok: true });
      }
    }

    /* ---------- admin ---------- */
    if (a === 'admin') {
      const s = requireAdmin(req, res); if (!s) return;
      const x = body(req);

      if (b === 'employees') {
        if (!c && m === 'POST') {
          const first = String(x.first_name || '').trim();
          const last = String(x.last_name || '').trim();
          const passkey = String(x.passkey || '');
          const role = String(x.role || '').trim() || 'Employee';
          if (!first || !last) return fail(res, 400, 'First and last name are required.');
          if (!/^\d{4,6}$/.test(passkey)) return fail(res, 400, 'Passkey must be 4 to 6 digits.');
          try {
            const employee = await rpc('create_employee', {
              first_name: first, last_name: last,
              email: (x.email || '').trim(), phone: (x.phone || '').trim(),
              passkey_hash: await bcrypt.hash(passkey, 10),
              passkey_lookup: sha256hex(passkey),
              role,
              status: x.status === 'Inactive' ? 'Inactive' : 'Active',
            });
            try { await rpc2('store_passkey_enc', { id: employee.id, passkey }); } catch (e) {}
            return res.status(200).json({ employee });
          } catch (e) {
            if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return fail(res, 409, 'That passkey is already in use.');
            throw e;
          }
        }
        if (c && d === 'reveal' && m === 'POST') {
          const out = await rpc2('reveal_passkey', { id: c });
          if (!out || !out.passkey) return fail(res, 404, 'Not stored yet — it appears after their next sign-in, or set a new one via Edit.');
          return res.status(200).json({ passkey: out.passkey });
        }
        if (c && m === 'PATCH') {
          const payload = { id: c };
          if (x.first_name !== undefined) payload.first_name = String(x.first_name).trim();
          if (x.last_name !== undefined) payload.last_name = String(x.last_name).trim();
          if (x.email !== undefined) payload.email = String(x.email).trim();
          if (x.phone !== undefined) payload.phone = String(x.phone).trim();
          if (x.role !== undefined) payload.role = String(x.role).trim() || 'Employee';
          if (x.status !== undefined) payload.status = x.status === 'Inactive' ? 'Inactive' : 'Active';
          if (x.passkey) {
            if (!/^\d{4,6}$/.test(String(x.passkey))) return fail(res, 400, 'Passkey must be 4 to 6 digits.');
            payload.passkey_hash = await bcrypt.hash(String(x.passkey), 10);
            payload.passkey_lookup = sha256hex(String(x.passkey));
          }
          try {
            const employee = await rpc('update_employee', payload);
            if (x.passkey) { try { await rpc2('store_passkey_enc', { id: c, passkey: String(x.passkey) }); } catch (e) {} }
            return res.status(200).json({ employee });
          } catch (e) {
            if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return fail(res, 409, 'That passkey is already in use.');
            throw e;
          }
        }
        if (c && m === 'DELETE') {
          try { await rpc('delete_employee', { id: c }); return res.status(200).json({ ok: true }); }
          catch (e) {
            if (e.code === '23503' || /foreign key/i.test(e.message)) return fail(res, 409, 'They have logged purchases, so they were kept. Set them Inactive instead.');
            throw e;
          }
        }
      }

      if (b === 'roles') {
        if (!c && m === 'GET') return res.status(200).json({ roles: await rpc3('list_roles') });
        if (!c && m === 'POST') {
          const name = String(x.name || '').trim();
          if (!name) return fail(res, 400, 'Enter a role name');
          try { return res.status(200).json({ role: await rpc3('create_role', { name }) }); }
          catch (e) {
            if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return fail(res, 409, 'That role already exists.');
            throw e;
          }
        }
        if (c && m === 'PATCH') {
          const name = String(x.name || '').trim();
          if (!name) return fail(res, 400, 'Enter a role name');
          try { return res.status(200).json({ role: await rpc3('rename_role', { id: c, name }) }); }
          catch (e) {
            if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return fail(res, 409, 'That role already exists.');
            throw e;
          }
        }
        if (c && m === 'DELETE') { await rpc3('delete_role', { id: c }); return res.status(200).json({ ok: true }); }
      }

      if (b === 'makers') {
        if (!c && m === 'POST') {
          const name = String(x.name || '').trim();
          if (!name) return fail(res, 400, 'Enter a maker name');
          const makers = await rpc('list_makers');
          if ((makers || []).some((mk) => mk.name.toLowerCase() === name.toLowerCase())) return fail(res, 409, 'That maker already exists');
          return res.status(200).json({ maker: await rpc('create_maker', { name }) });
        }
        if (c && m === 'PATCH') {
          const name = String(x.name || '').trim();
          if (!name) return fail(res, 400, 'Enter a maker name');
          return res.status(200).json({ maker: await rpc2('update_maker', { id: c, name }) });
        }
        if (c && m === 'DELETE') { await rpc('delete_maker', { id: c }); return res.status(200).json({ ok: true }); }
      }

      if (b === 'categories') {
        if (!c && m === 'GET') return res.status(200).json({ categories: await rpc2('list_categories') });
        if (!c && m === 'POST') {
          const name = String(x.name || '').trim();
          if (!name) return fail(res, 400, 'Enter a category name');
          try { return res.status(200).json({ category: await rpc2('create_category', { name }) }); }
          catch (e) {
            if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return fail(res, 409, 'That category already exists.');
            throw e;
          }
        }
        if (c && m === 'PATCH') {
          const name = String(x.name || '').trim();
          if (!name) return fail(res, 400, 'Enter a category name');
          try { return res.status(200).json({ category: await rpc2('rename_category', { id: c, name }) }); }
          catch (e) {
            if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return fail(res, 409, 'That category already exists.');
            throw e;
          }
        }
        if (c && m === 'DELETE') { await rpc2('delete_category', { id: c }); return res.status(200).json({ ok: true }); }
      }

      if (b === 'product-categories') {
        if (!c && m === 'GET') return res.status(200).json({ categories: await rpc3('list_product_categories') });
        if (!c && m === 'POST') {
          const name = String(x.name || '').trim();
          if (!name) return fail(res, 400, 'Enter a category name');
          try { return res.status(200).json({ category: await rpc3('create_product_category', { name }) }); }
          catch (e) {
            if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return fail(res, 409, 'That category already exists.');
            throw e;
          }
        }
        if (c && m === 'DELETE') { await rpc3('delete_product_category', { id: c }); return res.status(200).json({ ok: true }); }
      }

      if (b === 'delete-requests' && c && m === 'DELETE') {
        await rpc2('reject_delete_request', { id: c });
        return res.status(200).json({ ok: true });
      }

      if (b === 'admins') {
        if (!c && m === 'GET') return res.status(200).json({ admins: await rpc2('list_admins') });
        if (!c && m === 'POST') {
          const email = String(x.email || '').trim().toLowerCase();
          const password = String(x.password || '');
          if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Enter a valid email.');
          if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
          try {
            const admin = await rpc2('create_admin', { email, password_hash: await bcrypt.hash(password, 10) });
            return res.status(200).json({ admin });
          } catch (e) {
            if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return fail(res, 409, 'That email is already an admin.');
            throw e;
          }
        }
        if (c && m === 'DELETE') {
          if (c === s.id) return fail(res, 400, 'You cannot remove your own admin account.');
          await rpc2('delete_admin', { id: c });
          return res.status(200).json({ ok: true });
        }
      }

      if (b === 'account' && m === 'PATCH') {
        const payload = { id: s.id };
        const email = String(x.email || '').trim().toLowerCase();
        const password = String(x.password || '');
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
          if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return fail(res, 409, 'That email is already an admin.');
          throw e;
        }
      }

      if (b === 'settings' && m === 'PATCH') {
        const out = { ok: true };
        if (x.shop_name !== undefined) {
          const name = String(x.shop_name || '').trim();
          if (!name) return fail(res, 400, 'Enter a shop name');
          await rpc2('set_shop_name', { value: name });
          out.shop_name = name;
        }
        if (x.logo_url !== undefined) {
          const logo = String(x.logo_url || '');
          if (logo && !/^data:image\//.test(logo)) return fail(res, 400, 'Invalid image');
          if (logo.length > 400000) return fail(res, 400, 'Image too large — pick a smaller one.');
          await rpc2('set_logo', { value: logo });
          out.logo_url = logo;
        }
        return res.status(200).json(out);
      }
    }

    return fail(res, 404, 'Not found');
  } catch (e) {
    return fail(res, 500, e.message || 'Request failed');
  }
};
