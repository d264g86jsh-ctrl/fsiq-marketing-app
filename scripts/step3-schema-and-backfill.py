#!/usr/bin/env python3
"""
Step 3 — Create all 5 tables + run all backfills.
Run with: python3 scripts/step3-schema-and-backfill.py
Reads DATABASE_URL from .env.local automatically.
"""

import json, re, os, sys, uuid, hashlib
from datetime import datetime, timedelta
from pathlib import Path
import psycopg2
from psycopg2.extras import execute_values

# ── Load .env.local ───────────────────────────────────────────────────────────

env_path = Path(__file__).parent.parent / '.env.local'
for line in env_path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, _, v = line.partition('=')
        os.environ.setdefault(k.strip(), v.strip())

DATABASE_URL = os.environ['DATABASE_URL']
SHEET_CACHE  = Path("/Users/rodrigoavendano/.claude/projects/-Users-rodrigoavendano"
                    "/c6aaeab0-da52-47df-8720-fff7e644c444/tool-results"
                    "/mcp-claude_ai_Google_Drive-read_file_content-1779950583000.txt")

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg): print(f"  {msg}")

def connect():
    return psycopg2.connect(DATABASE_URL)

def row_count(cur, table):
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    return cur.fetchone()[0]

def load_sheet():
    with open(SHEET_CACHE) as f:
        return json.load(f)['fileContent']

# ── STEP 1: Create all 5 tables ───────────────────────────────────────────────

