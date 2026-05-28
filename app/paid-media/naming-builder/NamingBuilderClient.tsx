'use client'

// Naming Convention Builder — client UI.
// Pure Tailwind, no component library. All naming-rule logic lives here so the
// preview updates on every keystroke without a round-trip.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────

type AdType    = 'VIDEO' | 'STATIC'
type Targeting = 'Broad' | 'Interest'
type LpCode    = 'LP1-CS' | 'LP2-EB' | 'LP3-EB'
type Duration  = '45s' | '60s' | '60s+'

type HookType =
  | 'Pain Point / Pattern Interrupt'
  | 'Direct Offer / Gift'
  | 'Social Proof'
  | 'Authority / Data'
  | 'Curiosity / Contrarian'
  | 'Static'

type Awareness =
  | 'Unaware'
  | 'Problem Aware'
  | 'Solution Aware'
  | 'Product Aware'
  | 'Most Aware'

type Variant = {
  globalNumber: number
  hookDesc: string
  hookType: HookType
  awareness: Awareness
  lpCode: LpCode
  copyVersion: string
  duration: Duration
}

type InitialProps = {
  nextVideoConceptId:  string
  nextStaticConceptId: string
  nextGlobalNumber:    number
}

type GenerateResult = {
  success: boolean
  folderName?: string
  adSetName?:  string
  adNames?:    string[]
  sharepointLink?: string | null
  error?: string
}

type AdSetRow = {
  id: string
  type: AdType
  concept_id: string
  ad_set_token: string
  talent: string | null
  targeting: Targeting
  lp_code: LpCode | null
  final_ad_set_name: string
  meta_renamed: boolean
  status: string | null
}

type AdRow = {
  id: string
  ad_id: string
  ad_type: AdType
  concept_name: string | null
  global_number: number | null
  hook_description: string | null
  hook_type: string | null
  awareness_level: string | null
  lp_code: string | null
  copy_version: string | null
  duration: string | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const HOOK_TYPES: HookType[] = [
  'Pain Point / Pattern Interrupt',
  'Direct Offer / Gift',
  'Social Proof',
  'Authority / Data',
  'Curiosity / Contrarian',
]

const AWARENESS_LEVELS: Awareness[] = [
  'Unaware',
  'Problem Aware',
  'Solution Aware',
  'Product Aware',
  'Most Aware',
]

const LP_CODES: LpCode[] = ['LP1-CS', 'LP2-EB', 'LP3-EB']

const COPY_IDS = Array.from({ length: 13 }, (_, i) => `COPY-${String(i + 1).padStart(2, '0')}`)

const DURATIONS: Duration[] = ['45s', '60s', '60s+']

const SUFFIX_LETTERS = ['b', 'c', 'd', 'e', 'f', 'g']

// ── Naming-rule helpers (mirror the API + SOP) ───────────────────────────────

function buildFolderName(conceptId: string, conceptName: string): string {
  return `${conceptId} | ${conceptName}`.trim()
}

function buildAdSetName(opts: {
  conceptId: string
  adSetToken: string
  talent: string | null
  targeting: Targeting
  lpCode: LpCode
  type: AdType
}): string {
  const parts = [opts.conceptId, opts.adSetToken]
  if (opts.type === 'VIDEO' && opts.talent && opts.talent.trim()) {
    parts.push(opts.talent.trim())
  }
  parts.push(opts.targeting, opts.lpCode)
  return parts.join(' - ')
}

function buildAdName(opts: {
  type: AdType
  conceptId: string
  globalNumber: number
  conceptName: string
  variant: Variant
}): string {
  const v = opts.variant
  if (opts.type === 'STATIC') {
    return [
      opts.conceptId,
      String(v.globalNumber),
      opts.conceptName,
      v.hookDesc,
      'Static',
      v.awareness,
      v.lpCode,
      v.copyVersion,
    ].join(' - ')
  }
  return [
    opts.conceptId,
    String(v.globalNumber),
    opts.conceptName,
    v.hookDesc,
    v.hookType,
    v.awareness,
    v.lpCode,
    v.copyVersion,
    v.duration,
  ].join(' - ')
}

// ── Small UI primitives ──────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
      className="ml-2 inline-flex items-center rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      aria-label="Copy to clipboard"
    >
      {copied ? 'Copied!' : '📋'}
    </button>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800">
      {options.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={
            'px-3 py-1.5 text-sm rounded ' +
            (o === value
              ? 'bg-indigo-600 text-white'
              : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700')
          }
        >
          {o}
        </button>
      ))}
    </div>
  )
}

