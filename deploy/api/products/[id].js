const { rpc3, readSession, fail } = require('../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session) return fail(res, 401, 'Not signed in');
  const id = req.query.id;
  try {
    if (req.method === 'PATCH') {
      const b = req.body || {};
      const payload = { id };
      if (b.name !== undefined) {
        const name = String(b.name).trim();
        if (!name) return fail(res, 400, 'Give the product a name before saving.');
        payload.name = name;
      }
      if (b.price !== undefined) {
        if (!(Number(b.price) > 0)) return fail(res, 400, 'Enter a price greater than zero.');
        payload.price = String(Number(b.price));
      }
      if (b.note !== undefined) payload.note = (b.note || '').trim();
      if (b.category_id !== undefined) payload.category_id = b.category_id || '';
      if (b.photo_url !== undefined) payload.photo_url = b.photo_url || '';
      await rpc3('update_product', payload);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await rpc3('delete_product', { id });
      return res.status(200).json({ ok: true });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
