# Paid Media Agent SOP
**Version:** 1.1 | **Last updated:** May 2026 | **Agent:** paid-media.agent.ts
**Source of truth:** This file. Loaded at runtime by every paid media skill.

---

## 1. Account Identity

| Field | Value |
|-------|-------|
| Account | FoodServiceIQ (FSIQ) |
| Meta Account ID | `act_1283218729838066` |
| Meta Business ID | `1318161616592876` |
| Campaign | ABO_Prospecting \| Leads (`120229729801330546`) |
| Primary Landing Page | LP2-EB (eBook) |
| Targeting | Broad |
| SOT (Source of Truth) | Google Sheets — Ads Tracker (Meta Ads All Data tab) |
| Windsor.ai connector | `facebook` |
| Budget ceiling | $650–$850/day (scaling toward $1,000/day) |

---

## 2. North Star Metrics — 3-Stage Qualification Model

**Three qualification tiers, all sourced from Supabase `leads` table (GHL → Supabase sync):**

| Stage | Field | Threshold | Metric | North Star? |
|-------|-------|-----------|--------|-------------|
| Stage 1 | All form submissions | any spend | CPL | Never use for budget decisions |
| **CPQL** | annual_food_spend | **≥ $600,000** | Cost Per Qualified Lead | **Primary** |
| **CP2QL** | annual_food_spend | **≥ $1,000,000** | Cost Per 2nd-Qualified Lead | **Confirming** |
| **CP3QL** | annual_food_spend | **≥ $2,000,000** | Cost Per 3rd-Qualified Lead | Supporting |

**Decision hierarchy:**
- Use **CP2QL ($1M+)** as the primary scaling signal — highest confidence, sufficient volume
- Use **CPQL ($600k+)** as an early signal and directional check
- Use **CP3QL ($2M+)** as a quality floor — never scale if CP3QL is deteriorating badly
- **Never use Stage 1 CPL alone** to scale, hold, or kill

**Critical rule:** If CPQL looks good but CP2QL is poor, trust CP2QL. If CP2QL looks good, CPQL being slightly elevated is acceptable.

---

## 3. Performance Thresholds

| Metric | Threshold | Goal | Scale Down | Kill | Priority |
|--------|-----------|------|------------|------|----------|
| CPL | any spend | $50 | $100 | $150 | Tertiary |
| **CPQL** | **≥ $600k food spend** | **$100** | **$200** | **$300** | **Primary (early signal)** |
| **CP2QL** | **≥ $1M food spend** | **$150** | **$300** | **$450** | **Primary (scaling signal)** |
| **CP3QL** | **≥ $2M food spend** | **$400** | **$700** | **$900** | Secondary (quality floor) |
| CPM D1 | — | $35–$45 best band | $55–$65 caution | >$65 kill at $200 spend | Leading indicator |

**Benchmarks (lifetime, from $133,811 spend across 255 days):**
- CPQL ($600k+): ~$114 estimated lifetime | ~$104 7d
- CP2QL ($1M+): $206 lifetime | $183 7d
- CP3QL ($2M+): $399 lifetime | $243 7d

**Rules:**
- CP2QL ($1M+) is the primary scaling signal. Use 7d window for decisions.
- CPQL ($600k+) goal $100 will be exact once GHL→Supabase sync is live; until then it is ratio-estimated at 1.80× CP2QL lead count.
- If CPL is above goal but CP2QL is on target, do not kill.
- Never kill on CPL alone unless CP2QL data is absent after Day 21.

---

## 4. Scale Ladder (from SOP)

| Step | Budget | Trigger | Wait | Roll back if |
|------|--------|---------|------|-------------|
| Test | $75/day | Launch | — | D1 CPM > $75 and 0 Q2Ls at $150 spend |
| Graduate | $100/day | 3d < $150 (2+ Q2Ls) OR 7d < $120 | Immediate | 1d CPQL > $250 post-scale |
| Build | $130/day | 48hrs at $100, 7d still < $130 | 48 hours | 7d drifts above $160 |
| Scale | $160/day | 7d < $130 sustained | 72 hours | Two sessions: 1d > $175 |
| Cruise | $200/day | 14d < $130 | 1 week | 14d above $150 post-scale |
| Extended | $250–$300/day | All windows < $150, LT < $140 | 1 week | CPM consistently > $60 |

**Max step size:** +25% or +$35, whichever is smaller. Never skip steps.

