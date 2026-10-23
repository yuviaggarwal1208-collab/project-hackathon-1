import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Cake, Clock, Coffee, Copy, Loader2, MapPin, Navigation, Phone, RefreshCw, Soup, Store, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import { directionsUrl, fetchNearbyFoodPlaces, type FoodPlace, type PlaceKind } from '../lib/geo'
import { useI18n } from '../contexts/I18nContext'

const KINDS: { key: PlaceKind; label: string; one: string; icon: typeof Utensils }[] = [
  { key: 'restaurant', label: 'Restaurants', one: 'Restaurant', icon: Utensils },
  { key: 'cafe', label: 'Cafes', one: 'Cafe', icon: Coffee },
  { key: 'bakery', label: 'Bakeries & sweets', one: 'Bakery / sweets', icon: Cake },
  { key: 'stay', label: 'Hotels, hostels & venues', one: 'Hotel / hostel / venue', icon: Building2 },
  { key: 'canteen', label: 'Canteens', one: 'Canteen', icon: Soup }
]
const kindMeta = (k: PlaceKind) => KINDS.find(x => x.key === k)!

/**
 * Shown after "Use my precise location". Lists food businesses around the user
 * (potential donors) using free OpenStreetMap data, and sends them up so the map can pin them too.
 */
export function NearbyRestaurants({ me, where, onPlaces, onShowMap }: {
  me: [number, number]; where: string; onPlaces: (p: FoodPlace[]) => void; onShowMap: () => void
}) {
  const { t } = useI18n()
  const [radiusKm, setRadiusKm] = useState(2)
  const [places, setPlaces] = useState<FoodPlace[] | null>(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<PlaceKind | 'all'>('all')
  const [shown, setShown] = useState(6)
  const [tick, setTick] = useState(0)
  const cache = useRef(new Map<string, FoodPlace[]>())

  useEffect(() => {
    const key = `${me[0].toFixed(3)},${me[1].toFixed(3)},${radiusKm}`
    const hit = cache.current.get(key)
    if (hit && tick === 0) { setPlaces(hit); setError(''); return }
    const ctl = new AbortController()
    setPlaces(null); setError(''); setShown(6)
    fetchNearbyFoodPlaces(me[0], me[1], radiusKm * 1000, ctl.signal)
      .then(r => { cache.current.set(key, r); setPlaces(r) })
      .catch(e => { if (!ctl.signal.aborted) { setError((e as Error).message); setPlaces([]) } })
    return () => ctl.abort()
  }, [me, radiusKm, tick])

  const list = useMemo(() => (places ?? []).filter(p => kind === 'all' || p.kind === kind), [places, kind])
  useEffect(() => { onPlaces(list) }, [list])           // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPlaces([]), [])                // clear map pins when this panel goes away

  const count = (k: PlaceKind) => (places ?? []).filter(p => p.kind === k).length

  async function invite(p: FoodPlace) {
    const text = `Hello ${p.name}! If you ever have surplus food at the end of the day, you can donate it to verified NGOs through RescuePlate: ${window.location.origin}/register`
    try { await navigator.clipboard.writeText(text); toast.success('Invite message copied. Paste it in WhatsApp or SMS.') }
    catch { toast.error('Could not copy. Please copy the message manually.') }
  }

  return (
    <section className="card mt-6 overflow-hidden" aria-labelledby="nearby-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-forest-100 bg-forest-50 px-5 py-4">
        <div>
          <h2 id="nearby-title" className="flex items-center gap-2 text-lg font-bold"><Store size={18} className="text-forest-600" aria-hidden />{t('nearby.title')}</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {places === null ? t('nearby.searching') : `${places.length} ${t('nearby.found')} ${where ? `· ${where}` : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="nearby-radius">Search distance</label>
          <select id="nearby-radius" className="input !w-auto !py-2" value={radiusKm} onChange={e => setRadiusKm(Number(e.target.value))}>
            {[1, 2, 3, 5].map(k => <option key={k} value={k}>Within {k} km</option>)}
          </select>
          <button type="button" className="btn-outline !py-2" onClick={() => setTick(x => x + 1)} disabled={places === null} aria-label="Refresh nearby restaurants">
            <RefreshCw size={14} aria-hidden />
          </button>
          <button type="button" className="btn-primary !py-2" onClick={onShowMap} disabled={!list.length}><MapPin size={14} aria-hidden />Show on map</button>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Type of place">
          <button type="button" className={`chip ${kind === 'all' ? 'chip-on' : ''}`} aria-pressed={kind === 'all'} onClick={() => { setKind('all'); setShown(6) }}>All{places ? ` (${places.length})` : ''}</button>
          {KINDS.map(k => (
            <button key={k.key} type="button" className={`chip ${kind === k.key ? 'chip-on' : ''}`} aria-pressed={kind === k.key} onClick={() => { setKind(k.key); setShown(6) }}>
              <k.icon size={13} aria-hidden />{k.label}{places ? ` (${count(k.key)})` : ''}
            </button>
          ))}
        </div>

        {places === null && (
          <p className="flex items-center gap-2 py-10 text-sm text-ink-500" role="status"><Loader2 size={16} className="animate-spin" aria-hidden />{t('nearby.searching')}</p>
        )}
        {error && <p className="mt-4 rounded-xl bg-urgent-100 px-4 py-3 text-sm font-medium text-urgent-600" role="alert">{error}</p>}
        {places !== null && !error && list.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-500">{t('nearby.none')}</p>
        )}

        {list.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.slice(0, shown).map(p => {
              const M = kindMeta(p.kind)
              return (
                <li key={p.id} className="flex flex-col rounded-xl border border-forest-100 bg-white p-4 transition hover:border-forest-300">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-100 text-forest-700"><M.icon size={18} aria-hidden /></span>
                    <div className="min-w-0">
                      <h3 className="truncate font-sans text-sm font-bold" title={p.name}>{p.name}</h3>
                      <p className="truncate text-xs text-ink-500">{M.one}{p.cuisine ? ` · ${p.cuisine}` : ''}</p>
                    </div>
                    <span className="ml-auto shrink-0 rounded-full bg-forest-50 px-2 py-0.5 text-xs font-bold text-forest-800">{p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`}</span>
                  </div>
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-700"><MapPin size={12} className="mt-0.5 shrink-0 text-forest-600" aria-hidden />{p.address || 'Address not listed on the map'}</p>
                  {p.hours && <p className="mt-1 flex items-start gap-1.5 text-xs text-ink-500"><Clock size={12} className="mt-0.5 shrink-0" aria-hidden /><span className="line-clamp-1">{p.hours}</span></p>}
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-forest-100 pt-3">
                    <a className="btn-outline !px-3 !py-1.5 !text-xs" target="_blank" rel="noreferrer" href={directionsUrl(p.lat, p.lng)}><Navigation size={12} aria-hidden />Directions</a>
                    {p.phone && <a className="btn-outline !px-3 !py-1.5 !text-xs" href={`tel:${p.phone.replace(/[^+\d]/g, '')}`}><Phone size={12} aria-hidden />Call</a>}
                    <button type="button" className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => void invite(p)}><Copy size={12} aria-hidden />Invite to donate</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {list.length > shown && (
          <div className="mt-4 text-center"><button type="button" className="btn-outline" onClick={() => setShown(s => s + 9)}>Show more ({list.length - shown} left)</button></div>
        )}
        <p className="mt-4 text-xs text-ink-500">{t('nearby.note')}</p>
      </div>
    </section>
  )
}
