# BOS UI enhancements - 2026-09-02

## Scope

This pass continues the local BOS redesign and focuses on operational readability across desktop, tablet, and mobile. Dashboard calculation and Sendit reconciliation changes are documented separately in `docs/DASHBOARD_RECONCILIATION_2026-09-02.md`.

## Before / after

| Area | Before | After |
| --- | --- | --- |
| Shared page headers | Actions wrapped differently on each page; primary actions could appear last on mobile | `PageHead` exposes stable responsive hooks; actions use a horizontal rail and the primary action is shown first |
| Visual system | Cards used radii up to 16px and titles used negative tracking | Cards use an 8px maximum radius and shared display titles use neutral tracking |
| Orders on mobile | The reduced table still overflowed its container and required horizontal panning | A 3-column view shows client/order reference, status, and revenue in 351px |
| Orders on tablet | The 1196px desktop table was placed inside a 709-769px viewport | A 6-column tablet view keeps client, product, order status, delivery status, revenue, and date visible without horizontal scrolling |
| Products on mobile | A 738px table and four full-width KPI cards delayed access to product data | A 351px product/cost/margin table plus a 2x2 KPI grid keeps the useful data above the fold |
| Sendit on mobile | The 799px reconciliation table hid product matching and actions off-screen | Each shipment becomes a 351px reconciliation card with client, COD, city, date, Sendit product, state, and actions |
| Inventory on mobile | The main table was 772px wide and the tab row overflowed without a clear pattern | A 351px operational view keeps product, stock, purchase quantity, and adjustment action; tabs use a deliberate scroll rail |
| Touch interaction | Several page actions stayed at desktop control height | Mobile page actions now have a minimum 42px target |
| Dashboard basis switch | Only part of the dashboard changed, so one screen mixed delivery-date and creation-date figures | Revenue, P&L, chart, rankings, ROAS, reconciliation, and export now switch together; cohort-only metrics are labelled |
| Historical goals | July displayed September's goals and still exposed edit controls | Goals follow the viewed week/month; historical targets are locked and clearly dated |
| Chart comparison | Calendar-month comparisons could cross the prior month boundary | Full-month comparisons use exact calendar boundaries and safely clamp shorter months/leap years |

## Files changed in this pass

- `components/PageHead.tsx`
- `components/RevenueTrendChart.tsx`
- `app/design-tokens.css`
- `app/orders/page.tsx`
- `app/products/page.tsx`
- `app/sendit/page.tsx`
- `app/inventory/page.tsx`

## Responsive verification

- Mobile: 390px browser inspection and overflow measurements for Orders, Products, Sendit, and Inventory.
- Tablet: 768px and 1024px inspection for the Orders workflow.
- Desktop: 1366px inspection for Dashboard, Orders, Products, Sendit, and Inventory.
- All adapted tables finish at the edge of their content container with no page-level horizontal overflow.
- The dashboard chart now starts with a valid measured fallback size, avoiding Recharts `-1` dimension warnings during first render and responsive transitions.

## Technical verification

- `npm run type-check`: passed.
- Targeted ESLint: 0 errors; 29 existing warnings remain in Orders, Products, and Inventory.
- `npm run build`: passed; 97 static pages generated.
- Existing Next.js warning remains: migrate the deprecated `middleware` convention to `proxy` in a separate backend-focused change.

## Remaining UI work

- Apply the mobile table/card treatment to Customers, Leads, Reviews, and secondary Inventory tabs.
- Unify toast, error, empty, and loading feedback across all operational pages.
- Audit keyboard focus order and screen-reader labels on modal and drawer workflows.
- Resolve the existing React hook and image optimization lint warning backlog separately from visual changes.
