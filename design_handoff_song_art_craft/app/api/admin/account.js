const bcrypt = require('bcryptjs');
const { rpc2, readSession, setSession, fail } = require('../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  if (req.method !== 'PATCH') return fail(res, 405, 'Method not allowed');
  try {
    const b = req.body || {};
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
      if (e.code === '23505' || /duplicate|unique/i.test(e.message)) {
        return fail(res, 409, 'That email is already an admin.');
      }
      throw e;
    }
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
