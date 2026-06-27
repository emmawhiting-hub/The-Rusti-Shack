/* ── State ── */
let currentView = 'shop';
let activeCategory = null;
let activeSubcategory = null;
let searchQuery = '';
let modalProduct = null;
let selectedColor = null;
let selectedSize = null;
let selectedQty = 1;
let sidebarOpen = false;

/* ── Size ordering ── */
const SIZE_ORDER = [
  'XS','S','S/M','M','M/L','L','L/XL','XL','XXL','2XL','3XL',
  'Kids S','Kids M','Kids 2-4','K2-4','Age 4-7','Age 8-12',
  'Youth','Adult',
  'W6-7','S (W6-7)','W8-9','M (W8-9 / M7-8)','L (M9-10)','XL (M11-12)',
  'M9-10','M11-12',
  '28','30','32','34','36','38','40',
  '6 ft','7 ft','7\'0','8 ft','8\'0','9 ft','9\'0',
  '7 m2','9 m2','12 m2',
  '16 L','24 L','40 L',
  'M (60x120cm)','L (80x160cm)',
  'One Size','Standard','Free Size',
];

function sortSizes(sizes) {
  return [...sizes].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a);
    const bi = SIZE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return String(a).localeCompare(String(b));
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/* ── Product image helpers ── */
function getProductImage(product) {
  const entry = PRODUCT_IMAGES[product.sku];
  if (entry && entry.main) return entry.main;
  if (entry && entry.colors) {
    // prefer a life/in-use color shot over a basic one
    const lifeShot = Object.entries(entry.colors).find(([k]) => k.endsWith('__life'));
    if (lifeShot) return lifeShot[1];
    const basicShot = Object.values(entry.colors).find(v => !v.includes('__'));
    if (basicShot) return basicShot;
  }
  return `https://placehold.co/400x300/DFF5F2/1A7A9E?text=${encodeURIComponent(product.name)}&font=montserrat`;
}

function getColorImage(product, color) {
  const entry = PRODUCT_IMAGES[product.sku];
  if (entry && entry.colors) {
    if (entry.colors[color]) return entry.colors[color];
    // try life version
    if (entry.colors[color + '__life']) return entry.colors[color + '__life'];
  }
  if (entry && entry.main) return entry.main;
  const hex = (COLOR_HEX[color] || '00B4A0').replace('#', '');
  return `https://placehold.co/400x400/${hex}/ffffff?text=${encodeURIComponent(color || 'Product')}&font=montserrat`;
}

function getColorHoverImage(product, color) {
  const entry = PRODUCT_IMAGES[product.sku];
  if (entry && entry.colors) {
    if (entry.colors[color]) return entry.colors[color];
    if (entry.colors[color + '__life']) return entry.colors[color + '__life'];
  }
  return getProductImage(product);
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = Math.imul(31, h) + s.charCodeAt(i) | 0; }
  return h;
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  buildSidebar();
  renderProducts();
  updateCartCount();
  showHome();
  initCarousel();
  fetchExchangeRates();
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    if (searchQuery) { showShopView(); }
    renderProducts();
  });
});

/* ── Sidebar ── */
function buildSidebar() {
  const container = document.getElementById('sidebar-cats');
  const categories = {};
  PRODUCTS.forEach(p => {
    if (!categories[p.category]) categories[p.category] = new Set();
    categories[p.category].add(p.subcategory);
  });

  container.innerHTML = Object.entries(categories).map(([cat, subs]) => `
    <div class="sidebar-section">
      <div class="cat-header" onclick="toggleCat(this, '${cat}')">
        <span>${cat}</span>
        <span class="cat-arrow">&#9658;</span>
      </div>
      <div class="cat-subs">
        ${[...subs].sort().map(sub =>
          `<div class="sub-item" onclick="filterBySub('${cat}', '${sub}', this)">${sub}</div>`
        ).join('')}
      </div>
    </div>
  `).join('');
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');
  const hamburger = document.getElementById('hamburger');
  const backdrop = document.getElementById('sidebar-backdrop');

  sidebar.classList.toggle('open', sidebarOpen);
  hamburger.classList.toggle('open', sidebarOpen);
  backdrop.classList.toggle('show', sidebarOpen);

  // Only shift main on wider screens
  if (window.innerWidth > 900) {
    main.classList.toggle('shifted', sidebarOpen);
  }
}

