-- RentalTransactions
CREATE TABLE IF NOT EXISTS "RentalTransactions" (
  "RentalID"       text PRIMARY KEY,
  "RentalDate"     date NOT NULL,
  "CustID"         text REFERENCES "Customers_Core"("CustomerID"),
  "LocationID"     text NOT NULL,
  "SalesAssociate" text NOT NULL,
  "SKU"            text NOT NULL REFERENCES products(sku),
  "Quantity"       integer NOT NULL CHECK ("Quantity" >= 1),
  "DailyRate"      numeric(10,2) NOT NULL,
  "RentalRevenue"  numeric(10,2) NOT NULL,
  "Returned"       text
);
ALTER TABLE "RentalTransactions" ENABLE ROW LEVEL SECURITY;

-- Promotions
CREATE TABLE IF NOT EXISTS "Promotions" (
  "PromoCode"   text PRIMARY KEY,
  "PromoName"   text NOT NULL,
  "PromoType"   text,
  "DiscountPct" numeric(5,2),
  "StartDate"   date,
  "EndDate"     date,
  "Channel"     text
);
ALTER TABLE "Promotions" ENABLE ROW LEVEL SECURITY;

-- OrderPromotions
CREATE TABLE IF NOT EXISTS "OrderPromotions" (
  "OrderID"   text NOT NULL REFERENCES "Orders"("OrderID") ON DELETE CASCADE,
  "PromoCode" text NOT NULL REFERENCES "Promotions"("PromoCode"),
  PRIMARY KEY ("OrderID", "PromoCode")
);
ALTER TABLE "OrderPromotions" ENABLE ROW LEVEL SECURITY;

SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
