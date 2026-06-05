-- Performance indexes for Order table (dashboard optimization)
-- Migration: 006_add_order_performance_indexes.sql

-- Critical index for all date-range queries (most important!)
CREATE INDEX IF NOT EXISTS "idx_order_created_at" ON "Order"("createdAt" DESC);

-- Index for status filtering (pipeline, alerts, delivery stats)
CREATE INDEX IF NOT EXISTS "idx_order_status" ON "Order"("status");

-- Composite index for date + status queries (covers 80% of dashboard queries)
CREATE INDEX IF NOT EXISTS "idx_order_created_status" ON "Order"("createdAt" DESC, "status");

-- Index for city aggregations (top cities widget)
CREATE INDEX IF NOT EXISTS "idx_order_delivery_city" ON "Order"("deliveryCity");

-- Index for order items join performance
CREATE INDEX IF NOT EXISTS "idx_order_item_order_id" ON "OrderItem"("orderId");

-- Index for product joins in top products query
CREATE INDEX IF NOT EXISTS "idx_order_item_product_id" ON "OrderItem"("productId");

-- Comment explaining the optimization
COMMENT ON INDEX "idx_order_created_at" IS 'Dashboard date-range queries - primary performance index';
COMMENT ON INDEX "idx_order_created_status" IS 'Composite index for date+status filters - covers most dashboard queries';
