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
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}

// Supabase/PostgREST silently caps any single request at 1000 rows regardless
// of .limit(); page through with .range() to get the true full result set.
async function fetchAll(buildQuery) {
  const pageSize = 1000;
  let all = [], from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function handler(req, res) {
  const token = req.headers['x-manager-token'] || '';
  if (!validToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const section  = req.query.section  || 'dashboard';
  const dateFrom = req.query.from     || '2021-01-01';
  const dateTo   = req.query.to       || new Date().toISOString().slice(0, 10);
  const orderId  = req.query.order_id || '';
  const custId   = req.query.cust_id  || '';

  const sb = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  try {
    // ── POST: update inventory (single row) ──────────────────
    if (req.method === 'POST' && section === 'update_inventory') {
      const { sku, stock_qty, reorder_level } = req.body || {};
      if (!sku) return res.status(400).json({ error: 'sku required' });
      const { error } = await sb.from('Inventory').upsert({
        SKU: sku,
        StockQty: Math.max(0, parseInt(stock_qty, 10) || 0),
        ReorderLevel: Math.max(0, parseInt(reorder_level, 10) || 5),
        LastUpdated: new Date().toISOString(),
      }, { onConflict: 'SKU' });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    // ── POST: auto-populate inventory from 2025 sales ────────
    if (req.method === 'POST' && section === 'auto_inventory') {
      const [linesRes, prodsRes] = await Promise.all([
        sb.from('OrderLines').select('ProductCode,Quantity')
          .gte('OrderDate', '2025-01-01').lte('OrderDate', '2025-12-31').limit(100000),
        sb.from('products').select('sku').limit(5000),
      ]);
      const unitsBySku = {};
      for (const l of (linesRes.data || []))
        unitsBySku[l.ProductCode] = (unitsBySku[l.ProductCode] || 0) + (l.Quantity || 0);

      const upserts = [];
      // Products with 2025 sales
      for (const [sku, units] of Object.entries(unitsBySku)) {
        upserts.push({
          SKU:          sku,
          StockQty:     Math.max(5, Math.round(units / 12)), // ~1 month supply
          ReorderLevel: Math.max(1, Math.round(units * 0.02)),
          LastUpdated:  new Date().toISOString(),
        });
      }
      // Catalog products with no 2025 sales get minimal defaults
      const soldSkus = new Set(Object.keys(unitsBySku));
      for (const p of (prodsRes.data || [])) {
        if (!soldSkus.has(p.sku)) {
          upserts.push({ SKU: p.sku, StockQty: 5, ReorderLevel: 1, LastUpdated: new Date().toISOString() });
        }
      }
      const { error } = await sb.from('Inventory').upsert(upserts, { onConflict: 'SKU' });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, updated: upserts.length });
    }

    // ── GET: lightweight alert counts for notification banner ─
    if (section === 'inventory_alerts') {
      const { data: inv } = await sb.from('Inventory').select('SKU,StockQty,ReorderLevel').limit(5000);
      const rows = inv || [];
      return res.json({
        stockouts: rows.filter(i => i.StockQty === 0).length,
        low:       rows.filter(i => i.StockQty > 0 && i.StockQty <= i.ReorderLevel).length,
      });
    }

    // ── Last 7 days summary (always trailing 7 days, ignores filter) ─
    if (section === 'week_summary') {
      const to   = new Date().toISOString().slice(0, 10);
      const from = daysAgo(6);
      const orders = await fetchAll(() => sb.from('Orders')
        .select('OrderID,OrderTotal').gte('OrderDate', from).lte('OrderDate', to));
      const orderIds = orders.map(o => o.OrderID);
      const lines = orderIds.length
        ? await fetchAll(() => sb.from('OrderLines').select('ProductCode,Quantity').in('OrderID', orderIds))
        : [];

      const unitsBySku = {};
      for (const l of lines) unitsBySku[l.ProductCode] = (unitsBySku[l.ProductCode] || 0) + l.Quantity;
      const top = Object.entries(unitsBySku).sort((a, b) => b[1] - a[1])[0];

      let topName = top ? top[0] : '—';
      if (top) {
        const { data: prod } = await sb.from('products').select('name').eq('sku', top[0]).maybeSingle();
        if (prod?.name) topName = prod.name;
      }

      return res.json({
        from, to,
        totalOrders:    orders.length,
        totalRevenue:   orders.reduce((s, o) => s + parseFloat(o.OrderTotal || 0), 0).toFixed(2),
        topSeller:      topName,
        topSellerUnits: top ? top[1] : 0,
      });
    }

    // ── Full sales export: one row per item sold ──────────────
    if (section === 'export_sales') {
      // Fetch all orders in range + the entire OrderLines table and join in
      // memory — with 15k+ orders, filtering lines via .in(orderIds) would
      // build an unworkably long query string, so a full-table pull + JS
      // filter is the safer path here.
      const [orders, allLines, custs, prods] = await Promise.all([
        fetchAll(() => sb.from('Orders')
          .select('OrderID,OrderDate,CustID,ShippingFee,OrderTotal,PaymentMethod')
          .gte('OrderDate', dateFrom).lte('OrderDate', dateTo)),
        fetchAll(() => sb.from('OrderLines').select('OrderID,ProductCode,Quantity,UnitPrice,LineRevenue')),
        fetchAll(() => sb.from('Customers_Core').select('CustomerID,FirstName,LastName,Country')),
        fetchAll(() => sb.from('products').select('sku,name')),
      ]);

      const ordersById = {};
      for (const o of orders) ordersById[o.OrderID] = o;
      const custsById = {};
      for (const c of custs) custsById[c.CustomerID] = c;
      const namesBySku = {};
      for (const p of prods) namesBySku[p.sku] = p.name;

      const rows = allLines.filter(l => ordersById[l.OrderID]).map(l => {
        const o = ordersById[l.OrderID];
        const c = custsById[o.CustID] || {};
        return {
          OrderID:       l.OrderID,
          OrderDate:     o.OrderDate || '',
          FirstName:     c.FirstName || '',
          LastName:      c.LastName || '',
          Country:       c.Country || '',
          ProductCode:   l.ProductCode,
          ProductName:   namesBySku[l.ProductCode] || l.ProductCode,
          Quantity:      l.Quantity,
          UnitPrice:     parseFloat(l.UnitPrice || 0),
          LineRevenue:   parseFloat(l.LineRevenue || 0),
          ShippingFee:   parseFloat(o.ShippingFee || 0),
          OrderTotal:    parseFloat(o.OrderTotal || 0),
          PaymentMethod: o.PaymentMethod || '',
        };
      }).sort((a, b) => a.OrderDate < b.OrderDate ? 1 : a.OrderDate > b.OrderDate ? -1 : 0);

      return res.json({ rows });
    }

    // ── Raw table exports (extra credit: full data pull) ──────
    if (section === 'export_raw') {
      const tableMap = {
        orders:            'Orders',
        orderlines:        'OrderLines',
        customers_core:    'Customers_Core',
        customers_contact: 'Customers_Contact',
      };
      const tableName = tableMap[req.query.table || ''];
      if (!tableName) return res.status(400).json({ error: 'Unknown table' });

      const rows = await fetchAll(() => sb.from(tableName).select('*'));
      return res.json({ rows });
    }

    // ── Order detail ──────────────────────────────────────────
    if (section === 'order_detail') {
      const { data: lines } = await sb.from('OrderLines')
        .select('LineNumber,ProductCode,Quantity,UnitPrice,DiscountPct,LineRevenue,LineCost')
        .eq('OrderID', orderId).order('LineNumber');
      const { data: promos } = await sb.from('OrderPromotions')
        .select('PromoCode').eq('OrderID', orderId);
      return res.json({ lines: lines || [], promos: promos || [] });
    }

    // ── Customer orders ───────────────────────────────────────
    if (section === 'customer_orders') {
      const { data: orders } = await sb.from('Orders')
        .select('OrderID,OrderDate,OrderTotal,Channel,PaymentMethod')
        .eq('CustID', custId).order('OrderDate', { ascending: false });
      return res.json({ orders: orders || [] });
    }

    // ── Dashboard ────────────────────────────────────────────
    if (section === 'dashboard') {
      const prevFrom = new Date(new Date(dateFrom).getTime() - (new Date(dateTo) - new Date(dateFrom)))
        .toISOString().slice(0, 10);
      const currentYear = new Date().getFullYear();
      const lastYear    = currentYear - 1;

      const [allOrders, allCusts, allRentals, prevOrders, yoyOrders] = await Promise.all([
        fetchAll(() => sb.from('Orders').select('OrderID,OrderDate,CustID,OrderTotal,Channel,ShippingFee')
          .gte('OrderDate', dateFrom).lte('OrderDate', dateTo)),
        fetchAll(() => sb.from('Customers_Core').select('CustomerID,Country,JoinDate')),
        fetchAll(() => sb.from('RentalTransactions').select('RentalDate,RentalRevenue')
          .gte('RentalDate', dateFrom).lte('RentalDate', dateTo)),
        fetchAll(() => sb.from('Orders').select('OrderTotal')
          .gte('OrderDate', prevFrom).lt('OrderDate', dateFrom)),
        fetchAll(() => sb.from('Orders').select('OrderDate,OrderTotal')
          .gte('OrderDate', `${lastYear}-01-01`)
          .lte('OrderDate', `${currentYear}-12-31`)),
      ]);

      // Join lines in memory rather than .in(dashOrderIds) — with 15k+ orders
      // that filter would build an unworkably long query string.
      const dashOrderIdSet = new Set(allOrders.map(o => o.OrderID));
      const allOrderLines = await fetchAll(() => sb.from('OrderLines').select('OrderID,ProductCode,Quantity,LineRevenue'));
      const allLines = allOrderLines.filter(l => dashOrderIdSet.has(l.OrderID));

      const sum = arr => arr.reduce((s, o) => s + parseFloat(o.OrderTotal || 0), 0);
      const totalRevenue    = sum(allOrders);
      const prevRevenue     = sum(prevOrders);
      const rentalRevenue   = allRentals.reduce((s, r) => s + parseFloat(r.RentalRevenue || 0), 0);
      const shippingRevenue = allOrders.filter(o => o.Channel === 'Shipping').reduce((s,o)=>s+parseFloat(o.OrderTotal||0),0);
      const instoreRevenue  = allOrders.filter(o => o.Channel === 'In-Store').reduce((s,o)=>s+parseFloat(o.OrderTotal||0),0);
      const avgOrder        = allOrders.length ? totalRevenue / allOrders.length : 0;

      // Daily & monthly revenue
      const dailyMap = {};
      const start = new Date(dateFrom), end = new Date(dateTo);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1))
        dailyMap[d.toISOString().slice(0,10)] = { sales: 0, rental: 0 };
      for (const o of allOrders) if (dailyMap[o.OrderDate] !== undefined)
        dailyMap[o.OrderDate].sales += parseFloat(o.OrderTotal || 0);
      for (const r of allRentals) if (dailyMap[r.RentalDate] !== undefined)
        dailyMap[r.RentalDate].rental += parseFloat(r.RentalRevenue || 0);
      const daily = Object.entries(dailyMap).map(([date, v]) => ({
        date, sales: +v.sales.toFixed(2), rental: +v.rental.toFixed(2)
      }));

      const monthlyMap = {};
      for (const o of allOrders) {
        const m = o.OrderDate.slice(0,7);
        if (!monthlyMap[m]) monthlyMap[m] = { sales: 0, rental: 0 };
        monthlyMap[m].sales += parseFloat(o.OrderTotal || 0);
      }
      for (const r of allRentals) {
        const m = r.RentalDate.slice(0,7);
        if (!monthlyMap[m]) monthlyMap[m] = { sales: 0, rental: 0 };
        monthlyMap[m].rental += parseFloat(r.RentalRevenue || 0);
      }
      const monthly = Object.entries(monthlyMap).sort().map(([m,v]) => ({
        month: m, sales: +v.sales.toFixed(2), rental: +v.rental.toFixed(2)
      }));

      // Year-over-year: group by YYYY-MM for current and last year
      const yoy = { [currentYear]: {}, [lastYear]: {} };
      for (const o of yoyOrders) {
        const yr = +o.OrderDate.slice(0,4);
        const mo = o.OrderDate.slice(5,7);
        if (!yoy[yr]) continue;
        yoy[yr][mo] = (yoy[yr][mo] || 0) + parseFloat(o.OrderTotal || 0);
      }
      const yoyMonths = ['01','02','03','04','05','06','07','08','09','10','11','12'];
      const yoyData = {
        months:      yoyMonths,
        currentYear, lastYear,
        current: yoyMonths.map(m => +(yoy[currentYear][m] || 0).toFixed(2)),
        previous: yoyMonths.map(m => +(yoy[lastYear][m] || 0).toFixed(2)),
        currentYTD:  yoyMonths.slice(0, new Date().getMonth()+1)
          .reduce((s,m)=>s+(yoy[currentYear][m]||0), 0).toFixed(2),
        previousYTD: yoyMonths.slice(0, new Date().getMonth()+1)
          .reduce((s,m)=>s+(yoy[lastYear][m]||0), 0).toFixed(2),
      };

      // Day of week
      const dowCounts = [0,0,0,0,0,0,0];
      for (const o of allOrders) dowCounts[new Date(o.OrderDate+'T00:00:00Z').getUTCDay()]++;

      // Top countries
      const countryMap = {};
      for (const c of allCusts) if (c.Country) countryMap[c.Country] = (countryMap[c.Country]||0)+1;
      const topCountries = Object.entries(countryMap).sort((a,b)=>b[1]-a[1]).slice(0,8)
        .map(([country,count])=>({country,count}));

      // Top seller
      const unitsByProd = {};
      for (const l of allLines) unitsByProd[l.ProductCode] = (unitsByProd[l.ProductCode]||0)+l.Quantity;
      const topSku = Object.entries(unitsByProd).sort((a,b)=>b[1]-a[1])[0];

      // Recent orders with customer names
      const { data: recentRaw } = await sb.from('Orders')
        .select('OrderID,OrderDate,CustID,OrderTotal,Channel')
        .gte('OrderDate', dateFrom).lte('OrderDate', dateTo)
        .order('OrderDate', { ascending: false }).limit(10);
      const recentCustIds = [...new Set((recentRaw||[]).map(o=>o.CustID).filter(Boolean))];
      const recentCustMap = {};
      if (recentCustIds.length) {
        const { data: cores } = await sb.from('Customers_Core')
          .select('CustomerID,FirstName,LastName,Country').in('CustomerID', recentCustIds);
        for (const c of (cores||[])) recentCustMap[c.CustomerID] = { display: c.FirstName[0]+'. '+c.LastName, country: c.Country || '—' };
      }

      const newCustomers = allCusts.filter(c => c.JoinDate >= dateFrom && c.JoinDate <= dateTo).length;

      return res.json({
        totalRevenue:    totalRevenue.toFixed(2),
        prevRevenue:     prevRevenue.toFixed(2),
        rentalRevenue:   rentalRevenue.toFixed(2),
        shippingRevenue: shippingRevenue.toFixed(2),
        instoreRevenue:  instoreRevenue.toFixed(2),
        totalOrders:     allOrders.length,
        avgOrder:        avgOrder.toFixed(2),
        totalCustomers:  allCusts.length,
        newCustomers,
        topSeller:       topSku ? topSku[0] : '—',
        topSellerUnits:  topSku ? topSku[1] : 0,
        daily, monthly, yoyData,
        dowCounts, topCountries,
        recentOrders: (recentRaw||[]).map(o=>({
          ...o,
          customerDisplay: recentCustMap[o.CustID]?.display || '—',
          country:         recentCustMap[o.CustID]?.country || '—',
        })),
      });
    }

    // ── Orders ───────────────────────────────────────────────
    if (section === 'orders') {
      const { data: orders } = await sb.from('Orders')
        .select('OrderID,OrderDate,CustID,OrderTotal,Channel,ShippingFee,PaymentMethod')
        .gte('OrderDate', dateFrom).lte('OrderDate', dateTo)
        .order('OrderDate', { ascending: false }).limit(500);

      const custIds = [...new Set((orders||[]).map(o=>o.CustID).filter(Boolean))];
      const custMap = {};
      if (custIds.length) {
        const [coreRes, contactRes] = await Promise.all([
          sb.from('Customers_Core').select('CustomerID,FirstName,LastName,Country').in('CustomerID', custIds),
          sb.from('Customers_Contact').select('CustomerID,Email').in('CustomerID', custIds),
        ]);
        for (const c of (coreRes.data||[]))    custMap[c.CustomerID] = { name:c.FirstName+' '+c.LastName, country:c.Country, id:c.CustomerID };
        for (const c of (contactRes.data||[])) if (custMap[c.CustomerID]) custMap[c.CustomerID].email = c.Email;
      }

      const threeDaysAgo = daysAgo(3);
      return res.json({
        orders: (orders||[]).map(o=>({
          ...o,
          customerName:   custMap[o.CustID]?.name    || '—',
          customerId:     custMap[o.CustID]?.id       || null,
          country:        custMap[o.CustID]?.country  || '—',
          customerEmail:  custMap[o.CustID]?.email    || null,
          needsAttention: o.OrderDate < threeDaysAgo && o.Channel === 'Shipping',
        }))
      });
    }

    // ── Customers ────────────────────────────────────────────
    if (section === 'customers') {
      const [customersCore, customersContact, custOrders] = await Promise.all([
        fetchAll(() => sb.from('Customers_Core').select('*').order('JoinDate', { ascending: false })),
        fetchAll(() => sb.from('Customers_Contact').select('*')),
        fetchAll(() => sb.from('Orders').select('CustID,OrderTotal,OrderDate')),
      ]);

      const contactMap = {};
      for (const c of customersContact) contactMap[c.CustomerID] = c;
      const ordersByCust = {};
      for (const o of custOrders) {
        if (!ordersByCust[o.CustID]) ordersByCust[o.CustID] = { count:0, total:0, last:'', years: new Set() };
        ordersByCust[o.CustID].count++;
        ordersByCust[o.CustID].total += parseFloat(o.OrderTotal||0);
        ordersByCust[o.CustID].years.add(o.OrderDate.slice(0,4));
        if (o.OrderDate > ordersByCust[o.CustID].last) ordersByCust[o.CustID].last = o.OrderDate;
      }

      const customers = customersCore.map(c=>({
        ...c,
        email:         contactMap[c.CustomerID]?.Email || '—',
        loyalty:       contactMap[c.CustomerID]?.LoyaltyMember || false,
        orderCount:    ordersByCust[c.CustomerID]?.count || 0,
        lifetimeValue: (ordersByCust[c.CustomerID]?.total||0).toFixed(2),
        lastOrder:     ordersByCust[c.CustomerID]?.last || '—',
      }));

      // Retention by cohort year
      const cohortFirst = {};
      const custYears   = {};
      for (const o of custOrders) {
        const yr = o.OrderDate.slice(0,4);
        if (!cohortFirst[o.CustID] || yr < cohortFirst[o.CustID]) cohortFirst[o.CustID] = yr;
        if (!custYears[o.CustID]) custYears[o.CustID] = new Set();
        custYears[o.CustID].add(yr);
      }
      const cohorts = {};
      for (const [cust, firstYr] of Object.entries(cohortFirst)) {
        if (!cohorts[firstYr]) cohorts[firstYr] = { total:0, retained:0 };
        cohorts[firstYr].total++;
        if (custYears[cust].has(String(+firstYr+1))) cohorts[firstYr].retained++;
      }
      const retention = Object.entries(cohorts)
        .filter(([yr]) => +yr < new Date().getFullYear())
        .sort()
        .map(([year, v]) => ({
          year, total: v.total, retained: v.retained,
          rate: v.total > 0 ? +((v.retained/v.total)*100).toFixed(1) : 0
        }));

      const loyaltyOrders   = customers.filter(c=>c.loyalty && c.orderCount>0);
      const noLoyaltyOrders = customers.filter(c=>!c.loyalty && c.orderCount>0);
      const avgLTV = arr => arr.length ? arr.reduce((s,c)=>s+parseFloat(c.lifetimeValue),0)/arr.length : 0;

      // New customers by month (last 12 months)
      const monthMap = {};
      for (let i=11;i>=0;i--) {
        const d=new Date(); d.setMonth(d.getMonth()-i);
        monthMap[d.toISOString().slice(0,7)] = 0;
      }
      for (const c of customers) {
        const mo=(c.JoinDate||'').slice(0,7);
        if (monthMap[mo]!==undefined) monthMap[mo]++;
      }

      const countryMap = {};
      for (const c of customers) if (c.Country) countryMap[c.Country]=(countryMap[c.Country]||0)+1;
      const countryDist = Object.entries(countryMap).sort((a,b)=>b[1]-a[1]).slice(0,12)
        .map(([country,count])=>({country,count}));

      return res.json({
        customers,
        loyaltyAvgLTV:   avgLTV(loyaltyOrders).toFixed(2),
        noLoyaltyAvgLTV: avgLTV(noLoyaltyOrders).toFixed(2),
        loyaltyCount:    loyaltyOrders.length,
        noLoyaltyCount:  noLoyaltyOrders.length,
        newByMonth: Object.entries(monthMap).map(([month,count])=>({month,count})),
        countryDist,
        retention,
      });
    }

    // ── Products ─────────────────────────────────────────────
    if (section === 'products') {
      const [dateOrders, productsRes] = await Promise.all([
        fetchAll(() => sb.from('Orders').select('OrderID').gte('OrderDate', dateFrom).lte('OrderDate', dateTo)),
        sb.from('products').select('sku,name,category,subcategory,price').limit(5000),
      ]);
      // Join in memory rather than .in(orderIds) — with 15k+ orders that
      // filter would build an unworkably long query string.
      const prodOrderIdSet = new Set(dateOrders.map(o=>o.OrderID));
      const allOrderLines = await fetchAll(() => sb.from('OrderLines').select('OrderID,ProductCode,Quantity,LineRevenue,LineCost'));
      const linesInRange = allOrderLines.filter(l => prodOrderIdSet.has(l.OrderID));

      const meta = {};
      for (const p of (productsRes.data||[])) meta[p.sku] = p;

      const byProd = {};
      for (const l of linesInRange) {
        if (!byProd[l.ProductCode]) byProd[l.ProductCode] = { sku:l.ProductCode, units:0, revenue:0, cost:0 };
        byProd[l.ProductCode].units   += l.Quantity;
        byProd[l.ProductCode].revenue += parseFloat(l.LineRevenue||0);
        byProd[l.ProductCode].cost    += parseFloat(l.LineCost||0);
      }

      const rows = Object.values(byProd).map(p=>({
        ...p,
        name:     meta[p.sku]?.name     || p.sku,
        category: meta[p.sku]?.category || '—',
        price:    meta[p.sku]?.price    || 0,
        revenue:  +p.revenue.toFixed(2),
        cost:     +p.cost.toFixed(2),
        margin:   p.revenue > 0 ? +((p.revenue-p.cost)/p.revenue*100).toFixed(1) : 0,
      })).sort((a,b)=>b.revenue-a.revenue);

      const catMap = {};
      for (const r of rows) catMap[r.category]=(catMap[r.category]||0)+r.revenue;
      const byCategory = Object.entries(catMap).sort((a,b)=>b[1]-a[1])
        .map(([cat,rev])=>({cat,rev:+rev.toFixed(2)}));

      return res.json({ products: rows, byCategory });
    }

    // ── Rentals ──────────────────────────────────────────────
    if (section === 'rentals') {
      const [allRentals, allSales, productsRes] = await Promise.all([
        fetchAll(() => sb.from('RentalTransactions')
          .select('RentalID,RentalDate,CustID,SKU,Quantity,DailyRate,RentalRevenue,Returned')
          .gte('RentalDate', dateFrom).lte('RentalDate', dateTo)
          .order('RentalDate', { ascending: false })),
        fetchAll(() => sb.from('Orders').select('OrderDate,OrderTotal')
          .gte('OrderDate', dateFrom).lte('OrderDate', dateTo)),
        sb.from('products').select('sku,category').limit(5000),
      ]);

      const skuCat     = {};
      for (const p of (productsRes.data||[])) skuCat[p.sku] = p.category;

      const totalRev   = allRentals.reduce((s,r)=>s+parseFloat(r.RentalRevenue||0),0);
      const totalSales = allSales.reduce((s,o)=>s+parseFloat(o.OrderTotal||0),0);
      const returnRate = allRentals.length
        ? (allRentals.filter(r=>r.Returned==='Yes').length / allRentals.length * 100).toFixed(1)
        : '0';

      // Top rented SKUs
      const bySku = {};
      for (const r of allRentals) {
        if (!bySku[r.SKU]) bySku[r.SKU] = { sku:r.SKU, count:0, revenue:0 };
        bySku[r.SKU].count   += r.Quantity;
        bySku[r.SKU].revenue += parseFloat(r.RentalRevenue||0);
      }
      const topRentals = Object.values(bySku).sort((a,b)=>b.revenue-a.revenue).slice(0,10)
        .map(r=>({...r, revenue:+r.revenue.toFixed(2)}));

      // Category utilization
      const byCat = {};
      for (const r of allRentals) {
        const cat = skuCat[r.SKU] || 'Other';
        if (!byCat[cat]) byCat[cat] = { count:0, revenue:0 };
        byCat[cat].count   += r.Quantity;
        byCat[cat].revenue += parseFloat(r.RentalRevenue||0);
      }
      const byCategory = Object.entries(byCat).sort((a,b)=>b[1].revenue-a[1].revenue)
        .map(([cat,v])=>({ cat, count:v.count, revenue:+v.revenue.toFixed(2) }));

      // Monthly rental revenue + sales for % of total chart
      const monthlyMap = {};
      for (const r of allRentals) {
        const m = r.RentalDate.slice(0,7);
        if (!monthlyMap[m]) monthlyMap[m] = { rental:0, sales:0 };
        monthlyMap[m].rental += parseFloat(r.RentalRevenue||0);
      }
      for (const o of allSales) {
        const m = o.OrderDate.slice(0,7);
        if (!monthlyMap[m]) monthlyMap[m] = { rental:0, sales:0 };
        monthlyMap[m].sales += parseFloat(o.OrderTotal||0);
      }
      const monthly = Object.entries(monthlyMap).sort().map(([month,v]) => {
        const total = v.rental + v.sales;
        return {
          month,
          rev:  +v.rental.toFixed(2),
          pct:  total > 0 ? +((v.rental/total)*100).toFixed(1) : 0,
        };
      });

      const overallPct = (totalRev + totalSales) > 0
        ? +((totalRev / (totalRev + totalSales)) * 100).toFixed(1)
        : 0;

      return res.json({ totalRev:totalRev.toFixed(2), totalTransactions:allRentals.length, returnRate, topRentals, monthly, byCategory, overallPct });
    }

    // ── Promos ───────────────────────────────────────────────
    if (section === 'promos') {
      // Fetch all orders + lines once and derive both the promo subset and
      // the effectiveness comparison from them in memory — with 14k+ promo
      // links, filtering via .in(promoOrderIds) would build an unworkably
      // long query string.
      const [promosData, opData, allOrders, allOrderLines] = await Promise.all([
        sb.from('Promotions').select('*').order('StartDate', { ascending: false }).limit(1000).then(r => r.data || []),
        fetchAll(() => sb.from('OrderPromotions').select('PromoCode,OrderID')),
        fetchAll(() => sb.from('Orders').select('OrderID,OrderTotal')),
        fetchAll(() => sb.from('OrderLines').select('OrderID,UnitPrice,Quantity,LineRevenue')),
      ]);

      const promoOrderSet = new Set(opData.map(op => op.OrderID));

      const orderTotals = {};
      for (const o of allOrders) orderTotals[o.OrderID] = parseFloat(o.OrderTotal||0);

      // Sacrificed revenue per order = sum(UnitPrice*Qty - LineRevenue) for its lines
      const sacrificedByOrder = {};
      for (const l of allOrderLines) {
        if (!promoOrderSet.has(l.OrderID)) continue;
        const full = parseFloat(l.UnitPrice||0) * (l.Quantity||1);
        const paid = parseFloat(l.LineRevenue||0);
        sacrificedByOrder[l.OrderID] = (sacrificedByOrder[l.OrderID]||0) + Math.max(0, full - paid);
      }

      const orderCounts     = {};
      const promoRevenue    = {};
      const promoSacrificed = {};
      for (const op of opData) {
        orderCounts[op.PromoCode]     = (orderCounts[op.PromoCode]||0) + 1;
        promoRevenue[op.PromoCode]    = (promoRevenue[op.PromoCode]||0) + (orderTotals[op.OrderID]||0);
        promoSacrificed[op.PromoCode] = (promoSacrificed[op.PromoCode]||0) + (sacrificedByOrder[op.OrderID]||0);
      }

      // Overall effectiveness
      let revenueWithPromo = 0, revenueNoPromo = 0, ordersWithPromo = 0, ordersNoPromo = 0;
      for (const o of allOrders) {
        if (promoOrderSet.has(o.OrderID)) { revenueWithPromo += parseFloat(o.OrderTotal||0); ordersWithPromo++; }
        else                              { revenueNoPromo   += parseFloat(o.OrderTotal||0); ordersNoPromo++;   }
      }

      const promos = promosData.map(p=>({
        ...p,
        orderCount: orderCounts[p.PromoCode]||0,
        revenue:    +((promoRevenue[p.PromoCode]||0).toFixed(2)),
        sacrificed: +((promoSacrificed[p.PromoCode]||0).toFixed(2)),
        avgOrder:   orderCounts[p.PromoCode]
          ? +((promoRevenue[p.PromoCode]||0) / orderCounts[p.PromoCode]).toFixed(2)
          : 0,
      })).sort((a,b)=>b.orderCount-a.orderCount);

      return res.json({
        promos,
        effectiveness: {
          revenueWithPromo: revenueWithPromo.toFixed(2),
          revenueNoPromo:   revenueNoPromo.toFixed(2),
          ordersWithPromo,
          ordersNoPromo,
          avgWithPromo:  ordersWithPromo > 0 ? +(revenueWithPromo/ordersWithPromo).toFixed(2) : 0,
          avgNoPromo:    ordersNoPromo   > 0 ? +(revenueNoPromo/ordersNoPromo).toFixed(2)     : 0,
        }
      });
    }

    // ── Inventory ────────────────────────────────────────────
    if (section === 'inventory') {
      const [prodsRes, invRes] = await Promise.all([
        sb.from('products').select('sku,name,category,subcategory,price,availability'),
        sb.from('Inventory').select('*').then(r=>r).catch(()=>({ data:[] })),
      ]);

      const invMap = {};
      for (const i of (invRes.data||[])) invMap[i.SKU] = i;

      const products = (prodsRes.data||[])
        .filter(p => p.availability !== 'Rental only')
        .map(p => ({
          sku:          p.sku,
          name:         p.name,
          category:     p.category,
          price:        p.price,
          stockQty:     invMap[p.sku] != null ? invMap[p.sku].StockQty     : null,
          reorderLevel: invMap[p.sku] != null ? invMap[p.sku].ReorderLevel : 5,
          lastUpdated:  invMap[p.sku]?.LastUpdated ?? null,
          status:       invMap[p.sku] == null        ? 'untracked'
                      : invMap[p.sku].StockQty === 0 ? 'stockout'
                      : invMap[p.sku].StockQty <= invMap[p.sku].ReorderLevel ? 'low'
                      : 'ok',
        }));

      const stockouts  = products.filter(p=>p.status==='stockout').length;
      const lowStock   = products.filter(p=>p.status==='low').length;
      const untracked  = products.filter(p=>p.status==='untracked').length;

      return res.json({ products, stockouts, lowStock, untracked });
    }

    // ── Financials ───────────────────────────────────────────
    if (section === 'financials') {
      const currentYear = new Date().getFullYear();
      const lastYear    = currentYear - 1;

      const [orders, rentals, prevYearOrders] = await Promise.all([
        fetchAll(() => sb.from('Orders').select('OrderID,OrderDate,OrderTotal,CustID').gte('OrderDate', dateFrom).lte('OrderDate', dateTo)),
        fetchAll(() => sb.from('RentalTransactions').select('RentalDate,RentalRevenue').gte('RentalDate', dateFrom).lte('RentalDate', dateTo)),
        fetchAll(() => sb.from('Orders').select('OrderTotal').gte('OrderDate', `${lastYear}-01-01`).lte('OrderDate', `${lastYear}-12-31`)),
      ]);

      // Join lines in memory rather than .in(orderIds) — with 15k+ orders
      // that filter would build an unworkably long query string.
      const orderIdSet = new Set(orders.map(o=>o.OrderID));
      const allOrderLines = orders.length
        ? await fetchAll(() => sb.from('OrderLines').select('OrderID,UnitPrice,Quantity,LineRevenue,LineCost'))
        : [];
      const lines = allOrderLines.filter(l => orderIdSet.has(l.OrderID));

      const salesRevenue  = orders.reduce((s,o)=>s+parseFloat(o.OrderTotal||0),0);
      const rentalRevenue = rentals.reduce((s,r)=>s+parseFloat(r.RentalRevenue||0),0);
      const totalRevenue  = salesRevenue + rentalRevenue;
      const cogs          = lines.reduce((s,l)=>s+parseFloat(l.LineCost||0),0);
      const grossProfit   = salesRevenue - cogs;
      const grossMargin   = salesRevenue > 0 ? grossProfit/salesRevenue*100 : 0;
      const avgOrder      = orders.length ? salesRevenue/orders.length : 0;

      // Revenue sacrificed (discounts)
      const totalSacrificed = lines.reduce((s,l)=>s+Math.max(0,parseFloat(l.UnitPrice||0)*(l.Quantity||1)-parseFloat(l.LineRevenue||0)),0);

      // Revenue per customer
      const activeCusts = new Set(orders.map(o=>o.CustID).filter(Boolean)).size;
      const revenuePerCustomer = activeCusts > 0 ? totalRevenue/activeCusts : 0;

      // Repeat customer rate
      const custOrderCount = {};
      for (const o of orders) custOrderCount[o.CustID] = (custOrderCount[o.CustID]||0)+1;
      const totalCusts  = Object.keys(custOrderCount).length;
      const repeatCusts = Object.values(custOrderCount).filter(n=>n>=2).length;
      const repeatRate  = totalCusts > 0 ? repeatCusts/totalCusts*100 : 0;

      // YoY growth
      const prevRevenue = prevYearOrders.reduce((s,o)=>s+parseFloat(o.OrderTotal||0),0);
      const yoyGrowth   = prevRevenue > 0 ? (salesRevenue - prevRevenue)/prevRevenue*100 : null;

      // Monthly revenue + gross profit
      const monthlyMap = {};
      for (const o of orders) {
        const m = o.OrderDate.slice(0,7);
        if (!monthlyMap[m]) monthlyMap[m] = { revenue:0, cost:0 };
        monthlyMap[m].revenue += parseFloat(o.OrderTotal||0);
      }
      // Distribute costs to months via order dates
      const orderDateMap = {};
      for (const o of orders) orderDateMap[o.OrderID] = o.OrderDate.slice(0,7);
      for (const l of lines) {
        const m = orderDateMap[l.OrderID];
        if (m && monthlyMap[m]) monthlyMap[m].cost += parseFloat(l.LineCost||0);
      }
      const monthly = Object.entries(monthlyMap).sort().map(([month,v])=>({
        month,
        revenue:     +v.revenue.toFixed(2),
        grossProfit: +(v.revenue - v.cost).toFixed(2),
        margin:      v.revenue > 0 ? +((v.revenue-v.cost)/v.revenue*100).toFixed(1) : 0,
      }));

      return res.json({
        totalRevenue:        +totalRevenue.toFixed(2),
        salesRevenue:        +salesRevenue.toFixed(2),
        rentalRevenue:       +rentalRevenue.toFixed(2),
        cogs:                +cogs.toFixed(2),
        grossProfit:         +grossProfit.toFixed(2),
        grossMargin:         +grossMargin.toFixed(2),
        avgOrder:            +avgOrder.toFixed(2),
        revenuePerCustomer:  +revenuePerCustomer.toFixed(2),
        totalSacrificed:     +totalSacrificed.toFixed(2),
        sacrificedPct:       totalRevenue > 0 ? +(totalSacrificed/totalRevenue*100).toFixed(2) : 0,
        rentalPct:           totalRevenue > 0 ? +(rentalRevenue/totalRevenue*100).toFixed(2)   : 0,
        repeatRate:          +repeatRate.toFixed(2),
        yoyGrowth,
        monthly,
      });
    }

    return res.status(400).json({ error: 'Unknown section' });
  } catch(err) {
    console.error('Manager data error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

handler.config = { api: { bodyParser: true } };
module.exports = handler;
