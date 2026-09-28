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

## Screen v2 and generated visuals

- **Cockpit.** A one-line verdict and 8 KPIs, each with a mini-curve and its change against the previous period of equal length (`verite(jours, decalage)`).
- **Hints.** `lib/ads/conseils.ts` is a rules engine, recomputed on every load, where each hint cites its numbers. It covers: losing money, cost per order above the margin, cost creeping up, ads to cut, winning ads that are paused, fatigue, boosted posts, monthly budget pace, DM orders invisible to Meta, the product to push, the audience that responds best, and gaps in the strategy.
- **Ad verdicts** compare each ad with the median of its own family: Messages with Messages, Sales with Sales. A DM is never compared with a purchase.
- **Tabs.**
  - Overview: recharts charts (spend against delivered revenue per day, conversations and their cost, channels, audiences, products).
  - Campaigns: campaign → ad hierarchy, filters and sorting. The ad panel shows the Instagram preview, a daily curve, all metrics, and buttons to request an analysis or variants.
  - Creative studio: stages from idea to live. It shows feed and story/reel mockups, FR/Darija/AR text (right-to-left for Arabic), editable on-image text, and a PNG export at the size Meta expects (1080×1350, 1080×1920, 1080×1080).
  - To-do, grouped by decision type.
  - Strategy, in sections, with suggestions computed from the real numbers.
  - Agent: request templates and reports filtered by type.
- **Visuals.** `lib/ads/images.ts` uses OpenAI `gpt-image-2.5-sunburst` through `/v1/images/edits`, with the product page's Cloudinary photo as reference, so the ad shows the real bottle.
  - Without a product it falls back to `gpt-image-2.5-flare` through `/generations`.
  - The model draws NO text: the BOS draws the headline over the image, in the preview and in the canvas export, with the same proportions.
  - Images are stored on Cloudinary (folder `shine-ads`) and logged in `AdsCreativeImage` (migration 048) with the exact prompt, model, duration and usage.
  - Caps: `ADS_IMAGES_PAR_JOUR` (default 40) and 40 images per creation. The agent can order a visual with `bos.mjs image`.
- **Art director (migration 049).** Claude writes the image prompts; OpenAI only paints.
  - Achraf sends a brief from the studio (`Brief au directeur artistique`): image options to compare, a carousel, or an animated Reel. Format, styles, quality, free text, plus one-click ideas computed from margin × sales × stock, the season and the winning ads (`idees()` in `lib/ads/direction-model.ts`).
  - The brief becomes an `AdsAgentRequest` of genre `direction`. A separate Claude routine takes only these (`bos.mjs demande --direction`), reads `scripts/ads/DIRECTION.md` (parashop repo) and looks at the real product photos. It then delivers options, cards or shots (`AdsCreativeOption`) and has each one painted (`bos.mjs image --option=<id>`). It looks at every image, redoes a failed one once, and notes its check.
  - `ADS_DA_ROUTINE_ID` + `ADS_DA_FIRE_TOKEN` (the routine's API trigger) wake it up at once. Without them, the routine's hourly run picks the brief up.
  - The BOS always appends the guardrails to Claude's prompt (`promptFinal`): exact product, no text, free headline zone. Carousel cards 2+ receive card 1 as a style reference.
- **Animated Reels.** Not AI video. Each shot is a generated background plate with no product; the real product photos, cut out by Cloudinary AI (`e_background_removal`), are animated on top with word-by-word text in the shop's fonts and colours.
  - Shots: `rebond` (drop, squash, screen shake), `pop`, `glisse`, `duo` (« ou » between two products), `revele` (premium rise), `etiquette` (2–3 benefits linked to the bottle), `quiz` (answers, a finger taps the first, the product answers), `dm` (an animated Instagram conversation that ends with the product card), `zoom`, `fin` (pulsing green button).
  - Transitions: cut, zoom-through, whip pan (motion blur), circle reveal, green wave. Ambiances: sparkles, droplets, bubbles, sand. Shine signature: a light sweep across each bottle when it lands, sparkles, motion trails. Durations go by half-seconds so cuts land on a 120 BPM beat.
  - Claude composes each Reel from this vocabulary (`scripts/ads/DIRECTION.md`); the motion parameters live in `AdsCreativeOption.motion`.
  - **Shot editor** (`ui/Montage.tsx`, table de montage): Achraf edits any shot (texts in 3 languages, animation, duration, transition, ambiance, animated products, DM bubbles, callouts, quiz answers, voice-over), sees it live in the player (drafts), then saves. Saving goes through the same rules as Claude's delivery (`verifierOption`, `verifierMontage`). He can also move, duplicate and delete shots, and send « refais ce plan » to Claude (a `direction` request whose `parametres.retouche` targets one option).
  - **French checks**: on-image French must carry its accents (`fautesFrancais` rejects « apres », « ete », « serum », « a la livraison »…); the *highlighted* word cannot be an empty word; a DM shot gets about 1 s per message (`dureeMinDm`). Up to 4 products in `pop`/`fin`.
  - **Sound**: synthesized sound effects in the browser, timed on the animation (`evenementsSonores` in `reel-model.ts`, `ui/sons.ts`), no music and no rights issue. There is an optional voice-over per shot, read by OpenAI `gpt-4o-mini-tts` as an ASMR whisper (`lib/ads/voix.ts`, MP3 on Cloudinary `shine-ads/voix`). The preview plays it after a click, and the MP4 export carries it as an AAC track.
  - `lib/ads/reel-model.ts` computes each frame (pure, tested). `app/ads/agent/ui/Reel.tsx` draws it in a canvas and exports an H.264 MP4 at 1080×1920, 30 fps, in the browser (WebCodecs + mediabunny; Chrome or Edge).
- **Periods.** 7 d, 30 d, 3, 6, 9, 12 months. Spend is merged day by day (ad-level detail when that day was read, campaign totals otherwise).
  - The ad account was used before Shine (a web agency in late 2024, Marketplace boosts in early 2025), and Shine sold in DMs before its orders were recorded (first order: 2026-02-23). No window starts before the first recorded order, so spend is never set against orders that are not in the database. A comparison period that starts before it is not used.
  - Ad-level history was backfilled on 2026-09-27 back to October 2024 (`synchro` accepts up to 1,100 days).
  - Variables on the BOS: `OPENAI_API_KEY` and `CLOUDINARY_*`, copied from the shop project on 2026-09-27 as secrets.

## Why the truth is not Meta's ROAS

On 26 September 2026, over 90 days:
- the pixel saw 8,764 DH of sales, while delivered orders totalled 42,846 DH;
- Instagram DMs are the first channel (39 orders), and Meta cannot see them;
- ads cost 66 DH per delivered order, against 214 DH of margin per order.

Judging ads by Meta's ROAS (1.25×) would cut campaigns that actually make money.
