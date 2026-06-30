const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { cartItems, customer, shippingFee, orderCode } = JSON.parse(event.body);

  const origin = event.headers.origin || process.env.URL || 'http://localhost:3456';

  const lineItems = cartItems.map(item => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.name,
        ...(item.color || item.size
          ? { description: [item.color, item.size].filter(Boolean).join(' · ') }
          : {}),
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.qty,
  }));

  lineItems.push({
    price_data: {
      currency: 'usd',
      product_data: { name: 'International Shipping (SHIP-INTL)' },
      unit_amount: Math.round(shippingFee * 100),
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
      firstName:     customer.firstName,
      lastName:      customer.lastName,
      phone:         customer.phone    || '',
      streetAddress: customer.streetAddress,
      city:          customer.city,
      country:       customer.country,
      loyalty:       customer.loyalty ? 'yes' : 'no',
    },
    success_url: `${origin}/success.html?order=${orderCode}`,
    cancel_url:  `${origin}/`,
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: session.url }),
  };
};