---

## 5. CPM as Leading Indicator

| D1 CPM Band | Win Rate | Action |
|-------------|----------|--------|
| < $35 | 27% | Extended $600 runway. Slow starters OK. |
| $35–$45 | 35% | Best band. Full $400 runway. |
| $45–$55 | 9% | Below average. Standard evaluation. |
| $55–$65 | 21% | Above winner median. $400 threshold, tighten at Day 5. |
| $65–$75 | 0% | Zero wins without D1 Q2L. Kill at $200. |
| > $75 | 0% | Kill at $150. Exception: Gift Ad Long Hook 2 (D1 Q2L). |

**CPM trend rule:** Winners trend CPM down D1→D7 (−$3 median). Losers trend up (+$1.2 median).

---

## 6. Decision Logic Per Ad Set

```
Data source: Supabase leads table (GHL→Supabase real-time sync)
             + Supabase daily_spend table (sheet sync)

For each active ad set:
1. Determine age (launch_date → today)
2. Retargeting check: if ad_set_name contains "AW-AD" → EXEMPT, skip all rules
3. If age ≤ 7 days: use CPM band evaluation (section 5), not CPQL
4. If age > 7 days: apply 3-stage threshold logic below
5. Special rule: 0 CP2QL leads at Day 21+ → KILL regardless of other metrics

Decision rules (priority order, use 7d window):

SCALE UP:
  cp2ql_7d < $150 AND cpql_7d < $200
  → recommended_budget = current + min(25%, $35), rounded to $5

HOLD:
  $150 ≤ cp2ql_7d ≤ $300 (OR cp2ql data absent but cpql_7d < $200)
  → no budget change

SCALE DOWN:
  $300 < cp2ql_7d ≤ $450
  → recommended_budget = current × 0.50, rounded to $5

KILL:
  cp2ql_7d > $450
  OR cpl_7d > $150 AND cp2ql data absent after Day 14
  OR cpm_d1 > $65 AND 0 cp2ql leads
  OR age > 21 days AND 0 cp2ql_leads_lifetime
  → recommended_budget = 0 (pause ad set)

INSUFFICIENT_DATA:
  cp2ql data absent AND age ≤ 14 days
  → apply CPL kill rule only ($150), otherwise hold
  → note: CPQL ($600k+) used as directional signal if available
```

---

## 7. Budget Pool Architecture

**Winner pool** (confirmed CP2QL ($1M+) < $150 on 7d+14d, 3+ CP2QL leads):
- Protected — never raided for tests
- Max $200–$300/day per ad set

**Test pool** (new launches):
- Ring-fenced at $75/day per ad set
- Max 4 concurrent tests
- 4 new launches per week target

**Retargeting:** AD-AW-01 at $20/day. Exempt from framework.

**Target architecture at $1k/day:**
- 5 winners × $160/day = $800
- 2 tests × $75/day = $150
- Retargeting: $20
- Buffer: $30

---

## 8. Weekly CPQL Health Check

Run every Monday:
```
Weighted CPQL = Σ(ad_set_budget × CPQL) ÷ total_daily_budget
```

| Result | Action |
|--------|--------|
| < $130 | Scale aggressively |
| $130–$145 | Hold, no new scales |
| > $145 | Cut lowest performer before scaling |
| > $150 | Pause all scales, audit every active ad set |

---

## 9. Creative Pipeline Rules

- Minimum catalog: **≥ 2 videos + ≥ 2 statics live at all times**
- If below minimum: flag as urgent to `#MediaBuying`
- 4 new launches per week target (19% win rate → ~0.76 new winners/week)
- Never reuse an AD number. AD numbers are globally unique across all time.
- Retargeting uses AW prefix (`FSIQ-VIDEO-AW-AD-XX`) — excluded from CPQL analysis.

**Naming convention:**
`FSIQ-[VIDEO/STATIC]-AD-[XX] - [Number] - [Name] - [Hook] - [Hook Type] - [Awareness] - [LP] - [Copy] - [Duration]`

---

## 10. Fatigue Analysis

When winner CPQL windows are deteriorating, check Windsor.ai before killing:

| Signal | Healthy | Fatiguing |
|--------|---------|-----------|
| Frequency | < 1.5, stable | > 2.0, rising |
| CPM | Stable or falling | Rising consistently |
| CTR | Stable or rising | Falling consistently |
| Reach | Stable | Collapsing |

