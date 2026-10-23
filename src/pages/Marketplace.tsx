import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Flag, List, Map as MapIcon, MapPin, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { useAuth } from '../contexts/AuthContext'
import { DonationCard } from '../components/DonationCard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LocationButton } from '../components/LocationButton'
import { MapView } from '../components/MapView'
import { NearbyRestaurants } from '../components/NearbyRestaurants'
import { PageHeader } from '../components/PageHeader'
import { CardSkeletons, Empty } from '../components/Spinner'
import { CATEGORIES, REPORT_CATEGORIES, REPORT_LABELS, type Donation } from '../lib/types'
import { errMsg, haversineKm, timeLeft } from '../lib/utils'
import type { FoodPlace, PlaceKind } from '../lib/geo'

const PAGE = 24  // marketplace pagination: fetch everything claimable (RLS caps it), render in pages

export default function Marketplace() {
  const { t } = useI18n(); const { profile, org } = useAuth(); const nav = useNavigate()
  const [rows, setRows] = useState<Donation[] | null>(null)
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [diet, setDiet] = useState('')
  const [minQty, setMinQty] = useState(''); const [maxKm, setMaxKm] = useState('')
  const [sort, setSort] = useState<'deadline' | 'nearest'>('deadline')
  const [view, setView] = useState<'list' | 'map'>('list')
  const [me, setMe] = useState<[number, number] | null>(null)
  const [where, setWhere] = useState('')
  const [nearby, setNearby] = useState<FoodPlace[]>([])
  const [claiming, setClaiming] = useState<Donation | null>(null)
  const [reporting, setReporting] = useState<Donation | null>(null)
  const [reason, setReason] = useState('')
  const [repCat, setRepCat] = useState('unsafe_food')
  const [shown, setShown] = useState(PAGE)

  async function load() {
    const { data, error } = await supabase.from('donations').select('*, organizations(name)')
      .eq('status', 'available').gt('pickup_deadline', new Date().toISOString()).order('pickup_deadline')
    if (error) toast.error(errMsg(error))
    setRows((data as Donation[]) ?? [])
  }
  useEffect(() => { void load() }, [])

  const dist = (d: Donation) => (me && d.approx_lat != null && d.approx_lng != null ? haversineKm(me, [Number(d.approx_lat), Number(d.approx_lng)]) : null)

  const list = useMemo(() => {
    let r = (rows ?? []).filter(d => !timeLeft(d.pickup_deadline).expired)
    if (q) r = r.filter(d => (d.title + d.area + d.city + (d.organizations?.name ?? '')).toLowerCase().includes(q.toLowerCase()))
    if (cat) r = r.filter(d => d.category === cat)
    if (diet) r = r.filter(d => d.diet === diet)
    if (minQty) r = r.filter(d => (d.quantity_portions ?? 0) >= Number(minQty))
    if (maxKm && me) r = r.filter(d => { const k = dist(d); return k != null && k <= Number(maxKm) })
    return [...r].sort((a, b) => sort === 'nearest' && me
      ? (dist(a) ?? 1e9) - (dist(b) ?? 1e9)
      : +new Date(a.pickup_deadline) - +new Date(b.pickup_deadline))
  }, [rows, q, cat, diet, minQty, maxKm, sort, me])

  const points = list.filter(d => d.approx_lat != null && d.approx_lng != null).map(d => ({
    id: d.id, lat: Number(d.approx_lat), lng: Number(d.approx_lng), title: d.title,
    sub: `${d.quantity_portions ?? '—'} portions · ${d.area}, ${d.city}${dist(d) != null ? ` · ${dist(d)!.toFixed(1)} km` : ''}` }))

  const KIND_STYLE: Record<PlaceKind, { color: string; label: string }> = {
    restaurant: { color: '#2563eb', label: 'Restaurants' }, cafe: { color: '#92400e', label: 'Cafes' },
    bakery: { color: '#db2777', label: 'Bakeries & sweets' }, stay: { color: '#7c3aed', label: 'Hotels, hostels & venues' },
    canteen: { color: '#0d9488', label: 'Canteens' }
  }
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
  // A nearby place counts as "food available" when its name matches the donor of a live listing.
  const donorNames = useMemo(() => (rows ?? []).map(d => norm(d.organizations?.name ?? '')).filter(n => n.length >= 4), [rows])
  const hasFood = (p: FoodPlace) => { const n = norm(p.name); return n.length >= 4 && donorNames.some(d => d.includes(n) || n.includes(d)) }

  const nearbyPoints = useMemo(() => nearby.map(p => {
    const live = hasFood(p)
    return {
      id: p.id, lat: p.lat, lng: p.lng, title: p.name,
      sub: live ? `Food available now · ${p.distanceKm.toFixed(1)} km away` : `${KIND_STYLE[p.kind].label.replace(/s$/, '')} · ${p.distanceKm.toFixed(1)} km away · no food listed right now`,
      color: live ? '#16a34a' : KIND_STYLE[p.kind].color, legend: live ? 'Food available now' : KIND_STYLE[p.kind].label
    }
  }), [nearby, donorNames])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setShown(PAGE) }, [q, cat, diet, minQty, maxKm, sort, me])

  const canClaim = profile?.role === 'ngo' && org?.verification_status === 'verified'
  async function claim() {
    if (!claiming) return
    const { error } = await supabase.rpc('claim_donation', { p_donation_id: claiming.id, p_needs_volunteer: false })
    setClaiming(null)
    if (error) toast.error(errMsg(error)); else { toast.success('Donation claimed. The pickup address is now in your dashboard.'); nav('/dashboard/ngo') }
    void load()
  }
  async function report() {
    if (!reporting || !profile) return
    if (reason.trim().length < 5) return void toast.error('Please describe the concern (at least 5 characters).')
    const { error } = await supabase.from('reports').insert({ donation_id: reporting.id, reporter_id: profile.id, category: repCat, reason })
    if (error) toast.error(errMsg(error)); else toast.success('Report sent to administrators.')
    setReporting(null); setReason(''); setRepCat('unsafe_food')
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader eyebrow="Marketplace" title={t('market.title')} subtitle={t('safety.note')}
        actions={<span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-forest-800 shadow-card">{rows ? `${list.length} available` : ' '}</span>} />

      <div className="card sticky top-20 z-20 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search size={16} className="absolute left-3 top-3 text-ink-500" aria-hidden />
          <input aria-label={t('market.search')} className="input !pl-9" placeholder={t('market.search')} value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select aria-label={t('market.category')} className="input" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">{t('market.category')}: {t('market.any')}</option>{CATEGORIES.map(c => <option key={c} value={c}>{t('cat.' + c)}</option>)}
        </select>
        <select aria-label={t('market.diet')} className="input" value={diet} onChange={e => setDiet(e.target.value)}>
          <option value="">{t('market.diet')}: {t('market.any')}</option>
          {(['veg', 'non_veg', 'mixed'] as const).map(d => <option key={d} value={d}>{t('diet.' + d)}</option>)}
        </select>
        <input aria-label={t('market.minQty')} type="number" min={0} className="input" placeholder={t('market.minQty')} value={minQty} onChange={e => setMinQty(e.target.value)} />
        <select aria-label="Distance" className="input" disabled={!me} title={me ? '' : 'Use your location first'} value={maxKm} onChange={e => setMaxKm(e.target.value)}>
          <option value="">Distance: any</option>{[2, 5, 10, 25].map(k => <option key={k} value={k}>Within {k} km</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
          <LocationButton onFound={(fix, place) => {
            setMe([fix.lat, fix.lng]); setSort('nearest'); setView('map')
            setWhere(place ? [place.area, place.city].filter(Boolean).join(', ') : `${fix.lat.toFixed(3)}, ${fix.lng.toFixed(3)}`)
          }} />
          {me && <span className="flex items-center gap-1 text-sm font-medium text-forest-800"><MapPin size={14} aria-hidden />Near {where}</span>}
          <select aria-label="Sort" className="input !w-auto" value={sort} onChange={e => setSort(e.target.value as 'deadline' | 'nearest')}>
            <option value="deadline">{t('market.sortDeadline')}</option>
            <option value="nearest" disabled={!me}>{t('market.sortNearest')}</option>
          </select>
          <div role="group" aria-label="View" className="ml-auto flex overflow-hidden rounded-full border border-forest-200">
            <button className={`flex items-center gap-1 px-4 py-2 text-sm font-semibold ${view === 'list' ? 'bg-forest-700 text-white' : 'bg-white text-forest-800'}`} aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={14} aria-hidden />List</button>
            <button className={`flex items-center gap-1 px-4 py-2 text-sm font-semibold ${view === 'map' ? 'bg-forest-700 text-white' : 'bg-white text-forest-800'}`} aria-pressed={view === 'map'} onClick={() => setView('map')}><MapIcon size={14} aria-hidden />Map</button>
          </div>
        </div>
      </div>

      {me && <NearbyRestaurants me={me} where={where} onPlaces={setNearby} onShowMap={() => { setView('map'); setTimeout(() => document.getElementById('food-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }} />}

      {view === 'map' && (rows !== null || me) && (
        <div className="mt-6 scroll-mt-24" id="food-map">
          <MapView points={points} extra={nearbyPoints} me={me} />
          <p className="mt-2 text-xs text-ink-500">Big green pins show food available now (approximate area only; the exact address is shared with the NGO that claims the food). Small coloured pins are nearby food businesses with nothing listed right now.</p>
        </div>
      )}

      {rows === null ? <div className="mt-8"><CardSkeletons /></div> : list.length === 0 ? <div className="mt-8"><Empty title={me ? 'No food is listed right now. Nearby restaurants are shown above, and they can post surplus food here later.' : t('market.empty')} /></div> : (
        <>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.slice(0, shown).map(d => (
            <DonationCard key={d.id} d={d} distanceKm={dist(d)} action={
              <div className="flex flex-wrap items-center gap-2">
                {canClaim && <button className="btn-primary" onClick={() => setClaiming(d)}>{t('card.claim')}</button>}
                {profile && <button className="btn-ghost" onClick={() => setReporting(d)} aria-label="Report unsafe food"><Flag size={16} aria-hidden /> Report</button>}
                {!profile && <p className="text-xs text-ink-500">Log in as a verified NGO to claim.</p>}
                {profile && !canClaim && profile.role === 'ngo' && <p className="text-xs text-ink-500">Claiming unlocks after verification.</p>}
              </div>} />
          ))}
        </div>
        {list.length > shown && (
          <div className="mt-6 text-center">
            <button className="btn-outline" onClick={() => setShown(s => s + PAGE)}>Show more ({list.length - shown} remaining)</button>
          </div>
        )}
        </>
      )}

      <ConfirmDialog open={!!claiming} title={`Claim “${claiming?.title}”?`}
        body="You commit to collecting this before the pickup deadline. The exact address is shared after you claim." onConfirm={claim} onCancel={() => setClaiming(null)} confirmLabel={t('card.claim')} />
      <ConfirmDialog open={!!reporting} title="Report unsafe or misleading food" confirmLabel="Send report" danger onConfirm={report} onCancel={() => setReporting(null)}
        body="Reports are private: only administrators can see them. They will review your report.">
        <label className="label mt-3" htmlFor="rcat">Concern type</label>
        <select id="rcat" className="input" value={repCat} onChange={e => setRepCat(e.target.value)}>
          {REPORT_CATEGORIES.map(c => <option key={c} value={c}>{REPORT_LABELS[c]}</option>)}
        </select>
        <label className="label mt-3" htmlFor="why">What is the concern?</label>
        <textarea id="why" className="input" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  )
}
