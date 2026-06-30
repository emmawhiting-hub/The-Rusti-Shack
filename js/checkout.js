const SHIPPING_FEE_USD = 15.00;

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

  // §5 — send only SKUs and quantities; the server looks up every price
  const cartSnapshot = cart.map(item => ({
    sku:   item.sku,
    name:  item.name,
    color: item.color || null,
    size:  item.size  || null,
    qty:   item.qty,
    // item.price deliberately excluded — server is authoritative on price
  }));

  // Keep a minimal order record in localStorage so the success page can greet
  // the customer by name. PII is cleared as soon as the success page renders.
  const pendingOrder = {
    orderCode,
    date:        new Date().toISOString().split('T')[0],
    location:    'SHIP-INTL',
    associate:   'WEB',
    channel:     'Shipping',
    shippingFee: SHIPPING_FEE_USD,
    payment:     'Card',
    customer,
    lines: cartSnapshot,
  };
  localStorage.setItem('rusti_pending_order', JSON.stringify(pendingOrder));

  btn.disabled = true;
  btn.textContent = 'Redirecting to payment…';

  try {
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartItems: cartSnapshot, customer, orderCode }),
    });

    if (!res.ok) {
      // §1 rule 9 — show vague message; server logs the detail
      throw new Error('server error');
    }
    const { url } = await res.json();
    cart = [];
    saveCart();
    window.location.href = url;

  } catch {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Place Order';
    showToast('Payment setup failed — please try again or contact us.', 'error');
    localStorage.removeItem('rusti_pending_order');
  }
}

function showOrderConfirmation(order) {
  const linesHtml = order.lines.map(l =>
    `<div class="co-confirm-line">
      <span>${l.name}${l.color ? ' · ' + l.color : ''}${l.size ? ' · ' + l.size : ''} ×${l.qty}</span>
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
      <p class="co-confirm-msg">Thank you, ${order.customer.firstName}. We'll send shipping details to <strong>${order.customer.email}</strong>.</p>
      <div class="co-confirm-summary">
        ${linesHtml}
        <div class="co-confirm-line co-confirm-ship"><span>Shipping (SHIP-INTL)</span></div>
        <div class="co-confirm-line co-confirm-total"><span>Total confirmed by payment</span></div>
      </div>
      <button class="co-confirm-btn" onclick="showHome()">Continue Shopping</button>
    </div>`;
}
