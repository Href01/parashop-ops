const TZ = 'Africa/Casablanca'

/** A conversion is anchored on a product view, not an unrelated cart event.
 * Parameters $1/$2 are the report dates. The same session and same product
 * must reach cart after the view and before the reporting window ends. */
export const PRODUCT_VIEW_CONVERTED_SQL = `e.name = 'PRODUCT_VIEW_DETAIL' AND EXISTS (
  SELECT 1 FROM "AnalyticsEvent" added
  WHERE added.name = 'PRODUCT_ADD_TO_CART'
    AND added."sessionId" = e."sessionId"
    AND COALESCE(NULLIF(added.props->>'productId', ''), NULLIF(added.props->>'id', ''))
      = COALESCE(NULLIF(e.props->>'productId', ''), NULLIF(e.props->>'id', ''))
    AND added."createdAt" >= e."createdAt"
    AND (added."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
)`

/** Shared by all three legacy product reports. Return session counts so one
 * repeated click or multiple units never creates a conversion above 100%. */
export function productFunnelCtes(viewColumn: 'views' | 'view_count' = 'views', cartColumn: 'carts' | 'cart_count' = 'carts') {
  return `views AS (
    SELECT (e.props->>'productId')::int AS pid,
      COUNT(DISTINCT e."sessionId")::int AS ${viewColumn},
      COUNT(DISTINCT e."sessionId") FILTER (WHERE ${PRODUCT_VIEW_CONVERTED_SQL})::int AS converted_sessions
    FROM "AnalyticsEvent" e
    WHERE e.name = 'PRODUCT_VIEW_DETAIL'
      AND (e."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
      AND e.props->>'productId' ~ '^[0-9]+$'
    GROUP BY 1
  ), carts AS (SELECT pid, converted_sessions AS ${cartColumn} FROM views)`
}
