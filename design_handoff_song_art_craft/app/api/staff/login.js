const bcrypt = require('bcryptjs');
const { rpc, rpc2, sha256hex, setSession, fail } = require('../_lib.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  try {
    const passkey = String((req.body && req.body.passkey) || '');
    if (!/^\d{4,6}$/.test(passkey)) return fail(res, 401, 'Passkey not recognised. Try again.');
    const emp = await rpc('find_employee_for_passkey', { passkey_lookup: sha256hex(passkey) });
    if (!emp || !emp.passkey_hash) return fail(res, 401, 'Passkey not recognised. Try again.');
    const ok = await bcrypt.compare(passkey, emp.passkey_hash);
    if (!ok) return fail(res, 401, 'Passkey not recognised. Try again.');
    const employee = {
      id: emp.id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      name: emp.first_name + ' ' + emp.last_name,
      role: emp.role,
    };
    setSession(res, { t: 'staff', id: emp.id, name: employee.name, role: emp.role });
    // Backfill the admin-revealable encrypted copy for passkeys set before this feature
    try { await rpc2('store_passkey_enc', { id: emp.id, passkey }); } catch (e) {}
    res.status(200).json({ employee });
  } catch (e) {
    fail(res, 500, e.message || 'Login failed');
  }
};
