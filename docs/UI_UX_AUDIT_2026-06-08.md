# Shine BOS UI/UX Audit

Date: 2026-06-08
Build reviewed: local production build on `localhost:3002`
Screenshots: `docs/ui-audit-screenshots/`

## Method

- Reviewed the rendered production build, the shared shell, route pages, forms, tables, cards, charts, empty states, and visible loading/error states.
- Captured desktop screenshots at 1920px and 1440px for the full app surface, plus focused 1024px and 390px auth captures.
- Inspected responsive CSS and page source for 1366px, 1024px, 768px, 430px, 390px, 375px, and 360px behavior where screenshot tooling was unstable.
- Benchmarked against Linear, Notion, Stripe, Vercel, Shopify, and Figma standards.

## Design Score

- Desktop: 6.2/10
- Tablet: 4.2/10
- Mobile: 2.8/10
- Overall: 4.6/10

The desktop direction has moments of polish, especially the shell, dashboard atmosphere, content board, and work hub. The product is not yet enterprise-grade because the design system is split, several creation forms are broken, mobile auth is release-blocking, many tables use clashing white headers, and visible data quality artifacts reduce trust.

## Top 50 UI Problems

| # | Severity | Location | Problem | Why it matters | Recommended fix |
|---|---|---|---|---|---|
| 1 | Critical | Auth / mobile sign-in | The 390px sign-in view horizontally overflows; logo and account rows are clipped off-screen. | Blocks mobile sign-in and makes the product feel broken before access. | Rebuild auth as a single-column mobile layout below 900px; remove fixed 430px side column, constrain all children to `max-width: 100%`, and hide/reflow hero stats. |
| 2 | Critical | Campaigns / create campaign form | Labels and inputs overlap; native white inputs sit on a dark panel. | Campaign creation is hard to use and visually broken. | Add a real `.form-grid` and `.form-field` layout, style `.form-input` for dark theme, and use 1-column below 640px. |
| 3 | Critical | Events / create event form | Same overlapping label/input failure as campaign creation. | Event creation looks unfinished and can cause bad input. | Share the fixed form component with campaign creation. |
| 4 | Critical | Customers / KPI cards | Avg LTV displays `NaN MAD`. | Data quality defect destroys trust in customer analytics. | Guard all numeric formatting with `Number.isFinite`, return `0 MAD` or `No data`, and fix API aggregate null handling. |
| 5 | High | Global shell / mobile | Sidebar remains a 64px permanent rail on small screens. | Mobile content width is reduced before the page even starts; thumb navigation is poor. | Replace the rail with a bottom nav or drawer below 760px. |
| 6 | High | Orders, Products, Inventory, Customers, Campaigns, Events tables | Table headers are bright white while the app uses dark terminal surfaces. | Looks like two design systems stitched together. | Create one dark `.tbl` header style and remove light `table-modern` usage inside dark pages. |
| 7 | High | Campaigns list | Active campaign row text is near-black on dark background. | Main row content is almost unreadable. | Force row text to `var(--tx-hi)` or `var(--tx-mid)` and audit inherited `gray-*` classes. |
| 8 | High | Events empty state | Empty-state copy is nearly invisible. | Users cannot understand why the table is empty or what to do next. | Use `var(--tx-hi)` for title, `var(--tx-mid)` for description, and a visible icon color. |
| 9 | High | Products / metric cards | KPI cards are full-width strips with tiny left-aligned values and isolated icons on the far right. | Huge dead space weakens hierarchy and slows scanning. | Use a compact 4-card grid, same as Campaigns/Content, with value, trend, and icon grouped. |
| 10 | High | Inventory / metric cards | Same full-width strip issue as Products. | Operational stats feel sparse and unprofessional. | Reuse a consistent metric-card component. |
| 11 | High | Customers / table rows | Segment and tier render as empty outlined pills for many rows. | Looks like missing data or broken badges. | Render `-` or `Unsegmented` text and provide a neutral badge. |
| 12 | High | Campaign detail / campaign info | Labels and values concatenate: `Period27 mars`, `Total orders0`. | Obvious layout defect in a finance view. | Define `.info-row { display:flex; justify-content:space-between; gap:12px; }`. |
| 13 | High | Order detail / status stepper | Stepper consumes a very large panel height with sparse vertical items. | Wastes prime screen area and pushes order details down. | Use a horizontal progress timeline on desktop and compact vertical list on mobile. |
| 14 | High | Order detail / P&L | Product cost can show `0`, producing a misleading 91.3% margin. | Incorrect visual finance insight can drive bad decisions. | Mark missing costs explicitly and prevent margin confidence styling when cost data is incomplete. |
| 15 | High | Dashboard / data visualization | Main chart has no Y-axis scale, tooltip, goal line, or context. | Users cannot interpret the spike or judge performance. | Add axes, labels, current/previous period comparison, and a hover tooltip. |
| 16 | High | Dashboard / ticker | Ticker repeats the same product symbols with stock-market language. | Feels fake and distracts from business operations. | Replace with real operational alerts or remove until backed by useful data. |
| 17 | High | Global header / search | Search button is decorative. | Violates user expectations and wastes high-value header space. | Implement command palette/global search or remove the faux shortcut. |
| 18 | High | Global header / notifications | Bell has unread dot but no dropdown/read state. | Creates false urgency and poor feedback. | Add notification menu or remove unread indicator. |
| 19 | High | Content and Work Hub | Primary actions show browser alerts/placeholders. | Makes whole modules feel prototype-level. | Disable unavailable features with roadmap notes or implement real flows. |
| 20 | High | Orders / toolbar | Search, filters, reset, and date controls collide visually with table header. | Filtering feels cramped and hard to scan. | Move filters into a separate dark toolbar above the table with consistent heights. |
| 21 | Medium | Orders / stat cards | Six status cards are arranged as two huge columns at 1920px. | Poor density for an ops dashboard. | Use 6 compact cards in a row on wide desktop, 3 columns on tablet, 1 on mobile. |
| 22 | Medium | Products / cost cells | Empty retail/cost fields render as pill outlines or tiny text. | Users cannot tell whether data is zero, missing, or loading. | Use explicit missing states and inline edit affordances. |
| 23 | Medium | Inventory / status filters | Filter tabs are tiny and attached to the table edge. | Tap target and visual grouping are weak. | Place filters in a segmented control with 32-36px height. |
| 24 | Medium | Customers / filters | Segment and tier filters run in one crowded line. | Filtering is hard on tablet and mobile. | Use filter chips that wrap cleanly, or a filter drawer on mobile. |
| 25 | Medium | Auth / tablet | At 1024px, auth brand block clips left and hero/footer collide. | Tablet sign-in looks broken even before mobile. | Add breakpoint-specific hero layout; do not combine brand, hero, and footer in a single horizontal band. |
| 26 | Medium | New order / customer section | Phone icon/input alignment is awkward and field widths feel arbitrary. | Data entry feels less polished than core competitors. | Use two equal columns for name/phone and icon inside the input. |
| 27 | Medium | New order / required city | Required city can sit in `Loading cities...` without retry affordance. | Blocks order creation when Sendit districts fail. | Add inline error, retry button, and disabled submit reason. |
| 28 | Medium | New order / empty products | Empty state is low contrast and too far from the product selector. | Users may miss why totals are empty. | Make empty state tighter and place add guidance near selector. |
| 29 | Medium | Order detail / quick actions | Multiple duplicate actions appear in header and quick actions. | Confusing workflow; user may wonder which action is canonical. | Keep one action area with priority ordering. |
| 30 | Medium | Order detail / Sendit panel | Shipment details start below fold on desktop despite being core order data. | Delivery state is less discoverable. | Move Sendit summary into the right rail near P&L. |
| 31 | Medium | Campaigns / KPI labels | Many campaign values are `0`, but trends say `Review` or `Loss`. | Ambiguous status language. | Add no-data states and definitions for ROAS/ROI. |
| 32 | Medium | Events / zero dashboard | Event KPIs all show zero without explaining the missing event tables/data. | Users cannot distinguish no events from failed analytics. | Show an explicit setup/empty analytics panel. |
| 33 | Medium | Content Hub / kanban | Six columns fit only on wide desktop; mobile requires horizontal scrolling. | Kanban is not mobile-friendly. | Use tabs/swimlane selector on mobile. |
| 34 | Medium | Work Hub / task row | Task rows use dense desktop grid with small checkboxes. | Poor tap targets on mobile. | Convert to stacked task cards below 640px. |
| 35 | Medium | Buttons / global | Mix of `.btn`, `.btn-modern`, shadcn buttons, and inline styles. | Inconsistent affordances and hover/focus behavior. | Standardize on one Button component with variants. |
| 36 | Medium | Inputs / global | Native white inputs appear in campaign/event forms while dark inputs appear elsewhere. | Breaks design-system consistency. | Standardize Input, Select, Textarea components. |
| 37 | Medium | Cards / global | Radii vary across 6px, 8px, 9px, 12px, 14px, 20px, and 24px. | Product lacks a mature component language. | Lock tokens to 6px controls, 8px panels/cards, full pills only for badges. |
| 38 | Medium | Shadows / global | Some panels have heavy glow, others none, some white components use light shadows. | Visual depth is inconsistent. | Define 3 elevation levels and apply by component role. |
| 39 | Medium | Typography / global | Serif dashboard heading conflicts with dense operational UI and table typography. | Brand personality becomes inconsistent. | Reserve serif for brand/sign-in only or remove from ops pages. |
| 40 | Medium | Accessibility / focus | Many inline buttons rely on hover classes and lack strong visible focus. | Keyboard users cannot confidently navigate. | Add consistent `:focus-visible` rings to buttons, links, chips, rows, and icon buttons. |
| 41 | Medium | Accessibility / tap targets | Many icon buttons and chips are 28-32px high. | Fails mobile ergonomic target expectations. | Minimum 40px desktop interactive height, 44px mobile. |
| 42 | Medium | Accessibility / labels | Some controls are visually labelled but not consistently semantic. | Screen reader workflow is weaker. | Use `label htmlFor`, `aria-describedby`, and error ids for all forms. |
| 43 | Medium | Data tables / mobile | Tables rely on `min-width: 860px` and horizontal scroll. | Mobile order/product workflows become spreadsheet-like. | Use responsive row cards for mobile and keep table only on desktop. |
| 44 | Medium | Tables / sticky headers | Sticky table headers inside scroll containers can collide with sticky page header. | Visual layering can become confusing. | Limit sticky table headers to desktop scroll regions and tune z-index/background. |
| 45 | Medium | Status colors | Green, teal, blue, violet, rose, amber, red all compete at similar saturation. | Semantic meaning is diluted. | Reduce palette to primary, success, warning, danger, info, neutral. |
| 46 | Medium | Header live badge | `LIVE` appears globally even for static/demo pages. | Misrepresents data freshness. | Show actual sync age/source, or remove from non-live modules. |
| 47 | Medium | Sidebar footer | `2 online` is static and not tied to presence. | Looks fake in an internal ops product. | Use account menu or remove presence until real. |
| 48 | Low | Dashboard / empty lower viewport | Large blank area below main chart at 1920px. | Wide desktop feels unfinished. | Add secondary panels or reduce chart height. |
| 49 | Low | Product thumbnails | Mixed image aspect/quality in tables. | Product catalog feels less curated. | Normalize image containers and fallback placeholders. |
| 50 | Low | Date localization | Some dates appear French/Moroccan while UI labels are English. | Language inconsistency adds friction. | Choose English, French, or bilingual conventions intentionally. |

