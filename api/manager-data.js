const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tukwikdsvjqlyyegdaak.supabase.co';

function validToken(token) {
  const correct = process.env.MANAGER_PASSWORD;
  if (!correct || !token) return false;
  const day = new Date().toISOString().slice(0, 10);
  const expected = crypto.createHmac('sha256', correct).update(day).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  const token = req.headers['x-manager-token'] || '';
  if (!validToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  const section = req.query.section || 'dashboard';
  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

  try {
    if (section === 'dashboard') {
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

      const [ordersRes, linesRes, customersRes] = await Promise.all([
        supabase.from('Orders').select('OrderID, OrderDate, CustID, OrderTotal, Channel').order('OrderDate', { ascending: false }).limit(50),
        supabase.from('OrderLines').select('ProductCode, Quantity, UnitPrice, LineRevenue'),
        supabase.from('Customers_Core').select('CustomerID, JoinDate'),
      ]);

      const allOrders = ordersRes.data || [];
      const weekOrders = allOrders.filter(o => o.OrderDate >= weekAgo);
      const revenueThisWeek = weekOrders.reduce((s, o) => s + parseFloat(o.OrderTotal || 0), 0);

      // Top seller by units
      const unitsByProduct = {};
      for (const l of (linesRes.data || [])) {
        unitsByProduct[l.ProductCode] = (unitsByProduct[l.ProductCode] || 0) + l.Quantity;
      }
      const topSku = Object.entries(unitsByProduct).sort((a, b) => b[1] - a[1])[0];

      // Join customer names
      const custMap = {};
      const custIds = [...new Set(allOrders.slice(0, 10).map(o => o.CustID).filter(Boolean))];
      if (custIds.length) {
        const { data: cores } = await supabase.from('Customers_Core').select('CustomerID, FirstName, LastName').in('CustomerID', custIds);
        const { data: contacts } = await supabase.from('Customers_Contact').select('CustomerID, Email').in('CustomerID', custIds);
        for (const c of (cores || [])) custMap[c.CustomerID] = { name: c.FirstName[0] + '. ' + c.LastName };
        for (const c of (contacts || [])) if (custMap[c.CustomerID]) custMap[c.CustomerID].email = c.Email;
      }

      const recentOrders = allOrders.slice(0, 10).map(o => ({
        ...o,
        customerDisplay: custMap[o.CustID]?.name || o.CustID || 'Guest',
      }));

      return res.json({
        ordersThisWeek: weekOrders.length,
        revenueThisWeek: revenueThisWeek.toFixed(2),
        topSeller: topSku ? topSku[0] : '—',
        topSellerUnits: topSku ? topSku[1] : 0,
        recentOrders,
        totalCustomers: (customersRes.data || []).length,
      });
    }

    if (section === 'orders') {
      const { data: orders } = await supabase.from('Orders')
        .select('OrderID, OrderDate, CustID, OrderTotal, Channel, ShippingFee, PaymentMethod')
        .order('OrderDate', { ascending: false })
        .limit(200);

      const custIds = [...new Set((orders || []).map(o => o.CustID).filter(Boolean))];
      const custMap = {};
      if (custIds.length) {
        const { data: cores } = await supabase.from('Customers_Core').select('CustomerID, FirstName, LastName, Country').in('CustomerID', custIds);
        for (const c of (cores || [])) custMap[c.CustomerID] = { name: c.FirstName + ' ' + c.LastName, country: c.Country };
      }

      return res.json({
        orders: (orders || []).map(o => ({
          ...o,
          customerName: custMap[o.CustID]?.name || '—',
          country: custMap[o.CustID]?.country || '—',
        }))
      });
    }

    if (section === 'customers') {
      const [coreRes, contactRes, ordersRes] = await Promise.all([
        supabase.from('Customers_Core').select('*').order('JoinDate', { ascending: false }),
        supabase.from('Customers_Contact').select('*'),
        supabase.from('Orders').select('CustID, OrderTotal'),
      ]);

      const contactMap = {};
      for (const c of (contactRes.data || [])) contactMap[c.CustomerID] = c;

      const ordersByCustomer = {};
      for (const o of (ordersRes.data || [])) {
        if (!ordersByCustomer[o.CustID]) ordersByCustomer[o.CustID] = { count: 0, total: 0 };
        ordersByCustomer[o.CustID].count++;
        ordersByCustomer[o.CustID].total += parseFloat(o.OrderTotal || 0);
      }

      return res.json({
        customers: (coreRes.data || []).map(c => ({
          ...c,
          email: contactMap[c.CustomerID]?.Email || '—',
          loyalty: contactMap[c.CustomerID]?.LoyaltyMember || false,
          orderCount: ordersByCustomer[c.CustomerID]?.count || 0,
          lifetimeValue: (ordersByCustomer[c.CustomerID]?.total || 0).toFixed(2),
        }))
      });
    }

    if (section === 'products') {
      const { data: lines } = await supabase.from('OrderLines').select('ProductCode, Quantity, LineRevenue');

      const byProduct = {};
      for (const l of (lines || [])) {
        if (!byProduct[l.ProductCode]) byProduct[l.ProductCode] = { sku: l.ProductCode, units: 0, revenue: 0 };
        byProduct[l.ProductCode].units += l.Quantity;
        byProduct[l.ProductCode].revenue += parseFloat(l.LineRevenue || 0);
      }

      return res.json({
        products: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue)
      });
    }

    return res.status(400).json({ error: 'Unknown section' });

  } catch (err) {
    console.error('Manager data error:', err.message);
    return res.status(500).json({ error: 'Data fetch failed' });
  }
};
