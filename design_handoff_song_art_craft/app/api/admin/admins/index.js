const bcrypt = require('bcryptjs');
const { rpc2, readSession, fail } = require('../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ admins: await rpc2('list_admins') });
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Enter a valid email.');
      if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
      try {
        const admin = await rpc2('create_admin', { email, password_hash: await bcrypt.hash(password, 10) });
        return res.status(200).json({ admin });
      } catch (e) {
        if (e.code === '23505' || /duplicate|unique/i.test(e.message)) {
          return fail(res, 409, 'That email is already an admin.');
        }
        throw e;
      }
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
