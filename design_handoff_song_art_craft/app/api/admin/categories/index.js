const { rpc2, readSession, fail } = require('../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ categories: await rpc2('list_categories') });
    }
    if (req.method === 'POST') {
      const name = String((req.body && req.body.name) || '').trim();
      if (!name) return fail(res, 400, 'Enter a category name');
      try {
        const category = await rpc2('create_category', { name });
        return res.status(200).json({ category });
      } catch (e) {
        if (e.code === '23505' || /duplicate|unique/i.test(e.message)) {
          return fail(res, 409, 'That category already exists');
        }
        throw e;
      }
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