## Top 20 UX Problems

1. Critical: Mobile sign-in is broken by horizontal overflow.
2. Critical: Campaign/event creation forms are visually unusable.
3. High: Placeholder alerts appear in Customers, Inventory, Content, and Work Hub.
4. High: Global search looks available but does nothing.
5. High: Notification bell shows unread state but has no interaction.
6. High: Orders use browser confirm/alert for destructive and Sendit sync actions.
7. High: No consistent toast system for success/error feedback.
8. High: Missing data is rendered as `NaN`, blank pills, zero-cost margins, or invisible text.
9. High: Tables are desktop-first and hard to use on tablet/mobile.
10. High: Add Product sends users to an external storefront admin instead of a BOS-native flow.
11. Medium: Dashboard chart lacks definitions and context for operational decision-making.
12. Medium: Sendit/delivery status is split across order status, delivery status, and Sendit status labels.
13. Medium: New order city loading has no retry path.
14. Medium: Multiple duplicated order actions create ambiguity.
15. Medium: Filters are client-side and visually cramped for growth datasets.
16. Medium: Empty states do not consistently explain whether data is absent, loading, failed, or not installed.
17. Medium: Campaign/event detail recalculation gives limited progress/feedback.
18. Medium: Static demo content in Content Hub and Work Hub blurs the line between real and mock data.
19. Medium: No command palette or keyboard shortcuts despite showing `Cmd+K`.
20. Medium: No clear responsive navigation pattern.

