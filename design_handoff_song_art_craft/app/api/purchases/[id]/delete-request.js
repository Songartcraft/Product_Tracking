const { rpc2, readSession, fail } = require('../../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session) return fail(res, 401, 'Not signed in');
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  try {
    await rpc2('create_delete_request', {
      purchase_id: req.query.id,
      requested_by: session.t === 'staff' ? session.id : '',
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