SCHEMA_SQL = """
-- 1. leads
CREATE TABLE IF NOT EXISTS leads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_contact_id        TEXT UNIQUE NOT NULL,
  created_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ DEFAULT now(),
  first_name            TEXT,
  last_name             TEXT,
  restaurant_name       TEXT,
  num_locations         INT,
  annual_food_spend_raw TEXT,
  annual_food_spend     BIGINT,
  lead_stage            TEXT,
  ad_attribution        TEXT,
  ad_id                 TEXT,
  adset_id              TEXT,
  campaign_id           TEXT,
  landing_page          TEXT,
  call_booked           BOOLEAN DEFAULT false,
  ghl_pipeline_stage    TEXT,
  source                TEXT,
  synced_from           TEXT DEFAULT 'ghl_webhook'
);
CREATE INDEX IF NOT EXISTS leads_stage_idx   ON leads (lead_stage);
CREATE INDEX IF NOT EXISTS leads_spend_idx   ON leads (annual_food_spend);
CREATE INDEX IF NOT EXISTS leads_adset_idx   ON leads (adset_id);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads (created_at);

-- 2. daily_spend
CREATE TABLE IF NOT EXISTS daily_spend (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date         DATE UNIQUE NOT NULL,
  spend        NUMERIC,
  leads_s1     INT,
  cpl          NUMERIC,
  cpql_leads   INT,
  cpql         NUMERIC,
  cp2ql_leads  INT,
  cp2ql        NUMERIC,
  cp3ql_leads  INT,
  cp3ql        NUMERIC,
  impressions  INT,
  cpm          NUMERIC,
  link_clicks  INT,
  cpc          NUMERIC,
  ctr          NUMERIC,
  synced_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. ad_performance (drop + recreate — only had 2 test rows)
DROP TABLE IF EXISTS ad_performance;
CREATE TABLE ad_performance (
  ad_set_id      TEXT PRIMARY KEY,
  ad_set_name    TEXT,
  campaign_id    TEXT,
  status         TEXT,
  daily_budget   NUMERIC,
  launch_date    DATE,
  impressions    INT, cpm_d1 NUMERIC, cpm_7d NUMERIC,
  link_clicks    INT, ctr    NUMERIC,
  spend_1d NUMERIC, spend_3d NUMERIC, spend_7d  NUMERIC,
  spend_14d NUMERIC, spend_30d NUMERIC, spend_total NUMERIC,
  leads_s1_1d INT, leads_s1_3d INT, leads_s1_7d  INT,
  leads_s1_14d INT, leads_s1_30d INT, leads_s1_lifetime INT,
  cpl_1d NUMERIC, cpl_3d NUMERIC, cpl_7d  NUMERIC,
  cpl_14d NUMERIC, cpl_30d NUMERIC, cpl_lifetime NUMERIC,
  cpql_leads_1d INT, cpql_leads_3d INT, cpql_leads_7d  INT,
  cpql_leads_14d INT, cpql_leads_30d INT, cpql_leads_lifetime INT,
  cpql_1d NUMERIC, cpql_3d NUMERIC, cpql_7d  NUMERIC,
  cpql_14d NUMERIC, cpql_30d NUMERIC, cpql_lifetime NUMERIC,
  cp2ql_leads_1d INT, cp2ql_leads_3d INT, cp2ql_leads_7d  INT,
  cp2ql_leads_14d INT, cp2ql_leads_30d INT, cp2ql_leads_lifetime INT,
  cp2ql_1d NUMERIC, cp2ql_3d NUMERIC, cp2ql_7d  NUMERIC,
  cp2ql_14d NUMERIC, cp2ql_30d NUMERIC, cp2ql_lifetime NUMERIC,
  cp3ql_leads_1d INT, cp3ql_leads_3d INT, cp3ql_leads_7d  INT,
  cp3ql_leads_14d INT, cp3ql_leads_30d INT, cp3ql_leads_lifetime INT,
  cp3ql_1d NUMERIC, cp3ql_3d NUMERIC, cp3ql_7d  NUMERIC,
  cp3ql_14d NUMERIC, cp3ql_30d NUMERIC, cp3ql_lifetime NUMERIC,
  last_synced TIMESTAMPTZ DEFAULT now()
);

-- 4. creative_performance
CREATE TABLE IF NOT EXISTS creative_performance (
  id               TEXT PRIMARY KEY,
  ad_name          TEXT,
  ad_type          TEXT,
  is_active        BOOLEAN DEFAULT false,
  last_active_date DATE,
  spend_1d NUMERIC, spend_3d NUMERIC, spend_7d  NUMERIC,
  spend_14d NUMERIC, spend_30d NUMERIC, spend_total NUMERIC,
  leads_s1_1d INT, leads_s1_3d INT, leads_s1_7d  INT,
  leads_s1_14d INT, leads_s1_30d INT, leads_s1_lifetime INT,
  cpl_1d NUMERIC, cpl_3d NUMERIC, cpl_7d  NUMERIC,
  cpl_14d NUMERIC, cpl_30d NUMERIC, cpl_lifetime NUMERIC,
  cpql_leads_1d INT, cpql_leads_3d INT, cpql_leads_7d  INT,
  cpql_leads_14d INT, cpql_leads_30d INT, cpql_leads_lifetime INT,
  cpql_1d NUMERIC, cpql_3d NUMERIC, cpql_7d  NUMERIC,
  cpql_14d NUMERIC, cpql_30d NUMERIC, cpql_lifetime NUMERIC,
  cp2ql_leads_1d INT, cp2ql_leads_3d INT, cp2ql_leads_7d  INT,
  cp2ql_leads_14d INT, cp2ql_leads_30d INT, cp2ql_leads_lifetime INT,
  cp2ql_1d NUMERIC, cp2ql_3d NUMERIC, cp2ql_7d  NUMERIC,
  cp2ql_14d NUMERIC, cp2ql_30d NUMERIC, cp2ql_lifetime NUMERIC,
  cp3ql_leads_1d INT, cp3ql_leads_3d INT, cp3ql_leads_7d  INT,
  cp3ql_leads_14d INT, cp3ql_leads_30d INT, cp3ql_leads_lifetime INT,
  cp3ql_1d NUMERIC, cp3ql_3d NUMERIC, cp3ql_7d  NUMERIC,
  cp3ql_14d NUMERIC, cp3ql_30d NUMERIC, cp3ql_lifetime NUMERIC,
  impressions INT, cpm NUMERIC, link_clicks INT, cpc NUMERIC,
  last_synced TIMESTAMPTZ DEFAULT now()
);

-- 5. creative_pipeline (drop + recreate with new SOP schema)
DROP TABLE IF EXISTS creative_pipeline;
CREATE TABLE creative_pipeline (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id           TEXT UNIQUE NOT NULL,
  global_number   INT,
  variant         TEXT,
  ad_type         TEXT NOT NULL,
  concept_name    TEXT,
  hook_description TEXT,
  hook_type       TEXT,
  awareness_level TEXT,
  funnel          TEXT,
  copy_version    TEXT,
  duration        TEXT,
  status          TEXT,
  launch_date     DATE,
  ad_notes        TEXT,
  other_notes     TEXT,
  winning_ad      TEXT,
  sharepoint_link TEXT,
  canva_link      TEXT,
  dropbox_link    TEXT,
  is_active       BOOLEAN DEFAULT false,
  total_spend     NUMERIC,
  cp2ql_lifetime  NUMERIC,
  cp3ql_lifetime  NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipeline_status_idx ON creative_pipeline (status);
CREATE INDEX IF NOT EXISTS pipeline_type_idx   ON creative_pipeline (ad_type);
CREATE INDEX IF NOT EXISTS pipeline_active_idx ON creative_pipeline (is_active);
CREATE INDEX IF NOT EXISTS pipeline_funnel_idx ON creative_pipeline (funnel);
"""

