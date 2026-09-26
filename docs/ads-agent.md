# Agent Meta Ads

A Claude agent that runs in Anthropic's cloud (Claude Code routines) and works in three roles:
- **consultant**: what to cut, scale or test, and how to spend the budget;
- **analyst**: why an ad works or not;
- **creative director**: hooks, scripts, and ad copy in French, Darija and Arabic, with visual briefs.

It never changes anything in the Meta account: Achraf decides and acts in Ads Manager.

## Pieces

| Piece | Where |
|---|---|
| Ad-level Meta data | `lib/ads/meta-sync.ts`. It reads each ad's daily insights (spend, reach, link clicks, landing views, carts, pixel purchases, **conversations started**, video views), its creative (text, format, thumbnail), its 7-day reach and frequency, and a 28-day account breakdown by age, gender, placement and region. It uses the existing Meta token (read-only) and the cron `/api/cron/ads-sync` (05:15 UTC). |
| Truth | `lib/ads/verite.ts`. It compares ad spend with **delivered** orders on every channel (site, Instagram DM, WhatsApp): margin (the BOS profit field), profit after ads, ad cost per delivered order, and the break-even point (average margin per order). `economieProduits` gives Shine's margin per sale, halved for consignment products, plus sellable stock and 90-day sales. |
| Strategy | `lib/ads/strategie-model.ts` (zod schema, shared with the form) and table `AdsStrategy`. Each save is a new version; the agent always reads the latest. |
| Memory | Migration 047: `MetaAd`, `MetaAdDaily`, `MetaBreakdown`, `AdsStrategy`, `AdsAgentRequest`, `AdsAgentReport`, `AdsAgentAction`, `AdsCreative`. |
| Agent API | `/api/ops/ads/agent/machine/{synchro,demande,contexte,rapport,echec}`. It accepts `ADS_AGENT_TOKEN`, falling back to `SEO_AGENT_TOKEN` (same cloud environment). The middleware lets only these paths through with that token. |
| Screen | `/ads/agent` (sidebar « Agent Meta Ads »). Sections: truth, ads, to-do, creatives, strategy, requests. |
| Agent instructions | `scripts/ads/AGENT.md` and `scripts/ads/bos.mjs`, in the **parashop** repo, which is the one the routines clone. |

## Why the truth is not Meta's ROAS

On 26 September 2026, over 90 days:
- the pixel saw 8,764 DH of sales, while delivered orders totalled 42,846 DH;
- Instagram DMs are the first channel (39 orders), and Meta cannot see them;
- ads cost 66 DH per delivered order, against 214 DH of margin per order.

Judging ads by Meta's ROAS (1.25×) would cut campaigns that actually make money.
