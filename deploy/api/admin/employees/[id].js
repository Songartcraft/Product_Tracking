const bcrypt = require('bcryptjs');
const { rpc, rpc2, sha256hex, readSession, fail } = require('../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  const id = req.query.id;
  try {
    if (req.method === 'PATCH') {
      const b = req.body || {};
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
        if (e.code === '23505' || /duplicate|unique/i.test(e.message)) {
          return fail(res, 409, 'That passkey is already in use.');
        }
        throw e;
      }
    }
    if (req.method === 'DELETE') {
      try {
        await rpc('delete_employee', { id });
        return res.status(200).json({ ok: true });
      } catch (e) {
        if (e.code === '23503' || /foreign key/i.test(e.message)) {
          return fail(res, 409, 'They have logged purchases, so they were kept. Set them Inactive instead.');
        }
        throw e;
      }
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