## Design System Inconsistencies

- Three competing systems are active: dark BOS globals, `modern-design-system.css` light components, and shadcn/base UI components.
- Buttons exist as `.btn`, `.btn-modern`, shadcn `Button`, icon-only inline buttons, and native buttons with custom styles.
- Inputs exist as `.inp`, `.input-modern`, `.form-input`, shadcn input, and native unstylized inputs.
- Tables exist as `.tbl` and `.table-modern`, with conflicting light/dark headers.
- Cards exist as `.panel`, `.card-modern`, `.kpi`, inline panels, and shadcn Card.
- Color semantics overlap: rose/purple can mean primary, selected, warning, or brand; teal/green both mean positive.
- Radius tokens conflict: `--radius` 9px, `--radius-sm` 6px, `--radius-lg` 14px, modern radius 8/12/16/24px, badge 20px.
- Typography mixes IBM Plex, Geist, Cormorant, Inter token references, and mono numerals without a clear role model.
- Hover/focus behavior differs by component family.

## Mobile-Specific Issues

- Auth is release-blocking on 390px and likely 430/375/360px because the layout overflows horizontally.
- Permanent 64px sidebar leaves too little room for app content.
- Tables require horizontal scrolling and are not converted to cards.
- Kanban has six min-width columns and needs horizontal scrolling.
- Header actions are not reprioritized; search hides, but live/bell/sidebar remain.
- Tap targets often fall below 44px.
- Form grids collapse partially, but campaign/event forms are missing the actual grid styling.
- Browser confirm/alert patterns are especially poor on mobile.
- Sticky elements can consume too much vertical space.

