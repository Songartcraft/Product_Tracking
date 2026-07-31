const { rpc2, readSession, fail } = require('../_lib.js');

module.exports = async (req, res) => {
  const session = readSession(req);
  if (!session || session.t !== 'admin') return fail(res, 401, 'Admin only');
  if (req.method !== 'PATCH') return fail(res, 405, 'Method not allowed');
  try {
    const b = req.body || {};
    const out = { ok: true };
    if (b.shop_name !== undefined) {
      const name = String(b.shop_name || '').trim();
      if (!name) return fail(res, 400, 'Enter a shop name');
      await rpc2('set_shop_name', { value: name });
      out.shop_name = name;
    }
    if (b.logo_url !== undefined) {
      const logo = String(b.logo_url || '');
      if (logo && !/^data:image\//.test(logo)) return fail(res, 400, 'Invalid image');
      if (logo.length > 400000) return fail(res, 400, 'Image too large — pick a smaller one.');
      await rpc2('set_logo', { value: logo });
      out.logo_url = logo;
    }
    res.status(200).json(out);
  } catch (e) {
    fail(res, 500, e.message || 'Request failed');
  }
};
