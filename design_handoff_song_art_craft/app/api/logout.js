const { clearSession } = require('./_lib.js');

module.exports = async (req, res) => {
  clearSession(res);
  res.status(200).json({ ok: true });
};
