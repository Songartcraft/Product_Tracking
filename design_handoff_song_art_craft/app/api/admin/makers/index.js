const { rpc, readSession, fail } = require('../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  try {
    if (req.method === 'POST') {
      const name = String((req.body && req.body.name) || '').trim();
      if (!name) return fail(res, 400, 'Enter a maker name');
      const makers = await rpc('list_makers');
      if ((makers || []).some((m) => m.name.toLowerCase() === name.toLowerCase())) {
        return fail(res, 409, 'That maker already exists');
      }
      const maker = await rpc('create_maker', { name });
      return res.status(200).json({ maker });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
