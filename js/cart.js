/* ── Cart State ── */
let cart = JSON.parse(localStorage.getItem('rusti_cart') || '[]');

function saveCart() {
  localStorage.setItem('rusti_cart', JSON.stringify(cart));
  renderCart();
  updateCartCount();
}

function addToCart(product, color, size, qty = 1) {
  const variantSku = findVariantSku(product, color, size);
  const key = `${product.sku}||${color || ''}||${size || ''}`;
  const existing = cart.find(i => i.key === key);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      key, qty,
      sku: variantSku || product.sku,
      parentSku: product.sku,
      name: product.name,
      color: color || null,
      size: size || null,
      price: product.price,
      image: getProductImage(product, color, false),
    });
  }
  saveCart();
  showToast(`Added to cart!`, 'success');
  bumpCartCount();
}

function findVariantSku(product, color, size) {
  if (!product.variants || !product.variants.length) return product.sku;
  const match = product.variants.find(v =>
    (!color || v.color === color) && (!size || v.size === size)
  );
  return match ? match.sku : product.sku;
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart();
}

function updateQty(key, delta) {
  const item = cart.find(i => i.key === key);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
}

function cartTotal() {
  return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function cartCount() {
  return cart.reduce((sum, i) => sum + i.qty, 0);
}

function updateCartCount() {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = cartCount();
}

function bumpCartCount() {
  const el = document.getElementById('cart-count');
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 300);
}

function renderCart() {
  const container = document.getElementById('cart-items');
  if (!container) return;

  if (!cart.length) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="empty-icon">🛒</div>
        <p>Your cart is empty.<br>Find something you love!</p>
      </div>`;
    document.getElementById('cart-total').textContent = '$0.00';
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" onerror="this.src='https://placehold.co/80x80/e8f4f3/1B3D6E?text=🐢'">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <div class="cart-item-meta">
          ${item.color ? `Color: ${item.color}` : ''}
          ${item.color && item.size ? ' · ' : ''}
          ${item.size ? `Size: ${item.size}` : ''}
          <br>SKU: ${item.sku}
        </div>
        <div class="cart-item-row">
          <span class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</span>
          <div class="cart-item-qty">
            <button onclick="updateQty('${item.key}', -1)">−</button>
            <span>${item.qty}</span>
            <button onclick="updateQty('${item.key}', 1)">+</button>
          </div>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart('${item.key}')">Remove</button>
      </div>
    </div>
  `).join('');

  document.getElementById('cart-total').textContent = `$${cartTotal().toFixed(2)}`;
}

function openCart() {
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-drawer').classList.add('open');
  renderCart();
}

function closeCart() {
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-drawer').classList.remove('open');
}
