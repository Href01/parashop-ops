-- Migration 019: capture the payment method on Sendit staging rows.
-- A 'VIREMENT' (bank transfer) order is prepaid, so its Sendit COD is 0. The
-- promote step then writes codAmount = NULL + total = products + charged delivery,
-- so calculate_order_profit()'s COALESCE(codAmount, total, revenue) lands on the
-- real cash received instead of 0 (which made the dashboard show a loss).
ALTER TABLE "SenditStaging"
  ADD COLUMN IF NOT EXISTS "paymentMethod" VARCHAR(20) NOT NULL DEFAULT 'COD';
