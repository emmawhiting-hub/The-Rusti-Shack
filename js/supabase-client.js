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

  // Normalize the Supabase row shape to match the existing PRODUCTS array
  // so the rest of the site needs no changes
  return data.map(row => ({
    sku:          row.sku,
    name:         row.name,
    category:     row.category,
    subcategory:  row.subcategory,
    price:        parseFloat(row.price),
    availability: row.availability,
    colors:       row.colors  || [],
    sizes:        row.sizes   || [],
    variants:     row.variants || [],
    rentalRate:   null, // online store is sale-only
  }));
}