function toggleCat(header, cat) {
  const subs = header.nextElementSibling;
  const isOpen = subs.classList.contains('open');
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
  showShopView();
  renderProducts();
}

function filterBySub(cat, sub, el) {
  currentView = 'shop';
  activeCategory = cat;
  activeSubcategory = sub;
  document.querySelectorAll('.sub-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  showShopView();
  renderProducts();
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
  document.getElementById('nav-all').classList.add('active');
  showShopView();
  renderProducts();
}

function showHome() {
  document.getElementById('home-view') && (document.getElementById('home-view').style.display = '');
  document.getElementById('shop-view').style.display = 'none';
  document.getElementById('about-view').style.display = 'none';
  document.getElementById('nav-all').classList.remove('active');
  currentView = 'home';
}

function showShopView() {
  document.getElementById('home-view').style.display = 'none';
  document.getElementById('shop-view').style.display = '';
  document.getElementById('about-view').style.display = 'none';
  document.getElementById('nav-all').classList.toggle('active', !activeCategory && !activeSubcategory);
}

function showAboutView() {
  document.getElementById('home-view').style.display = 'none';
  document.getElementById('shop-view').style.display = 'none';
  document.getElementById('about-view').style.display = 'block';
  document.getElementById('nav-all').classList.remove('active');
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

  if (activeSubcategory) {
    heading.textContent = activeSubcategory;
    breadcrumb.innerHTML = `
      <span onclick="showAll()">All Products</span> &rsaquo;
      <span onclick="filterByCategory('${activeCategory}')">${activeCategory}</span> &rsaquo;
      <span>${activeSubcategory}</span>`;
  } else if (activeCategory) {
    heading.textContent = activeCategory;
    breadcrumb.innerHTML = `<span onclick="showAll()">All Products</span> &rsaquo; <span>${activeCategory}</span>`;
  } else if (searchQuery) {
    heading.textContent = `Results for "${searchQuery}"`;
    breadcrumb.innerHTML = `<span onclick="showAll()">All Products</span> &rsaquo; Search`;
  } else {
    heading.textContent = 'All Products';
    breadcrumb.innerHTML = '';
  }

  if (!products.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:80px 20px;color:var(--gray-light)">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <p style="font-size:15px;color:var(--gray)">No products found.</p>
    </div>`;
    return;
  }

  grid.innerHTML = products.map(p => buildProductCard(p)).join('');
}

function buildProductCard(p) {
  const mainImg = getProductImage(p);
  const hoverImg = p.colors.length ? getColorHoverImage(p, p.colors[0]) : mainImg;
  const fallback = `https://placehold.co/400x300/e8f0f8/1B3D6E?text=${encodeURIComponent(p.name)}&font=montserrat`;

  const colorDots = p.colors.slice(0, 7).map(c => {
    const hex = COLOR_HEX[c] || '999';
    return `<span class="color-dot" style="background:#${hex}" title="${c}"></span>`;
  }).join('');

  let badgeText = '', badgeClass = '';
  if (p.availability === 'Rental') { badgeText = 'Rental Only'; badgeClass = 'rental'; }
  else if (p.availability === 'Both') { badgeText = 'Buy or Rent'; badgeClass = 'both'; }

  return `
    <div class="product-card" onclick="openProductModal('${p.sku}')">
      <div class="product-img-wrap">
        <img class="img-main" src="${mainImg}" alt="${p.name}" loading="lazy"
          onerror="this.src='${fallback}'">
        <img class="img-hover" src="${hoverImg}" alt="${p.name}" loading="lazy"
          onerror="this.src='${fallback}'">
        ${badgeText ? `<span class="product-badge ${badgeClass}">${badgeText}</span>` : ''}
      </div>
      <div class="product-info">
        <p class="product-subcat">${p.subcategory}</p>
        <h3>${p.name}</h3>
        ${colorDots ? `<div class="product-colors">${colorDots}</div>` : ''}
        <div class="product-footer">
          <span class="product-price">${formatPrice(p.price)}</span>
          ${p.rentalRate ? `<span class="product-rental">Rent ${formatPrice(p.rentalRate)}/day</span>` : ''}
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
  const mainImg = getProductImage(p);
  const fallback = `https://placehold.co/500x500/e8f0f8/1B3D6E?text=${encodeURIComponent(p.name)}&font=montserrat`;

  const thumbs = [
    { src: mainImg, label: 'In Use' },
    ...p.colors.map(c => ({ src: getColorImage(p, c), label: c }))
  ];

  const colorOpts = p.colors.map(c => {
    const hex = COLOR_HEX[c] || '999';
    const sel = selectedColor === c ? 'selected' : '';
    return `<button class="color-opt ${sel}" style="background:#${hex.replace('#','')}" title="${c}"
      onclick="selectColor('${c}', this)"></button>`;
  }).join('');

  const sortedSizes = sortSizes(p.sizes);
  const sizeOpts = sortedSizes.map(s => {
    const sel = selectedSize === s ? 'selected' : '';
    return `<button class="size-opt ${sel}" onclick="selectSize('${s}', this)">${s}</button>`;
  }).join('');

  let availHtml = '';
  if (p.availability === 'Both' && p.rentalRate) {
    availHtml = `<div class="modal-rental-info">Available to purchase or rent &mdash; Rental rate: <strong>${formatPrice(p.rentalRate)}/day</strong></div>`;
  } else if (p.availability === 'Rental' && p.rentalRate) {
    availHtml = `<div class="modal-rental-info">Rental only &mdash; <strong>${formatPrice(p.rentalRate)}/day</strong></div>`;
  }

  const thumbHtml = thumbs.map((t, i) => `
    <img class="modal-thumb ${i === 0 ? 'active' : ''}"
      src="${t.src}" alt="${t.label}"
      onclick="switchModalImg(this, '${t.src}')"
      onerror="this.style.display='none'">`
  ).join('');

  return `
    <div class="modal">
      <button class="modal-close" onclick="closeModal()">&#x2715;</button>
      <div class="modal-inner">
        <div class="modal-gallery">
          <img class="modal-main-img" id="modal-main-img" src="${mainImg}" alt="${p.name}"
            onerror="this.src='${fallback}'">
          <div class="modal-thumbs">${thumbHtml}</div>
        </div>
        <div class="modal-details">
          <div>
            <p class="modal-eyebrow">${p.category} &mdash; ${p.subcategory}</p>
            <h2 class="modal-name">${p.name}</h2>
            <p class="modal-sku">SKU: ${p.sku}</p>
          </div>
          <p class="modal-price">${formatPrice(p.price)}</p>
          ${availHtml}
          ${p.colors.length ? `
            <div>
              <p class="option-label">Color <span class="selected-val" id="selected-color-label">${selectedColor ? '— ' + selectedColor : ''}</span></p>
              <div class="color-options">${colorOpts}</div>
            </div>` : ''}
          ${p.sizes.length ? `
            <div>
              <p class="option-label">Size <span class="selected-val" id="selected-size-label">${selectedSize ? '— ' + selectedSize : ''}</span></p>
              <div class="size-options">${sizeOpts}</div>
            </div>` : ''}
          <div class="qty-row">
            <span class="option-label" style="margin-bottom:0">Qty</span>
            <div class="qty-ctrl">
              <button onclick="changeQty(-1)">&#8722;</button>
              <span id="modal-qty">1</span>
              <button onclick="changeQty(1)">&#43;</button>
            </div>
          </div>
          <div class="btn-row">
            <button class="add-cart-btn" id="modal-add-btn" onclick="modalAddToCart()">Add to Cart</button>
            <button class="wishlist-btn" title="Save to wishlist" onclick="showToast('Saved to wishlist')">&#9825;</button>
          </div>
          <div class="modal-divider"></div>
          <p class="modal-desc">${getProductDescription(p)}</p>
        </div>
      </div>
    </div>`;
}

function getProductDescription(p) {
  const descs = {
    'Masks':      'Crystal-clear tempered glass lens with a comfortable silicone skirt. Adjustable strap for a secure, leak-free fit. Ideal for snorkeling in Apo Island\'s vibrant coral reefs.',
    'Sets':       'Complete snorkeling set with everything you need to explore the underwater world. Perfect for beginners and experienced snorkelers alike.',
    'Fins':       'Lightweight and efficient fins designed for easy propulsion. Ideal for reef exploration and open-water snorkeling.',
    'Wetsuits':   'Premium neoprene construction for warmth and flexibility. UV-protective material for long sessions in the water.',
    'Surfboards': 'Durable foam construction ideal for learning to surf. Wide nose and thick rails provide excellent stability.',
    'Accessories':'Essential surf accessories built to withstand the rigors of ocean use. Designed for safety and performance.',
    'Skimboards': 'Lightweight construction with a slick bottom for smooth gliding. Suitable for shore break and flat water.',
    'Kitesurf':   'High-performance kitesurfing gear for riders of all skill levels. Engineered for control in varying wind conditions.',
    'Towels':     'Vibrant print with ultra-soft, quick-dry fabric. Generously sized for beach lounging.',
    'Coolers':    'Insulated to keep drinks and snacks cold all day at the beach. Water-resistant exterior with comfortable carry straps.',
    'Eyewear':    'Polarized lenses reduce glare off the water. UV400 protection with a lightweight wraparound frame.',
    'Footwear':   'Durable rubber sole with drainage ports and grip tread. Protects feet on rocky reefs and sandy shores.',
    'Shirts':     'Lightweight, breathable fabric in a relaxed tropical fit. Designed for island life and casual beach outings.',
    'Rashguards': 'UPF 50+ sun protection with stretch nylon-spandex fabric. Flat-lock seams prevent chafing during water activities.',
    'Bottoms':    'Quick-dry fabric with an internal mesh lining and drawstring waist. Multiple pockets for beach essentials.',
    'Swimwear':   'Chlorine-resistant fabric with a comfortable, supportive fit. Designed for active water use and beach lounging.',
    'Hats':       'Wide brim provides full-face sun coverage. UPF 50+ rated with a moisture-wicking interior band.',
  };
  return descs[p.subcategory] || 'Quality beach and water sports gear from The Rusti Shack — your home for ocean adventures at Apo Island, Philippines.';
}

function selectColor(color, btn) {
  selectedColor = color;
  document.querySelectorAll('.color-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const label = document.getElementById('selected-color-label');
  if (label) label.textContent = '— ' + color;
  const img = document.getElementById('modal-main-img');
  if (img && modalProduct) img.src = getColorImage(modalProduct, color);
  updateModalAddBtn();
}

function selectSize(size, btn) {
  selectedSize = size;
  document.querySelectorAll('.size-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const label = document.getElementById('selected-size-label');
  if (label) label.textContent = '— ' + size;
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
  const needsSize  = modalProduct.sizes.length > 0 && !selectedSize;
  if (needsColor || needsSize) {
    btn.disabled = true;
    const missing = [needsColor && 'a color', needsSize && 'a size'].filter(Boolean).join(' and ');
    btn.textContent = `Please select ${missing}`;
  } else {
    btn.disabled = false;
    btn.textContent = 'Add to Cart';
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
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  modalProduct = null;
}

/* ── Carousel ── */
let carouselIndex = 0;
let carouselTotal = 0;
let carouselTimer = null;
const CAROUSEL_INTERVAL = 7000;

function initCarousel() {
  const track = document.getElementById('carousel-track');
  const dotsEl = document.getElementById('carousel-dots');
  if (!track || !dotsEl) return;
  carouselTotal = track.children.length;
  dotsEl.innerHTML = Array.from({ length: carouselTotal }, (_, i) =>
    `<button class="carousel-dot${i === 0 ? ' active' : ''}" onclick="goToSlide(${i})" aria-label="Slide ${i+1}"></button>`
  ).join('');
  startCarouselTimer();
}

function goToSlide(idx) {
  carouselIndex = (idx + carouselTotal) % carouselTotal;
  document.getElementById('carousel-track').style.transform = `translateX(-${carouselIndex * 100}%)`;
  document.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === carouselIndex));
}

function carouselNext() { goToSlide(carouselIndex + 1); resetCarouselTimer(); }
function carouselPrev() { goToSlide(carouselIndex - 1); resetCarouselTimer(); }

function startCarouselTimer() {
  carouselTimer = setInterval(() => goToSlide(carouselIndex + 1), CAROUSEL_INTERVAL);
}
function resetCarouselTimer() { clearInterval(carouselTimer); startCarouselTimer(); }
function pauseCarousel()  { clearInterval(carouselTimer); }
function resumeCarousel() { startCarouselTimer(); }

/* ── Toast ── */
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

document.addEventListener('click', e => {
  if (e.target.id === 'modal-overlay') closeModal();
});
