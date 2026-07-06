const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');


const SUPABASE_URL = 'https://tukwikdsvjqlyyegdaak.supabase.co';
const SHIPPING_FEE_USD = 12.00;

const PRODUCT_PRICES = {
  "SNK-001": 42.99, "SNK-002": 58.00, "SNK-003": 34.99, "SNK-004": 64.99,
  "FIN-001": 79.00, "FIN-002": 49.99, "FIN-003": 29.99,
  "WET-001": 109.00, "WET-002": 32.99,
  "SUR-003": 279.00, "SUR-004": 22.50, "SUR-006": 89.00,
  "APP-001": 24.99, "APP-002": 26.99, "APP-003": 44.99,
  "APP-004": 54.00, "APP-005": 58.00, "APP-006": 28.00, "APP-007": 14.99,
  "BCH-003": 24.99, "BCH-004": 28.00, "BCH-009": 39.99,
  "BCH-011": 38.00, "BCH-012": 58.00,
  "KIT-001": 1099.00, "KIT-002": 139.00,
};

// §5 — in-memory dedup for Stripe retries
const processedEvents = new Set();

async function writeOrder(supabase, session) {
  const meta       = session.metadata || {};
  const orderCode  = meta.orderCode;
  const customerId = meta.customerId || null;
  const total      = session.amount_total / 100;
  const cartItems  = JSON.parse(meta.cart || '[]');

  const { error: orderErr } = await supabase.from('Orders').insert({
    OrderID:        orderCode,
    OrderDate:      new Date().toISOString().split('T')[0],
    CustID:         customerId,
    LocationID:     'SHIP-INTL',
    SalesAssociate: 'WEB',
    Channel:        'Shipping',
    ShippingFee:    SHIPPING_FEE_USD,
    OrderTotal:     total,
    PaymentMethod:  'Card',
  });
  if (orderErr) throw new Error('Orders insert: ' + orderErr.message);

  for (let i = 0; i < cartItems.length; i++) {
    const { sku, qty } = cartItems[i];
    const unitPrice = PRODUCT_PRICES[sku] || 0;
    // LineRevenue is a generated column; LineCost is not, so set it here from
    // the SKU's historical cost ratio. Without this, web orders would have a
    // null LineCost and inflate gross margin to 100% in the financials view.
    const lineRevenue = unitPrice * qty;
    const lineCost = +(lineRevenue * await costRatioForSku(supabase, sku)).toFixed(2);
    const { error: lineErr } = await supabase.from('OrderLines').insert({
      OrderID:     orderCode,
      LineNumber:  i + 1,
      ProductCode: sku,
      Quantity:    qty,
      UnitPrice:   unitPrice,
      DiscountPct: 0,
      LineCost:    lineCost,
    });
    if (lineErr) console.error('OrderLines insert error:', lineErr.message);
  }

  await decrementInventory(supabase, cartItems);

  console.log(`Order written to DB: ${orderCode} | customer: ${customerId} | total: ${total}`);
}

// Historical cost/revenue ratio for a SKU, used to estimate LineCost on web
// orders. Falls back to the overall average (~0.42) when a SKU has no priced
// history. Cached per invocation to avoid repeat queries for repeat SKUs.
const OVERALL_COST_RATIO = 0.42;
const _costRatioCache = {};
async function costRatioForSku(supabase, sku) {
  if (_costRatioCache[sku] != null) return _costRatioCache[sku];
  const { data, error } = await supabase.from('OrderLines')
    .select('LineRevenue,LineCost').eq('ProductCode', sku).not('LineCost', 'is', null).limit(200);
  let ratio = OVERALL_COST_RATIO;
  if (!error && data && data.length) {
    let rev = 0, cost = 0;
    for (const l of data) { rev += parseFloat(l.LineRevenue || 0); cost += parseFloat(l.LineCost || 0); }
    if (rev > 0) ratio = cost / rev;
  }
  _costRatioCache[sku] = ratio;
  return ratio;
}

async function decrementInventory(supabase, cartItems) {
  for (const { sku, qty } of cartItems) {
    const { data: inv, error: readErr } = await supabase.from('Inventory').select('StockQty').eq('SKU', sku).maybeSingle();
    if (readErr) { console.error(`Inventory read error for ${sku}:`, readErr.message); continue; }
    if (!inv) continue; // untracked SKU — nothing to decrement
    const newQty = Math.max(0, (inv.StockQty || 0) - qty);
    const { error: updateErr } = await supabase.from('Inventory')
      .update({ StockQty: newQty, LastUpdated: new Date().toISOString() })
      .eq('SKU', sku);
    if (updateErr) console.error(`Inventory update error for ${sku}:`, updateErr.message);
  }
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handler(req, res) {
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
    const rawBody = await getRawBody(req);
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
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

    console.log(`Payment confirmed: ${orderCode} | ${firstName} ${lastName} | ${session.id}`);

    try {
      const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
      await writeOrder(supabase, session);
    } catch (dbErr) {
      console.error('Order DB write failed:', dbErr.message);
      // Still return 200 so Stripe doesn't retry — order is paid, we log the failure
    }
  }

  processedEvents.add(stripeEvent.id);
  return res.status(200).send('ok');
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
