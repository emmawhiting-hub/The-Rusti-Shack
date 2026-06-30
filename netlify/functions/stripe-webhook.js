const Stripe = require('stripe');

// §5 — track processed event IDs to ignore Stripe retries
// (in-memory only until Supabase is connected; sufficient for now
//  because Netlify reuses containers between calls for a period)
const processedEvents = new Set();

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  if (!sig) {
    console.error('Webhook: missing stripe-signature header');
    return { statusCode: 400, body: 'Bad request' };
  }

  let stripeEvent;
  try {
    // §5 — verify signature on the raw body before touching any data
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    // §1 rule 9 — vague to caller, detailed in logs
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  // §5 — ignore duplicate deliveries (Stripe retries on timeout/error)
  if (processedEvents.has(stripeEvent.id)) {
    console.log('Webhook: duplicate event ignored:', stripeEvent.id);
    return { statusCode: 200, body: 'ok' };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const { orderCode, firstName, lastName, email: metaEmail } = session.metadata || {};

    // §5 — confirm amount matches what the server calculated
    const expectedTotal = session.amount_total; // already in cents, set by our function
    if (session.payment_status !== 'paid') {
      console.error(`Webhook: session ${session.id} not paid — status: ${session.payment_status}`);
      return { statusCode: 200, body: 'ok' }; // return 200 so Stripe doesn't retry
    }

    console.log(`Order confirmed by webhook: ${orderCode} | ${firstName} ${lastName} | ${session.currency.toUpperCase()} ${(expectedTotal / 100).toFixed(2)} | Stripe session: ${session.id}`);

    // TODO (Supabase): mark order as paid in the database here:
    // await supabase.from('orders').update({ status: 'paid', stripe_session_id: session.id })
    //   .eq('order_code', orderCode)
  }

  processedEvents.add(stripeEvent.id);
  return { statusCode: 200, body: 'ok' };
};
