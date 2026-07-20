const { rpc2, readSession, fail } = require('../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  const id = req.query.id;
  try {
    if (req.method === 'PATCH') {
      const name = String((req.body && req.body.name) || '').trim();
      if (!name) return fail(res, 400, 'Enter a category name');
      try {
        const category = await rpc2('rename_category', { id, name });
        return res.status(200).json({ category });
      } catch (e) {
        if (e.code === '23505' || /duplicate|unique/i.test(e.message)) {
          return fail(res, 409, 'That category already exists');
        }
        throw e;
      }
    }
    if (req.method === 'DELETE') {
      await rpc2('delete_category', { id });
      return res.status(200).json({ ok: true });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 400, e.message || 'Request failed');
  }
};
