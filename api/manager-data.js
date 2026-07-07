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

// ── Forecasting helpers (real statistical models, no AI) ──────────────
const SEASON = 12;              // monthly seasonality period
const FC_Z80 = 1.28;            // ~80% prediction interval
const FC_Z95 = 1.96;            // ~95% prediction interval
const FC_HMAX = 24;             // forecast up to 24 months ahead

const fcMean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
function fcStd(a) {
  if (a.length < 2) return 0;
  const m = fcMean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}
function fcMedian(a) {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y);
  const i = Math.floor(b.length / 2);
  return b.length % 2 ? b[i] : (b[i - 1] + b[i]) / 2;
}
function addMonths(ym, k) {
  let [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + k;
  return Math.floor(idx / 12) + '-' + String(idx % 12 + 1).padStart(2, '0');
}
// Rolling one-step-ahead backtest → MAPE (mean absolute % error).
function fcBacktest(y, predictNext, start) {
  let sum = 0, c = 0;
  for (let t = start; t < y.length; t++) {
    const f = predictNext(y.slice(0, t));
    if (y[t] > 0 && isFinite(f)) { sum += Math.abs(y[t] - f) / y[t]; c++; }
  }
  return c ? +(sum / c).toFixed(4) : null;
}

// Each model returns { means[], se[], mape, predict } where se[h] is the
// forecast standard error (so the caller can draw bands at any confidence
// level) and predict(slice) is the one-step-ahead point forecast used for
// backtesting and for blending into the ensemble.

// Model 1 — Linear trend (ordinary least squares). The standard error uses
// the exact OLS formula, so the band widens as the horizon moves away from
// the centre of the data.
function fcLinear(y, H, btStart) {
  const n = y.length;
  const fit = yy => {
    const k = yy.length; let st = 0, sy = 0, stt = 0, sty = 0;
    for (let t = 0; t < k; t++) { st += t; sy += yy[t]; stt += t * t; sty += t * yy[t]; }
    const b = (k * sty - st * sy) / (k * stt - st * st);
    return { a: (sy - b * st) / k, b };
  };
  const { a, b } = fit(y);
  const resid = y.map((v, t) => v - (a + b * t));
  const sigma = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2));
  const tbar = (n - 1) / 2; let Sxx = 0;
  for (let t = 0; t < n; t++) Sxx += (t - tbar) ** 2;
  const means = [], se = [];
  for (let h = 1; h <= H; h++) {
    const tt = n - 1 + h;
    means.push(a + b * tt);
    se.push(sigma * Math.sqrt(1 + 1 / n + (tt - tbar) ** 2 / Sxx));
  }
  const predict = yy => { const f = fit(yy); return f.a + f.b * yy.length; };
  return { means, se, mape: fcBacktest(y, predict, btStart), predict };
}

// Model 2 — Seasonal naive with growth. Each future month = the same month a
// year earlier, scaled by the typical year-over-year growth factor.
function fcSeasonalNaive(y, H, btStart) {
  const n = y.length, s = SEASON;
  // Year-over-year growth from the most recent 12 months only, so the early
  // startup period (near-zero → thousands = huge ratios) doesn't inflate it.
  const growth = yy => {
    const r = [];
    for (let t = Math.max(s, yy.length - s); t < yy.length; t++) if (yy[t - s] > 0) r.push(yy[t] / yy[t - s]);
    return r.length ? fcMedian(r) : 1;
  };
  const g = growth(y);
  const ext = y.slice(), means = [];
  for (let h = 1; h <= H; h++) { const i = n - 1 + h; const m = ext[i - s] * g; ext[i] = m; means.push(m); }
  const resid = [];
  for (let t = s; t < n; t++) if (y[t - s] > 0) resid.push(y[t] - y[t - s] * g);
  const sigma = fcStd(resid);
  const se = [];
  for (let h = 1; h <= H; h++) se.push(sigma * Math.sqrt(h));
  const predict = yy => { const gg = growth(yy); return yy[yy.length - s] * gg; };
  return { means, se, mape: fcBacktest(y, predict, btStart), predict };
}