## Tablet Issues

- Auth at 1024px clips the brand area and creates awkward hero/form balance.
- 768px tablet will inherit the collapsed rail plus dense tables, creating a cramped workspace.
- KPI layouts switch inconsistently: some pages use compact grids, others huge strips.
- Content and Work Hub side rails collapse only at 1180px, but inner desktop row layouts still feel dense.
- Topbar search width reduces to 160px at 900px but remains low utility because it is non-functional.

## Accessibility Findings

- Contrast failures are visible in campaign rows, event empty state text, placeholder text, and disabled-looking pills.
- Keyboard focus treatment is inconsistent across inline buttons, chips, rows, and icon controls.
- Several icon buttons have labels, but many semantic relationships between labels, errors, hints, and inputs are not explicit.
- Tables expose dense data but lack mobile alternatives and likely overwhelm screen-reader users.
- Motion effects such as ticker/pulse should respect `prefers-reduced-motion`.
- Color alone carries status meaning in many badges and dots.

## Data Visualization Findings

- Dashboard chart has no Y-axis, no scale, no tooltip, and weak labels.
- Momentum index number `9` has no definition or benchmark.
- Watchlist percentages are visually precise but context-poor.
- Campaign ROAS/ROI zero states do not distinguish no spend, no revenue, missing attribution, or not installed.
- Content metrics look polished but appear static and unconnected to real sources.
- Product trend micro-bars lack axis, timeframe clarity, and accessible labels.

## Quick Wins Under 1 Hour

1. Fix `.info-row` spacing to stop campaign detail label/value concatenation.
2. Guard customer Avg LTV against `NaN`.
3. Replace white table headers with dark theme headers.
4. Increase low-contrast empty state text in Events.
5. Remove or disable global search until implemented.
6. Remove notification unread dot until a dropdown exists.
7. Hide `2 online` or make it an account menu.
8. Add `No data` labels instead of blank pills.
9. Change table column typo `DATA` to `Data completeness`.
10. Add focus-visible ring styles globally.
11. Replace browser `alert` messages with a basic toast helper.
12. Convert `Loading cities...` to include retry/error state.

## High Impact Improvements

