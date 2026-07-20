const bcrypt = require('bcryptjs');
const { rpc, rpc2, sha256hex, readSession, fail } = require('../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  try {
    if (req.method === 'POST') {
      const b = req.body || {};
      const first = String(b.first_name || '').trim();
      const last = String(b.last_name || '').trim();
      const passkey = String(b.passkey || '');
      if (!first || !last) return fail(res, 400, 'First and last name are required.');
      if (!/^\d{4,6}$/.test(passkey)) return fail(res, 400, 'Passkey must be 4 to 6 digits.');
      const hash = await bcrypt.hash(passkey, 10);
      try {
        const employee = await rpc('create_employee', {
          first_name: first,
          last_name: last,
          email: (b.email || '').trim(),
          phone: (b.phone || '').trim(),
          passkey_hash: hash,
          passkey_lookup: sha256hex(passkey),
          role: b.role === 'Manager' ? 'Manager' : 'Employee',
          status: b.status === 'Inactive' ? 'Inactive' : 'Active',
        });
        try { await rpc2('store_passkey_enc', { id: employee.id, passkey }); } catch (e) {}
        return res.status(200).json({ employee });
      } catch (e) {
        if (e.code === '23505' || /duplicate|unique/i.test(e.message)) {
          return fail(res, 409, 'That passkey is already in use.');
        }
        throw e;
      }
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