const inputCls =
  'border border-slate-300 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500'

const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1'

// ── Main client component ────────────────────────────────────────────────────

export default function NamingBuilderClient({ initial }: { initial: InitialProps }) {
  // Ad Set Builder state
  const [type, setType] = useState<AdType>('VIDEO')
  const [baseConceptId, setBaseConceptId] = useState(initial.nextVideoConceptId)
  const [subVariant, setSubVariant] = useState(false)
  const [subVariantLetter, setSubVariantLetter] = useState('b')
  const [conceptName, setConceptName] = useState('')
  const [adSetToken, setAdSetToken] = useState('')
  const [talent, setTalent] = useState('')
  const [targeting, setTargeting] = useState<Targeting>('Broad')
  const [lpCode, setLpCode] = useState<LpCode>('LP2-EB')

  // When the type toggles, swap in the right pre-filled concept ID.
  useEffect(() => {
    setBaseConceptId(type === 'VIDEO' ? initial.nextVideoConceptId : initial.nextStaticConceptId)
  }, [type, initial.nextVideoConceptId, initial.nextStaticConceptId])

  const conceptId = subVariant ? `${baseConceptId}${subVariantLetter}` : baseConceptId

  // Ad variant rows
  const [variants, setVariants] = useState<Variant[]>([
    {
      globalNumber: initial.nextGlobalNumber,
      hookDesc: '',
      hookType: type === 'STATIC' ? 'Static' : 'Pain Point / Pattern Interrupt',
      awareness: 'Unaware',
      lpCode: 'LP2-EB',
      copyVersion: 'COPY-02',
      duration: '60s',
    },
  ])

  // Whenever the ad type toggles, normalise hookType for each row.
  useEffect(() => {
    setVariants(prev =>
      prev.map(v => ({
        ...v,
        hookType: type === 'STATIC' ? 'Static' : v.hookType === 'Static' ? 'Pain Point / Pattern Interrupt' : v.hookType,
      })),
    )
  }, [type])

  // When the Ad Set LP changes, propagate to any row still on the previous default.
  useEffect(() => {
    setVariants(prev => prev.map(v => ({ ...v, lpCode })))
    // intentional: only when ad-set LP changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lpCode])

  function addVariant() {
    setVariants(prev => {
      const last = prev[prev.length - 1]
      return [
        ...prev,
        {
          globalNumber: (last?.globalNumber ?? initial.nextGlobalNumber) + 1,
          hookDesc: '',
          hookType: type === 'STATIC' ? 'Static' : 'Pain Point / Pattern Interrupt',
          awareness: 'Unaware',
          lpCode,
          copyVersion: 'COPY-02',
          duration: '60s',
        },
      ]
    })
  }

  function removeVariant(idx: number) {
    setVariants(prev => prev.filter((_, i) => i !== idx))
  }

  function updateVariant(idx: number, patch: Partial<Variant>) {
    setVariants(prev => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)))
  }

  // ── Live previews ──────────────────────────────────────────────────────────

  const folderPreview = useMemo(
    () => buildFolderName(conceptId, conceptName || '[Concept Name]'),
    [conceptId, conceptName],
  )

  const adSetPreview = useMemo(
    () =>
      buildAdSetName({
        conceptId,
        adSetToken: adSetToken || '[Ad Set Token]',
        talent: type === 'VIDEO' ? talent : null,
        targeting,
        lpCode,
        type,
      }),
    [conceptId, adSetToken, talent, targeting, lpCode, type],
  )

  // ── Submit ────────────────────────────────────────────────────────────────

  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)

  function validate(): string[] {
    const e: string[] = []
    if (!baseConceptId.trim())        e.push('Concept ID is required.')
    if (!conceptName.trim())          e.push('Concept name is required.')
    if (!adSetToken.trim())           e.push('Ad Set Token is required.')
    variants.forEach((v, i) => {
      if (!v.hookDesc.trim())         e.push(`Variant ${i + 1}: ${type === 'STATIC' ? 'Variant' : 'Hook Description'} is required.`)
      if (!v.hookType)                e.push(`Variant ${i + 1}: Hook Type is required.`)
      if (!Number.isFinite(v.globalNumber) || v.globalNumber <= 0)
        e.push(`Variant ${i + 1}: Global # must be a positive number.`)
    })
    return e
  }

  async function onGenerate() {
    const errs = validate()
    if (errs.length) {
      setErrors(errs)
      return
    }
    setErrors([])
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/naming-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          conceptId,
          conceptName: conceptName.trim(),
          adSetToken: adSetToken.trim(),
          talent: type === 'VIDEO' && talent.trim() ? talent.trim() : null,
          targeting,
          lpCode,
          variants,
        }),
      })
      const data = (await res.json()) as GenerateResult
      if (!res.ok || !data.success) {
        setResult({ success: false, error: data.error ?? `Request failed (${res.status}).` })
      } else {
        setResult(data)
        // Refresh existing tables to show the new rows.
        loadTable(activeTab)
      }
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Existing tables ──────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<'adsets' | 'ads'>('adsets')
  const [adSets, setAdSets] = useState<AdSetRow[]>([])
  const [ads, setAds]       = useState<AdRow[]>([])
  const [tableLoading, setTableLoading] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // filters
  const [filterType, setFilterType] = useState<'All' | AdType>('All')
  const [filterLp, setFilterLp] = useState<'All' | LpCode>('All')
  const [filterMetaRenamed, setFilterMetaRenamed] = useState<'All' | 'Yes' | 'No'>('All')
  const [filterHookType, setFilterHookType] = useState<'All' | HookType>('All')
  const [filterAwareness, setFilterAwareness] = useState<'All' | Awareness>('All')
  const [filterCopy, setFilterCopy] = useState<'All' | string>('All')

  async function loadTable(tab: 'adsets' | 'ads') {
    setTableLoading(true)
    try {
      const params = new URLSearchParams({ tab })
      if (filterType !== 'All') params.set('type', filterType)
      if (tab === 'adsets') {
        if (filterLp !== 'All') params.set('lp', filterLp)
        if (filterMetaRenamed !== 'All') params.set('metaRenamed', filterMetaRenamed === 'Yes' ? 'yes' : 'no')
      } else {
        if (filterHookType !== 'All') params.set('hookType', filterHookType)
        if (filterAwareness !== 'All') params.set('awareness', filterAwareness)
        if (filterCopy !== 'All') params.set('copy', filterCopy)
      }
      const res = await fetch(`/api/naming-builder/tables?${params.toString()}`)
      const data = await res.json()
      if (tab === 'adsets') setAdSets((data.rows ?? []) as AdSetRow[])
      else setAds((data.rows ?? []) as AdRow[])
    } catch (err) {
      console.error('loadTable failed:', err)
    } finally {
      setTableLoading(false)
    }
  }

  useEffect(() => {
    loadTable(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filterType, filterLp, filterMetaRenamed, filterHookType, filterAwareness, filterCopy])

  async function toggleMetaRenamed(row: AdSetRow, next: boolean) {
    setAdSets(prev => prev.map(r => (r.id === row.id ? { ...r, meta_renamed: next } : r)))
    await fetch('/api/naming-builder/tables', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'ad_set_naming', id: row.id, meta_renamed: next }),
    })
  }

  async function saveAdSetRow(row: AdSetRow) {
    await fetch('/api/naming-builder/tables', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'ad_set_naming',
        id: row.id,
        type: row.type,
        concept_id: row.concept_id,
        ad_set_token: row.ad_set_token,
        talent: row.talent,
        targeting: row.targeting,
        lp_code: row.lp_code,
        final_ad_set_name: row.final_ad_set_name,
        meta_renamed: row.meta_renamed,
        status: row.status,
      }),
    })
    loadTable('adsets')
    setExpandedRow(null)
  }

  async function saveAdRow(row: AdRow) {
    await fetch('/api/naming-builder/tables', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'creative_pipeline',
        id: row.id,
        ad_id: row.ad_id,
        ad_type: row.ad_type,
        concept_name: row.concept_name,
        global_number: row.global_number,
        hook_description: row.hook_description,
        hook_type: row.hook_type,
        awareness_level: row.awareness_level,
        lp_code: row.lp_code,
        copy_version: row.copy_version,
        duration: row.duration,
      }),
    })
    loadTable('ads')
    setExpandedRow(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <Link href="/paid-media" className="text-sm text-indigo-600 hover:underline">
          ← Back to Paid Media
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">Naming Convention Builder</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Generates folder names, ad set names, and ad names that pass the SOP nomenclature audit.
        </p>
      </div>

      {/* ── Ad Set Builder ───────────────────────────────────────────────── */}
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Ad Set Builder</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Type</label>
            <Segmented options={['VIDEO', 'STATIC'] as const} value={type} onChange={setType} />
          </div>

          <div>
            <label className={labelCls}>Concept ID</label>
            <input
              className={inputCls + ' w-full font-mono'}
              value={baseConceptId}
              onChange={e => setBaseConceptId(e.target.value)}
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={subVariant}
                onChange={e => setSubVariant(e.target.checked)}
              />
              Sub-variant (b/c/d)
            </label>
            {subVariant && (
              <select
                className={inputCls + ' ml-2 inline-block w-auto'}
                value={subVariantLetter}
                onChange={e => setSubVariantLetter(e.target.value)}
              >
                {SUFFIX_LETTERS.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
            {subVariant && (
              <span className="ml-2 text-xs text-slate-500 font-mono">→ {conceptId}</span>
            )}
          </div>

          <div>
            <label className={labelCls}>Concept Name</label>
            <input
              className={inputCls + ' w-full'}
              placeholder="e.g. Media Pouch"
              value={conceptName}
              onChange={e => setConceptName(e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls}>Ad Set Token</label>
            <input
              className={inputCls + ' w-full'}
              placeholder={type === 'VIDEO' ? 'e.g. VSL_1' : 'e.g. Media Pouch'}
              value={adSetToken}
              onChange={e => setAdSetToken(e.target.value)}
            />
            {type === 'VIDEO' && (
              <div className="mt-2">
                <label className={labelCls}>Talent (optional)</label>
                <input
                  className={inputCls + ' w-full'}
                  placeholder="e.g. Chad  or  Neil / Richard"
                  value={talent}
                  onChange={e => setTalent(e.target.value)}
                />
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Targeting</label>
            <Segmented options={['Broad', 'Interest'] as const} value={targeting} onChange={setTargeting} />
          </div>

          <div>
            <label className={labelCls}>Landing Page</label>
            <Segmented options={LP_CODES} value={lpCode} onChange={setLpCode} />
          </div>
        </div>

        {/* Preview */}
        <div className="mt-5 rounded-md bg-slate-100 p-4 font-mono text-sm text-slate-800 dark:bg-slate-900 dark:text-slate-200">
          <div className="flex items-start">
            <span className="w-20 shrink-0 text-slate-500">FOLDER:</span>
            <span className="flex-1 break-all">{folderPreview}</span>
            <CopyButton text={folderPreview} />
          </div>
          <div className="mt-2 flex items-start">
            <span className="w-20 shrink-0 text-slate-500">AD SET:</span>
            <span className="flex-1 break-all">{adSetPreview}</span>
            <CopyButton text={adSetPreview} />
          </div>
        </div>
      </section>

      {/* ── Ad Builder ───────────────────────────────────────────────────── */}
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ad Variants</h2>
          <button
            type="button"
            onClick={addVariant}
            className="rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700"
          >
            + Add Variant
          </button>
        </div>

        <div className="space-y-5">
          {variants.map((v, idx) => {
            const adPreview = buildAdName({
              type,
              conceptId,
              globalNumber: v.globalNumber,
              conceptName: conceptName || '[Concept Name]',
              variant: { ...v, hookDesc: v.hookDesc || (type === 'STATIC' ? '[Variant]' : '[Hook Desc]') },
            })
            return (
              <div
                key={idx}
                className="rounded-md border border-slate-200 p-4 dark:border-slate-700"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className={labelCls}>Global #</label>
                    <input
                      type="number"
                      className={inputCls + ' w-full'}
                      value={v.globalNumber}
                      onChange={e => updateVariant(idx, { globalNumber: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      {type === 'STATIC' ? 'Variant' : 'Hook Description'}
                    </label>
                    <input
                      className={inputCls + ' w-full'}
                      placeholder={type === 'STATIC' ? 'e.g. Night' : 'e.g. No Book'}
                      value={v.hookDesc}
                      onChange={e => updateVariant(idx, { hookDesc: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Hook Type</label>
                    <select
                      className={inputCls + ' w-full'}
                      value={v.hookType}
                      disabled={type === 'STATIC'}
                      onChange={e => updateVariant(idx, { hookType: e.target.value as HookType })}
                    >
                      {type === 'STATIC' ? (
                        <option value="Static">Static</option>
                      ) : (
                        HOOK_TYPES.map(h => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Awareness</label>
                    <select
                      className={inputCls + ' w-full'}
                      value={v.awareness}
                      onChange={e => updateVariant(idx, { awareness: e.target.value as Awareness })}
                    >
                      {AWARENESS_LEVELS.map(a => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>LP</label>
                    <Segmented
                      options={LP_CODES}
                      value={v.lpCode}
                      onChange={lp => updateVariant(idx, { lpCode: lp })}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Copy ID</label>
                    <select
                      className={inputCls + ' w-full'}
                      value={v.copyVersion}
                      onChange={e => updateVariant(idx, { copyVersion: e.target.value })}
                    >
                      {COPY_IDS.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  {type === 'VIDEO' && (
                    <div>
                      <label className={labelCls}>Duration</label>
                      <Segmented
                        options={DURATIONS}
                        value={v.duration}
                        onChange={d => updateVariant(idx, { duration: d })}
                      />
                    </div>
                  )}
                  <div className="flex items-end">
                    {variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeVariant(idx)}
                        className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/30"
                      >
                        × Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 rounded bg-slate-50 p-2 font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300 flex items-start">
                  <span className="flex-1 break-all">{adPreview}</span>
                  <CopyButton text={adPreview} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Generate ─────────────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-8">
        <button
          type="button"
          onClick={onGenerate}
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Generating…' : 'Generate Concept'}
        </button>
      </div>

      {result && result.success && (
        <section className="mb-8 rounded-lg border-2 border-green-500 bg-green-50 p-6 dark:bg-green-900/20">
          <h3 className="mb-3 text-lg font-semibold text-green-800 dark:text-green-300">
            Concept created successfully
          </h3>
          <div className="space-y-2 font-mono text-sm text-slate-800 dark:text-slate-200">
            <div className="flex items-start">
              <span className="w-24 shrink-0 text-slate-500">FOLDER:</span>
              <span className="flex-1 break-all">{result.folderName}</span>
              <CopyButton text={result.folderName ?? ''} />
            </div>
            <div className="flex items-start">
              <span className="w-24 shrink-0 text-slate-500">AD SET:</span>
              <span className="flex-1 break-all">{result.adSetName}</span>
              <CopyButton text={result.adSetName ?? ''} />
            </div>
            {(result.adNames ?? []).map((n, i) => (
              <div key={i} className="flex items-start">
                <span className="w-24 shrink-0 text-slate-500">AD NAME:</span>
                <span className="flex-1 break-all">{n}</span>
                <CopyButton text={n} />
              </div>
            ))}
            {result.sharepointLink && (
              <div className="flex items-start">
                <span className="w-24 shrink-0 text-slate-500">SharePoint:</span>
                <a href={result.sharepointLink} className="flex-1 break-all text-indigo-600 hover:underline">
                  {result.sharepointLink}
                </a>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const all = [
                `FOLDER: ${result.folderName}`,
                `AD SET: ${result.adSetName}`,
                ...(result.adNames ?? []).map(n => `AD NAME: ${n}`),
                result.sharepointLink ? `SHAREPOINT: ${result.sharepointLink}` : null,
              ]
                .filter(Boolean)
                .join('\n')
              navigator.clipboard.writeText(all)
            }}
            className="mt-4 rounded-md border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900/40"
          >
            Copy All
          </button>
        </section>
      )}

      {result && !result.success && (
        <div className="mb-8 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
          {result.error}
        </div>
      )}

      {/* ── Existing tables ──────────────────────────────────────────────── */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setActiveTab('adsets')}
            className={
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px ' +
              (activeTab === 'adsets'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300')
            }
          >
            Ad Sets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ads')}
            className={
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px ' +
              (activeTab === 'ads'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300')
            }
          >
            Ads
          </button>
        </div>

        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className={labelCls}>Type</label>
            <select
              className={inputCls}
              value={filterType}
              onChange={e => setFilterType(e.target.value as 'All' | AdType)}
            >
              <option value="All">All</option>
              <option value="VIDEO">VIDEO</option>
              <option value="STATIC">STATIC</option>
            </select>
          </div>
          {activeTab === 'adsets' ? (
            <>
              <div>
                <label className={labelCls}>LP</label>
                <select
                  className={inputCls}
                  value={filterLp}
                  onChange={e => setFilterLp(e.target.value as 'All' | LpCode)}
                >
                  <option value="All">All</option>
                  {LP_CODES.map(lp => (
                    <option key={lp} value={lp}>
                      {lp}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Meta Renamed</label>
                <select
                  className={inputCls}
                  value={filterMetaRenamed}
                  onChange={e => setFilterMetaRenamed(e.target.value as 'All' | 'Yes' | 'No')}
                >
                  <option value="All">All</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={labelCls}>Hook Type</label>
                <select
                  className={inputCls}
                  value={filterHookType}
                  onChange={e => setFilterHookType(e.target.value as 'All' | HookType)}
                >
                  <option value="All">All</option>
                  {HOOK_TYPES.map(h => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                  <option value="Static">Static</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Awareness</label>
                <select
                  className={inputCls}
                  value={filterAwareness}
                  onChange={e => setFilterAwareness(e.target.value as 'All' | Awareness)}
                >
                  <option value="All">All</option>
                  {AWARENESS_LEVELS.map(a => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Copy ID</label>
                <select
                  className={inputCls}
                  value={filterCopy}
                  onChange={e => setFilterCopy(e.target.value)}
                >
                  <option value="All">All</option>
                  {COPY_IDS.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {tableLoading && <div className="text-sm text-slate-500">Loading…</div>}

        {!tableLoading && activeTab === 'adsets' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Concept ID</th>
                  <th className="py-2 pr-3">Ad Set Name</th>
                  <th className="py-2 pr-3">Targeting</th>
                  <th className="py-2 pr-3">LP</th>
                  <th className="py-2 pr-3">Renamed in Meta</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {adSets.map(row => {
                  const isOpen = expandedRow === row.id
                  return (
                    <>
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-700/30"
                        onClick={() => setExpandedRow(isOpen ? null : row.id)}
                      >
                        <td className="py-2 pr-3">{row.type}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{row.concept_id}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{row.final_ad_set_name}</td>
                        <td className="py-2 pr-3">{row.targeting}</td>
                        <td className="py-2 pr-3">{row.lp_code}</td>
                        <td className="py-2 pr-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={row.meta_renamed}
                            onChange={e => toggleMetaRenamed(row, e.target.checked)}
                          />
                        </td>
                        <td className="py-2 pr-3">{row.status ?? '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr key={`${row.id}-edit`} className="bg-slate-50 dark:bg-slate-900/40">
                          <td colSpan={7} className="p-3">
                            <AdSetEditor row={row} onSave={saveAdSetRow} />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
                {adSets.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-500">
                      No rows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!tableLoading && activeTab === 'ads' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <th className="py-2 pr-3">Concept ID</th>
                  <th className="py-2 pr-3">Global #</th>
                  <th className="py-2 pr-3">Ad Name</th>
                  <th className="py-2 pr-3">Hook Type</th>
                  <th className="py-2 pr-3">Awareness</th>
                  <th className="py-2 pr-3">Copy ID</th>
                </tr>
              </thead>
              <tbody>
                {ads.map(row => {
                  const isOpen = expandedRow === row.id
                  const adName = buildAdName({
                    type: row.ad_type,
                    conceptId: row.ad_id,
                    globalNumber: row.global_number ?? 0,
                    conceptName: row.concept_name ?? '',
                    variant: {
                      globalNumber: row.global_number ?? 0,
                      hookDesc: row.hook_description ?? '',
                      hookType: (row.hook_type as HookType) ?? 'Static',
                      awareness: (row.awareness_level as Awareness) ?? 'Unaware',
                      lpCode: (row.lp_code as LpCode) ?? 'LP2-EB',
                      copyVersion: row.copy_version ?? '',
                      duration: (row.duration as Duration) ?? '60s',
                    },
                  })
                  return (
                    <>
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-700/30"
                        onClick={() => setExpandedRow(isOpen ? null : row.id)}
                      >
                        <td className="py-2 pr-3 font-mono text-xs">{row.ad_id}</td>
                        <td className="py-2 pr-3">{row.global_number ?? '—'}</td>
                        <td className="py-2 pr-3 font-mono text-xs" title={adName}>
                          <span className="block max-w-[28rem] truncate">{adName}</span>
                        </td>
                        <td className="py-2 pr-3">{row.hook_type ?? '—'}</td>
                        <td className="py-2 pr-3">{row.awareness_level ?? '—'}</td>
                        <td className="py-2 pr-3">{row.copy_version ?? '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr key={`${row.id}-edit`} className="bg-slate-50 dark:bg-slate-900/40">
                          <td colSpan={6} className="p-3">
                            <AdEditor row={row} onSave={saveAdRow} />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
                {ads.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      No rows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

// ── Inline editors ────────────────────────────────────────────────────────────

function AdSetEditor({ row, onSave }: { row: AdSetRow; onSave: (r: AdSetRow) => void }) {
  const [draft, setDraft] = useState<AdSetRow>(row)
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div>
        <label className={labelCls}>Type</label>
        <select
          className={inputCls + ' w-full'}
          value={draft.type}
          onChange={e => setDraft({ ...draft, type: e.target.value as AdType })}
        >
          <option value="VIDEO">VIDEO</option>
          <option value="STATIC">STATIC</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Concept ID</label>
        <input
          className={inputCls + ' w-full font-mono'}
          value={draft.concept_id}
          onChange={e => setDraft({ ...draft, concept_id: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>Ad Set Token</label>
        <input
          className={inputCls + ' w-full'}
          value={draft.ad_set_token}
          onChange={e => setDraft({ ...draft, ad_set_token: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>Talent</label>
        <input
          className={inputCls + ' w-full'}
          value={draft.talent ?? ''}
          onChange={e => setDraft({ ...draft, talent: e.target.value || null })}
        />
      </div>
      <div>
        <label className={labelCls}>Targeting</label>
        <select
          className={inputCls + ' w-full'}
          value={draft.targeting}
          onChange={e => setDraft({ ...draft, targeting: e.target.value as Targeting })}
        >
          <option value="Broad">Broad</option>
          <option value="Interest">Interest</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>LP</label>
        <select
          className={inputCls + ' w-full'}
          value={draft.lp_code ?? ''}
          onChange={e => setDraft({ ...draft, lp_code: (e.target.value || null) as LpCode | null })}
        >
          <option value="">—</option>
          {['LP1-CS', 'LP2-EB', 'LP3-EB'].map(lp => (
            <option key={lp} value={lp}>
              {lp}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>Final Ad Set Name</label>
        <input
          className={inputCls + ' w-full font-mono'}
          value={draft.final_ad_set_name}
          onChange={e => setDraft({ ...draft, final_ad_set_name: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>Status</label>
        <input
          className={inputCls + ' w-full'}
          value={draft.status ?? ''}
          onChange={e => setDraft({ ...draft, status: e.target.value })}
        />
      </div>
      <div className="md:col-span-3">
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function AdEditor({ row, onSave }: { row: AdRow; onSave: (r: AdRow) => void }) {
  const [draft, setDraft] = useState<AdRow>(row)
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div>
        <label className={labelCls}>Concept ID</label>
        <input
          className={inputCls + ' w-full font-mono'}
          value={draft.ad_id}
          onChange={e => setDraft({ ...draft, ad_id: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>Type</label>
        <select
          className={inputCls + ' w-full'}
          value={draft.ad_type}
          onChange={e => setDraft({ ...draft, ad_type: e.target.value as AdType })}
        >
          <option value="VIDEO">VIDEO</option>
          <option value="STATIC">STATIC</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Global #</label>
        <input
          type="number"
          className={inputCls + ' w-full'}
          value={draft.global_number ?? 0}
          onChange={e => setDraft({ ...draft, global_number: parseInt(e.target.value, 10) || 0 })}
        />
      </div>
      <div>
        <label className={labelCls}>Concept Name</label>
        <input
          className={inputCls + ' w-full'}
          value={draft.concept_name ?? ''}
          onChange={e => setDraft({ ...draft, concept_name: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>Hook Description</label>
        <input
          className={inputCls + ' w-full'}
          value={draft.hook_description ?? ''}
          onChange={e => setDraft({ ...draft, hook_description: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>Hook Type</label>
        <select
          className={inputCls + ' w-full'}
          value={draft.hook_type ?? ''}
          onChange={e => setDraft({ ...draft, hook_type: e.target.value })}
        >
          <option value="">—</option>
          {HOOK_TYPES.map(h => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
          <option value="Static">Static</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Awareness</label>
        <select
          className={inputCls + ' w-full'}
          value={draft.awareness_level ?? ''}
          onChange={e => setDraft({ ...draft, awareness_level: e.target.value })}
        >
          <option value="">—</option>
          {AWARENESS_LEVELS.map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>LP</label>
        <select
          className={inputCls + ' w-full'}
          value={draft.lp_code ?? ''}
          onChange={e => setDraft({ ...draft, lp_code: e.target.value })}
        >
          <option value="">—</option>
          {LP_CODES.map(lp => (
            <option key={lp} value={lp}>
              {lp}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Copy ID</label>
        <select
          className={inputCls + ' w-full'}
          value={draft.copy_version ?? ''}
          onChange={e => setDraft({ ...draft, copy_version: e.target.value })}
        >
          <option value="">—</option>
          {COPY_IDS.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Duration</label>
        <select
          className={inputCls + ' w-full'}
          value={draft.duration ?? ''}
          onChange={e => setDraft({ ...draft, duration: e.target.value })}
        >
          <option value="">—</option>
          {DURATIONS.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-3">
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Save
        </button>
      </div>
    </div>
  )
}
