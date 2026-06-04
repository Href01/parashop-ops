# UI Design Implementation

## Source

The current operations UI was aligned against the Claude export provided in `ops management.zip`:

- `Dashboard.html`
- `Orders.html`
- `New Order.html`
- `Order Detail.html`
- `Products.html`
- `Sign In.html`
- `Campaigns.html`
- `Content Hub.html`
- `Work Hub.html`
- `assets/bos.css`

## What changed

- Added a shared BOS shell in `components/BosShell.tsx` for sidebar, topbar, navigation state, and founders footer.
- Restyled the dashboard with the Claude BOS dark command-center visual system.
- Rebuilt Orders, New Order, Order Detail, Products, and Sign In screens around the Claude layouts while keeping existing app data flows.
- Added protected Campaigns, Content Hub, and Work Hub pages to match the Claude design surface.
- Extended `app/globals.css` with the BOS table, toolbar, form, auth, kanban, campaign, work hub, and responsive styles.

## Data behavior

- Dashboard, Orders, New Order, Order Detail, Products, and Sign In are wired to existing APIs/auth behavior.
- Campaigns, Content Hub, and Work Hub currently use static operational sample data because matching backend models/APIs do not exist yet.

## Routes covered

- `/`
- `/orders`
- `/orders/new`
- `/orders/[id]`
- `/products`
- `/auth/signin`
- `/campaigns`
- `/content`
- `/work-hub`

## Notes

- Orders and products layouts now only enforce operations access; page chrome is provided by `BosShell`.
- Product cost editing still uses the existing `EditCostPriceModal`.
- The design system keeps IBM Plex Sans/Mono, rose brand accent, dense tables, dark panels, and semantic profit/loss colors from the Claude export.
