const { runCors } = require('./helper');

module.exports = async (req, res) => {
  if (runCors(req, res)) return;
  res.json({ status: 'ok', ts: new Date().toISOString() });
};
