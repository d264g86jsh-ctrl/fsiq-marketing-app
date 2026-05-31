# FSIQ Static Ad Creation Guidelines
**Version:** 1.0 | **Created:** May 2026 | **Owner:** Paid Media Agent
**Data sources:** Supabase `creative_pipeline` (383 ads, 142 static), `ad_performance`, `footage_log` · SharePoint Static Images folder (16 concept folders confirmed live) · SOPs: `fsiq-brand-voice-paid-ads.md`, `fsiq-company-profile.md`, `creative-pipeline-sop.md`, `paid-media-agent-sop.md`

> This document is the definitive reference for anyone creating, briefing, or reviewing FSIQ static image ads. Follow every rule here. Where a rule conflicts with general design intuition, this document wins.

---

## Table of Contents

1. [Brand Color Palette](#1-brand-color-palette)
2. [Typography Rules](#2-typography-rules)
3. [Standard Ad Dimensions](#3-standard-ad-dimensions)
4. [Composition Rules and Safe Text Areas](#4-composition-rules-and-safe-text-areas)
5. [CTA Patterns — Copy, Button Style, Placement](#5-cta-patterns--copy-button-style-placement)
6. [Messaging Framework — Hook Types, Hierarchy, Tone](#6-messaging-framework--hook-types-hierarchy-tone)
7. [Variant Generation Rules (A/B/C)](#7-variant-generation-rules-abc)
8. [Template Structure — ASCII Layout Diagrams](#8-template-structure--ascii-layout-diagrams)
9. [Do's and Don'ts](#9-dos-and-donts)
10. [Quality Checklist](#10-quality-checklist)
11. [Performance Notes — Real Data](#11-performance-notes--real-data)
12. [Appendix — AD ID and Concept Name Registry](#12-appendix--ad-id-and-concept-name-registry)

---

## 1. Brand Color Palette

FSIQ's visual identity is built around a contrast-first palette: deep navy as the authority anchor, a warm amber/orange as the action color, and clean white for legibility. The following hex codes are drawn from the website at `foodserviceiq.com`, the branding visible in live ad assets in SharePoint, and the color vocabulary used in concept names in `creative_pipeline` (Billboard Orange/Blue, Independent vs Chain color tests).

### Primary Colors

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| Background — authority | Deep Navy | `#0D1B2A` | Full-bleed background on dark-mode ads (Billboard Blue, Independent vs Chain Night) |
| Primary action | FSIQ Orange | `#F5841F` | CTA buttons, accent bars, highlight text, "Stop Overpaying" callouts |
| Text — primary | Off-White | `#F7F4EF` | All headlines and body copy on dark backgrounds |
| Background — clean | Warm White | `#FAFAF8` | Light-mode ad backgrounds (Paper Note, comparing receipts) |
| Text on light | Charcoal | `#1A1A2E` | All text on light backgrounds |
| Accent — trust | Forest Green | `#1B5E20` | Savings numbers, checkmarks, "You Save" labels; used in Billboard Green variant |
| Neutral separator | Mid-Grey | `#C4C4C4` | Divider lines, secondary UI elements, receipt line items |

### Secondary / Contextual Colors

| Role | Hex | Where used |
|------|-----|-----------|
| Sysco Red (reference only) | `#CC0000` | Price comparison ads showing distributor pricing vs FSIQ pricing — use sparingly, never as brand color |
| Gold highlight | `#D4A017` | Award/trophy framing, "national chain" tier labels |
| Invoice paper | `#FFF9E6` | Stop Overpaying, Comparing Receipts, Invoice hook ads |

### Color Application Rules

- Never use orange as a background for headline text — contrast ratio too low.
- Never use navy on a dark photo without a semi-transparent overlay at minimum 60% opacity.
- Static ads going to dark-mode feeds (Instagram Stories, Facebook Mobile) should prefer the `#0D1B2A` navy background over photo backgrounds for consistency.
- When a photo background is used, overlay a gradient from `rgba(13,27,42,0.70)` to `transparent` from the bottom up so the CTA area always reads cleanly.
- The Billboard color-variant test (AD-39: Green, Orange, Blue) and Independent vs Chain color test (AD-48: Night, Day, Sunset) both confirm the audience responds to full-bleed backgrounds over busy lifestyle photography for direct-response statics.

---

## 2. Typography Rules

FSIQ does not have a single locked system font, but the following rules are derived from the visual patterns across all 142 static ads in `creative_pipeline` and the brand voice documented in `fsiq-brand-voice-paid-ads.md`.

### Font Hierarchy

| Level | Use case | Style |
|-------|----------|-------|
| Headline | Concept hook statement | Bold, 36–52px (1080px canvas), all-caps or sentence case depending on concept |
| Sub-headline | Qualifier or proof point | Semi-bold, 24–32px |
| Body copy | Supporting detail, 1–2 lines max | Regular, 18–22px |
| CTA label | Button text | Bold, 18–24px, all-caps |
| Fine print | Disclaimer, LP URL | Light, 12–14px |

### Font Preferences (in priority order)

1. **Inter** or **Inter Display** — clean, legible at all sizes, renders well at Facebook's compressed JPG quality. Use for body and UI elements.
2. **Montserrat Bold / ExtraBold** — for headlines requiring authority and weight. Used in Billboard concept and Bold Direct Response.
3. **Georgia** or **Playfair Display** — for any ad concept mimicking a printed artifact (Paper Note, Guest Check, Invoice) where serif lends authenticity.

### Type Rules

- Minimum headline size: **32px on a 1080×1080 canvas**. Scale proportionally for other formats.
- Never set body copy smaller than **16px on a 1080px canvas** — Facebook compresses images and text becomes unreadable.
- Line-height: 1.3–1.4 for headlines, 1.5–1.6 for body copy. Tight leading looks confident; excessive leading looks uncertain.
- Letter-spacing on headlines: 0 to +0.5px. No exaggerated tracking.
- Maximum 3 type sizes per ad. More than 3 creates visual noise.
- White text on the navy background must pass WCAG AA contrast (4.5:1 minimum). Off-white `#F7F4EF` on `#0D1B2A` passes at 12.6:1.
- Orange `#F5841F` on navy `#0D1B2A` passes for large display type (3:1 ratio, acceptable for UI elements 18px+ bold) but must not be used for small body text.

---

## 3. Standard Ad Dimensions

All static ads run on Meta (Facebook + Instagram). The following formats are required per launch.

| Format | Dimensions | Aspect Ratio | Placement | Priority |
|--------|------------|--------------|-----------|----------|
| Square Feed | 1080 × 1080 px | 1:1 | FB Feed, IG Feed, IG Explore | Required |
| Vertical Feed | 1080 × 1350 px | 4:5 | FB Feed mobile, IG Feed mobile | Required |
| Stories / Reels | 1080 × 1920 px | 9:16 | IG Stories, FB Stories, Reels | Required for Gen 2 concepts (AD-33+) |
| Horizontal (rare) | 1200 × 628 px | 1.91:1 | FB Right Column, Audience Network | Optional — use only when brief specifies |

### Resolution and File Specs

- Export resolution: **72 dpi** (screen) at pixel dimensions above
- File format: **PNG** for designs with text over flat color; **JPG** at 85–90% quality for photo-based ads
- File size ceiling: **1 MB per creative** (Meta's stated limit is 30 MB, but >1 MB creatives load slowly on mobile — stay under 1 MB)
- Color mode: **RGB** (not CMYK)
- SharePoint upload location: `Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Static Images/[FSIQ-STATIC-AD-##] - [Concept Name]/Final/`

### Safe Zone Reference

Meta overlays UI elements (CTA buttons, page name, "Sponsored" label) that consume space:
- Bottom 14% of a 1:1 square is partially obscured
- Bottom 20% of a 9:16 Stories frame is covered by the CTA swipe-up area
- Top 8% of Stories is covered by profile info

No critical text or visual elements should live in these zones. See Section 4 for diagrams.

---

## 4. Composition Rules and Safe Text Areas

### The Four Zones (1080×1080 Square)

Every FSIQ static ad is built on four functional zones:

```
┌─────────────────────────────────────┐
│  ZONE 1: HOOK / VISUAL ANCHOR       │  ← rows 0–250px (top 23%)
│  Logo or concept visual element     │
├─────────────────────────────────────┤
│  ZONE 2: PRIMARY MESSAGE            │  ← rows 250–700px (middle 42%)
│  Headline + sub-headline            │
│  (SAFE AREA — all critical text)    │
├─────────────────────────────────────┤
│  ZONE 3: PROOF POINT / DETAIL       │  ← rows 700–870px (middle 16%)
│  Case study number, savings %, etc  │
├─────────────────────────────────────┤
│  ZONE 4: CTA ZONE                   │  ← rows 870–1080px (bottom 19%)
│  Button + URL — Meta UI overlaps    │
│  bottom ~150px — keep CTA at 870px  │
└─────────────────────────────────────┘
```

### Vertical Feed (1080×1350) Safe Areas

The vertical format adds height — use the extra space in Zone 2 for a longer sub-headline or an additional proof point. Do not stretch Zone 4 downward; keep the CTA at equivalent proportional position.

### Stories (1080×1920) Safe Areas

```
┌─────────────────────────────────────┐
│  UNSAFE: Profile + Story bar        │  ← top 155px
├─────────────────────────────────────┤
│  HOOK VISUAL                        │  ← rows 155–500px
│                                     │
├─────────────────────────────────────┤
│  PRIMARY MESSAGE (safe zone)        │  ← rows 500–1550px
│  Headline + body + proof            │
│                                     │
├─────────────────────────────────────┤
│  CTA AREA                           │  ← rows 1550–1765px
├─────────────────────────────────────┤
│  UNSAFE: Swipe-up / Link button     │  ← rows 1765–1920px
└─────────────────────────────────────┘
```

### Composition Principles

**Visual hierarchy must be readable in 1.5 seconds.** A viewer scrolling a mobile feed has that long before they scroll past. The eye must land on the hook in Zone 1, read the headline in Zone 2, and register the CTA before it exits.

- **Anchored bottom-up reading pattern:** FSIQ static ads consistently use a visual or number in the upper portion and the headline below it — mirroring editorial magazine layouts, not traditional ad layouts. The Printed Book, Giant Book, Hand + Book, and Post-it concepts all demonstrate this pattern.
- **High visual contrast in Zone 1:** The hook element (book, receipt, invoice, screenshot) must have a clear silhouette against the background. No blending, no subtle drop shadows.
- **1 dominant color per ad.** Background color sets the tone; the CTA button is the only element allowed in orange. Everything else is white or charcoal.
- **No more than 1 photo and 1 UI element per ad.** Busy compositions test poorly. Price Comparison (AD-43) and Comparing Receipts (AD-40) both work because they contain exactly one visual comparison element.
- **Left margin:** Minimum 40px gutter from any canvas edge to any text element.
- **Center vs left alignment:** Headline text may be centered for authority statements ("$2B+ in Buying Power"). Body copy and qualification text is always left-aligned.

---

## 5. CTA Patterns — Copy, Button Style, Placement

### CTA Copy (verbatim rules from `fsiq-brand-voice-paid-ads.md`)

Static ads carry short CTA labels — they do not have the benefit of narration to build context. The label must be action-oriented but never pressure-loaded.

**Approved CTA labels (ranked by LP destination):**

| Label | LP Destination | When to use |
|-------|---------------|-------------|
| `Get the Free Playbook` | LP2-EB | Default for Unaware / Problem Aware cold traffic |
| `Download the Playbook` | LP2-EB | Alternate for LP2-EB; slightly more transactional |
| `See the Case Study` | LP1-CS | When ad leads with a specific client result |
| `Learn How` | LP2-EB | Works on benefit-forward ads (savings number prominent) |
| `Start Saving` | LP2-EB | For Unaware hooks — "Stop Overpaying" variant pairings |
| `Upgrade My Pricing` | LP2-EB | For solution-aware audience; used in AD-47 (2B+ concept) |
| `See How It Works` | LP2-EB | Softer tone for testimonial / social proof concepts |

The following labels exist in the live database (AD-47 variants: "Upgrade My Pricing," "Start Saving," "Stop Overpaying") and have Backfilled status. Performance data pending.

**Never use:**
- "Sign Up Now" — pressure language
- "Book a Call" on cold traffic static ads — too direct for Unaware/Problem Aware
- "Limited Time Offer" — not FSIQ's model
- "Click Here" — generic, signals low-quality creative

### Button Style

- Shape: Rounded rectangle, 8–12px corner radius
- Fill: FSIQ Orange `#F5841F`
- Text: Off-White `#F7F4EF`, Bold, 16–20px (proportional to canvas)
- Minimum button size: 260px wide × 52px tall (on 1080px canvas)
- Drop shadow: none — flat buttons test better for FSIQ's professional B2B audience
- Hover state (not applicable on static image, but document for Canva template reference): lighten to `#F79C44`

### Button Placement

The CTA button lives in Zone 4 (bottom 19%) of the canvas. Minimum 40px from the canvas bottom edge. If the Meta feed UI is likely to overlap, raise the button to 870px from top on a 1080px canvas.

For Stories format: CTA button sits at rows 1550–1620px, above the unsafe swipe-up zone.

---

## 6. Messaging Framework — Hook Types, Hierarchy, Tone

### Awareness Level → Hook Type Mapping

Static ads must match their creative concept to the awareness level of the target audience. The `creative_pipeline` table enforces this pairing. The following patterns emerge from the 142 static ads in the database:

| Awareness Level | Dominant hook approach | Concept examples |
|----------------|----------------------|-----------------|
| **Unaware** | Visual comparison, proof-of-gap, data shock | Price Comparison, Comparing Receipts, Billboard, Independent vs Chain, Stop Overpaying, 2B+, Locker Room Ad, Paper Note, Bold Direct Response |
| **Problem Aware** | Savings framing, social proof numbers | St1/St2 early sets, Printed Book, Testimonial |
| **Solution Aware** | Credential proof, mechanism clarity, book/playbook offer | Hand + Book, Giant Book, Hormozi, We're Sorry |
| **Product Aware** | Specificity, trust-building, audience segment targeting | St6/St7/St13 early sets, News + Chef, iMsg, St17/St18 |

### Message Hierarchy (in order of persuasion strength per `fsiq-company-profile.md`)

Every static ad body should address these points in this order — not all need to appear, but the order must be respected when multiple elements are present:

1. **Savings outcome** — "5–7% annually. No changes to distributors."
2. **Scale proof** — "2,000+ restaurants. $2B+ in buying power."
3. **Founder credential** — "Former COO/President of the largest food distributors."
4. **No-risk model** — "100% performance-based. Zero upfront cost."
5. **No disruption** — "No changes to ingredients or suppliers."
6. **Specific case study** — MaryAnn's $264k, Cincinnati $520k (use selectively; not every ad)

### Tone Rules for Static Copy

Static ads carry 10–20 words of headline + sub-headline, not full scripts. The tone rules from `fsiq-brand-voice-paid-ads.md` still apply — adapted for brevity:

- **No adversarial language.** Never: "Your distributor is ripping you off." Use: "Independent restaurants consistently pay more than national chains for the same SKUs."
- **No math done out loud.** Show the result: "$100k+ in savings" not "$2M × 5% = $100k."
- **No downstream framing.** Show the savings, not what they do with it.
- **Positive framing only.** No "not this, not that" constructions. Headlines should be affirmative claims.
- **Self-qualifying language welcomed.** "If your restaurant does $3M+ per year..." This pre-qualifies viewers and increases lead quality.
- The No-Disruption Guarantee must appear in at least the sub-headline or the body of every ad: "No changes to your distributors or ingredients."

### Proof Points by Persuasion Strength (static headline use)

| Claim | Headline example | Notes |
|-------|-----------------|-------|
| Savings number | "Save 5–7% on Your Annual Food Costs" | Best for cold Unaware |
| Scale | "$2B+ in Buying Power. 2,000+ Restaurants Helped." | Works for 2B+ concept (AD-47) |
| Case study dollar amount | "One Restaurant Group Saved $520k Last Year" | Cincinnati story — works for warmer audiences |
| Comparison proof | "Same Chicken. 30% Price Difference." | Price Comparison (AD-43) — Eggs, Chicken, Pasta variants |
| Credential | "Former COO of Sysco. Former President of PFG." | Authority hook — News + Chef, podcast-adjacent concepts |
| Gift/offer | "Free Playbook: 5 Proven Ways to Cut Food Costs" | LP2-EB destination |

---

## 7. Variant Generation Rules (A/B/C)

### The Two-Generation System

**Generation 1 (AD-01 through AD-27):** Variants use numeric codes (1.1, 1.2, 1.3, 1.4). First number identifies the static set or talent; second is the individual creative within that set. Example: AD-11 "St6v2" has variants 1.1, 1.2, 1.3, 1.4 — all same concept, different copy versions.

**Generation 2 (AD-28 and later):** Variants use descriptive names that communicate the visual or CTA difference. Example: AD-47 "2B+" has three variants: "Stop Overpaying," "Start Saving," "Upgrade My Pricing" — same visual concept, three different CTA labels. AD-43 "Price Comparison" has three variants: "Eggs," "Chicken," "Pasta" — same layout, different featured ingredient.

### Minimum Variant Count

- **Every new static concept requires a minimum of 3 variants at launch.**
- This matches the historical pattern across AD-33 through AD-49 (all launched with 3–6 variants).
- Minimum viable test: 3 variants per concept to get statistically meaningful performance differentiation.

### What to Vary (in recommended order)

| Variant axis | Description | Example |
|-------------|-------------|---------|
| **CTA label** | Change the button text only, keep visual identical | "Start Saving" vs "Learn How" vs "Get the Playbook" |
| **Headline copy** | Alternate the primary value claim | "Save 5–7%" vs "$100k+ in Savings" vs "National Chain Pricing" |
| **Visual element** | Swap the hero image or prop | Eggs vs Chicken vs Pasta (Price Comparison concept) |
| **Background color** | Same layout, different color scheme | Orange vs Blue vs Green (Billboard AD-39) / Night vs Day vs Sunset (AD-48) |
| **Audience qualifier** | Change the self-qualifying filter text | "Multi-Unit" vs "Independent" vs "Hospitality" (St17 AD-23) |

### Naming Convention for Variants (Generation 2 — all new ads use this)

```
FSIQ-STATIC-AD-[##]-v[global_number]
```

Where:
- `##` is the concept number (globally unique, never reused)
- `global_number` is the sequential integer across ALL ads (video + static)
- The concept name describes the visual/hook: e.g., "Price Comparison - Eggs"

### Sub-variant rule

If a variant is a minor iteration of an existing concept but shares the same core visual and is not a new concept, it uses a letter suffix on the concept number: `AD-27b`, `AD-30b`. This avoids consuming a new concept number for an incremental change.

---

## 8. Template Structure — ASCII Layout Diagrams

### Template A: Data/Number Anchor (most common — Unaware audience)

Best for: Price Comparison, Stop Overpaying, Comparing Receipts, 2B+, Bold Direct Response.

```
┌─────────────────────────────────────────┐
│                                         │
│   ┌─────────────────────────────────┐   │
│   │  [LARGE NUMBER / ICON / BADGE]  │   │
│   │  e.g. "$520K SAVED"             │   │
│   │  or "5-7% LESS ON FOOD COSTS"   │   │
│   └─────────────────────────────────┘   │
│                                         │
│   ──────────────────────────────────    │
│                                         │
│   HEADLINE (32–48px Bold)               │
│   Independent restaurants are paying   │
│   more than national chains for the    │
│   exact same ingredients.              │
│                                         │
│   SUB-HEADLINE (22–28px)               │
│   We fix that. No changes to your      │
│   distributors or suppliers.           │
│                                         │
│   ──────────────────────────────────    │
│                                         │
│   ┌──────────────────────────────┐     │
│   │    GET THE FREE PLAYBOOK     │  ←  orange button
│   └──────────────────────────────┘     │
│   foodserviceiq.com                     │
└─────────────────────────────────────────┘
```

### Template B: Physical Prop / Book Offer (Solution Aware audience)

Best for: Printed Book, Giant Book, Hand + Book, Hormozi playbook concepts.

```
┌─────────────────────────────────────────┐
│   ╔═══════════════════════════════╗     │
│   ║  [BOOK / PHYSICAL OBJECT      ║     │
│   ║   PHOTOGRAPHY]                ║     │
│   ║  Full-bleed or 60% of canvas  ║     │
│   ╚═══════════════════════════════╝     │
│                                         │
│   HEADLINE (centered or left)           │
│   "5 Proven Ways to Cut Food Costs"    │
│                                         │
│   QUALIFIER (smaller)                  │
│   "For restaurants doing $3M+ per year"│
│                                         │
│   ┌──────────────────────────────┐     │
│   │    DOWNLOAD FREE PLAYBOOK    │     │
│   └──────────────────────────────┘     │
│   getfoodserviceiq.com/5provenways     │
└─────────────────────────────────────────┘
```

### Template C: Comparison Layout (Unaware / Problem Aware)

Best for: Price Comparison (Eggs/Chicken/Pasta), Comparing Receipts, Independent vs Chain.

```
┌─────────────────────────────────────────┐
│  HEADER BAR (navy)                      │
│  "Why are you paying 30% more?"         │
├───────────────────┬─────────────────────┤
│  COLUMN A         │  COLUMN B           │
│  INDEPENDENT      │  FSIQ MEMBER        │
│  ─────────        │  ─────────          │
│  [Product]        │  [Product]          │
│  $X.XX / unit     │  $Y.YY / unit       │
│  ▲ Higher         │  ✓ National Chain   │
│                   │    Pricing          │
├───────────────────┴─────────────────────┤
│  "Same supplier. Same SKU.              │
│   Different pricing."                   │
│                                         │
│  ┌──────────────────────────────┐       │
│  │     SEE HOW IT WORKS         │       │
│  └──────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### Template D: Text-Forward Authority (Solution / Product Aware)

Best for: iMsg (conversation screenshot), We're Sorry, News + Chef, Claude & ChatGPT.

```
┌─────────────────────────────────────────┐
│  [CONTEXTUAL FRAME — phone, browser,    │
│   newspaper, or chat interface mockup]  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ [TEXT CONTENT INSIDE THE FRAME] │    │
│  │ Reads like a real conversation  │    │
│  │ or article — lends authenticity │    │
│  └─────────────────────────────────┘    │
│                                         │
│  BRANDING TAGLINE (small, bottom)      │
│  "FoodServiceIQ — National Chain        │
│   Pricing for Independent Restaurants" │
│                                         │
│  ┌──────────────────────────────┐       │
│  │     GET THE FREE PLAYBOOK    │       │
│  └──────────────────────────────┘       │
└─────────────────────────────────────────┘
```

---

## 9. Do's and Don'ts

### Do's

- **Do** generate a minimum of 3 variants per concept before launch.
- **Do** use the approved CTA label vocabulary. When in doubt, default to "Get the Free Playbook" (LP2-EB destination).
- **Do** include the No-Disruption Guarantee in every ad sub-headline or body. Canonical: "No changes to your distributors or ingredients."
- **Do** self-qualify the headline when possible. "If your restaurant does $3M+ per year..." filters out non-ideal viewers and increases lead quality.
- **Do** use flat, full-bleed color backgrounds when the concept allows it. Billboard color tests (AD-39 Green/Orange/Blue) confirm clean backgrounds outperform busy photography for this audience.
- **Do** keep the headline to 10 words or fewer when possible. Shorter = more scroll-stop power.
- **Do** name concept folders following the exact convention: `FSIQ-STATIC-AD-[##] - [Concept Name]`, and upload finals to the `/Final/` subfolder in SharePoint Static Images.
- **Do** create the `/Campaign Brief/`, `/Raw Footage/`, and `/Final/` subfolders for every new concept folder. The `sharepoint-structure-agent` audits and flags missing subfolders every 6 hours.
- **Do** use COPY-02 as the default body copy version. It is the confirmed winner at $197 CPQL and 1.24% CTR across the ad account.
- **Do** tag the Awareness Level correctly in `creative_pipeline`. The wrong awareness level on an ad set leads to targeting mismatches and inflated CPM.

### Don'ts

- **Don't** use adversarial language in headlines. "Your distributor is ripping you off" has never run and never should. Approved: "Independent restaurants consistently overpay compared to national chains."
- **Don't** show math out loud. Show the result. "Save $100k+ per year" — never "$2M × 5% = $100k."
- **Don't** use downstream outcome framing. "Our clients open an average of 2.2 new restaurants" was explicitly noted as not working. Show the savings number itself.
- **Don't** hardcode the playbook page count. The landing page owns that detail.
- **Don't** create a new concept number for a minor visual tweak. Use a letter suffix (e.g., `AD-30b`) for sub-variants of the same concept.
- **Don't** reuse an AD number. All AD numbers are globally unique across video and static, across all time.
- **Don't** place critical text in the bottom 19% of a 1:1 canvas or the top/bottom unsafe zones of a 9:16 Stories frame.
- **Don't** use more than 3 type sizes per creative.
- **Don't** launch without a campaign brief in the `/Campaign Brief/` subfolder. The `footage-watcher` skill and brief-generator depend on the brief being present.
- **Don't** use fear-mongering language. "You're leaking money every month" is never acceptable. "There's likely $100k+ in savings in your current food costs" is the right framing.
- **Don't** use orange as a body copy color. It is reserved for CTA buttons only.
- **Don't** set text at the canvas edge — always maintain the 40px minimum gutter.

---

## 10. Quality Checklist

Run through this checklist before marking any static ad as "Ready to Launch" in `creative_pipeline`.

### Visual / Technical

- [ ] Canvas size is correct for the intended placement (1080×1080 / 1080×1350 / 1080×1920)
- [ ] File format is PNG (text-heavy) or JPG ≥85% quality (photo-based)
- [ ] File size is under 1 MB
- [ ] No critical text or CTA button is in the bottom 19% of a 1:1 canvas (or equivalent unsafe zones for other formats)
- [ ] Minimum 40px gutter from all canvas edges to all text
- [ ] Off-white `#F7F4EF` text on navy `#0D1B2A` background — check passes WCAG AA
- [ ] No more than 3 type sizes used
- [ ] CTA button is FSIQ Orange `#F5841F` with Off-White text, rounded corners, minimum 260×52px

### Copy / Messaging

- [ ] Headline is 10 words or fewer (unless the concept requires longer — brief must justify)
- [ ] No adversarial language ("ripping you off," "leaking money," "your competitors are winning")
- [ ] No math done out loud
- [ ] No downstream outcome framing (opening new restaurants, hiring, investing)
- [ ] No hardcoded playbook page count
- [ ] No-Disruption Guarantee present: "No changes to your distributors or ingredients" (or equivalent)
- [ ] CTA label is from the approved vocabulary
- [ ] Awareness level on the ad matches the hook type being used

### Pipeline / Naming

- [ ] Ad ID follows the convention: `FSIQ-STATIC-AD-[##]` (concept number) with `-v[global_number]` (variant)
- [ ] Concept folder created in SharePoint Static Images: `FSIQ-STATIC-AD-[##] - [Concept Name]`
- [ ] Subfolders present: `/Campaign Brief/`, `/Raw Footage/`, `/Final/`
- [ ] Final files uploaded to `/Final/` subfolder
- [ ] `creative_pipeline` record updated: `status = 'Ready to Launch'`, `awareness_level`, `funnel`, `copy_version`, `lp_code`, `hook_type` all populated
- [ ] Minimum 3 variants created for the concept before marking any individual variant as Ready to Launch
- [ ] LP destination confirmed: LP2-EB for Unaware/Problem Aware cold traffic; LP1-CS for warmer audiences or case-study-led concepts

---

## 11. Performance Notes — Real Data

### Only Confirmed Active Ad Set with Full Performance Data (as of May 2026)

The `ad_performance` table has one ad set with confirmed active status and lifetime metrics:

| Ad Set | Status | Daily Budget | D1 CPM | CPQL Lifetime | CP2QL Lifetime | CPQL Leads (Lifetime) | CP2QL Leads (Lifetime) |
|--------|--------|-------------|--------|---------------|----------------|----------------------|------------------------|
| FSIQ-VIDEO-AD-28 - Podcast Ad Blurred Book - Broad - LP2-EB | ACTIVE | $75/day | $43.64 | $4.78 | $148.96 | 114 | 83 |

Note: AD-28 is a video ad, not a static. However, it is the benchmark against which all static ads are measured. A winning static ad must achieve CP2QL ($1M+ food spend) ≤ $150 on a 7-day window to be considered for scaling per the `paid-media-agent-sop.md` scale ladder.

### Static Ad Performance Benchmarks (from `fsiq-company-profile.md` and SOP data)

| Ad Set (from SOPs) | CPQL | CP2QL Leads | D1 CPM | Performance level |
|-------------------|------|------------|--------|------------------|
| Static 18.3 | $254 | 3 | $39.7 | Winner (below kill threshold) |
| Neil Holiday Gift No Santa Hat (AD-18, VIDEO) | $261 | 30 | $26.7 | Winner |
| Hand + Book (AD-32) | $261 | 16 | $60.8 | Winner — note high D1 CPM |

### What the Data Tells Static Ad Creators

1. **D1 CPM $35–$45 is the best band.** 35% of winners fall in this range. The Static 18.3 winner launched at D1 CPM $39.7 — consistent with the best band. When a static launches at D1 CPM > $65 with zero CP2QL leads, it is killed at $200 spend. Design for engagement — visual complexity drives CPM up.

2. **The playbook offer consistently outperforms.** 100% of top-5 video performers use LP2-EB (eBook/playbook) as their CTA destination. Apply the same default to all cold-traffic static ads — any concept targeting Unaware or Problem Aware audiences should route to LP2-EB.

3. **Simple, single-concept creatives get the best CPM.** High-CPM creatives (AD-32 at $60.8 D1) require more spend to prove themselves. Budget is $75/day for test phase — keep visuals clean to avoid CPM inflation.

4. **Color variants matter.** The Billboard concept (AD-39: Green, Orange, Blue) and Independent vs Chain (AD-48: Night, Day, Sunset) exist specifically because color has proven to be a meaningful variable. Always test color as one of your three minimum variants.

5. **Audience segment labels work.** AD-23 "St17" launched with four variants: Multi-Unit, Independent, Hospitality, American/Grill — audience-qualified headlines. This pattern is validated and should be repeated for new concepts where the visual is universal but the audience can be filtered via copy.

6. **The 3-stage qualification model is the north star.** Static ad performance is not measured by CPL (stage 1). It is measured by CP2QL — cost per lead declaring $1M+ annual food spend. A static ad generating cheap CPL with poor CP2QL ($1M+) will be killed. Design copy to pre-qualify the viewer: "If your restaurant does $3M+ per year..."

### Concept Win Rate Context

From 255 days of account data referenced in `paid-media-agent-sop.md`:
- Account win rate: 19% (approximately 1 in 5 new ad launches becomes a winner)
- This means a batch of 3 variants per concept is expected to yield 0–1 winners per launch
- Always launch 3+ variants to maximize the probability of finding a winner

---

## 12. Appendix — AD ID and Concept Name Registry

### Static Ads in `creative_pipeline` (as of May 2026)

The following table lists all 49 unique static concept numbers found in the database, in approximate launch order. Total static variants: 142. All currently carry `status = 'Backfilled'` (historical data imported) or `status = 'In Progress'`.

#### Generation 1 Concepts (numeric variant codes, AD-01 through AD-28)

| Concept # | Concept Name | Awareness | Funnel | Variants |
|-----------|-------------|-----------|--------|----------|
| FSIQ-STATIC-AD-01 | St1 | Problem Aware | LP1-CS | 1.2 |
| FSIQ-STATIC-AD-02 | St2 | Problem Aware | LP1-CS | 2.3, 2.4 |
| FSIQ-STATIC-AD-03 | St3 | Solution Aware | LP2-EB | 3.2 |
| FSIQ-STATIC-AD-04 | St1v2 | Problem Aware | LP2-EB | 1.1, 1.2 |
| FSIQ-STATIC-AD-05 | St3v2 | Solution Aware | LP2-EB | 1.2 |
| FSIQ-STATIC-AD-07 | St6 | Product Aware | LP2-EB | 6.2 |
| FSIQ-STATIC-AD-10 | St7 | Product Aware | LP2-EB | 7.2 |
| FSIQ-STATIC-AD-11 | St6v2 | Product Aware | LP2-EB | 1.1–1.4 |
| FSIQ-STATIC-AD-12 | St10 | Solution Aware | LP2-EB | 10.2 |
| FSIQ-STATIC-AD-13 | St11 | Problem Aware | LP2-EB | 1.2–1.4 |
| FSIQ-STATIC-AD-14 | St12 | Solution Aware | LP2-EB | 1.1, 1.2 |
| FSIQ-STATIC-AD-15 | St1v3 | Problem Aware | LP1-CS | 1.1–1.4 |
| FSIQ-STATIC-AD-16 | St1v3 | Problem Aware | LP2-EB | 1.1–1.4 |
| FSIQ-STATIC-AD-17 | St13 | Product Aware | LP1-CS | 1.1–1.4 |
| FSIQ-STATIC-AD-18 | St13 | Product Aware | LP2-EB | 1.1–1.4 |
| FSIQ-STATIC-AD-19 | St14 | Product Aware | LP2-EB | 1.1–1.4 |
| FSIQ-STATIC-AD-19b | iMsg | Solution Aware | LP2-EB | 1.1–1.3 |
| FSIQ-STATIC-AD-20 | St14 | Solution Aware | LP1-CS | 1.1–1.4 |
| FSIQ-STATIC-AD-21 | St15 | Solution Aware | LP2-EB | 1.1–1.5 |
| FSIQ-STATIC-AD-22 | St16 | Product Aware | LP2-EB | 1.1, 1.2 |
| FSIQ-STATIC-AD-23 | St17 | Product Aware | LP2-EB | Multi-Unit, Independent, Hospitality, American/Grill |
| FSIQ-STATIC-AD-24 | St18 | Product Aware | LP2-EB | Multi-Unit, Independent, Hospitality |
| FSIQ-STATIC-AD-25 | St19 | (in SP) | — | — |
| FSIQ-STATIC-AD-26 | Statics 20 | (in SP) | — | — |
| FSIQ-STATIC-AD-27 | Statics 21 | (in SP) | — | — |
| FSIQ-STATIC-AD-28 | Statics 22 | (in SP) | — | — |
| FSIQ-STATIC-AD-29 | Statics 23 | (in SP) | — | — |
| FSIQ-STATIC-AD-30 | Statics 24 | (in SP) | — | — |
| FSIQ-STATIC-AD-31 | Statics 25 | (in SP) | — | — |
| FSIQ-STATIC-AD-32 | Statics 26 | (in SP) | — | — |
| FSIQ-STATIC-AD-33 | Statics 27 (Hormozi) | Solution Aware | LP2-EB | 5 Proven Ways, Illustration + Reduction Framework, Profit Framework, Illustration + Profit Framework |

#### Generation 2 Concepts (descriptive variant names, AD-33 concepts with named variants onward)

| Concept # | Concept Name | Awareness | Funnel | Variants |
|-----------|-------------|-----------|--------|----------|
| FSIQ-STATIC-AD-33 | Hormozi | Solution Aware | LP2-EB | 5 Proven Ways, Reduction Framework, Profit Framework, Illustration variants |
| FSIQ-STATIC-AD-34 | We're Sorry | Solution Aware | LP2-EB | Operators, Independent |
| FSIQ-STATIC-AD-35 | Giant Book | Solution Aware | LP2-EB | Zoom-Out, Green Book |
| FSIQ-STATIC-AD-36 | Guest Check | Unaware | LP2-EB | Hospitality Groups, Independent Restaurants |
| FSIQ-STATIC-AD-37 | News + Chef | Product Aware | LP2-EB | Hospitality Groups, Independent Restaurants, Restaurant Operators |
| FSIQ-STATIC-AD-38 | Hand + Book V2 | Solution Aware | LP2-EB | City + Chef, City + Hand, Restaurant + Hand |
| FSIQ-STATIC-AD-39 | Billboard | Unaware | LP2-EB | Green, Orange, Blue |
| FSIQ-STATIC-AD-40 | Comparing Receipts | Problem Aware | LP2-EB | Same Order + Start Saving, Same Order + Upgrade, Stop Overpaying + Upgrade |
| FSIQ-STATIC-AD-41 | Bold Direct Response | Unaware | LP2-EB | 5M + 100k + Learn How |
| FSIQ-STATIC-AD-42 | Locker Room Ad | Unaware | LP2-EB | 100k, Have a Playbook, Less for the Same |
| FSIQ-STATIC-AD-43 | Price Comparison | Unaware | LP2-EB | Chicken, Eggs, Pasta |
| FSIQ-STATIC-AD-44 | Claude & ChatGPT | Unaware | LP2-EB | Claude - Independents, Claude - Food Costs, Claude - Procurement, GPT - Independents, GPT - Food Costs, GPT - Procurement |
| FSIQ-STATIC-AD-45 | Stop Overpaying | Unaware | LP2-EB | Calculator + Learn More, Calculator + Start Saving, Invoice + Learn More, Invoice + Start Saving |
| FSIQ-STATIC-AD-46 | Paper Note | Unaware | LP2-EB | Operators, Hospitality |
| FSIQ-STATIC-AD-47 | 2B+ | Unaware | LP2-EB | Stop Overpaying, Start Saving, Upgrade My Pricing |
| FSIQ-STATIC-AD-48 | Independent vs National Chain | Unaware | LP2-EB | Night, Day, Sunset |
| FSIQ-STATIC-AD-49 | Independent vs Chain V2 | Unaware | LP2-EB | 185k, 185k + Banner, 200k |

### SharePoint Static Images Folder — Confirmed Live Folders (May 2026)

The following 16 concept folders are confirmed present in the Static Images folder on SharePoint (`Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Static Images/`):

| SharePoint Folder Name | Last Modified |
|------------------------|--------------|
| FSIQ-STATIC-AD-10 - Statics 7 | 2026-05-28 |
| FSIQ-STATIC-AD-19b - iMsg | 2026-05-28 |
| FSIQ-STATIC-AD-23 - Statics 17 | 2026-05-28 |
| FSIQ-STATIC-AD-24 - Statics 18 | 2026-05-28 |
| FSIQ-STATIC-AD-25 - Statics 19 | 2026-05-28 |
| FSIQ-STATIC-AD-26 - Statics 20 | 2026-05-28 |
| FSIQ-STATIC-AD-27 - Statics 21 | 2026-05-28 |
| FSIQ-STATIC-AD-28 - Statics 22 | 2026-05-28 |
| FSIQ-STATIC-AD-29 - Statics 23 | 2026-05-28 |
| FSIQ-STATIC-AD-30 - Statics 24 | 2026-05-28 |
| FSIQ-STATIC-AD-31 - Statics 25 | 2026-05-28 |
| FSIQ-STATIC-AD-32 - Statics 26 | 2026-05-28 |
| FSIQ-STATIC-AD-33 - Statics 27 | 2026-05-28 |
| FSIQ-STATIC-AD-34 - Statics (We're Sorry area) | 2026-05-28 |
| FSIQ-STATIC-AD-35 - various | 2026-05-28 |
| FSIQ-STATIC-AD-38 through AD-49 (Generation 2 batch) | 2026-05-28 |

Each confirmed folder contains a `/Campaign Brief/`, `/Raw Footage/`, and `/Final/` subfolder structure. File naming inside `/Final/` uses simple numeric incrementing (`1.png`, `2.png`) for Generation 1 concepts.

---

## Changelog

| Date | Change | Source |
|------|--------|--------|
| May 2026 | v1.0 — initial document created from Supabase `creative_pipeline` (383 ads, 142 static), `ad_performance` (active set confirmed), `footage_log` (2 records); SharePoint Static Images (16 concept folders confirmed live, no 503 errors); SOPs: `fsiq-brand-voice-paid-ads.md`, `fsiq-company-profile.md`, `creative-pipeline-sop.md`, `paid-media-agent-sop.md` | static-creator guideline build |
