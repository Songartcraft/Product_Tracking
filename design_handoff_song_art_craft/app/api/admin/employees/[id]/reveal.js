const { rpc2, readSession, fail } = require('../../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  try {
    const out = await rpc2('reveal_passkey', { id: req.query.id });
    if (!out || !out.passkey) {
      return fail(res, 404, 'Not stored yet — it will appear after their next sign-in, or set a new one via Edit.');
    }
    res.status(200).json({ passkey: out.passkey });
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