# ── Parsing helpers ───────────────────────────────────────────────────────────

def parse_money(s):
    """Parse '$1,234.56' or '1234.56' → float or None"""
    if not s: return None
    s = str(s).replace('$','').replace(',','').replace('\\-','').strip()
    try: return float(s) if s and s not in ('-','') else None
    except: return None

def parse_int(s):
    if not s: return None
    s = str(s).strip().replace(',','')
    try: return int(float(s)) if s else None
    except: return None

def parse_pct(s):
    """'6.47%' → 6.47"""
    if not s: return None
    try: return float(str(s).replace('%','').strip())
    except: return None

def parse_date(s):
    for fmt in ('%m/%d/%Y','%Y-%m-%d'):
        try: return datetime.strptime(s.strip(), fmt).date()
        except: pass
    return None

def parse_ad_name(name):
    """Parse FSIQ ad name string into fields per creative-pipeline-sop.md"""
    name = name.replace('\\|','|').replace('\\ ','').strip()
    parts = [p.strip() for p in name.split('|')]
    if not parts: return {}

    raw_id = parts[0]
    ad_id_m = re.match(r'(FSIQ-(?:VIDEO|STATIC)(?:-AW)?-AD-(\d+)([a-z]?))', raw_id, re.I)
    if not ad_id_m: return {}

    ad_id     = ad_id_m.group(1).upper()
    ad_num    = int(ad_id_m.group(2))
    variant   = ad_id_m.group(3) or None
    ad_type   = 'Video' if 'VIDEO' in ad_id else 'Static'

    out = {'ad_id': ad_id, 'variant': variant, 'ad_type': ad_type}

    # Detect new format: position 1 is a bare integer (global number)
    if len(parts) > 1 and re.match(r'^\d+$', parts[1].strip()):
        out['global_number'] = int(parts[1])
        offset = 2
    else:
        offset = 1

    fields = ['concept_name','hook_description','hook_type',
              'awareness_level','funnel','copy_version','duration']
    for i, field in enumerate(fields):
        idx = offset + i
        if idx < len(parts) and parts[idx]:
            out[field] = parts[idx]

    return out

def make_ghl_id(first, last, date_str):
    """Stable synthetic GHL ID for backfill rows that don't have a real one"""
    key = f"backfill:{first}:{last}:{date_str}"
    return "bf_" + hashlib.md5(key.encode()).hexdigest()[:20]

