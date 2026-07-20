const { rpc, readSession, fail } = require('../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session) return fail(res, 401, 'Not signed in');
  const id = req.query.id;
  try {
    if (req.method === 'GET') {
      const purchase = await rpc('get_purchase', { id });
      return res.status(200).json({ purchase });
    }
    if (req.method === 'PATCH') {
      const b = req.body || {};
      const payload = { id, actor: { type: session.t === 'admin' ? 'admin' : 'staff', subject: session.id } };
      if (b.category !== undefined) payload.category = b.category;
      if (b.price !== undefined) payload.price = String(Number(b.price));
      if (b.quantity !== undefined) payload.quantity = String(Math.max(1, parseInt(b.quantity, 10) || 1));
      if (b.payment !== undefined) payload.payment = b.payment === 'Online' ? 'Online' : 'Cash';
      if (b.note !== undefined) payload.note = (b.note || '').trim();
      if (b.maker_id !== undefined) payload.maker_id = b.maker_id;
      if (b.photo_url !== undefined) payload.photo_url = b.photo_url || '';
      const purchase = await rpc('update_purchase', payload);
      return res.status(200).json({ purchase });
    }
    if (req.method === 'DELETE') {
      await rpc('delete_purchase', { id });
      return res.status(200).json({ ok: true });
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
