-- Inventory table for stock tracking
CREATE TABLE IF NOT EXISTS "Inventory" (
  "SKU"          text PRIMARY KEY REFERENCES products(sku),
  "StockQty"     integer NOT NULL DEFAULT 0 CHECK ("StockQty" >= 0),
  "ReorderLevel" integer NOT NULL DEFAULT 5 CHECK ("ReorderLevel" >= 0),
  "LastUpdated"  timestamptz DEFAULT now()
);
ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;
-- No public-facing policies; manager API uses service_role key only

SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