def classify_stage(spend):
    if spend is None: return 'unqualified'
    if spend >= 2_000_000: return 'cp3ql'
    if spend >= 1_000_000: return 'cp2ql'
    if spend >= 600_000:   return 'cpql'
    return 'unqualified'

# ── Sheet parsing ─────────────────────────────────────────────────────────────

def parse_daily_spend(lines):
    rows = []
    for line in lines:
        parts = [p.strip() for p in line.split('|')]
        parts = [p for p in parts if p]
        if len(parts) < 6: continue
        if not re.match(r'^\d{2}/\d{2}/\d{4}$', parts[0]): continue
        spend_m = re.match(r'^\$?([\d,]+\.?\d*)$', parts[1])
        if not spend_m: continue
        try:
            spend = float(spend_m.group(1).replace(',',''))
            if spend < 1: continue
            d = {
                'date':        parse_date(parts[0]),
                'spend':       spend,
                'leads_s1':    parse_int(parts[2]),
                'cpl':         parse_money(parts[3]) if len(parts)>3 else None,
                'cp2ql_leads': parse_int(parts[4])   if len(parts)>4 else None,
                'cp2ql':       parse_money(parts[5]) if len(parts)>5 else None,
                'cp3ql_leads': parse_int(parts[6])   if len(parts)>6 else None,
                'cp3ql':       parse_money(parts[7]) if len(parts)>7 else None,
                'impressions': parse_int(parts[8])   if len(parts)>8 else None,
                'ctr':         parse_pct(parts[9])   if len(parts)>9 else None,
            }
            if d['date']: rows.append(d)
        except: pass
    return rows

def parse_leads(lines):
    rows = []
    in_leads = False
    for line in lines:
        if 'First Name' in line and 'Last Name' in line and 'Annual Spend' in line:
            in_leads = True; continue
        if ':-:' in line: continue
        if not in_leads: continue
        parts = [p.strip() for p in line.split('|')]
        parts = [p for p in parts if p]
        if len(parts) < 6: continue
        if not re.match(r'^\d{2}/\d{2}/\d{4}$', parts[0]):
            if in_leads and len(parts) < 3: break
            continue
        # Find numeric food spend (a cell with a 6+ digit bare number)
        annual_spend = None
        annual_raw   = parts[5].replace('\\','') if len(parts)>5 else ''
        for p in parts:
            p_c = p.replace('\\','').replace(',','').replace('$','').strip()
            if re.match(r'^\d{6,}$', p_c):
                annual_spend = int(p_c); break

        # Extract ad attribution (first FSIQ-*-AD-* found)
        ad_attr = None
        ad_id_found = None
        for p in parts:
            p_c = p.replace('\\','')
            m = re.search(r'(FSIQ-(?:VIDEO|STATIC)(?:-AW)?-AD-\d+[a-z]?)', p_c, re.I)
            if m:
                if not ad_attr: ad_attr = p_c.split('|')[0].strip()
                if not ad_id_found: ad_id_found = m.group(1).upper()
                break

        ghl_id = make_ghl_id(parts[1] if len(parts)>1 else '',
                             parts[2] if len(parts)>2 else '',
                             parts[0])
        rows.append({
            'ghl_contact_id':        ghl_id,
            'created_at':            datetime.combine(parse_date(parts[0]), datetime.min.time()),
            'first_name':            parts[1].replace('\\','') if len(parts)>1 else None,
            'last_name':             parts[2].replace('\\','') if len(parts)>2 else None,
            'restaurant_name':       parts[3].replace('\\','') if len(parts)>3 else None,
            'num_locations':         parse_int(parts[4])        if len(parts)>4 else None,
            'annual_food_spend_raw': annual_raw or None,
            'annual_food_spend':     annual_spend,
            'lead_stage':            classify_stage(annual_spend),
            'ad_attribution':        ad_attr,
            'ad_id':                 ad_id_found,
            'landing_page':          next((p for p in parts if 'LP' in p and ('CS' in p or 'EB' in p or 'LP1' in p or 'LP2' in p)), None),
            'call_booked':           False,
            'source':                next((p for p in parts if p in ('ClickFunnels','Manual','Meta','Organic')), None),
            'synced_from':           'sheet_backfill',
        })
    return rows

