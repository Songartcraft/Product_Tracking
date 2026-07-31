const { rpc, fail } = require('./_lib.js');

module.exports = async (req, res) => {
  try {
    const makers = await rpc('list_makers');
    res.status(200).json({ ok: true, db: true, makers: (makers || []).length });
  } catch (e) {
    fail(res, 500, 'DB check failed: ' + (e.message || 'unknown'));
  }
};
