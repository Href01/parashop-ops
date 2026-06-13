-- Migration 007: Create calculate_event_metrics function
-- Date: 2026-06-13
-- Fix: "Recalculate impact" button was calling non-existent function

CREATE OR REPLACE FUNCTION calculate_event_metrics(p_event_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_event RECORD;
  v_total_orders INTEGER;
  v_total_revenue DECIMAL(10,2);
  v_total_units INTEGER;
  v_normal_revenue DECIMAL(10,2);
  v_normal_orders INTEGER;
BEGIN
  -- Get event dates
  SELECT "startDate", "endDate" INTO v_event
  FROM "Event" WHERE id = p_event_id;

  -- Get event period performance (eventId OR date range)
  SELECT
    COUNT(*),
    COALESCE(SUM(total), 0),
    COALESCE(SUM(oi.quantity), 0)
  INTO v_total_orders, v_total_revenue, v_total_units
  FROM "Order" o
  LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
  WHERE (o."eventId" = p_event_id OR o."createdAt" BETWEEN v_event."startDate" AND v_event."endDate")
    AND o.status IN ('CONFIRMED', 'DELIVERED');

  -- Get normal period performance (same duration before event)
  SELECT
    COUNT(*),
    COALESCE(SUM(total), 0)
  INTO v_normal_orders, v_normal_revenue
  FROM "Order" o
  WHERE o.status IN ('CONFIRMED', 'DELIVERED')
    AND o."createdAt" BETWEEN
      (v_event."startDate" - (v_event."endDate" - v_event."startDate"))
      AND v_event."startDate";

  -- Insert or update metrics
  INSERT INTO "EventMetrics" (
    "eventId",
    "totalOrders",
    "totalRevenue",
    "totalUnits",
    "avgOrderValue",
    "normalPeriodRevenue",
    "normalPeriodOrders",
    "revenueIncrease",
    "ordersIncrease",
    "calculatedAt"
  ) VALUES (
    p_event_id,
    v_total_orders,
    v_total_revenue,
    v_total_units,
    CASE WHEN v_total_orders > 0 THEN v_total_revenue / v_total_orders ELSE 0 END,
    v_normal_revenue,
    v_normal_orders,
    CASE WHEN v_normal_revenue > 0
      THEN ((v_total_revenue - v_normal_revenue) / v_normal_revenue) * 100
      ELSE 0 END,
    CASE WHEN v_normal_orders > 0
      THEN ((v_total_orders - v_normal_orders)::DECIMAL / v_normal_orders) * 100
      ELSE 0 END,
    NOW()
  )
  ON CONFLICT ("eventId") DO UPDATE SET
    "totalOrders" = EXCLUDED."totalOrders",
    "totalRevenue" = EXCLUDED."totalRevenue",
    "totalUnits" = EXCLUDED."totalUnits",
    "avgOrderValue" = EXCLUDED."avgOrderValue",
    "normalPeriodRevenue" = EXCLUDED."normalPeriodRevenue",
    "normalPeriodOrders" = EXCLUDED."normalPeriodOrders",
    "revenueIncrease" = EXCLUDED."revenueIncrease",
    "ordersIncrease" = EXCLUDED."ordersIncrease",
    "calculatedAt" = EXCLUDED."calculatedAt";
END;
$$ LANGUAGE plpgsql;
