const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tukwikdsvjqlyyegdaak.supabase.co';

function validToken(token) {
  const correct = process.env.MANAGER_PASSWORD;
  if (!correct || !token) return false;
  const day = new Date().toISOString().slice(0, 10);
  const expected = crypto.createHmac('sha256', correct).update(day).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)); }
  catch { return false; }
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 864e5);
  return d.toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  const token = req.headers['x-manager-token'] || '';
  if (!validToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const section = req.query.section || 'dashboard';
  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  try {
    // ── Dashboard ──────────────────────────────────────────────
    if (section === 'dashboard') {
      const [ordersRes, linesRes, customersRes, contactsRes] = await Promise.all([
        supabase.from('Orders').select('OrderID,OrderDate,CustID,OrderTotal,Channel').order('OrderDate', { ascending: false }),
        supabase.from('OrderLines').select('ProductCode,Quantity,LineRevenue'),
        supabase.from('Customers_Core').select('CustomerID,FirstName,LastName,Country,JoinDate'),
        supabase.from('Customers_Contact').select('CustomerID'),
      ]);

      const allOrders = ordersRes.data || [];
      const allLines  = linesRes.data  || [];
      const allCusts  = customersRes.data || [];

      const weekAgo      = daysAgo(7);
      const twoWeeksAgo  = daysAgo(14);
      const thirtyAgo    = daysAgo(30);

      const thisWeek  = allOrders.filter(o => o.OrderDate >= weekAgo);
      const lastWeek  = allOrders.filter(o => o.OrderDate >= twoWeeksAgo && o.OrderDate < weekAgo);
      const last30    = allOrders.filter(o => o.OrderDate >= thirtyAgo);

      const sum = arr => arr.reduce((s, o) => s + parseFloat(o.OrderTotal || 0), 0);
      const allTimeRevenue   = sum(allOrders);
      const revenueThisWeek  = sum(thisWeek);
      const revenueLastWeek  = sum(lastWeek);
      const avgOrderValue    = allOrders.length ? allTimeRevenue / allOrders.length : 0;

      // 30-day daily revenue
      const dailyMap = {};
      for (let i = 29; i >= 0; i--) { dailyMap[daysAgo(i)] = 0; }
      for (const o of last30) {
        if (dailyMap[o.OrderDate] !== undefined)
          dailyMap[o.OrderDate] += parseFloat(o.OrderTotal || 0);
      }
      const dailyRevenue = Object.entries(dailyMap).map(([date, rev]) => ({ date, rev: parseFloat(rev.toFixed(2)) }));

      // Orders by day of week
      const dowLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const dowCounts = [0,0,0,0,0,0,0];
      for (const o of allOrders) { dowCounts[new Date(o.OrderDate).getUTCDay()]++; }

      // Top countries
      const countryMap = {};
      for (const c of allCusts) {
        if (c.Country) countryMap[c.Country] = (countryMap[c.Country] || 0) + 1;
      }
      const topCountries = Object.entries(countryMap).sort((a,b) => b[1]-a[1]).slice(0, 8)
        .map(([country, count]) => ({ country, count }));

      // Top seller
      const unitsByProduct = {};
      for (const l of allLines) unitsByProduct[l.ProductCode] = (unitsByProduct[l.ProductCode] || 0) + l.Quantity;
      const topSku = Object.entries(unitsByProduct).sort((a,b) => b[1]-a[1])[0];

      // Recent orders with names
      const custMap = {};
      for (const c of allCusts) custMap[c.CustomerID] = c.FirstName[0] + '. ' + c.LastName;
      const recentOrders = allOrders.slice(0, 10).map(o => ({
        ...o, customerDisplay: custMap[o.CustID] || '—'
      }));

      return res.json({
        allTimeRevenue:   allTimeRevenue.toFixed(2),
        ordersThisWeek:   thisWeek.length,
        ordersLastWeek:   lastWeek.length,
        revenueThisWeek:  revenueThisWeek.toFixed(2),
        revenueLastWeek:  revenueLastWeek.toFixed(2),
        avgOrderValue:    avgOrderValue.toFixed(2),
        totalCustomers:   allCusts.length,
        topSeller:        topSku ? topSku[0] : '—',
        topSellerUnits:   topSku ? topSku[1] : 0,
        dailyRevenue,
        dowLabels, dowCounts,
        topCountries,
        recentOrders,
      });
    }

    // ── Orders ────────────────────────────────────────────────
    if (section === 'orders') {
      const { data: orders } = await supabase.from('Orders')
        .select('OrderID,OrderDate,CustID,OrderTotal,Channel,ShippingFee,PaymentMethod')
        .order('OrderDate', { ascending: false }).limit(500);

      const custIds = [...new Set((orders||[]).map(o => o.CustID).filter(Boolean))];
      const custMap = {};
      if (custIds.length) {
        const { data: cores } = await supabase.from('Customers_Core')
          .select('CustomerID,FirstName,LastName,Country').in('CustomerID', custIds);
        for (const c of (cores||[])) custMap[c.CustomerID] = { name: c.FirstName+' '+c.LastName, country: c.Country };
      }

      const threeDaysAgo = daysAgo(3);
      return res.json({
        orders: (orders||[]).map(o => ({
          ...o,
          customerName: custMap[o.CustID]?.name || '—',
          country:      custMap[o.CustID]?.country || '—',
          needsAttention: o.OrderDate < threeDaysAgo,
        }))
      });
    }

    // ── Customers ─────────────────────────────────────────────
    if (section === 'customers') {
      const [coreRes, contactRes, ordersRes] = await Promise.all([
        supabase.from('Customers_Core').select('*').order('JoinDate', { ascending: false }),
        supabase.from('Customers_Contact').select('*'),
        supabase.from('Orders').select('CustID,OrderTotal,OrderDate'),
      ]);

      const contactMap = {};
      for (const c of (contactRes.data||[])) contactMap[c.CustomerID] = c;

      const ordersByCust = {};
      for (const o of (ordersRes.data||[])) {
        if (!ordersByCust[o.CustID]) ordersByCust[o.CustID] = { count:0, total:0 };
        ordersByCust[o.CustID].count++;
        ordersByCust[o.CustID].total += parseFloat(o.OrderTotal||0);
      }

      const customers = (coreRes.data||[]).map(c => ({
        ...c,
        email:         contactMap[c.CustomerID]?.Email || '—',
        loyalty:       contactMap[c.CustomerID]?.LoyaltyMember || false,
        orderCount:    ordersByCust[c.CustomerID]?.count || 0,
        lifetimeValue: (ordersByCust[c.CustomerID]?.total || 0).toFixed(2),
      }));

      // Loyalty comparison
      const loyaltyOrders   = customers.filter(c => c.loyalty && c.orderCount > 0);
      const noLoyaltyOrders = customers.filter(c => !c.loyalty && c.orderCount > 0);
      const avgLTV = arr => arr.length ? arr.reduce((s,c) => s + parseFloat(c.lifetimeValue),0) / arr.length : 0;

      // New customers by month (last 6 months)
      const monthMap = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        monthMap[d.toISOString().slice(0,7)] = 0;
      }
      for (const c of customers) {
        const mo = (c.JoinDate || '').slice(0,7);
        if (monthMap[mo] !== undefined) monthMap[mo]++;
      }

      // Country distribution
      const countryMap = {};
      for (const c of customers) if (c.Country) countryMap[c.Country] = (countryMap[c.Country]||0)+1;
      const countryDist = Object.entries(countryMap).sort((a,b)=>b[1]-a[1]).slice(0,10)
        .map(([country,count])=>({country,count}));

      return res.json({
        customers,
        loyaltyAvgLTV:   avgLTV(loyaltyOrders).toFixed(2),
        noLoyaltyAvgLTV: avgLTV(noLoyaltyOrders).toFixed(2),
        newByMonth: Object.entries(monthMap).map(([month,count])=>({month,count})),
        countryDist,
      });
    }

    // ── Products ──────────────────────────────────────────────
    if (section === 'products') {
      const [linesRes, productsRes] = await Promise.all([
        supabase.from('OrderLines').select('ProductCode,Quantity,LineRevenue'),
        supabase.from('products').select('sku,name,category,price'),
      ]);

      const productMeta = {};
      for (const p of (productsRes.data||[])) productMeta[p.sku] = p;

      const byProduct = {};
      for (const l of (linesRes.data||[])) {
        if (!byProduct[l.ProductCode]) byProduct[l.ProductCode] = { sku:l.ProductCode, units:0, revenue:0 };
        byProduct[l.ProductCode].units   += l.Quantity;
        byProduct[l.ProductCode].revenue += parseFloat(l.LineRevenue||0);
      }

      const rows = Object.values(byProduct).map(p => ({
        ...p,
        name:     productMeta[p.sku]?.name     || p.sku,
        category: productMeta[p.sku]?.category || '—',
        revenue:  parseFloat(p.revenue.toFixed(2)),
      })).sort((a,b) => b.revenue - a.revenue);

      // Revenue by category
      const catMap = {};
      for (const r of rows) catMap[r.category] = (catMap[r.category]||0) + r.revenue;
      const byCategory = Object.entries(catMap).sort((a,b)=>b[1]-a[1])
        .map(([cat,rev])=>({cat, rev: parseFloat(rev.toFixed(2))}));

      return res.json({ products: rows, byCategory });
    }

    return res.status(400).json({ error: 'Unknown section' });
  } catch (err) {
    console.error('Manager data error:', err.message);
    return res.status(500).json({ error: 'Data fetch failed' });
  }
};
