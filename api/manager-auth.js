const crypto = require('crypto');

function makeToken(password) {
  // Token is valid for the current UTC day — rotates at midnight
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHmac('sha256', password).update(day).digest('hex');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { password } = req.body || {};
  const correct = process.env.MANAGER_PASSWORD;

  if (!correct) {
    console.error('MANAGER_PASSWORD env var not set');
    return res.status(500).send('Server misconfiguration');
  }

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(password || '');
  const b = Buffer.from(correct);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  return res.status(200).json({ token: makeToken(correct) });
};