// Model 3 — Holt-Winters additive (triple exponential smoothing): level +
// trend + seasonal(12). Smoothing params chosen by grid search to minimise
// one-step squared error.
function hwRun(y, al, be, ga) {
  const n = y.length, s = SEASON;
  let L = fcMean(y.slice(0, s));
  let T = (fcMean(y.slice(s, 2 * s)) - fcMean(y.slice(0, s))) / s;
  const seas = [];
  for (let i = 0; i < s; i++) seas[i] = y[i] - L;
  const oneStep = [];
  for (let t = s; t < n; t++) {
    oneStep.push({ t, pred: L + T + seas[t % s] });
    const Lprev = L;
    L = al * (y[t] - seas[t % s]) + (1 - al) * (L + T);
    T = be * (L - Lprev) + (1 - be) * T;
    seas[t % s] = ga * (y[t] - L) + (1 - ga) * seas[t % s];
  }
  return { L, T, seas, oneStep };
}
function hwPick(y) {
  let best = null;
  for (let al = 0.1; al <= 0.6; al += 0.1)
    for (let be = 0.05; be <= 0.35; be += 0.1)
      for (let ga = 0.1; ga <= 0.5; ga += 0.1) {
        const r = hwRun(y, al, be, ga);
        let sse = 0; for (const o of r.oneStep) sse += (y[o.t] - o.pred) ** 2;
        if (!best || sse < best.sse) best = { al, be, ga, sse };
      }
  return best;
}
function fcHoltWinters(y, H, btStart) {
  const n = y.length, s = SEASON;
  const p = hwPick(y);
  const r = hwRun(y, p.al, p.be, p.ga);
  const sigma = fcStd(r.oneStep.map(o => y[o.t] - o.pred));
  const means = [], se = [];
  for (let h = 1; h <= H; h++) {
    const i = n - 1 + h;
    means.push(r.L + h * r.T + r.seas[i % s]);
    se.push(sigma * Math.sqrt(h));
  }
  const predict = yy => {
    if (yy.length < 2 * s) return yy[yy.length - 1];
    const rr = hwRun(yy, p.al, p.be, p.ga);
    return rr.L + rr.T + rr.seas[yy.length % s];
  };
  return { means, se, mape: fcBacktest(y, predict, btStart), predict };
}

// Model 4 — Ensemble: an inverse-error weighted blend of the three models
// above. Averaging independent forecasts usually beats any single one, and
// the blend is more robust to any one model reading the future wrong.
function fcEnsemble(y, H, btStart, base) {
  const raw = base.map(m => (m.mape && m.mape > 0) ? 1 / m.mape : 0);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const w = raw.map(x => x / sum);
  const means = [];
  for (let h = 0; h < H; h++) means.push(base.reduce((s, m, i) => s + w[i] * m.means[h], 0));
  const predict = yy => base.reduce((s, m, i) => s + w[i] * m.predict(yy), 0);
  const resid = [];
  for (let t = btStart; t < y.length; t++) { const f = predict(y.slice(0, t)); if (isFinite(f)) resid.push(y[t] - f); }
  const sigma = fcStd(resid);
  const se = [];
  for (let h = 1; h <= H; h++) se.push(sigma * Math.sqrt(h));
  return { means, se, mape: fcBacktest(y, predict, btStart), predict, weights: w };
}

