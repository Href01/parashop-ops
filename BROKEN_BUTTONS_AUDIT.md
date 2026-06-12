# BOS UI / Tool State Audit

Last updated: 2026-06-08

## Fixed In This Pass

- Orders page search now filters by order id, order number, customer, phone, city, channel, and product names.
- Orders status pills now filter: All, Pending, No shipment, Incomplete.
- Orders date control now cycles Today, This week, 30 days, All time.
- Orders pagination now pages through filtered results.
- Orders "Sync Sendit" now calls `/api/ops/orders/sync-sendit`.
- Products pagination now pages through result sets.
- Products row action now opens the cost editor instead of doing nothing.
- Campaign and event creation now redirect using API-returned IDs.
- Campaign/event API sorting now uses whitelisted columns.
- Major app sections now have authenticated layouts.
- Sendit shipment creation now sends real product names and quantities in the `products` field instead of generic order/item text.
- Sendit COD now defaults to the order total unless the payment method is explicitly prepaid.
- Sendit tracking sync now stores in-transit statuses and maps final statuses from the current Sendit status set.
- Sendit city/district selection now saves and sends the selected `senditDistrictId`; shipment creation no longer guesses unknown city text as Casablanca Fida.
- Campaign APIs now tolerate the live storefront schema (`slug`, `active`, `startsAt`, `endsAt`) and return safe zero metrics when ops analytics tables are absent.
- Event APIs now return an explicit not-installed state instead of raw 500s when event tables are not present.
- Dashboard KPIs now use live order financials: booked revenue/profit only from `CONFIRMED` and `DELIVERED` orders, order pipeline from valid local statuses, real `sourceChannel` mix, and conservative profit when cost data is missing.
- Static sidebar badge counts were removed until they can be backed by live stats.

## Still Missing

### Dashboard

- Global search in the top bar is still decorative.
- Notifications bell has no dropdown or read state.
- Founder avatar has no account menu.
- Dashboard API has a fallback, but production still needs monitoring for "Executive dashboard unavailable" cases.

### Orders

- Filters are client-side over the latest 100 API rows; server-side search/date pagination is still needed for larger order volume.
- Bulk select checkboxes are visual only.
- Delete still uses a browser confirm/alert flow instead of a proper modal/toast pattern.

### Products

- Row actions only open cost editing; full product actions/detail view are still missing.
- Pagination is client-side over the latest 100 API rows.
- Add product sends founders to the storefront admin instead of a BOS-native product flow.

### Inventory

- Add stock is still a placeholder alert.
- Stock adjustments need a real movement form tied to `/api/ops/inventory/movement`.

### Customers

- Add customer is still a placeholder because customers are currently created through orders.
- Customer detail/actions should be checked against current workflows.

### Content Hub

- New content and Add card actions are placeholder alerts.
- Calendar/table views are UI-only placeholders unless wired elsewhere.

### Work Hub

- New task and Decision log actions are placeholder alerts.
- Task persistence is not implemented.

## Engineering Follow-Ups

- Move all `/api/ops/*` routes to the shared `getOpsSession()` founder guard.
- Add E2E coverage for core flows: sign in, dashboard, create order, confirm order, create Sendit, sync Sendit, campaign/event creation.
- Add server-side pagination/filtering to Orders and Products APIs.
- Replace alert/confirm calls with consistent modal and toast components.
- Decide whether to install the planned event/marketing analytics tables (`Event`, `EventMetrics`, `EventProduct`, `EventCategory`, `CampaignMetrics`, `CampaignCost`) or keep the ops UI in compatibility mode with the storefront campaign schema.
- Fill missing product cost prices so dashboard profit/margin can be fully accurate for legacy delivered orders.
- Resolve the ESLint warning backlog instead of keeping it suppressed to warnings.
