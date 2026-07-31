const { rpc3, readSession, fail } = require('../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  try {
    if (req.method === 'DELETE') {
      await rpc3('delete_product_category', { id: req.query.id });
      return res.status(200).json({ ok: true });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 400, e.message || 'Request failed');
  }
};
