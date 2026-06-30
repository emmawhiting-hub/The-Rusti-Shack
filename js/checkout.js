const SHIPPING_FEE_USD = 15.00;

const CHECKOUT_COUNTRIES = [
  'Philippines','United States','Australia','Germany','Japan','New Zealand',
  'Singapore','South Korea','United Kingdom','Canada','France','Netherlands',
  'Italy','Spain','Sweden','Norway','Denmark','Switzerland','Austria','Belgium',
  'Hong Kong','Taiwan','China','Indonesia','Malaysia','Thailand','Vietnam',
  'India','United Arab Emirates','Brazil','Mexico','Argentina','South Africa','Other'
];

function generateOrderCode() {
  const seq = parseInt(localStorage.getItem('rusti_order_seq') || '50005');
  const next = seq + 1;
  localStorage.setItem('rusti_order_seq', next);
  return 'ORD' + String(next).padStart(6, '0');
}

function showCheckoutView() {
  closeCart();
  if (!cart.length) { showToast('Your cart is empty'); return; }
  ['home-view','shop-view','about-view'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  const view = document.getElementById('checkout-view');
  view.style.display = 'block';
  view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderCheckoutSummary();
}

function renderCheckoutSummary() {
  const subtotalUSD = cartTotal();
  const totalUSD = subtotalUSD + SHIPPING_FEE_USD;

  const itemsHtml = cart.map(item => `
    <div class="co-line">
      <img src="${item.image}" alt="${item.name}" class="co-thumb"
        onerror="this.src='https://placehold.co/64x64/e8f0f8/1B3D6E?text=Item'">
      <div class="co-line-info">
        <span class="co-line-name">${item.name}</span>
        ${item.color || item.size ? `<span class="co-line-meta">${[item.color, item.size].filter(Boolean).join(' · ')}</span>` : ''}
      </div>
      <span class="co-line-qty">×${item.qty}</span>
      <span class="co-line-price">${formatPrice(item.price * item.qty)}</span>
    </div>`).join('');

  document.getElementById('co-items').innerHTML = itemsHtml;
  document.getElementById('co-subtotal').textContent = formatPrice(subtotalUSD);
  document.getElementById('co-shipping').textContent = formatPrice(SHIPPING_FEE_USD);
  document.getElementById('co-total').textContent = formatPrice(totalUSD);
}

async function submitCheckout(e) {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('.co-submit-btn');

  const customer = {
    firstName:     f.firstName.value.trim(),
    lastName:      f.lastName.value.trim(),
    email:         f.email.value.trim(),
    phone:         f.phone.value.trim(),
    streetAddress: f.streetAddress.value.trim(),
    city:          f.city.value.trim(),
    country:       f.country.value,
    loyalty:       f.loyalty.checked,
  };

  const orderCode = generateOrderCode();

  const order = {
    orderCode,
    date:        new Date().toISOString().split('T')[0],
    location:    'SHIP-INTL',
    associate:   'WEB',
    channel:     'Shipping',
    shippingFee: SHIPPING_FEE_USD,
    subtotal:    cartTotal(),
    total:       cartTotal() + SHIPPING_FEE_USD,
    payment:     'Card',
    customer,
    lines: cart.map(item => ({
      sku:       item.sku,
      name:      item.name,
      color:     item.color || null,
      size:      item.size  || null,
      qty:       item.qty,
      unitPrice: item.price,
      discount:  0,
      lineTotal: item.price * item.qty,
    }))
  };

  // Persist order so success page can read it
  const orders = JSON.parse(localStorage.getItem('rusti_orders') || '[]');
  orders.push(order);
  localStorage.setItem('rusti_orders', JSON.stringify(orders));

  // Try Stripe hosted checkout
  btn.disabled = true;
  btn.textContent = 'Redirecting to payment…';

  try {
    const res = await fetch('/.netlify/functions/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cartItems:   cart,
        customer,
        shippingFee: SHIPPING_FEE_USD,
        orderCode,
      }),
    });

    if (!res.ok) throw new Error('Function error');
    const { url } = await res.json();
    cart = [];
    saveCart();
    window.location.href = url;

  } catch (err) {
    // Stripe not yet connected — fall back to local confirmation
    cart = [];
    saveCart();
    showOrderConfirmation(order);
  }
}

function showOrderConfirmation(order) {
  const linesHtml = order.lines.map(l =>
    `<div class="co-confirm-line">
      <span>${l.name}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''} ×${l.qty}</span>
      <span>${formatPrice(l.lineTotal)}</span>
    </div>`).join('');

  document.getElementById('checkout-view').innerHTML = `
    <div class="co-confirm">
      <div class="co-confirm-icon">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      </div>
      <h2>Order Received!</h2>
      <p class="co-confirm-code">${order.orderCode}</p>
      <p class="co-confirm-msg">Thank you, ${order.customer.firstName}. We've got your order and will send shipping details to <strong>${order.customer.email}</strong>.</p>
      <div class="co-confirm-summary">
        ${linesHtml}
        <div class="co-confirm-line co-confirm-ship"><span>Shipping (SHIP-INTL)</span><span>${formatPrice(order.shippingFee)}</span></div>
        <div class="co-confirm-line co-confirm-total"><span>Total</span><span>${formatPrice(order.total)}</span></div>
      </div>
      <button class="co-confirm-btn" onclick="showHome()">Continue Shopping</button>
    </div>`;
}