1. Build one BOS component library: Button, Input, Select, Textarea, Card, MetricCard, Table, EmptyState, Toast, Modal.
2. Rebuild Campaign/Event creation forms using the shared form components.
3. Create mobile app shell with drawer/bottom nav.
4. Convert tables to responsive cards below 760px.
5. Rework Products/Inventory/Customers metric cards into compact stat rows.
6. Replace placeholder modules with disabled states, roadmap labels, or real persistence.
7. Add command palette or remove `Cmd+K`.
8. Add real notification dropdown backed by alerts.
9. Add dashboard metric definitions and chart tooltips.
10. Add data-quality badges for missing product costs and incomplete analytics.

## Enterprise-Level Improvements

1. Establish a design-token contract and delete unused/conflicting style systems.
2. Add Storybook or a component sandbox for every component state.
3. Add Playwright visual regression for 1440, 1024, 390, and 360 widths.
4. Add axe accessibility tests to core routes.
5. Add E2E tests for create order, create shipment, sync Sendit, create campaign, create event, edit cost.
6. Add real audit/log feedback for destructive actions.
7. Add role-aware empty states for modules not fully installed.
8. Add server-side pagination/filtering for orders/products/customers.
9. Add source freshness metadata to all KPIs.
10. Add product analytics governance: distinguish real, estimated, missing, and mock data.

## Screenshot-by-Screenshot Review

| Screenshot | Review |
|---|---|
| `desktop-1920__dashboard.png` | Strong atmosphere and premium shell, but chart lacks analytical context, ticker feels fake/repetitive, and lower viewport has too much empty space. |
| `desktop-1920__orders.png` | White table/toolbar clash with dark app. Status cards are sparse. Filters are cramped and attached to the table. |
| `desktop-1920__orders-detail.png` | Useful detail density, but stepper wastes height, duplicated actions compete, and missing product costs make profit/margin misleading. |
| `desktop-1920__orders-new.png` | Better than campaign/event forms, but fields are overly wide, empty state is low contrast, and city loading needs a resilient state. |
| `desktop-1920__products.png` | Full-width KPI strips waste space. Table header and controls break the dark system. Missing cost action is visible but visually heavy. |
| `desktop-1920__inventory.png` | Repeats products layout issues; table is dense and desktop-only. Add stock is a placeholder despite primary placement. |
| `desktop-1920__customers.png` | `NaN MAD` and blank pills are trust-breaking. Table header/system mismatch repeats. |
| `desktop-1920__campaigns.png` | Campaign row contrast is too low. KPI zeros need no-data explanation. |
| `desktop-1920__campaign-new.png` | Form is visibly broken with overlapping labels/inputs and native white controls. Critical. |
| `desktop-1920__campaign-detail.png` | Good layout intent, but info labels concatenate with values and no-data cost/order panels need stronger empty-state hierarchy. |
| `desktop-1920__events.png` | Empty state text is almost invisible. Event analytics need explicit not-installed/no-data language. |
| `desktop-1920__events-new.png` | Same critical form styling failure as campaign creation. |
| `desktop-1920__content.png` | One of the best pages visually. Needs real interaction model and mobile kanban alternative. |
| `desktop-1920__work-hub.png` | Good executive planning surface, but static placeholder actions and small task checkboxes limit product maturity. |
| `tablet-1024__auth-signin.png` | Auth page clips brand/hero content and footer at tablet width. Critical responsive defect. |
| `mobile-390__auth-signin.png` | Mobile sign-in overflows horizontally and cuts off brand/accounts. Release-blocking. |

## Final Professional UI Grade

Grade: C-

The app has a promising premium internal-ops direction, but it is currently closer to a strong prototype than an enterprise-grade product. Desktop has enough visual personality to build from, yet the broken forms, mobile auth failure, mixed light/dark components, placeholder workflows, low-contrast states, and data-quality artifacts would not pass a serious comparison against Linear, Stripe, Vercel, Shopify, Notion, or Figma.

Recommended priority order:

1. Fix release blockers: mobile auth, campaign/event forms, `NaN`, low-contrast table rows.
2. Normalize the design system: one button, one input, one table, one metric card, one empty state.
3. Rebuild mobile shell and responsive tables.
4. Replace placeholders with real disabled states, modals, toasts, and persistent flows.
5. Improve dashboard analytics with definitions, source freshness, and chart context.
