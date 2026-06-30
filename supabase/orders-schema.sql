-- ============================================================
-- Rusti Shack — customer and order tables
-- Run this entire file in the Supabase SQL editor.
-- Column names match Rusti's spreadsheet sheets exactly.
-- ============================================================

-- ── Customers_Core ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Customers_Core" (
  "CustomerID"   text        PRIMARY KEY,           -- e.g. CUST000001
  "FirstName"    text        NOT NULL,
  "LastName"     text        NOT NULL,
  "CustomerType" text        NOT NULL DEFAULT 'Retail'
                             CHECK ("CustomerType" IN ('Retail','Wholesale','VIP','Staff')),
  "JoinDate"     date        NOT NULL DEFAULT CURRENT_DATE,
  "City"         text,
  "Country"      text
);

-- §4 SECURITY.md: RLS on immediately; no public access on customer data
ALTER TABLE "Customers_Core" ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies = no access except via secret key.
-- Add role-based policies here when the manager page is built.

-- ── Customers_Contact ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Customers_Contact" (
  "CustomerID"     text    PRIMARY KEY
                           REFERENCES "Customers_Core"("CustomerID") ON DELETE CASCADE,
  "Email"          text    NOT NULL UNIQUE,
  "Phone"          text,
  "LoyaltyMember"  boolean NOT NULL DEFAULT false,
  -- Three address columns new to the web channel (previously lived on courier slips)
  "StreetAddress"  text,
  "Region"         text,   -- state / province
  "PostalCode"     text
);

ALTER TABLE "Customers_Contact" ENABLE ROW LEVEL SECURITY;
-- No public access policies — server-side secret key only.

-- ── Orders ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Orders" (
  "OrderID"        text           PRIMARY KEY,      -- e.g. ORD050006
  "OrderDate"      date           NOT NULL DEFAULT CURRENT_DATE,
  "CustID"         text           REFERENCES "Customers_Core"("CustomerID"),
  "LocationID"     text           NOT NULL,         -- e.g. SHIP-INTL
  "SalesAssociate" text           NOT NULL,         -- WEB for online orders
  "Channel"        text           NOT NULL
                                  CHECK ("Channel" IN ('Shipping','In-Store','Rental')),
  "ShippingFee"    numeric(10,2)  NOT NULL DEFAULT 0
                                  CHECK ("ShippingFee" >= 0),
  "OrderTotal"     numeric(10,2)  NOT NULL
                                  CHECK ("OrderTotal" >= 0),
  "PaymentMethod"  text           NOT NULL
                                  CHECK ("PaymentMethod" IN ('Card','Cash','Transfer','Other'))
);

ALTER TABLE "Orders" ENABLE ROW LEVEL SECURITY;
-- No public access policies — server-side secret key only.

-- ── OrderLines ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "OrderLines" (
  "OrderID"                text          NOT NULL REFERENCES "Orders"("OrderID") ON DELETE CASCADE,
  "LineNumber"             integer       NOT NULL CHECK ("LineNumber" >= 1),
  "ProductCode"            text          NOT NULL REFERENCES products(sku),
  -- §4 SECURITY.md: database enforces impossible states — quantities are positive
  -- whole numbers, prices non-negative, discount bounded 0–100
  "Quantity"               integer       NOT NULL CHECK ("Quantity" >= 1),
  "UnitPrice"              numeric(10,2) NOT NULL CHECK ("UnitPrice" >= 0),
  "DiscountPct"            numeric(5,2)  NOT NULL DEFAULT 0
                                         CHECK ("DiscountPct" >= 0 AND "DiscountPct" <= 100),
  -- Computed columns — database derives these; application code never writes them
  "LineRevenue"            numeric(10,2) GENERATED ALWAYS AS (
                             ROUND(("Quantity" * "UnitPrice" * (1 - "DiscountPct" / 100))::numeric, 2)
                           ) STORED,
  "LineCost"               numeric(10,2),           -- filled by manager / import; null until known
  "EffectiveDiscountAmount" numeric(10,2) GENERATED ALWAYS AS (
                             ROUND(("Quantity" * "UnitPrice" * ("DiscountPct" / 100))::numeric, 2)
                           ) STORED,
  PRIMARY KEY ("OrderID", "LineNumber")
);

ALTER TABLE "OrderLines" ENABLE ROW LEVEL SECURITY;
-- No public access policies — server-side secret key only.

-- ── Verify: list all five tables ────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
