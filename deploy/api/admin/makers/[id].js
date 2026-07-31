const { rpc, rpc2, readSession, fail } = require('../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  const id = req.query.id;
  try {
    if (req.method === 'PATCH') {
      const name = String((req.body && req.body.name) || '').trim();
      if (!name) return fail(res, 400, 'Enter a maker name');
      const maker = await rpc2('update_maker', { id, name });
      return res.status(200).json({ maker });
    }
    if (req.method === 'DELETE') {
      await rpc('delete_maker', { id });
      return res.status(200).json({ ok: true });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 400, e.message || 'Request failed');
  }
};