def parse_creative_pipeline(lines):
    """Parse Creative Tracker / Ad Pipeline rows from the sheet."""
    ads = {}
    for line in lines:
        clean = line.replace('\\|','｜').replace('\\','')
        parts = [p.strip() for p in clean.split('|')]
        parts = [p for p in parts if p]
        # Find any part that looks like an FSIQ ad ID
        for p in parts:
            m = re.match(r'(FSIQ-(?:VIDEO|STATIC)(?:-AW)?-AD-\d+[a-z]?)', p, re.I)
            if m:
                ad_id = m.group(1).upper()
                if ad_id in ads: break
                parsed = parse_ad_name(p.replace('｜','|'))
                if not parsed.get('ad_id'): break
                # Look for status
                status_vocab = ['In Progress','Ready to Launch','Recording Pending',
                               'Testing','Live','Killed - Previous Winner','Killed','Postponed']
                status = next((sv for sv in status_vocab
                               if any(sv.lower() in pp.lower() for pp in parts)), None)
                # Launch date
                launch = next((parse_date(pp) for pp in parts
                               if re.match(r'\d{2}/\d{2}/\d{4}', pp)), None)
                ads[ad_id] = {**parsed, 'status': status, 'launch_date': launch,
                              'is_active': status in ('Live','Testing')}
                break
    return list(ads.values())

