const Stripe = require('stripe');

// §5 — prices come from the server, never from the client.
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

const SHIPPING_FEE_USD = 12.00;
const ALLOWED_ORIGINS = [
  'https://the-rusti-shack.vercel.app',
  'http://localhost:3456',
  'http://localhost:3000',
];

function isValidSku(sku) {
  return typeof sku === 'string' && /^[A-Z]{2,5}-\d{3}$/.test(sku) && sku in PRODUCT_PRICES;
}
function isValidQty(qty) {
  return Number.isInteger(qty) && qty >= 1 && qty <= 20;
}
function isValidString(val, maxLen) {
  return typeof val === 'string' && val.trim().length > 0 && val.length <= maxLen;
}
function isValidEmail(val) {
  return typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && val.length <= 254;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { cartItems, customer, orderCode } = req.body || {};

  const errors = [];

  if (!Array.isArray(cartItems) || cartItems.length === 0 || cartItems.length > 50) {
    errors.push('invalid cart');
  } else {
    for (const item of cartItems) {
      if (!isValidSku(item.sku)) errors.push(`unknown SKU: ${String(item.sku).slice(0, 20)}`);
      if (!isValidQty(item.qty)) errors.push(`invalid qty for ${item.sku}`);
    }
  }

  if (!customer || typeof customer !== 'object') {
    errors.push('missing customer');
  } else {
    if (!isValidString(customer.firstName, 100))     errors.push('invalid firstName');
    if (!isValidString(customer.lastName, 100))      errors.push('invalid lastName');
    if (!isValidEmail(customer.email))               errors.push('invalid email');
    if (!isValidString(customer.streetAddress, 300)) errors.push('invalid streetAddress');
    if (!isValidString(customer.city, 100))          errors.push('invalid city');
    if (!isValidString(customer.country, 100))       errors.push('invalid country');
    // region and postalCode are optional but bounded if present
    if (customer.region     && customer.region.length     > 100) errors.push('invalid region');
    if (customer.postalCode && customer.postalCode.length > 20)  errors.push('invalid postalCode');
  }

  if (!isValidString(orderCode, 20) || !/^ORD\d{6}$/.test(orderCode)) {
    errors.push('invalid orderCode');
  }

  if (errors.length) {
    console.error('Checkout validation failed:', errors);
    return res.status(400).send('Invalid request');
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const siteOrigin = ALLOWED_ORIGINS.find(o => origin.startsWith(o)) || ALLOWED_ORIGINS[0];

    const lineItems = cartItems.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name ? String(item.name).slice(0, 250) : item.sku,
          ...(item.color || item.size
            ? { description: [item.color, item.size].filter(Boolean).map(s => String(s).slice(0, 100)).join(' · ') }
            : {}),
        },
        unit_amount: Math.round(PRODUCT_PRICES[item.sku] * 100),
      },
      quantity: item.qty,
    }));

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'International Shipping (SHIP-INTL)' },
        unit_amount: Math.round(SHIPPING_FEE_USD * 100),
      },
      quantity: 1,
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: customer.email,
      metadata: {
        orderCode,
        firstName:     customer.firstName.slice(0, 100),
        lastName:      customer.lastName.slice(0, 100),
        phone:         (customer.phone || '').slice(0, 50),
        streetAddress: customer.streetAddress.slice(0, 300),
        city:          customer.city.slice(0, 100),
        region:        (customer.region     || '').slice(0, 100),
        postalCode:    (customer.postalCode || '').slice(0, 20),
        country:       customer.country.slice(0, 100),
        loyalty:       customer.loyalty ? 'yes' : 'no',
      },
      success_url: `${siteOrigin}/success.html?order=${orderCode}`,
      cancel_url:  `${siteOrigin}/`,
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe session creation failed:', err.message);
    return res.status(500).send('Payment setup failed. Please try again.');
  }
};
