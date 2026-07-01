// Supabase publishable key — safe in browser code (§4 SECURITY.md)
// The secret key lives only in Netlify environment variables, never here.
const SUPABASE_URL = 'https://tukwikdsvjqlyyegdaak.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BAci45zNmL-oPaGxirzJog_nQ6SEa-S';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function fetchProductsFromSupabase() {
  const { data, error } = await _supabase
    .from('products')
    .select('*')
    .order('category')
    .order('subcategory');

  if (error) throw error;

  // Only show SKUs that exist in the bundled catalog.
  // The DB also contains variant SKUs (APP-003-M-NAV) and historical SKUs
  // (Beach Ball, Shovel etc.) imported purely for FK constraints on order lines.
  const catalogSkus = new Set(PRODUCTS.map(p => p.sku));
  const catalog = data.filter(row => catalogSkus.has(row.sku));

  // Build a lookup of the bundled catalog so we can pull colors/sizes/variants
  // from it — those fields were never stored in Supabase, only price/availability
  // are managed there. Everything else (hover images, color swatches, size opts)
  // comes from the bundled data unchanged.
  const bundledMap = {};
  for (const p of PRODUCTS) bundledMap[p.sku] = p;

  return catalog.map(row => {
    const b = bundledMap[row.sku] || {};
    return {
      sku:          row.sku,
      name:         row.name,
      category:     row.category,
      subcategory:  row.subcategory,
      price:        parseFloat(row.price),
      availability: row.availability,
      colors:       b.colors   || [],
      sizes:        b.sizes    || [],
      variants:     b.variants || [],
      rentalRate:   null,
    };
  });
}
