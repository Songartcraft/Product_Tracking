const { rpc, readSession, fail } = require('../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session) return fail(res, 401, 'Not signed in');
  try {
    if (req.method === 'POST') {
      if (session.t !== 'staff') return fail(res, 403, 'Only staff can log purchases');
      const b = req.body || {};
      if (!b.category) return fail(res, 400, 'Select a category');
      if (!(Number(b.price) > 0)) return fail(res, 400, 'Enter a valid price');
      const purchase = await rpc('create_purchase', {
        photo_url: b.photo_url || '',
        photo_path: '',
        category: b.category,
        price: String(Number(b.price)),
        quantity: String(Math.max(1, parseInt(b.quantity, 10) || 1)),
        payment: b.payment === 'Online' ? 'Online' : 'Cash',
        note: (b.note || '').trim(),
        maker_id: b.maker_id,
        employee_id: session.id,
      });
      return res.status(200).json({ purchase });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
