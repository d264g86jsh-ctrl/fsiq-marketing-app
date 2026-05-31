# FSIQ Static Ad Design Guidelines
**Version:** 1.0 | **Created:** May 2026 | **Owner:** Paid Media Agent
**Scope:** All static image ads for Facebook, Instagram, and display placements

> This document is completely standalone. A designer or the static-creator skill can create FSIQ-compliant statics from this guide alone without consulting any other document. When anything here conflicts with general design intuition, this document wins.

---

## Table of Contents

1. [Typography System](#1-typography-system)
2. [Color Palette](#2-color-palette)
3. [Layout & Composition](#3-layout--composition)
4. [Button & CTA Component](#4-button--cta-component)
5. [Variant System (A/B/C)](#5-variant-system-abc)
6. [Reference Examples — Annotated](#6-reference-examples--annotated)
7. [Design Checklist](#7-design-checklist)
8. [Canva API Integration](#8-canva-api-integration)
9. [File Naming Convention](#9-file-naming-convention)
10. [Common Mistakes to Avoid](#10-common-mistakes-to-avoid)

---

## 1. Typography System

**One font family only: Inter.**

Inter is available via Google Fonts (`https://fonts.google.com/specimen/Inter`). Do not substitute with Helvetica, Arial, or any system sans-serif — Inter's optical sizing and weight range are specifically suited to FSIQ's direct-response aesthetic.

### Font Hierarchy

#### Level 1 — Headline (Hook Statement)

The most prominent text element. Contains the core value claim or curiosity hook.

| Property | Landscape (1200×628) | Square (1080×1080) |
|----------|----------------------|---------------------|
| Font | Inter | Inter |
| Weight | 700 (Bold) or 800 (ExtraBold) | 700 (Bold) or 800 (ExtraBold) |
| Size | 56–72px | 48–64px |
| Line height | 1.15 | 1.15 |
| Letter spacing | −0.5px to −1px | −0.5px to −1px |
| Max lines | 2 | 3 |
| Color | `#FFFFFF` on dark backgrounds; `#143225` on light backgrounds |
| Alignment | Left-aligned or centered (never right-aligned) |
| Capitalization | Sentence case. Never ALL CAPS on more than 3 words. |

**Character limits:** 45 characters for 1-line headlines. 80 characters across 2 lines. If the hook is longer, break it before a natural pause — never mid-phrase.

---

#### Level 2 — Sub-headline / Hook Qualifier

Supports the headline with a specific number, qualifier, or proof point.

| Property | Value |
|----------|-------|
| Font | Inter |
| Weight | 500 (Medium) or 600 (SemiBold) |
| Size | 24–32px |
| Line height | 1.3 |
| Letter spacing | 0px |
| Max lines | 2 |
| Color | `#FFFFFF` at 85% opacity on dark backgrounds; `#475569` on light backgrounds |
| Alignment | Matches headline alignment |

---

#### Level 3 — Body / Supporting Detail

Brief, secondary text. Used for social proof counts, disclaimers, or secondary value statements.

| Property | Value |
|----------|-------|
| Font | Inter |
| Weight | 400 (Regular) |
| Size | 18–22px |
| Line height | 1.45 |
| Letter spacing | 0px |
| Max lines | 2 |
| Color | `#FFFFFF` at 70% opacity on dark; `#64748B` on light |
| Alignment | Matches headline alignment |

---

#### Level 4 — CTA Button Label

Text inside the CTA button. Must be legible at thumbnail size (200px wide).

| Property | Value |
|----------|-------|
| Font | Inter |
| Weight | 700 (Bold) |
| Size | 16–18px minimum |
| Letter spacing | 0.5px |
| Capitalization | Title Case preferred ("Book Your Analysis") or ALL CAPS short form ("BOOK A CALL") |
| Color | `#FFFFFF` always |

---

#### Level 5 — Fine Print / Attribution

URL, disclaimer, or small social proof. Never critical to the message.

| Property | Value |
|----------|-------|
| Font | Inter |
| Weight | 400 (Regular) |
| Size | 12–14px |
| Color | `#FFFFFF` at 50% opacity on dark; `#94A3B8` on light |

---

### Typography Don'ts

- ✗ No serif fonts (no Georgia, Times, Playfair)
- ✗ No font sizes below 12px (illegible at mobile feed size)
- ✗ No italic on headlines (weakens authority)
- ✗ No more than 2 font weights in a single ad
- ✗ No text-on-text shadows (use background contrast instead)
- ✗ No justified text alignment

---

## 2. Color Palette

### Primary Brand Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| FSIQ Dark Green | `#143225` | rgb(20, 50, 37) | Primary background, headline text on light bg, CTA button fill |
| FSIQ Accent Green | `#52C275` | rgb(82, 194, 117) | Highlight text, accent bars, callout boxes, Variant B pop color |
| Pure White | `#FFFFFF` | rgb(255, 255, 255) | All text on dark backgrounds, icon fills |
| Off-White | `#F8FAFC` | rgb(248, 250, 252) | Light-mode ad backgrounds |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| Slate 600 | `#475569` | rgb(71, 85, 105) | Body text on light backgrounds, secondary labels |
| Slate 400 | `#94A3B8` | rgb(148, 163, 184) | Fine print on light backgrounds |
| Slate 100 | `#F1F5F9` | rgb(241, 245, 249) | Subtle dividers, card backgrounds on light ads |

### Color Application Rules

**Rule 1 — Maximum 3 colors per ad.** Choose from: Dark Green + White + (optional) Accent Green. Using Accent Green with both Dark Green and White counts as 3. Do not introduce a 4th color.

**Rule 2 — Never use Accent Green (`#52C275`) as a background for body text.** Contrast ratio is insufficient for Inter Regular at body sizes. Accent Green is for highlights, badges, and short bolded callouts only.

**Rule 3 — Never approximate.** Brand colors are exact. `#1a3228` is not `#143225`. Use the exact hex values above.

**Rule 4 — Photo backgrounds require an overlay.** If a photo is used as background, add a semi-transparent Dark Green overlay at minimum 60% opacity: `rgba(20, 50, 37, 0.65)`. This ensures text contrast and visual consistency across all ad sets.

**Rule 5 — Dark Green owns the CTA button.** The CTA button is always `#143225` fill with `#FFFFFF` text. Do not invert this for "contrast." The dark green button on any background is the established visual anchor.

### Contrast Reference

| Text color | Background | WCAG ratio | Pass? |
|-----------|-----------|------------|-------|
| `#FFFFFF` | `#143225` | 12.5:1 | ✅ AAA |
| `#143225` | `#FFFFFF` | 12.5:1 | ✅ AAA |
| `#143225` | `#F8FAFC` | 11.8:1 | ✅ AAA |
| `#FFFFFF` | `#52C275` | 3.0:1 | ⚠️ AA large only — avoid for body text |
| `#143225` | `#52C275` | 4.2:1 | ✅ AA — usable for bold labels only |

---

## 3. Layout & Composition

### Standard Ad Dimensions

| Format | Dimensions | Aspect ratio | Primary placement |
|--------|-----------|--------------|-------------------|
| Landscape | 1200 × 628 px | 1.91:1 | Facebook News Feed, Link ads, Open Graph |
| Square | 1080 × 1080 px | 1:1 | Instagram Feed, Facebook Feed mobile |
| Story / Reel | 1080 × 1920 px | 9:16 | Instagram Stories, Facebook Stories |

**Export spec:** PNG, sRGB color space, 72 DPI (screen), maximum 30MB. For Facebook upload, compress to under 1MB without visible quality loss.

---

### Safe Text Areas

Text placed outside the safe zone risks being clipped by feed UI, rounded corners, or platform chrome.

#### Landscape (1200 × 628)
```
┌──────────────────────────────────────────────────────────────────────┐
│  60px                                                           60px  │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │                     SAFE TEXT ZONE                         │  40px │
│  │                                                            │       │
│  │  Full-bleed image or color can extend to edges.            │       │
│  │  All text, logos, buttons MUST stay inside this box.       │       │
│  │                                                            │  40px │
│  └────────────────────────────────────────────────────────────┘       │
│  60px                                                           60px  │
└──────────────────────────────────────────────────────────────────────┘
```
- Horizontal padding: **60px** from each edge
- Vertical padding: **40px** from top and bottom
- Safe zone dimensions: 1080 × 548 px
- No critical content within 60px of any edge

#### Square (1080 × 1080)
```
┌──────────────────────────────────────────────────────────────────────┐
│  60px                                                           60px  │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │                     SAFE TEXT ZONE                         │  60px │
│  │                  960 × 960 px                              │       │
│  │                                                            │       │
│  │  Content inside here. Background can bleed to edges.       │       │
│  │                                                            │  60px │
│  └────────────────────────────────────────────────────────────┘       │
│  60px                                                           60px  │
└──────────────────────────────────────────────────────────────────────┘
```
- All padding: **60px** on all sides
- Safe zone dimensions: 960 × 960 px

---

### Logo Placement

The FSIQ logo is placed in the **top-left** of the safe text zone in all standard formats.

| Property | Value |
|----------|-------|
| Position | Top-left corner of safe zone |
| Size | 60–80px tall (width scales proportionally) |
| Spacing from edge | Exactly at the safe zone boundary (60px from edge) |
| Color | White on dark backgrounds; Dark Green (`#143225`) on light |
| Minimum clear space | 12px on all sides of logo (no text or elements within) |

**Never:** center the logo, place it bottom-center, or use a drop shadow on the logo.

---

### Text Block Placement Options

Three approved layout patterns. Choose based on background and message length.

#### Layout A — Full-Overlay (dark bg or photo with overlay)
```
┌─────────────────────────────────────────────────────────┐
│  [LOGO]                                                  │
│                                                          │
│                                                          │
│         HEADLINE TEXT — 2 LINES MAX                      │
│         Sub-headline or proof point                      │
│                                                          │
│                                                          │
│              [ CTA BUTTON ]                              │
└─────────────────────────────────────────────────────────┘
```
Use when: solid Dark Green background, or photo with ≥60% overlay. All text centered or left-aligned.

#### Layout B — Side Panel (light bg with image)
```
┌──────────────────────────┬──────────────────────────────┐
│  [LOGO]                  │                              │
│                          │                              │
│  HEADLINE TEXT           │    [PHOTO / VISUAL]          │
│  Sub-headline            │                              │
│                          │                              │
│  [ CTA BUTTON ]          │                              │
└──────────────────────────┴──────────────────────────────┘
```
Use when: Off-White background, image fills right 45–50% of canvas. Text block is left-aligned, image bleeds to right edge.

#### Layout C — Stacked (square format, centered)
```
┌─────────────────────────────────────────────────────────┐
│                      [LOGO]                             │
│                                                          │
│               HEADLINE TEXT                              │
│             (centered, 2 lines)                          │
│                                                          │
│              Supporting detail                           │
│                                                          │
│                [ CTA BUTTON ]                            │
└─────────────────────────────────────────────────────────┘
```
Use when: square format with no photo, or centered brand statement. Button is centered and full-width within safe zone.

---

### Whitespace Rules

- **Minimum gap between headline and sub-headline:** 16px
- **Minimum gap between sub-headline and body:** 12px
- **Minimum gap between body and CTA button:** 24px
- **Minimum gap between logo and first text element:** 20px
- **Breathing room:** At least 30% of the ad area should be non-text (background, image, or whitespace)

---

### Image Area vs Text Area Ratio

| Layout | Text area | Image/color area |
|--------|-----------|-----------------|
| Full-overlay | 100% (text over full-bleed) | 100% (background) |
| Side panel | ~50% | ~50% |
| Stacked | ~60% | ~40% |

Text-heavy ads outperform image-heavy in direct-response. When in doubt, prioritize legible text over aesthetic photography.

---

## 4. Button & CTA Component

### Button Specification

| Property | Value |
|----------|-------|
| Background color | `#143225` (Dark Green) |
| Text color | `#FFFFFF` |
| Font | Inter 700 Bold |
| Font size | 16–18px minimum |
| Height | 44px minimum (mobile tap target) |
| Horizontal padding | 24px left, 24px right |
| Border radius | 6px (slightly rounded, not pill) |
| Border | None |
| Drop shadow | None |

**Full-width variant:** In stacked (Layout C) compositions, the button may stretch to 80% of the safe zone width. Center horizontally.

**Fixed-width variant:** In side-panel (Layout B) compositions, button width is determined by content + padding. Left-aligned to match text block.

### Button States

Static ads do not have interactive states, but the button must read as tappable. Achieve this through:
- Sufficient contrast (Dark Green on any background passes)
- Clear rectangular shape with 6px radius
- Text that is a verb phrase ("Book Your Analysis" not "Analysis")

### CTA Copy — Approved Phrases

These are the validated, highest-performing CTA labels. Use these in order of preference:

1. **"Book Your Analysis"** — Top performer. Use for Solution-Aware audiences.
2. **"Get Your Savings Estimate"** — Use for Unaware/Curious audiences.
3. **"Schedule Free Review"** — Use for retargeting warm audiences.
4. **"Download Free Playbook"** — Use when playbook is the offer.
5. **"See How It Works"** — Use for cold traffic unfamiliar with FSIQ.

**Rules for CTA copy:**
- Sentence case or Title Case only. Not ALL CAPS.
- Maximum 4 words. "Book Your Free Analysis" = 4 words, acceptable. "Book Your Completely Free Personalized Analysis" = too long.
- Must be a verb phrase. Not "Free Analysis" — "Book Your Analysis."
- Never: "Learn More," "Click Here," "Get Started," "Sign Up."

---

## 5. Variant System (A/B/C)

Every static ad concept is produced in 3 variants that test different design dimensions while keeping the core offer constant.

### Variant A — Conservative (Proven / Safe)

**Hypothesis:** High-contrast, authoritative design converts best with cold restaurant-owner audiences.

| Element | Specification |
|---------|--------------|
| Background | Solid `#143225` Dark Green, full-bleed |
| Headline color | `#FFFFFF` White |
| Sub-headline color | `#FFFFFF` at 80% opacity |
| Accent color | None — pure Dark Green + White only |
| CTA button | `#143225` with `2px solid #FFFFFF` border (inverted on dark bg) |
| CTA text | `#FFFFFF` |
| Tone | Confident, specific numbers ("Save $100K+/year") |
| Layout | Full-overlay (Layout A) |
| CTA copy | "Book Your Analysis" |

**When to use Variant A:** Always the control ad in any A/B test. If only one variant is running, it must be A.

---

### Variant B — Aggressive (New Angle / Accent Pop)

**Hypothesis:** The Accent Green creates a visual interrupt that draws attention in feed and lifts click-through on high-intent audiences.

| Element | Specification |
|---------|--------------|
| Background | Solid `#143225` Dark Green, full-bleed |
| Headline color | `#52C275` Accent Green (primary hook only) |
| Sub-headline color | `#FFFFFF` |
| Accent color | `#52C275` on headline, badge, or callout bar only |
| CTA button | `#52C275` background, `#143225` text (reversed) |
| Tone | More direct, urgency signal ("Most restaurants overpay by $50K+") |
| Layout | Full-overlay (Layout A) or Side Panel (Layout B) |
| CTA copy | "Get Your Savings Estimate" |

**When to use Variant B:** Test after Variant A has 300+ impressions. Rotate into ad set when A fatigues (CTR drops >20%).

**Constraint:** Accent Green is used on exactly one element beyond the CTA. Headline OR a badge OR a bar — never all three simultaneously.

---

### Variant C — Hybrid (Balanced / Social Proof Focus)

**Hypothesis:** A light, clean background with social proof signals (2,000+ restaurants) performs better with warm/retargeted audiences.

| Element | Specification |
|---------|--------------|
| Background | `#F8FAFC` Off-White |
| Headline color | `#143225` Dark Green |
| Sub-headline color | `#475569` Slate 600 |
| Accent color | `#52C275` on social proof badge only (e.g., "2,000+ restaurants served") |
| CTA button | `#143225` fill, `#FFFFFF` text (standard) |
| Tone | Confident + social proof ("Trusted by 2,000+ independent restaurants") |
| Layout | Side Panel (Layout B) or Stacked (Layout C) |
| CTA copy | "Schedule Free Review" or "Download Free Playbook" |

**When to use Variant C:** Retargeting campaigns, warm lookalike audiences, and restaurant-specific account-based targeting. Pairs well with testimonial or case-study copy.

---

## 6. Reference Examples — Annotated

### Example 1 — AD-28 "Podcast Ad Blurred Book" (Top Performer)

**AD ID:** FSIQ-STATIC-AD-28 | **Concept:** Blurred book prop with curiosity hook
**Performance:** #1 overall performer — cp2ql_lifetime $148.96, 83 leads at this CPA

#### Composition (Landscape 1200×628)
```
┌───────────────────────────────────────────────────────────────────────────┐
│  [FSIQ Logo — white, 70px tall, top-left, 60px from edges]               │
│                                                                           │
│                                                                           │
│    "If your restaurant does over $3M/year in          [BLURRED BOOK       │
│     revenue, I'd like to send you this                 PHOTO — right      │
│     book completely free."                             45% of canvas]     │
│    [Inter 700, 60px, #FFFFFF, left-aligned]                               │
│                                                                           │
│    "This is the exact playbook our team uses           │
│     to save 2,000+ restaurants 5-7% annually."        │
│    [Inter 500, 26px, #FFFFFF 80%, left-aligned]        │
│                                                                           │
│    [  Book Your Analysis  ]                                               │
│    [#143225 btn, white text, 44px h, 6px radius]                          │
└───────────────────────────────────────────────────────────────────────────┘
```

**Why it works:**
- **Curiosity gap:** Blurred book creates visual mystery. The hook tells you what it is before you see it clearly — this is the "prop reveal" hook type.
- **Self-qualifying:** "$3M+ revenue" filters out irrelevant clicks in the first line. The CPC appears higher but CPL is lower because of qualification.
- **Specificity:** "5–7% annually" and "2,000+ restaurants" are concrete, not vague. Specific numbers outperform general claims in FSIQ's audience.
- **Color:** Dark green full-bleed with white text achieves 12.5:1 contrast. Zero ambiguity about what to read first.
- **CTA placement:** Button is positioned at the bottom-left, directly under the body copy. Eye path: Logo → Headline → Body → CTA. Linear top-to-bottom.

**Exact measurements:**
- Canvas: 1200 × 628 px
- Safe zone: 60px all sides
- Logo: 70px tall, top-left at (60, 40)
- Headline: 60px, starts at x=60, y=160
- Sub-headline: 26px, 16px gap below headline bottom
- CTA button: 44px tall, 200px wide, at bottom of safe zone (y=548 minus button height)
- Photo: right 45% (x=660 to x=1200), full bleed height

---

### Example 2 — AD-23 "Gift / Offer" (Strong Performer)

**AD ID:** FSIQ-STATIC-AD-23 | **Concept:** Holiday gift / playbook offer framing
**Performance:** #2 performer in gift-offer hook category; paired with AD-18 in same hook type

#### Composition (Square 1080×1080)
```
┌───────────────────────────────────────────────────────────────────────────┐
│  [FSIQ Logo — white, 70px, top-center or top-left]                       │
│                                                                           │
│                                                                           │
│         "The best gift I could give you this year                         │
│          is something we normally charge for…"                            │
│         [Inter 700, 56px, #FFFFFF, centered]                              │
│                                                                           │
│         "Download our completely free playbook —                          │
│          used by 2,000+ independent restaurants."                         │
│         [Inter 500, 24px, #FFFFFF 80%, centered]                          │
│                                                                           │
│                                                                           │
│              [  Download Free Playbook  ]                                 │
│              [#143225, #FFFFFF, centered, full-safe-width]                │
└───────────────────────────────────────────────────────────────────────────┘
```

**Why it works:**
- **Gift framing:** Positions the offer as something being given away — not a lead magnet, but a gift. This reframes the transaction and reduces the perceived risk of clicking.
- **Ellipsis pause:** "…" at the end of the headline creates a scroll-stop — the viewer reads the incomplete sentence and needs to finish it in the sub-headline.
- **Social proof in body:** "used by 2,000+ independent restaurants" grounds the gift claim in real evidence without sounding like a pitch.
- **Stacked layout:** Square format with centered hierarchy means mobile users see the full headline in one glance without horizontal scrolling.
- **CTA specificity:** "Download Free Playbook" is a concrete action vs generic "Learn More." Viewer knows exactly what they get.

**Exact measurements:**
- Canvas: 1080 × 1080 px
- Safe zone: 60px all sides (960 × 960 safe area)
- Logo: 70px, centered at top of safe zone (x=center, y=60)
- Headline: 56px, centered, starts at y=180
- Sub-headline: 24px, 16px gap below headline
- CTA button: 44px tall, 80% of safe width (768px wide), centered, bottom of safe zone

---

## 7. Design Checklist

Complete every item before submitting a static for review or uploading to Canva/Meta.

### Brand Compliance
- [ ] Font is Inter only — no other font families used
- [ ] Headline weight is 700 or 800 — not 400 or 500
- [ ] Background color is exactly `#143225` (dark mode) or `#F8FAFC` (light mode) — verified with eyedropper
- [ ] Accent Green (`#52C275`) used on maximum 1 element per ad
- [ ] Maximum 3 colors total in ad (Dark Green + White + optional Accent Green)
- [ ] No 4th color introduced

### Layout Compliance
- [ ] Logo is placed top-left within safe zone
- [ ] Logo is 60–80px tall
- [ ] All text is within 60px horizontal safe zone margins
- [ ] All text is within 40px vertical safe zone margins (landscape) or 60px (square)
- [ ] No text overlaps a busy photo area without sufficient overlay opacity

### Typography Compliance
- [ ] Headline is ≤2 lines on landscape; ≤3 lines on square
- [ ] Headline font size is 56–72px on landscape; 48–64px on square
- [ ] No italic text on headlines
- [ ] CTA button text is 16px minimum
- [ ] Fine print is 12px minimum

### CTA Compliance
- [ ] CTA button minimum height is 44px
- [ ] CTA button uses `#143225` fill and `#FFFFFF` text (Variant A/C) or `#52C275` fill and `#143225` text (Variant B)
- [ ] CTA copy is one of the 5 approved phrases (or has been explicitly approved)
- [ ] CTA is visually distinct and stands alone — not competing with other elements for attention

### Content Compliance
- [ ] No em dashes (`—`) in any copy — use ellipsis (`…`) or period
- [ ] No math performed out loud in copy ("5% of $2M = $100K" → ✗)
- [ ] Copy is ≤80 characters across headline + sub-headline combined
- [ ] Numbers are specific, not rounded vaguely ("$100K–$270K typical range" not "save money")
- [ ] Tone is confident and direct — not hype, not alarm, not adversarial

### File Compliance
- [ ] Exported as PNG
- [ ] Color space is sRGB
- [ ] File size is under 1MB (for Meta upload)
- [ ] File named using the approved convention (see Section 9)

---

## 8. Canva API Integration

The `static-creator.skill.ts` skill generates static ads via the Canva API using base templates. Three templates are maintained — one per standard format.

### Template 1 — Landscape Dark (1200×628, Variant A/B base)

```json
{
  "template_name": "FSIQ-Landscape-Dark-Base",
  "dimensions": { "width": 1200, "height": 628 },
  "background": "#143225",
  "elements": [
    {
      "id": "logo",
      "type": "image",
      "x": 60, "y": 40,
      "height": 70,
      "placeholder": "fsiq_logo_white"
    },
    {
      "id": "headline",
      "type": "text",
      "x": 60, "y": 160,
      "width": 620,
      "font": "Inter",
      "weight": 700,
      "size": 64,
      "color": "#FFFFFF",
      "line_height": 1.15,
      "max_lines": 2
    },
    {
      "id": "subheadline",
      "type": "text",
      "x": 60, "y": "headline_bottom + 16",
      "width": 620,
      "font": "Inter",
      "weight": 500,
      "size": 26,
      "color": "#FFFFFFCC",
      "line_height": 1.3,
      "max_lines": 2
    },
    {
      "id": "cta_button",
      "type": "button",
      "x": 60, "y": 548,
      "width": 240, "height": 44,
      "bg_color": "#143225",
      "border": "2px solid #FFFFFF",
      "border_radius": 6,
      "text_color": "#FFFFFF",
      "font": "Inter",
      "font_weight": 700,
      "font_size": 17
    },
    {
      "id": "image_panel",
      "type": "image",
      "x": 660, "y": 0,
      "width": 540, "height": 628,
      "placeholder": "concept_photo"
    }
  ]
}
```

### Template 2 — Square Dark (1080×1080, Variant A/B/C base)

```json
{
  "template_name": "FSIQ-Square-Dark-Base",
  "dimensions": { "width": 1080, "height": 1080 },
  "background": "#143225",
  "elements": [
    {
      "id": "logo",
      "type": "image",
      "x": 60, "y": 60,
      "height": 70,
      "placeholder": "fsiq_logo_white"
    },
    {
      "id": "headline",
      "type": "text",
      "x": 60, "y": 220,
      "width": 960,
      "font": "Inter",
      "weight": 700,
      "size": 56,
      "color": "#FFFFFF",
      "line_height": 1.15,
      "alignment": "center",
      "max_lines": 3
    },
    {
      "id": "subheadline",
      "type": "text",
      "x": 60, "y": "headline_bottom + 20",
      "width": 960,
      "font": "Inter",
      "weight": 500,
      "size": 24,
      "color": "#FFFFFFCC",
      "line_height": 1.3,
      "alignment": "center",
      "max_lines": 2
    },
    {
      "id": "cta_button",
      "type": "button",
      "x": 120, "y": 960,
      "width": 840, "height": 44,
      "bg_color": "#143225",
      "border": "2px solid #FFFFFF",
      "border_radius": 6,
      "text_color": "#FFFFFF",
      "font": "Inter",
      "font_weight": 700,
      "font_size": 17,
      "alignment": "center"
    }
  ]
}
```

### Template 3 — Square Light (1080×1080, Variant C base)

```json
{
  "template_name": "FSIQ-Square-Light-Base",
  "dimensions": { "width": 1080, "height": 1080 },
  "background": "#F8FAFC",
  "elements": [
    {
      "id": "logo",
      "type": "image",
      "x": 60, "y": 60,
      "height": 70,
      "placeholder": "fsiq_logo_dark",
      "tint": "#143225"
    },
    {
      "id": "headline",
      "type": "text",
      "x": 60, "y": 220,
      "width": 960,
      "font": "Inter",
      "weight": 700,
      "size": 56,
      "color": "#143225",
      "line_height": 1.15,
      "alignment": "left",
      "max_lines": 3
    },
    {
      "id": "subheadline",
      "type": "text",
      "x": 60, "y": "headline_bottom + 20",
      "width": 960,
      "font": "Inter",
      "weight": 500,
      "size": 24,
      "color": "#475569",
      "line_height": 1.3,
      "alignment": "left",
      "max_lines": 2
    },
    {
      "id": "social_proof_badge",
      "type": "badge",
      "x": 60, "y": "subheadline_bottom + 24",
      "bg_color": "#52C275",
      "text_color": "#143225",
      "font": "Inter",
      "font_weight": 700,
      "font_size": 14,
      "border_radius": 4,
      "padding": "6px 12px"
    },
    {
      "id": "cta_button",
      "type": "button",
      "x": 60, "y": 960,
      "width": 320, "height": 44,
      "bg_color": "#143225",
      "border_radius": 6,
      "text_color": "#FFFFFF",
      "font": "Inter",
      "font_weight": 700,
      "font_size": 17
    }
  ]
}
```

---

## 9. File Naming Convention

### Pattern

```
FSIQ-STATIC-[AD-ID]-[CONCEPT-NAME]-[VARIANT].[ext]
```

### Rules

- `[AD-ID]` — Full ID in uppercase: `AD-28`, `AD-30`, `AD-49`
- `[CONCEPT-NAME]` — Title-cased concept name, spaces replaced with hyphens, max 30 characters: `Podcast-Blurred-Book`, `Gift-Offer`, `Invoice-Proof`
- `[VARIANT]` — Single letter: `A`, `B`, or `C`
- `[ext]` — Always `png` (lowercase)

### Examples

```
FSIQ-STATIC-AD-28-Podcast-Blurred-Book-A.png
FSIQ-STATIC-AD-28-Podcast-Blurred-Book-B.png
FSIQ-STATIC-AD-28-Podcast-Blurred-Book-C.png
FSIQ-STATIC-AD-23-Gift-Offer-A.png
FSIQ-STATIC-AD-23-Gift-Offer-B.png
FSIQ-STATIC-AD-30-Media-Pouch-A.png
FSIQ-STATIC-AD-49-New-Invention-A.png
```

### What Not To Do

- ✗ `FSIQ_AD28_static_v1_FINAL_FINAL.png` — no underscores, no "v1", no "FINAL"
- ✗ `ad28-a.png` — must include full FSIQ prefix
- ✗ `FSIQ-STATIC-AD-28-Podcast-Ad-Blurred-Book-No-Book-Variant-A.png` — concept name max 30 characters
- ✗ `FSIQ-STATIC-AD28-...` — hyphen between AD and number: `AD-28` not `AD28`

---

## 10. Common Mistakes to Avoid

### Mistake 1 — Wrong color hex values

**What happens:** Designer uses `#1a3228` or `#14322a` instead of `#143225`. The ad looks correct on screen but fails brand audit on close inspection. Colors drift across an ad set when multiple designers work from approximations.

**Fix:** Copy exact hex from this document. Verify with eyedropper on final export. `#143225` only.

---

### Mistake 2 — Text placed outside safe zone

**What happens:** Headline or logo is 20–30px from the canvas edge. On Facebook mobile News Feed, rounded corners or UI elements clip the text. On Instagram, the bottom action bar covers the CTA.

**Fix:** Always work within the safe zone boundaries documented in Section 3. On the landscape format: 60px horizontal, 40px vertical. Never rely on visual approximation — set guides or use the safe zone template.

---

### Mistake 3 — Accent Green as background

**What happens:** Designer uses `#52C275` as the ad background or button fill for body text. At 18–22px regular weight, the contrast ratio is only 3.0:1 — below WCAG AA for normal text. The ad looks energetic but is hard to read, especially on compressed mobile feeds.

**Fix:** Accent Green is for highlights, badges, and Variant B CTA buttons only. It is never the background for body copy or sub-headlines. Body text always sits on `#143225` or `#F8FAFC`.

---

### Mistake 4 — CTA copy is too generic

**What happens:** CTA button reads "Learn More" or "Get Started." These are the lowest-performing CTA labels in direct-response. They signal to the viewer that they don't know what they're clicking into.

**Fix:** Use one of the 5 approved CTA phrases from Section 4. If the concept needs a custom CTA, it must be a verb phrase that tells the viewer exactly what they receive: "Download Free Playbook," "Book Your Analysis," "Get Your Savings Estimate."

---

### Mistake 5 — Photo background without sufficient overlay

**What happens:** A kitchen or restaurant photo is used full-bleed behind white text. The photo has bright areas (windows, stainless steel surfaces) that destroy text contrast in the busy parts of the image.

**Fix:** Any photo background requires a `rgba(20, 50, 37, 0.65)` Dark Green overlay applied as a full-bleed layer between the photo and the text. Test by zooming out to 25% — if every word is readable at that size, the contrast is sufficient.

---

### Mistake 6 — Em dash in ad copy

**What happens:** Copy writer uses em dash (`—`) in headline or sub-headline. This violates the FSIQ brand voice rules established across all paid media copy.

**Fix:** Replace every `—` with `…` (ellipsis) for pauses and connective tissue. "Save money — without changing your suppliers" becomes "Save money… without changing your suppliers."

---

### Mistake 7 — Headline is more than 2 lines on landscape

**What happens:** A long headline wraps to 3 lines at 60px. This pushes the sub-headline below the vertical midpoint and compresses the CTA area. The ad looks crowded, the hierarchy breaks, and the CTA may fall outside the safe zone.

**Fix:** Edit the headline to fit 2 lines at the target font size. If the message cannot be compressed, reduce font size to 48px (minimum for landscape) and verify the safe zone is respected. Never reduce to under 48px.

---

### Mistake 8 — Using more than 1 Accent Green element

**What happens:** Designer adds Accent Green to the headline, a badge, AND the CTA button simultaneously (Variant B). The eye has no single anchor. The ad looks fragmented and the CTA loses prominence.

**Fix:** In Variant B, choose exactly one element for Accent Green: either the headline text OR a badge/callout OR the CTA button fill. Not multiple. The constraint is intentional — one green element creates contrast; multiple green elements create noise.

---

*End of document. This guide is self-contained and authoritative. For brand voice and messaging rules (copy tone, what not to say), refer to the FSIQ Brand Voice — Paid Ads SOP, but do not defer any visual specification to any external document.*

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| May 2026 | 1.0 | Initial document — standalone designer-ready spec |
