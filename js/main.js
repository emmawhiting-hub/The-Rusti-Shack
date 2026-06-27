/* ── State ── */
let currentView = 'shop'; // 'shop' | 'about'
let activeCategory = null;
let activeSubcategory = null;
let searchQuery = '';
let modalProduct = null;
let selectedColor = null;
let selectedSize = null;
let selectedQty = 1;

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  buildSidebar();
  renderProducts();
  updateCartCount();

  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderProducts();
  });
});

/* ── Image helpers ── */
function getProductImage(product, color, inUse = true) {
  if (inUse) {
    // Unique but consistent action photo per product using picsum
    const seed = product.sku.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return `https://picsum.photos/seed/${seed}/400/300`;
  } else {
    const hex = (COLOR_HEX[color] || '00B5A5').replace('#', '');
    const label = encodeURIComponent(color || 'Product');
    return `https://placehold.co/400x400/${hex}/ffffff?text=${label}`;
  }
}

function getColorImage(product, color) {
  const hex = (COLOR_HEX[color] || '00B5A5').replace('#', '');
  return `https://placehold.co/400x400/${hex}/ffffff?text=${encodeURIComponent(color || 'Product')}`;
}

/* ── Sidebar ── */
function buildSidebar() {
  const sidebar = document.getElementById('sidebar-cats');
  const categories = {};
  PRODUCTS.forEach(p => {
    if (!categories[p.category]) categories[p.category] = new Set();
    categories[p.category].add(p.subcategory);
  });

  const icons = {
    'Snorkel & Dive': '🤿',
    'Beach Essentials': '🏖️',
    'Surfing': '🏄',
    'Apparel': '👕',
  };

  sidebar.innerHTML = Object.entries(categories).map(([cat, subs]) => `
    <div class="sidebar-section">
      <div class="cat-header" onclick="toggleCat(this, '${cat}')">
        <span>
          <span class="cat-icon">${icons[cat] || '📦'}</span>${cat}
        </span>
        <span class="cat-arrow">▶</span>
      </div>
      <div class="cat-subs">
        ${[...subs].sort().map(sub => `
          <div class="sub-item" onclick="filterBySub('${cat}', '${sub}', this)">${sub}</div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function toggleCat(header, cat) {
  const subs = header.nextElementSibling;
  const isOpen = subs.classList.contains('open');
  // Close all
  document.querySelectorAll('.cat-subs').forEach(s => s.classList.remove('open'));
  document.querySelectorAll('.cat-header').forEach(h => h.classList.remove('open'));
  if (!isOpen) {
    subs.classList.add('open');
    header.classList.add('open');
    filterByCategory(cat);
  } else {
    showAll();
  }
}

function filterByCategory(cat) {
  currentView = 'shop';
  activeCategory = cat;
  activeSubcategory = null;
  document.querySelectorAll('.sub-item').forEach(el => el.classList.remove('active'));
  renderProducts();
  showShopView();
}

function filterBySub(cat, sub, el) {
  currentView = 'shop';
  activeCategory = cat;
  activeSubcategory = sub;
  document.querySelectorAll('.sub-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  renderProducts();
  showShopView();
}

function showAll() {
  currentView = 'shop';
  activeCategory = null;
  activeSubcategory = null;
  searchQuery = '';
  document.getElementById('search-input').value = '';
  document.querySelectorAll('.sub-item').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.cat-subs').forEach(s => s.classList.remove('open'));
  document.querySelectorAll('.cat-header').forEach(h => h.classList.remove('open'));
  renderProducts();
  showShopView();
}

/* ── Sidebar toggle ── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');
  const hamburger = document.getElementById('hamburger');
  sidebar.classList.toggle('collapsed');
  main.classList.toggle('expanded');
  hamburger.classList.toggle('open');
}

/* ── Views ── */
function showShopView() {
  document.getElementById('shop-view').style.display = '';
  document.getElementById('about-view').style.display = 'none';
}

function showAboutView() {
  document.getElementById('shop-view').style.display = 'none';
  document.getElementById('about-view').style.display = 'block';
  document.querySelectorAll('.sub-item').forEach(e => e.classList.remove('active'));
  currentView = 'about';
}

/* ── Render products ── */
function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    if (activeSubcategory && p.subcategory !== activeSubcategory) return false;
    if (activeCategory && !activeSubcategory && p.category !== activeCategory) return false;
    if (searchQuery) {
      const hay = `${p.name} ${p.category} ${p.subcategory} ${p.sku}`.toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
}

function renderProducts() {
  const grid = document.getElementById('product-grid');
  const heading = document.getElementById('section-title');
  const breadcrumb = document.getElementById('breadcrumb');
  const products = getFilteredProducts();

  // Heading
  if (activeSubcategory) {
    heading.textContent = activeSubcategory;
    breadcrumb.innerHTML = `
      <span onclick="showAll()">All Products</span> ›
      <span onclick="filterByCategory('${activeCategory}')">${activeCategory}</span> ›
      <span>${activeSubcategory}</span>`;
  } else if (activeCategory) {
    heading.textContent = activeCategory;
    breadcrumb.innerHTML = `
      <span onclick="showAll()">All Products</span> › <span>${activeCategory}</span>`;
  } else if (searchQuery) {
    heading.textContent = `Search: "${searchQuery}"`;
    breadcrumb.innerHTML = `<span onclick="showAll()">All Products</span> › Search results`;
  } else {
    heading.textContent = 'All Products';
    breadcrumb.innerHTML = '';
  }

  if (!products.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--gray)">
      <div style="font-size:48px;margin-bottom:16px">🔍</div>
      <p style="font-size:16px">No products found.</p>
    </div>`;
    return;
  }

  grid.innerHTML = products.map(p => buildProductCard(p)).join('');
}

function buildProductCard(p) {
  const mainImg = getProductImage(p, null, true);
  const hoverImg = p.colors.length ? getColorImage(p, p.colors[0]) : mainImg;
  const colorDots = p.colors.slice(0, 6).map(c => {
    const hex = COLOR_HEX[c] || '999';
    return `<span class="color-dot" style="background:#${hex}" title="${c}"></span>`;
  }).join('');
  const badge = p.availability === 'Rental' ? 'rental' : p.availability === 'Both' ? '' : '';
  const badgeText = p.availability === 'Rental' ? 'Rental Only' : p.availability === 'Both' ? 'Buy or Rent' : '';

  return `
    <div class="product-card" onclick="openProductModal('${p.sku}')">
      <div class="product-img-wrap">
        <img class="img-main" src="${mainImg}" alt="${p.name}" loading="lazy"
          onerror="this.src='https://placehold.co/400x300/e8f4f3/1B3D6E?text=${encodeURIComponent(p.name)}'">
        <img class="img-hover" src="${hoverImg}" alt="${p.name}" loading="lazy"
          onerror="this.src='https://placehold.co/400x300/00B5A5/ffffff?text=${encodeURIComponent(p.name)}'">
        ${badgeText ? `<span class="product-badge ${badge}">${badgeText}</span>` : ''}
      </div>
      <div class="product-info">
        <p class="product-sub">${p.category} · ${p.subcategory}</p>
        <h3>${p.name}</h3>
        ${colorDots ? `<div class="product-colors">${colorDots}</div>` : ''}
        <div class="product-price-row">
          <span class="product-price">$${p.price.toFixed(2)}</span>
          ${p.rentalRate ? `<span class="product-rental">Rent: $${p.rentalRate.toFixed(2)}/day</span>` : ''}
        </div>
      </div>
    </div>`;
}

/* ── Product Modal ── */
function openProductModal(sku) {
  const p = PRODUCTS.find(x => x.sku === sku);
  if (!p) return;
  modalProduct = p;
  selectedColor = p.colors.length === 1 ? p.colors[0] : null;
  selectedSize = p.sizes.length === 1 ? p.sizes[0] : null;
  selectedQty = 1;

  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = buildModal(p);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  updateModalAddBtn();
}

function buildModal(p) {
  const mainImg = getProductImage(p, null, true);
  const thumbs = [
    { src: mainImg, label: 'In Use' },
    ...p.colors.map(c => ({ src: getColorImage(p, c), label: c }))
  ];

  const colorOpts = p.colors.map(c => {
    const hex = COLOR_HEX[c] || '999';
    const sel = selectedColor === c ? 'selected' : '';
    return `<button class="color-opt ${sel}" style="background:#${hex}" title="${c}"
      onclick="selectColor('${c}', this)"></button>`;
  }).join('');

  const sizeOpts = p.sizes.map(s => {
    const sel = selectedSize === s ? 'selected' : '';
    return `<button class="size-opt ${sel}" onclick="selectSize('${s}', this)">${s}</button>`;
  }).join('');

  const availability = p.availability === 'Both'
    ? `<div class="modal-rental-info">🏖️ Available to <span>buy or rent</span> · Rental: <span>$${p.rentalRate?.toFixed(2)}/day</span></div>`
    : p.availability === 'Rental'
    ? `<div class="modal-rental-info">🏖️ Rental only · <span>$${p.rentalRate?.toFixed(2)}/day</span></div>`
    : '';

  const thumbHtml = thumbs.map((t, i) => `
    <img class="modal-thumb ${i === 0 ? 'active' : ''}" src="${t.src}" alt="${t.label}"
      onclick="switchModalImg(this, '${t.src}')"
      onerror="this.style.display='none'">`
  ).join('');

  return `
    <div class="modal">
      <button class="modal-close" onclick="closeModal()">✕</button>
      <div class="modal-inner">
        <div class="modal-gallery">
          <img class="modal-main-img" id="modal-main-img" src="${mainImg}" alt="${p.name}"
            onerror="this.src='https://placehold.co/500x500/e8f4f3/1B3D6E?text=${encodeURIComponent(p.name)}'">
          <div class="modal-thumbs">${thumbHtml}</div>
        </div>
        <div class="modal-details">
          <p class="modal-cat">${p.category} · ${p.subcategory}</p>
          <h2 class="modal-name">${p.name}</h2>
          <p class="modal-sku">SKU: ${p.sku}</p>
          <div class="modal-price-row">
            <span class="modal-price">$${p.price.toFixed(2)}</span>
          </div>
          ${availability}
          ${p.colors.length ? `
            <div>
              <p class="option-label">Color <span id="selected-color-label">${selectedColor ? ': ' + selectedColor : ''}</span></p>
              <div class="color-options">${colorOpts}</div>
            </div>` : ''}
          ${p.sizes.length ? `
            <div>
              <p class="option-label">Size <span id="selected-size-label">${selectedSize ? ': ' + selectedSize : ''}</span></p>
              <div class="size-options">${sizeOpts}</div>
            </div>` : ''}
          <div class="qty-row">
            <span class="qty-label">Qty</span>
            <div class="qty-ctrl">
              <button onclick="changeQty(-1)">−</button>
              <span id="modal-qty">1</span>
              <button onclick="changeQty(1)">+</button>
            </div>
          </div>
          <div class="btn-row">
            <button class="add-cart-btn" id="modal-add-btn" onclick="modalAddToCart()">
              🛒 Add to Cart
            </button>
            <button class="wishlist-btn" onclick="showToast('Saved to wishlist ♡')">♡</button>
          </div>
          <div class="modal-desc">
            ${getProductDescription(p)}
          </div>
        </div>
      </div>
    </div>`;
}

function getProductDescription(p) {
  const descs = {
    'Masks': 'Crystal-clear tempered glass lens with a comfortable silicone skirt. Adjustable strap for a secure, leak-free fit. Ideal for snorkeling in Apo Island\'s vibrant coral reefs.',
    'Sets': 'Complete snorkeling set with everything you need to explore the underwater world. Perfect for beginners and experienced snorkelers alike.',
    'Fins': 'Lightweight and efficient fins designed for easy swimming. Open-heel design fits over dive booties. Ideal for reef exploration.',
    'Wetsuits': 'Premium neoprene construction for warmth and flexibility. UV-protective material keeps you comfortable on long snorkel sessions.',
    'Surfboards': 'Durable foam construction perfect for learning to surf. Wide nose and thick rails provide excellent stability in the water.',
    'Accessories': 'Essential surf accessories for a safe and enjoyable session. Built to withstand the rigors of ocean use.',
    'Skimboards': 'Lightweight hardwood core with a slick bottom for smooth gliding. Perfect for shore break and flat water riding.',
    'Kitesurf': 'High-performance kitesurfing gear for riders of all skill levels. Designed for control and power in a variety of wind conditions.',
    'Towels': 'Vibrant tropical prints with ultra-soft, quick-dry fabric. Large enough for beach lounging with plenty of room to spare.',
    'Coolers': 'Insulated bag keeps drinks and snacks cold all day at the beach. Water-resistant exterior and comfortable carry straps.',
    'Eyewear': 'Polarized lenses reduce glare off the water. UV400 protection shields your eyes from harmful rays. Lightweight wraparound design.',
    'Footwear': 'Durable rubber sole with drainage ports and grip. Designed to protect your feet on rocky reefs and sandy shores.',
    'Shirts': 'Lightweight, breathable fabric with a relaxed tropical fit. Perfect for island life and casual beach outings.',
    'Rashguards': 'UPF 50+ sun protection with stretch nylon-spandex fabric. Flat-lock seams prevent chafing during water activities.',
    'Bottoms': 'Quick-dry fabric with an internal mesh lining. Drawstring waist with multiple pockets for beach essentials.',
    'Swimwear': 'Chlorine-resistant fabric with a comfortable fit. Designed for active water use and stylish beach lounging.',
    'Hats': 'Wide brim provides full-face sun coverage. UPF 50+ rated with a moisture-wicking sweatband.',
  };
  return descs[p.subcategory] || 'Quality beach and water sports gear from The Rusti Shack — your home for ocean adventures at Apo Island, Philippines.';
}

function selectColor(color, btn) {
  selectedColor = color;
  document.querySelectorAll('.color-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const label = document.getElementById('selected-color-label');
  if (label) label.textContent = ': ' + color;
  // Update modal image to color swatch
  const img = document.getElementById('modal-main-img');
  if (img && modalProduct) {
    img.src = getColorImage(modalProduct, color);
  }
  updateModalAddBtn();
}

function selectSize(size, btn) {
  selectedSize = size;
  document.querySelectorAll('.size-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const label = document.getElementById('selected-size-label');
  if (label) label.textContent = ': ' + size;
  updateModalAddBtn();
}

function changeQty(delta) {
  selectedQty = Math.max(1, selectedQty + delta);
  const el = document.getElementById('modal-qty');
  if (el) el.textContent = selectedQty;
}

function updateModalAddBtn() {
  const btn = document.getElementById('modal-add-btn');
  if (!btn || !modalProduct) return;
  const needsColor = modalProduct.colors.length > 0 && !selectedColor;
  const needsSize = modalProduct.sizes.length > 0 && !selectedSize;
  if (needsColor || needsSize) {
    btn.disabled = true;
    const missing = [needsColor && 'color', needsSize && 'size'].filter(Boolean).join(' & ');
    btn.textContent = `Please select a ${missing}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = '🛒 Add to Cart';
  }
}

function modalAddToCart() {
  if (!modalProduct) return;
  addToCart(modalProduct, selectedColor, selectedSize, selectedQty);
  closeModal();
  openCart();
}

function switchModalImg(thumb, src) {
  const main = document.getElementById('modal-main-img');
  if (main) main.src = src;
  document.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  modalProduct = null;
}

/* ── Toast ── */
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ── Close modal on overlay click ── */
document.addEventListener('click', e => {
  if (e.target.id === 'modal-overlay') closeModal();
});