def parse_ad_performance(lines):
    """
    Parse the Meta Ads (All Data) per-ad-set rows.
    Header: Ad Set Name | Active | Food Spend | Last Active | Is Active |
            Cost | Cost 1d..30d | Leads 1d..lifetime |
            CPL 1d..lifetime | CPQL Leads 1d..lifetime | CPQL 1d..lifetime |
            CP2QL Leads 1d..lifetime | CP2QL 1d..lifetime | Impressions | CPM | Clicks | CPC
    """
    rows = []
    header_found = False
    col_map = {}

    for line in lines:
        # Detect the ad set header row
        if 'Ad Set Name' in line and 'Cost 1d' in line:
            header_found = True
            raw_cols = [p.strip() for p in line.split('|')]
            raw_cols = [p for p in raw_cols if p]
            for i, c in enumerate(raw_cols):
                col_map[c] = i
            continue
        if not header_found: continue
        if ':-:' in line: continue

        parts = [p.strip() for p in line.split('|')]
        parts = [p for p in parts if p]
        if len(parts) < 6: continue

        # First column must be an ad set name (contains FSIQ or is a known name)
        name = parts[0].replace('\\','').strip()
        if not name or name.startswith('#') or ':-:' in name: continue
        # Ad set rows have a recognisable name pattern
        if not re.search(r'(FSIQ|Podcast|Gift|Media|Static|Neil|VSL|Hand|Book|UGC|AD-)', name, re.I):
            continue

        def g(col, default=None):
            idx = col_map.get(col)
            if idx is None or idx >= len(parts): return default
            return parts[idx] or default

        def gm(col): return parse_money(g(col))
        def gi(col): return parse_int(g(col))

        # Use the FSIQ ad ID from the name as a stable key when possible
        m = re.search(r'(FSIQ-(?:VIDEO|STATIC)(?:-AW)?-AD-\d+[a-z]?)', name, re.I)
        ad_set_id_key = m.group(1).upper() if m else name[:80]

        rows.append({
            'ad_set_id':   ad_set_id_key,
            'ad_set_name': name,
            'is_active':   g('Is Active','') in ('1','TRUE','True','true','Active'),
            'spend_total': gm('Cost'),
            'spend_1d':    gm('Cost 1d'),  'spend_3d':  gm('Cost 3d'),
            'spend_7d':    gm('Cost 7d'),  'spend_14d': gm('Cost 14d'),
            'spend_30d':   gm('Cost 30d'),
            'leads_s1_1d': gi('Leads 1d'), 'leads_s1_3d': gi('Leads 3d'),
            'leads_s1_7d': gi('Leads 7d'), 'leads_s1_14d':gi('Leads 14d'),
            'leads_s1_30d':gi('Leads 30d'),'leads_s1_lifetime':gi('Leads Lifetime'),
            'cpl_1d':      gm('CPL 1d'),   'cpl_3d':  gm('CPL 3d'),
            'cpl_7d':      gm('CPL 7d'),   'cpl_14d': gm('CPL 14d'),
            'cpl_30d':     gm('CPL 30d'),  'cpl_lifetime': gm('CPL Lifetime'),
            # OLD "CPQL" → new CP2QL ($1M+)
            'cp2ql_leads_1d':  gi('CPQL Leads 1d'),  'cp2ql_leads_3d':  gi('CPQL Leads 3d'),
            'cp2ql_leads_7d':  gi('CPQL Leads 7d'),  'cp2ql_leads_14d': gi('CPQL Leads 14d'),
            'cp2ql_leads_30d': gi('CPQL Leads 30d'), 'cp2ql_leads_lifetime': gi('CPQL Leads Lifetime'),
            'cp2ql_1d':  gm('CPQL 1d'),  'cp2ql_3d':  gm('CPQL 3d'),
            'cp2ql_7d':  gm('CPQL 7d'),  'cp2ql_14d': gm('CPQL 14d'),
            'cp2ql_30d': gm('CPQL 30d'), 'cp2ql_lifetime': gm('CPQL Lifetime'),
            # OLD "CPQ2L" → new CP3QL ($2M+)
            'cp3ql_leads_1d':  gi('CP2QL Leads 1d'),  'cp3ql_leads_3d':  gi('CP2QL Leads 3d'),
            'cp3ql_leads_7d':  gi('CP2QL Leads 7d'),  'cp3ql_leads_14d': gi('CP2QL Leads 14d'),
            'cp3ql_leads_30d': gi('CP2QL Leads 30d'), 'cp3ql_leads_lifetime': gi('CP2QL Leads Lifetime'),
            'cp3ql_1d':  gm('CPQ2L 1d'),  'cp3ql_3d':  gm('CPQ2L 3d'),
            'cp3ql_7d':  gm('CPQ2L 7d'),  'cp3ql_14d': gm('CPQ2L 14d'),
            'cp3ql_30d': gm('CPQ2L 30d'), 'cp3ql_lifetime': gm('CPQ2L Lifetime'),
            'impressions':  gi('Impressions '),
            'cpm':          gm('CPM'),
            'link_clicks':  gi('Link Clicks'),
            'cpc':          gm('CPC'),
        })
    return rows

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    content = load_sheet()
    lines   = content.split('\n')

    conn = connect()
    conn.autocommit = False
    cur  = conn.cursor()

    # ── 1. Create tables ──────────────────────────────────────────────────────
    print('\n[1/5] Creating tables...')
    for stmt in [s.strip() for s in SCHEMA_SQL.split(';') if s.strip()]:
        cur.execute(stmt)
    conn.commit()
    for t in ['leads','daily_spend','ad_performance','creative_performance','creative_pipeline']:
        log(f"✅ {t}")

    # ── 2. Backfill daily_spend ───────────────────────────────────────────────
    print('\n[2/5] Backfilling daily_spend...')
    daily_rows = parse_daily_spend(lines)
    log(f"Parsed {len(daily_rows)} rows")
    cols = ('date','spend','leads_s1','cpl','cp2ql_leads','cp2ql',
            'cp3ql_leads','cp3ql','impressions','ctr')
    vals = [(r['date'], r['spend'], r['leads_s1'], r['cpl'],
             r['cp2ql_leads'], r['cp2ql'], r['cp3ql_leads'], r['cp3ql'],
             r['impressions'], r['ctr']) for r in daily_rows]
    execute_values(cur,
        """INSERT INTO daily_spend (date,spend,leads_s1,cpl,cp2ql_leads,cp2ql,
           cp3ql_leads,cp3ql,impressions,ctr)
           VALUES %s ON CONFLICT (date) DO NOTHING""", vals)
    conn.commit()
    log(f"✅ Inserted — DB count: {row_count(cur,'daily_spend')}")

    # ── 3. Backfill leads ────────────────────────────────────────────────────
    print('\n[3/5] Backfilling leads...')
    lead_rows = parse_leads(lines)
    log(f"Parsed {len(lead_rows)} rows")
    for r in lead_rows:
        try:
            cur.execute("""
                INSERT INTO leads
                  (ghl_contact_id,created_at,first_name,last_name,restaurant_name,
                   num_locations,annual_food_spend_raw,annual_food_spend,lead_stage,
                   ad_attribution,ad_id,landing_page,call_booked,source,synced_from)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (ghl_contact_id) DO NOTHING
            """, (r['ghl_contact_id'], r['created_at'], r['first_name'], r['last_name'],
                  r['restaurant_name'], r['num_locations'], r['annual_food_spend_raw'],
                  r['annual_food_spend'], r['lead_stage'], r['ad_attribution'],
                  r['ad_id'], r['landing_page'], r['call_booked'],
                  r['source'], r['synced_from']))
        except Exception as e:
            log(f"  ⚠ skipped row ({r.get('first_name')} {r.get('last_name')}): {e}")
            conn.rollback(); cur = conn.cursor()
    conn.commit()
    total = row_count(cur, 'leads')
    # Show stage breakdown
    cur.execute("SELECT lead_stage, COUNT(*) FROM leads GROUP BY lead_stage ORDER BY COUNT(*) DESC")
    stages = cur.fetchall()
    log(f"✅ DB count: {total}")
    for stage, cnt in stages:
        log(f"   {stage}: {cnt}")

    # ── 4. Backfill creative_pipeline ────────────────────────────────────────
    print('\n[4/5] Backfilling creative_pipeline...')
    pipeline_rows = parse_creative_pipeline(lines)
    log(f"Parsed {len(pipeline_rows)} unique ads")
    inserted_cp = 0
    for r in pipeline_rows:
        if not r.get('ad_id'): continue
        try:
            cur.execute("""
                INSERT INTO creative_pipeline
                  (ad_id,global_number,variant,ad_type,concept_name,hook_description,
                   hook_type,awareness_level,funnel,copy_version,duration,status,
                   launch_date,is_active)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (ad_id) DO NOTHING
            """, (r['ad_id'], r.get('global_number'), r.get('variant'), r['ad_type'],
                  r.get('concept_name'), r.get('hook_description'), r.get('hook_type'),
                  r.get('awareness_level'), r.get('funnel'), r.get('copy_version'),
                  r.get('duration'), r.get('status'), r.get('launch_date'), r.get('is_active',False)))
            inserted_cp += 1
        except Exception as e:
            conn.rollback(); cur = conn.cursor()
    conn.commit()
    log(f"✅ DB count: {row_count(cur,'creative_pipeline')}")

    # ── 5. Backfill ad_performance ───────────────────────────────────────────
    print('\n[5/5] Backfilling ad_performance...')
    perf_rows = parse_ad_performance(lines)
    log(f"Parsed {len(perf_rows)} ad set rows")
    inserted_ap = 0
    for r in perf_rows:
        try:
            cur.execute("""
                INSERT INTO ad_performance
                  (ad_set_id,ad_set_name,spend_total,
                   spend_1d,spend_3d,spend_7d,spend_14d,spend_30d,
                   leads_s1_1d,leads_s1_3d,leads_s1_7d,leads_s1_14d,leads_s1_30d,leads_s1_lifetime,
                   cpl_1d,cpl_3d,cpl_7d,cpl_14d,cpl_30d,cpl_lifetime,
                   cpql_leads_1d,cpql_leads_3d,cpql_leads_7d,cpql_leads_14d,
                   cpql_leads_30d,cpql_leads_lifetime,
                   cpql_1d,cpql_3d,cpql_7d,cpql_14d,cpql_30d,cpql_lifetime,
                   cp2ql_leads_1d,cp2ql_leads_3d,cp2ql_leads_7d,cp2ql_leads_14d,
                   cp2ql_leads_30d,cp2ql_leads_lifetime,
                   cp2ql_1d,cp2ql_3d,cp2ql_7d,cp2ql_14d,cp2ql_30d,cp2ql_lifetime,
                   cp3ql_leads_1d,cp3ql_leads_3d,cp3ql_leads_7d,cp3ql_leads_14d,
                   cp3ql_leads_30d,cp3ql_leads_lifetime,
                   cp3ql_1d,cp3ql_3d,cp3ql_7d,cp3ql_14d,cp3ql_30d,cp3ql_lifetime,
                   impressions,cpm_d1,link_clicks)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                        %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                        %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (ad_set_id) DO NOTHING
            """, (r['ad_set_id'], r['ad_set_name'], r.get('spend_total'),
                  r.get('spend_1d'), r.get('spend_3d'), r.get('spend_7d'),
                  r.get('spend_14d'), r.get('spend_30d'),
                  r.get('leads_s1_1d'), r.get('leads_s1_3d'), r.get('leads_s1_7d'),
                  r.get('leads_s1_14d'), r.get('leads_s1_30d'), r.get('leads_s1_lifetime'),
                  r.get('cpl_1d'), r.get('cpl_3d'), r.get('cpl_7d'),
                  r.get('cpl_14d'), r.get('cpl_30d'), r.get('cpl_lifetime'),
                  r.get('cpql_leads_1d'), r.get('cpql_leads_3d'), r.get('cpql_leads_7d'),
                  r.get('cpql_leads_14d'), r.get('cpql_leads_30d'), r.get('cpql_leads_lifetime'),
                  r.get('cpql_1d'), r.get('cpql_3d'), r.get('cpql_7d'),
                  r.get('cpql_14d'), r.get('cpql_30d'), r.get('cpql_lifetime'),
                  r.get('cp2ql_leads_1d'), r.get('cp2ql_leads_3d'), r.get('cp2ql_leads_7d'),
                  r.get('cp2ql_leads_14d'), r.get('cp2ql_leads_30d'), r.get('cp2ql_leads_lifetime'),
                  r.get('cp2ql_1d'), r.get('cp2ql_3d'), r.get('cp2ql_7d'),
                  r.get('cp2ql_14d'), r.get('cp2ql_30d'), r.get('cp2ql_lifetime'),
                  r.get('cp3ql_leads_1d'), r.get('cp3ql_leads_3d'), r.get('cp3ql_leads_7d'),
                  r.get('cp3ql_leads_14d'), r.get('cp3ql_leads_30d'), r.get('cp3ql_leads_lifetime'),
                  r.get('cp3ql_1d'), r.get('cp3ql_3d'), r.get('cp3ql_7d'),
                  r.get('cp3ql_14d'), r.get('cp3ql_30d'), r.get('cp3ql_lifetime'),
                  r.get('impressions'), r.get('cpm'), r.get('link_clicks')))
            inserted_ap += 1
        except Exception as e:
            log(f"  ⚠ skipped {r.get('ad_set_id')}: {e}")
            conn.rollback(); cur = conn.cursor()
    conn.commit()
    log(f"✅ DB count: {row_count(cur,'ad_performance')}")

    # ── Final summary ─────────────────────────────────────────────────────────
    print('\n══════════ STEP 3 COMPLETE ══════════')
    tables = ['leads','daily_spend','ad_performance','creative_performance','creative_pipeline']
    for t in tables:
        print(f"  {t:<25} {row_count(cur, t):>5} rows")

    cur.close(); conn.close()

if __name__ == '__main__':
    main()
