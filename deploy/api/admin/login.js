const bcrypt = require('bcryptjs');
const { rpc, setSession, fail } = require('../_lib.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    if (!email || !password) return fail(res, 401, 'Incorrect ID or password.');
    const admin = await rpc('find_admin_by_email', { email });
    if (!admin || !admin.password_hash) return fail(res, 401, 'Incorrect ID or password.');
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return fail(res, 401, 'Incorrect ID or password.');
    setSession(res, { t: 'admin', id: admin.id, email: admin.email });
    res.status(200).json({ admin: { id: admin.id, email: admin.email } });
  } catch (e) {
    fail(res, 500, e.message || 'Login failed');
  }
};
