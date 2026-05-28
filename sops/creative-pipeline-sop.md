# Creative Pipeline SOP & Nomenclature Guide
**Version:** 2.0 | **Last updated:** May 2026
**Source of truth:** This file. Loaded at runtime by any skill that reads or writes creative data.

---

## 1. Full Ad Naming Convention

Every ad follows this exact dash-delimited format:

**VIDEO:**
```
FSIQ-VIDEO-AD-[##][variant] - [Global #] - [Ad Set Token] - [Hook Description] - [Hook Type] - [Awareness Level] - [Funnel/LP] - [Copy Version] - [Duration]
```

**STATIC:**
```
FSIQ-STATIC-AD-[##] - [Global #] - [Ad Set Token] - [Variant] - Static - [Awareness Level] - [Funnel/LP] - [Copy Version]
```

**Examples from live account:**
```
FSIQ-VIDEO-AD-28 - 117 - Podcast Ad Blurred Book - No Book - Direct Offer / Gift - Solution Aware - LP2-EB - COPY-02 - 60s+
FSIQ-VIDEO-AD-30 - 124 - Media Pouch - Hook 4 15M - Pain Point / Pattern Interrupt - Solution Aware - LP2-EB - COPY-02 - 45s
FSIQ-STATIC-AD-01 - 1 - St1 - 1.1 - Static - Problem Aware - LP1-CS - COPY-01
FSIQ-STATIC-AD-43 - 141 - Price Comparison - Eggs - Static - Unaware - LP2-EB - COPY-02
```

---

## 2. Ad Set Naming Convention

Every Meta ad set follows this dash-delimited format:

```
[FSIQ-TYPE-AD-##] - [Ad Set Token] - [Targeting] - [LP-Code]
```

No leading "FSIQ -" prefix — the Concept ID leads directly.

**Examples:**
```
FSIQ-STATIC-AD-01 - St1 - Broad - LP1-CS
FSIQ-STATIC-AD-19b - iMsg - Broad - LP2-EB
FSIQ-VIDEO-AD-01 - VSL_1 - Chad - Broad - LP1-CS
FSIQ-VIDEO-AD-02 - VSL_3v4 - Neil / Richard - Broad - LP2-EB
FSIQ-VIDEO-AD-28 - Podcast Ad Blurred Book - Broad - LP2-EB
FSIQ-VIDEO-AD-30 - Media Pouch - Broad - LP2-EB
```

The Ad Set Token (position 2) is the creative/execution variant: talent name, version shortcode, or concept shortname. Multiple ad sets exist per concept — one per execution variant × targeting × LP combination.

**Relationship to ad name:** The Ad Set Token at position 2 of the ad set name reappears at position 3 of the ad name. Targeting is only at the ad set level.

---

## 3. Field Definitions

### AD ID Format
- Prefix: `FSIQ-VIDEO-AD` or `FSIQ-STATIC-AD`
- Number: globally unique integer, never reused
- Variant suffix: `b/c/d` = sub-variant of same concept (same concept ID, different execution)
  - Example: `AD-27`, `AD-27b` = two executions of concept 27 (iPhone vs Studio)
- Retargeting: uses AW prefix → `FSIQ-VIDEO-AW-AD-01`

### Variant System (two generations)

**Generation 1 — AD-01 through AD-27:** Numeric variant codes (1.1, 1.2, 1.3...). First number = static set number or talent, second = individual creative within that set. Ad Set Token includes talent name (`VSL_1 | Chad`, `VSL_1 | Neil`).

**Generation 2 — AD-28 and later:** Descriptive hook names as variant identifiers ("No Book", "Book", "Hook 4 - 15M", "Hook 5 - Started 2010"). Ad Set Token is the concept shortname ("Podcast Ad Blurred Book", "Media Pouch").

### Global Number
- Sequential integer assigned at launch, unique across ALL ads (videos + statics)
- Separate from the AD concept number
- Examples: 117, 124, 133, 141, 158

### Hook Types (controlled vocabulary)
- `Pain Point / Pattern Interrupt`
- `Direct Offer / Gift`
- `Social Proof`
- `Authority / Data`
- `Curiosity / Contrarian`
- `Static` (static images only)

### Awareness Levels (controlled vocabulary)
- `Unaware` — doesn't know they have a problem
- `Problem Aware` — knows the problem, doesn't know solutions
- `Solution Aware` — knows solutions exist, doesn't know FSIQ
- `Product Aware` — knows FSIQ, hasn't committed
- `Most Aware` — ready to act

### Funnel / Landing Page (controlled vocabulary)
- `LP1-CS` = LP1 (Case Study): getfoodserviceiq.com/case-study
- `LP2-EB` = LP2 (eBook): getfoodserviceiq.com/5provenways
- `LP3-EB` = LP3 (Food Cost Playbook): getfoodserviceiq.com/foodcost-playbook

### Copy Version
- Format: `COPY-01` through `COPY-13` (see Copywriting Matrix in Creative Tracker)
- Tracks which body copy variant runs on the ad set
- Current winner: **COPY-02** ($197 CPQL, 1.24% CTR)
- Full copy text for each COPY-ID is in the Copywriting Matrix tab of the Creative Tracker