// ── Per-SKU demand forecast → recommended stock levels ────────────────
// Projects next-month unit demand for each product from its recent sales
// level adjusted by its own seasonal pattern, then turns that into a
// recommended stock level (≈1 month of cover) and reorder point (≈2 weeks of
// lead time) — each padded with safety stock sized to the product's demand
// volatility for ~90% service. Returns a map keyed by product code.
function computeSkuDemand(orders, lines) {
  const orderMonth = {};
  for (const o of orders) orderMonth[o.OrderID] = o.OrderDate.slice(0, 7);

  // Continuous month list, trimming the trailing incomplete month(s).
  const totalByMonth = {}, unitsBySkuMonth = {};
  for (const l of lines) {
    const m = orderMonth[l.OrderID]; if (!m) continue;
    const q = l.Quantity || 0;
    totalByMonth[m] = (totalByMonth[m] || 0) + q;
    (unitsBySkuMonth[l.ProductCode] = unitsBySkuMonth[l.ProductCode] || {});
    unitsBySkuMonth[l.ProductCode][m] = (unitsBySkuMonth[l.ProductCode][m] || 0) + q;
  }
  const present = Object.keys(totalByMonth).sort();
  if (!present.length) return { demand: {}, nextMonth: null };
  let months = [];
  for (let m = present[0]; m <= present[present.length - 1]; m = addMonths(m, 1)) months.push(m);
  while (months.length > 13) {
    const last = totalByMonth[months[months.length - 1]] || 0;
    const med = fcMedian(months.slice(-7, -1).map(m => totalByMonth[m] || 0));
    if (med > 0 && last < 0.25 * med) months.pop(); else break;
  }
  const lastMonth = months[months.length - 1];
  const nextMonth = addMonths(lastMonth, 1);
  const nextCal = +nextMonth.split('-')[1];        // calendar month 1..12 being forecast

  const demand = {};
  for (const [sku, byMonth] of Object.entries(unitsBySkuMonth)) {
    const arr = months.map(m => byMonth[m] || 0);
    const n = arr.length;
    const overallAvg = fcMean(arr);
    const recentAvg  = fcMean(arr.slice(Math.max(0, n - 6)));
    const std12      = fcStd(arr.slice(Math.max(0, n - 12)));

    // Seasonal factor for the month being forecast.
    let seasonal = 1;
    if (overallAvg > 0) {
      const sameMonthVals = [];
      months.forEach((m, i) => { if (+m.split('-')[1] === nextCal) sameMonthVals.push(arr[i]); });
      if (sameMonthVals.length) seasonal = Math.min(2, Math.max(0.5, fcMean(sameMonthVals) / overallAvg));
    }

    const forecastUnits = +(recentAvg * seasonal).toFixed(1);
    const safety = Math.ceil(1.28 * std12);
    demand[sku] = {
      forecastUnits,
      avgMonthly:      +recentAvg.toFixed(1),
      suggestedStock:  Math.max(0, Math.ceil(forecastUnits) + safety),   // ~1 month cover + safety
      suggestedReorder: Math.max(1, Math.ceil(forecastUnits * 0.5) + safety), // ~2 week lead + safety
    };
  }
  return { demand, nextMonth };
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

    // ── POST: auto-populate inventory from the demand forecast ────────
    if (req.method === 'POST' && section === 'auto_inventory') {
      const [orders, lines, prodsRes] = await Promise.all([
        fetchAll(() => sb.from('Orders').select('OrderID,OrderDate')),
        fetchAll(() => sb.from('OrderLines').select('OrderID,ProductCode,Quantity')),
        sb.from('products').select('sku').limit(5000),
      ]);
      const { demand } = computeSkuDemand(orders, lines);

      const now = new Date().toISOString();
      const upserts = (prodsRes.data || []).map(p => {
        const d = demand[p.sku];
        return d
          ? { SKU: p.sku, StockQty: Math.max(2, d.suggestedStock), ReorderLevel: d.suggestedReorder, LastUpdated: now }
          : { SKU: p.sku, StockQty: 2, ReorderLevel: 1, LastUpdated: now }; // never sold → minimal
      });

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

    // ── Forecast: historicals + 3 statistical models ──────────
    if (section === 'forecast') {
      // Which slice of the business to forecast (ignores the top-bar year filter).
      //   all | shipping | instore | rental
      const segment = ['all', 'shipping', 'instore', 'rental'].includes(req.query.segment) ? req.query.segment : 'all';
      const includeOrders  = segment !== 'rental';
      const includeRentals = segment === 'all' || segment === 'rental';
      const channelOk = ch => segment === 'all' || (segment === 'shipping' && ch === 'Shipping') || (segment === 'instore' && ch === 'In-Store');

      const [orders, rentals, lines] = await Promise.all([
        fetchAll(() => sb.from('Orders').select('OrderID,OrderDate,OrderTotal,Channel')),
        fetchAll(() => sb.from('RentalTransactions').select('RentalDate,RentalRevenue')),
        fetchAll(() => sb.from('OrderLines').select('OrderID,LineRevenue,LineCost')),
      ]);

      const salesByMonth = {}, rentByMonth = {}, orderMonth = {}, orderChannel = {};
      for (const o of orders) {
        const m = o.OrderDate.slice(0, 7);
        orderMonth[o.OrderID] = m;
        orderChannel[o.OrderID] = o.Channel;
        if (includeOrders && channelOk(o.Channel)) salesByMonth[m] = (salesByMonth[m] || 0) + parseFloat(o.OrderTotal || 0);
      }
      if (includeRentals) for (const r of rentals) {
        const m = (r.RentalDate || '').slice(0, 7);
        if (m) rentByMonth[m] = (rentByMonth[m] || 0) + parseFloat(r.RentalRevenue || 0);
      }
      // Gross margin only applies to product sales, not rentals.
      const lineRevByMonth = {}, lineCostByMonth = {};
      if (segment !== 'rental') for (const l of lines) {
        const m = orderMonth[l.OrderID]; if (!m || !channelOk(orderChannel[l.OrderID])) continue;
        lineRevByMonth[m]  = (lineRevByMonth[m]  || 0) + parseFloat(l.LineRevenue || 0);
        lineCostByMonth[m] = (lineCostByMonth[m] || 0) + parseFloat(l.LineCost || 0);
      }

      // Continuous month sequence, filling any interior gaps with 0.
      const monthsSet = new Set([...Object.keys(salesByMonth), ...Object.keys(rentByMonth)]);
      const sorted = [...monthsSet].sort();
      const cont = [];
      for (let m = sorted[0]; m <= sorted[sorted.length - 1]; m = addMonths(m, 1)) cont.push(m);

      let series = cont.map(m => ({
        month:   m,
        revenue: +(((salesByMonth[m] || 0) + (rentByMonth[m] || 0))).toFixed(2),
        lineRev: lineRevByMonth[m] || 0,
        lineCost: lineCostByMonth[m] || 0,
      }));

      // Drop trailing incomplete months (e.g. the current partial month, or a
      // stray month with only a couple of web orders) — a trailing month is
      // "incomplete" if it's below 25% of the median of the prior 6 months.
      while (series.length > 13) {
        const last = series[series.length - 1].revenue;
        const med  = fcMedian(series.slice(-7, -1).map(s => s.revenue));
        if (med > 0 && last < 0.25 * med) series.pop(); else break;
      }

      const history = series.map(s => ({
        month:   s.month,
        revenue: s.revenue,
        margin:  s.lineRev > 0 ? +(((s.lineRev - s.lineCost) / s.lineRev) * 100).toFixed(1) : null,
      }));

      const y = series.map(s => s.revenue);
      const n = y.length;
      const lastMonth = series[n - 1].month;
      const btStart = n > 2 * SEASON + 6 ? 2 * SEASON : Math.min(SEASON + 1, Math.floor(n / 2));
      const futureMonths = [];
      for (let h = 1; h <= FC_HMAX; h++) futureMonths.push(addMonths(lastMonth, h));

      const build = (name, key, r) => {
        // Projected next-12-months total, with a range derived from the sum of
        // per-month forecast variances (√Σσ²).
        const h12 = Math.min(12, FC_HMAX);
        let tot = 0, varSum = 0;
        for (let i = 0; i < h12; i++) { tot += r.means[i]; varSum += r.se[i] * r.se[i]; }
        const totSe = Math.sqrt(varSum);
        return {
          key, name, mape: r.mape,
          forecast: futureMonths.map((m, i) => ({
            month: m,
            mean: +r.means[i].toFixed(2),
            lo80: +Math.max(0, r.means[i] - FC_Z80 * r.se[i]).toFixed(2),
            hi80: +(r.means[i] + FC_Z80 * r.se[i]).toFixed(2),
            lo95: +Math.max(0, r.means[i] - FC_Z95 * r.se[i]).toFixed(2),
            hi95: +(r.means[i] + FC_Z95 * r.se[i]).toFixed(2),
          })),
          next12: {
            total: +tot.toFixed(0),
            lo: +Math.max(0, tot - FC_Z80 * totSe).toFixed(0),
            hi: +(tot + FC_Z80 * totSe).toFixed(0),
          },
        };
      };

      const linear   = fcLinear(y, FC_HMAX, btStart);
      const seasonal  = fcSeasonalNaive(y, FC_HMAX, btStart);
      const holtw     = fcHoltWinters(y, FC_HMAX, btStart);
      const ensemble  = fcEnsemble(y, FC_HMAX, btStart, [linear, seasonal, holtw]);

      const models = [
        build('Linear Trend',   'linear',      linear),
        build('Seasonal Naive', 'seasonal',    seasonal),
        build('Holt-Winters',   'holtwinters', holtw),
        build('Ensemble Blend', 'ensemble',    ensemble),
      ];

      const SEGMENT_LABELS = {
        all:      'Total revenue (sales + rentals)',
        shipping: 'Shipping (online) sales',
        instore:  'In-store sales',
        rental:   'Rental revenue',
      };
      return res.json({
        segment, segmentLabel: SEGMENT_LABELS[segment],
        hasMargin: segment !== 'rental',
        target: SEGMENT_LABELS[segment],
        history, lastMonth, horizonMax: FC_HMAX, models,
      });
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
      // Return every order in range (the client paginates); fetch the whole
      // customer table once and join in memory rather than .in(custIds),
      // which with thousands of distinct customers would overflow the URL.
      const [orders, cores] = await Promise.all([
        fetchAll(() => sb.from('Orders')
          .select('OrderID,OrderDate,CustID,OrderTotal,Channel,ShippingFee,PaymentMethod')
          .gte('OrderDate', dateFrom).lte('OrderDate', dateTo)
          .order('OrderDate', { ascending: false })),
        fetchAll(() => sb.from('Customers_Core').select('CustomerID,FirstName,LastName,Country')),
      ]);

      const custMap = {};
      for (const c of cores) custMap[c.CustomerID] = { name:c.FirstName+' '+c.LastName, country:c.Country, id:c.CustomerID };

      return res.json({
        orders: orders.map(o=>({
          ...o,
          customerName:   custMap[o.CustID]?.name    || '—',
          customerId:     custMap[o.CustID]?.id       || null,
          country:        custMap[o.CustID]?.country  || '—',
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

      const loyaltyTotal = customers.filter(c => c.loyalty).length;
      return res.json({
        customers,
        loyaltyAvgLTV:   avgLTV(loyaltyOrders).toFixed(2),
        noLoyaltyAvgLTV: avgLTV(noLoyaltyOrders).toFixed(2),
        // Counts over ALL customers so loyalty + non-loyalty = total.
        loyaltyTotal,
        nonLoyaltyTotal: customers.length - loyaltyTotal,
        // Counts limited to customers who have ordered (the LTV denominator).
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
        sb.from('products').select('sku,category,name').limit(5000),
      ]);

      const skuCat = {}, skuName = {};
      for (const p of (productsRes.data||[])) { skuCat[p.sku] = p.category; skuName[p.sku] = p.name; }

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

      // ── Fleet utilization ────────────────────────────────────
      // Each transaction's unit-days rented = RentalRevenue / DailyRate
      // (DailyRate is per unit per day). "Avg units out per day" over the
      // period is the utilization proxy — how hard each item works.
      let minD = null, maxD = null;
      for (const r of allRentals) { if (!minD || r.RentalDate < minD) minD = r.RentalDate; if (!maxD || r.RentalDate > maxD) maxD = r.RentalDate; }
      const periodDays = (minD && maxD) ? Math.max(1, Math.round((new Date(maxD) - new Date(minD)) / 864e5) + 1) : 1;

      const util = {};
      for (const r of allRentals) {
        const dr = parseFloat(r.DailyRate || 0);
        const unitDays = dr > 0 ? parseFloat(r.RentalRevenue || 0) / dr : (r.Quantity || 0);
        if (!util[r.SKU]) util[r.SKU] = { sku: r.SKU, txns: 0, units: 0, unitDays: 0, revenue: 0, returned: 0 };
        const u = util[r.SKU];
        u.txns++; u.units += r.Quantity || 0; u.unitDays += unitDays;
        u.revenue += parseFloat(r.RentalRevenue || 0);
        if (r.Returned === 'Yes') u.returned++;
      }
      const utilization = Object.values(util).map(u => ({
        sku: u.sku, name: skuName[u.sku] || u.sku, category: skuCat[u.sku] || 'Other',
        txns: u.txns, units: u.units,
        unitDays:      Math.round(u.unitDays),
        revenue:       +u.revenue.toFixed(2),
        avgLength:     +(u.unitDays / Math.max(1, u.units)).toFixed(1),
        avgUnitsOut:   +(u.unitDays / periodDays).toFixed(2),
        revenuePerDay: +(u.revenue / periodDays).toFixed(2),
        returnRate:    +(u.returned / u.txns * 100).toFixed(0),
      })).sort((a, b) => b.avgUnitsOut - a.avgUnitsOut);

      return res.json({ totalRev:totalRev.toFixed(2), totalTransactions:allRentals.length, returnRate, topRentals, monthly, byCategory, overallPct, utilization, periodDays });
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

    // ── Employees / Labor ────────────────────────────────────
    if (section === 'employees') {
      // No staff table exists — attribute activity via the SalesAssociate code
      // recorded on each order and rental (E001-E004 are people; WEB is online).
      const [orders, rentals] = await Promise.all([
        fetchAll(() => sb.from('Orders').select('SalesAssociate,OrderDate,OrderTotal,Channel')
          .gte('OrderDate', dateFrom).lte('OrderDate', dateTo)),
        fetchAll(() => sb.from('RentalTransactions').select('SalesAssociate,RentalDate,RentalRevenue,Quantity')
          .gte('RentalDate', dateFrom).lte('RentalDate', dateTo)),
      ]);

      const emp = {};
      const get = id => emp[id] || (emp[id] = { id, orders: 0, salesRev: 0, rentals: 0, rentalRev: 0, months: new Set() });
      for (const o of orders) { const e = get(o.SalesAssociate || '—'); e.orders++; e.salesRev += parseFloat(o.OrderTotal || 0); e.months.add(o.OrderDate.slice(0, 7)); }
      for (const r of rentals) { const e = get(r.SalesAssociate || '—'); e.rentals++; e.rentalRev += parseFloat(r.RentalRevenue || 0); e.months.add(r.RentalDate.slice(0, 7)); }

      const employees = Object.values(emp).map(e => ({
        id: e.id,
        isWeb: e.id === 'WEB',
        orders: e.orders,
        salesRevenue: +e.salesRev.toFixed(2),
        rentals: e.rentals,
        rentalRevenue: +e.rentalRev.toFixed(2),
        totalRevenue: +(e.salesRev + e.rentalRev).toFixed(2),
        avgOrderValue: e.orders ? +(e.salesRev / e.orders).toFixed(2) : 0,
        activeMonths: e.months.size,
      })).sort((a, b) => b.totalRevenue - a.totalRevenue);

      const periodDays = Math.max(1, Math.round((new Date(dateTo) - new Date(dateFrom)) / 864e5) + 1);
      return res.json({ employees, periodDays, from: dateFrom, to: dateTo });
    }

    // ── Inventory ────────────────────────────────────────────
    if (section === 'inventory') {
      const [prodsRes, invRes, orders, lines] = await Promise.all([
        sb.from('products').select('sku,name,category,subcategory,price,availability'),
        sb.from('Inventory').select('*').then(r=>r).catch(()=>({ data:[] })),
        fetchAll(() => sb.from('Orders').select('OrderID,OrderDate')),
        fetchAll(() => sb.from('OrderLines').select('OrderID,ProductCode,Quantity')),
      ]);

      const invMap = {};
      for (const i of (invRes.data||[])) invMap[i.SKU] = i;
      const { demand, nextMonth } = computeSkuDemand(orders, lines);

      const products = (prodsRes.data||[])
        .filter(p => p.availability !== 'Rental only')
        .map(p => {
          const d = demand[p.sku] || { forecastUnits: 0, suggestedStock: 0, suggestedReorder: 1 };
          const stockQty = invMap[p.sku] != null ? invMap[p.sku].StockQty : null;
          return {
            sku:          p.sku,
            name:         p.name,
            category:     p.category,
            price:        p.price,
            stockQty,
            reorderLevel: invMap[p.sku] != null ? invMap[p.sku].ReorderLevel : 5,
            lastUpdated:  invMap[p.sku]?.LastUpdated ?? null,
            // Forecast-driven fields
            forecastUnits:    d.forecastUnits,
            suggestedStock:   d.suggestedStock,
            suggestedReorder: d.suggestedReorder,
            // Will the current stock cover the forecast month's demand?
            coversForecast:   stockQty != null ? stockQty >= d.forecastUnits : null,
            status:       invMap[p.sku] == null        ? 'untracked'
                        : invMap[p.sku].StockQty === 0 ? 'stockout'
                        : invMap[p.sku].StockQty <= invMap[p.sku].ReorderLevel ? 'low'
                        : 'ok',
          };
        });

      const stockouts  = products.filter(p=>p.status==='stockout').length;
      const lowStock   = products.filter(p=>p.status==='low').length;
      const untracked  = products.filter(p=>p.status==='untracked').length;
      // Products whose forecast demand exceeds what's on the shelf.
      const underStocked = products.filter(p => p.stockQty != null && p.forecastUnits > 0 && p.stockQty < p.forecastUnits).length;
      const topDemand = [...products].sort((a,b)=>b.forecastUnits-a.forecastUnits).slice(0,10)
        .map(p=>({ sku:p.sku, name:p.name, forecastUnits:p.forecastUnits, stockQty:p.stockQty, suggestedStock:p.suggestedStock }));

      return res.json({ products, stockouts, lowStock, untracked, underStocked, topDemand, forecastMonth: nextMonth });
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
      // Gross margin is a product-level metric: compare COGS to the revenue of
      // the same lines (LineRevenue), NOT to OrderTotal. OrderTotal bundles in
      // shipping fees and any orders that have no line detail, which would
      // otherwise inflate margin (e.g. web orders whose line items are missing).
      const productRevenue = lines.reduce((s,l)=>s+parseFloat(l.LineRevenue||0),0);
      const grossProfit   = productRevenue - cogs;
      const grossMargin   = productRevenue > 0 ? grossProfit/productRevenue*100 : 0;
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

      // Monthly product revenue + cost (line-based, to keep the Revenue bar,
      // Gross Profit bar, and margin line all on the same consistent basis).
      const monthlyMap = {};
      for (const o of orders) {
        const m = o.OrderDate.slice(0,7);
        if (!monthlyMap[m]) monthlyMap[m] = { revenue:0, cost:0 };
      }
      const orderDateMap = {};
      for (const o of orders) orderDateMap[o.OrderID] = o.OrderDate.slice(0,7);
      for (const l of lines) {
        const m = orderDateMap[l.OrderID];
        if (!m || !monthlyMap[m]) continue;
        monthlyMap[m].revenue += parseFloat(l.LineRevenue||0);
        monthlyMap[m].cost    += parseFloat(l.LineCost||0);
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
