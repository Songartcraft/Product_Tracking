const { rpc3, readSession, fail } = require('../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session) return fail(res, 401, 'Not signed in');
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ products: await rpc3('list_products') });
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const name = String(b.name || '').trim();
      if (!name) return fail(res, 400, 'Give the product a name before saving.');
      if (!(Number(b.price) > 0)) return fail(res, 400, 'Enter a price greater than zero.');
      const created = await rpc3('create_product', {
        photo_url: b.photo_url || '',
        name,
        price: String(Number(b.price)),
        note: (b.note || '').trim(),
        category_id: b.category_id || '',
        employee_id: session.t === 'staff' ? session.id : (b.employee_id || ''),
      });
      return res.status(200).json({ product: created });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