### Duration (video only)
- `45s` = ~45 second ad
- `60s` = ~60 second ad
- `60s+` = 60+ seconds (long form)

### Format (static only)
- `Static` = standard image ad

---

## 4. Ad Status Vocabulary

| Status | Meaning |
|--------|---------|
| `In Progress` | Being created/recorded |
| `Ready to Launch` | Finished, loaded on ad account, not yet live |
| `Recording Pending` | Script approved, waiting for footage |
| `Testing` | Live, in evaluation window ($75/day) |
| `Live` | Active winner, scaled beyond test budget |
| `Killed` | Stopped, did not meet KPI |
| `Killed - Previous Winner` | Was a winner, now retired |
| `Postponed` | Paused, may relaunch |

---

## 5. SharePoint Folder Structure

### Concept folder naming (required)
```
FSIQ-[VIDEO/STATIC]-AD-[##] - [Concept Name]
```
Examples:
```
FSIQ-VIDEO-AD-28 - Podcast Blurred Book
FSIQ-STATIC-AD-10 - Statics 7
FSIQ-VIDEO-AD-27b - Food Spend Tiers
```

### Required subfolders inside every concept folder
Every concept folder must contain exactly these three subfolders:
```
/Campaign Brief/   ← .docx campaign brief uploaded here
/Raw Footage/      ← editor uploads raw files here
/Final/            ← finished ad set files
```

The `sharepoint-structure-agent` validates both folder naming and subfolder presence on every 6h run. Missing subfolders are auto-created and flagged in `#assistant`.

---

## 6. Supabase creative_pipeline Schema

```sql
CREATE TABLE creative_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  ad_id TEXT UNIQUE NOT NULL,
  global_number INT,
  variant TEXT,

  -- Classification
  ad_type TEXT NOT NULL,
  concept_name TEXT,
  hook_description TEXT,
  hook_type TEXT,
  awareness_level TEXT,
  funnel TEXT,
  lp_code TEXT,
  copy_version TEXT,
  duration TEXT,

  -- Ad set fields
  ad_set_token TEXT,
  targeting TEXT DEFAULT 'Broad',

  -- Pipeline
  status TEXT,
  week TEXT,
  launch_date DATE,
  editor_assigned TEXT,
  ad_notes TEXT,
  other_notes TEXT,
  winning_ad TEXT,

  -- Asset links
  sharepoint_link TEXT,
  canva_link TEXT,
  dropbox_link TEXT,

  -- Performance (denormalized for fast dashboard queries)
  is_active BOOLEAN DEFAULT false,
  total_spend NUMERIC,
  cp2ql_lifetime NUMERIC,
  cp3ql_lifetime NUMERIC,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 7. Dashboard Display Fields

The `/paid-media` dashboard must surface these fields per active ad:

| Field | Filterable |
|-------|-----------|
| Ad ID + Concept Name | No |
| Hook Type | ✅ |
| Awareness Level | ✅ |
| Funnel/LP | ✅ |
| Duration | ✅ |
| Status | ✅ (Active / Testing / Killed / All) |
| Ad Type | ✅ (Video / Static) |
| Launch Date | No |
| Total Spend | Sortable |
| CP2QL Lifetime | Sortable |
| CP3QL Lifetime | Sortable |
| SharePoint Link | Clickable |

---

## 8. Name Parser Rules

When syncing from Google Sheet or Meta API, parse the dash-delimited ad name into fields:

```
Position 0: ad_id         → always
Position 1: global_number (if integer) OR concept_name (old format)
Position 2: ad_set_token  (new format) OR hook_description (old format)
Position 3: hook_description (new format, video) OR variant (static)
Position 4: hook_type
Position 5: awareness_level
Position 6: funnel / lp_code
Position 7: copy_version
Position 8: duration (video only)
```

**Format detection:**
- New format (AD-28+): position 1 is a bare integer → global_number
- Old format (pre-AD-28): position 1 is a string → concept_name, no global_number

**Always extract:**
- `ad_id` from position 0
- `ad_type` from prefix: `FSIQ-VIDEO-AD` → `Video`, `FSIQ-STATIC-AD` → `Static`
- `variant` from ad_id suffix letter if present (e.g. `AD-27b` → variant = `b`)

---

## 9. Agent Rules

- Never reuse an AD number. AD numbers are globally unique across all time.
- Retargeting ads use `AW` prefix and are excluded from all CPQL analysis.
- When generating a new ad ID, query `MAX(CAST(regexp_replace(ad_id, '[^0-9]', '', 'g') AS INT))` from `creative_pipeline` and increment by 1.
- Sub-variants of an existing concept use a letter suffix directly on the concept ID (e.g., `FSIQ-VIDEO-AD-27b`), not a new concept number.
- Status transitions: `In Progress` → `Recording Pending` → `Ready to Launch` → `Testing` → (`Live` | `Killed` | `Postponed`)

---

## Changelog

| Date | Change | Changed by |
|------|--------|-----------|
| May 2026 | Initial version | Rodrigo |
| May 2026 | v2.0: added ad set naming convention, LP3-EB fix, variant system evolution, copywriting matrix reference, letter-suffix sub-variant pattern, SharePoint folder structure with required subfolders, added ad_set_token/targeting/week/editor_assigned/lp_code schema fields | Architecture |
