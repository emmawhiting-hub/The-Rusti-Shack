const Stripe = require('stripe');

// Vercel: disable body parsing so Stripe can verify the raw request signature
module.exports.config = { api: { bodyParser: false } };

// §5 — in-memory dedup for Stripe retries
const processedEvents = new Set();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('Webhook: missing stripe-signature header');
    return res.status(400).send('Bad request');
  }

  let stripeEvent;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // §5 — must verify on the raw body before parsing
    stripeEvent = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  if (processedEvents.has(stripeEvent.id)) {
    console.log('Webhook: duplicate event ignored:', stripeEvent.id);
    return res.status(200).send('ok');
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const { orderCode, firstName, lastName } = session.metadata || {};

    if (session.payment_status !== 'paid') {
      console.error(`Webhook: session ${session.id} not paid — status: ${session.payment_status}`);
      return res.status(200).send('ok');
    }

    const total = session.amount_total;
    console.log(`Order confirmed: ${orderCode} | ${firstName} ${lastName} | ${session.currency.toUpperCase()} ${(total / 100).toFixed(2)} | ${session.id}`);

    // TODO: write to Supabase when manager page is built
  }

  processedEvents.add(stripeEvent.id);
  return res.status(200).send('ok');
};