- All delivery metrics healthy + CPQL above KPI → audience quality issue, not creative fatigue. More budget won't fix it.
- Delivery metrics deteriorating → genuine creative fatigue. Kill and test new creative.

---

## 11. SOT-Confirmed Winners (Benchmarks)

| Ad Set | CPQL | Q2Ls | D1 CPM | Days to 1st Q2L |
|--------|------|------|--------|-----------------|
| Media Pouch H4-15M | $155 | 9 | $42.3 | D1 |
| Gift Ad New Studio H3 | $174 | 8 | $53.7 | D1 |
| Gift Ad Short Hook 2 | $239 | 18 | $47.8 | D3 |
| Static 18.3 | $254 | 3 | $39.7 | D8 |
| Neil Holiday Gift No Santa Hat | $261 | 30 | $26.7 | D1 |
| Hand + Book (AD-32) | $261 | 16 | $60.8 | D3 |
| VSL_1.1 Neil | $280 | 8 | $12.9 | D8 |
| New Gift Ad Hook 2 | $282 | 26 | $41.4 | D17 |
| Podcast Ad Blurred Book | $298 | 20 | $39.8 | D17 |

Key stats: 56% show first Q2L on D1 | 75% by D3 | 88% by D7 | 100% by D21

---

## 12. Common Errors to Avoid

- Using Stage 1 CPQL for scale decisions (check CP2QL column always)
- Scaling on 1 Q2L (need 2+ Q2Ls or 3d CPQL materially below $120)
- Skipping steps on scale ladder (AD-42 lesson: jumping $75→$150 inflates CPM)
- Touching retargeting ad set without explicit instruction

---

## 13. Output Format (Slack #MediaBuying)

One message per flagged ad set. Include:
- Ad name
- Key metrics (CPQL 7d, CP2QL 7d, CPL 7d, CPM D1, budget)
- Decision + reason (one line)
- Recommended new budget
- Buttons: [✅ Approve] [❌ Skip]

---

## 15. Data Source Verification (Active Until Disabled)

**Status: ACTIVE** — All KILL and SCALE DOWN decisions require dual-source confirmation.

| Check | Source | How matched |
|-------|--------|-------------|
| Primary | Supabase `leads` table | `leads.adset_id = meta_adset_id` |
| Verification | Supabase `sheet_sot` table | `sheet_sot.meta_ad_set_id = meta_adset_id` |

`sheet_sot` is synced from the Google Sheet Meta Ads All Data tab.
Sheet ID: `1nx5PXn6AnLWdskroFwkNLXPPcvBy9spy_2ggNAnvRFI`
Sync script: `scripts/sync-sheet-sot.ts`

### Decision rules for KILL and SCALE DOWN:

- **Supabase 0 leads, Sheet has leads** → use Sheet data; flag `data_source: 'sheet_sot'`; note "Supabase attribution pending"
- **Both sources agree on underperformance** → flag `data_source: 'supabase_verified'`; allow KILL/SCALE DOWN
- **Sources conflict** → use Sheet (always higher authority); flag `data_source: 'conflict_sheet_used'`; never kill on Supabase-only signal
- **Sheet has no entry for ad set** → flag `data_source: 'attribution_pending'`; hold, do not kill

**Never output KILL or SCALE DOWN unless BOTH sources agree the ad is underperforming.**
If only Supabase shows zero, the most likely explanation is missing UTM attribution — not a dead ad.

### Column remapping (Sheet → new naming):
- Sheet column "CPQL" = $1M+ leads → maps to `cp2ql` (primary scaling signal)
- Sheet column "CP2QL" = $2M+ leads → maps to `cp3ql` (quality floor)

### To disable this section:
Remove Section 15 from this SOP file. No code change needed — the skill reads the SOP at runtime and will stop applying dual-source logic when this section is absent.

---

## Changelog

| Date | Change | Changed by |
|------|--------|-----------|
| May 2026 | Initial version created | CMO Agent |
| May 2026 | v1.1 — 3-stage lead model (CPQL $600k+, CP2QL $1M+, CP3QL $2M+); thresholds confirmed from 255-day dataset; decision logic updated to use Supabase as data source | Rodrigo |
| May 2026 | v1.2 — Section 15: dual-source verification rule; sheet_sot table added; KILL/SCALE DOWN blocked unless both Supabase and Sheet agree | Rodrigo |
