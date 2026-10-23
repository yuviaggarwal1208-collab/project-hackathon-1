export interface Fix { lat: number; lng: number; accuracy: number }
export interface Place { area: string; city: string; address: string }

/** Asks the browser for the most precise position available. */
export function getPreciseLocation(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Your browser does not support location.'))
    if (!window.isSecureContext) return reject(new Error('Location only works on a secure page (https or localhost).'))
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => reject(new Error(
        e.code === e.PERMISSION_DENIED ? 'Location permission was blocked. Click the lock icon next to the web address, allow Location, then try again.'
        : e.code === e.TIMEOUT ? 'Finding your location took too long. Move near a window or turn on GPS/Wi-Fi, then try again.'
        : 'Your location is not available right now. Check that location services are on.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  })
}

/** Turns coordinates into an address using OpenStreetMap Nominatim (free, no key). Returns null if unavailable. */
export async function reverseGeocode(lat: number, lng: number): Promise<Place | null> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`,
      { signal: ctl.signal, headers: { 'Accept-Language': 'en' } })
    if (!r.ok) return null
    const j = await r.json(); const a = j.address ?? {}
    return {
      area: a.suburb || a.neighbourhood || a.city_district || a.village || a.town || a.road || '',
      city: a.city || a.town || a.village || a.county || a.state_district || '',
      address: j.display_name || ''
    }
  } catch { return null } finally { clearTimeout(timer) }
}

/* ---------- Nearby restaurants (OpenStreetMap, free, no key) ---------- */
export type PlaceKind = 'restaurant' | 'cafe' | 'bakery' | 'stay' | 'canteen'
export interface FoodPlace {
  id: string; name: string; kind: PlaceKind; cuisine: string
  lat: number; lng: number; address: string; phone: string; hours: string; distanceKm: number
}

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
]

function kindOf(t: Record<string, string>): PlaceKind | null {
  if (t.amenity === 'restaurant' || t.amenity === 'fast_food' || t.amenity === 'food_court') return 'restaurant'
  if (t.amenity === 'cafe') return 'cafe'
  if (t.amenity === 'canteen') return 'canteen'
  if (t.shop === 'bakery' || t.shop === 'confectionery' || t.shop === 'pastry') return 'bakery'
  if (t.tourism === 'hotel' || t.tourism === 'hostel' || t.tourism === 'guest_house' || t.amenity === 'events_venue') return 'stay'
  return null
}

const km = (a: [number, number], b: [number, number]) => {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

function toPlaces(els: OsmEl[], lat: number, lng: number): FoodPlace[] {
  const out: FoodPlace[] = []
  const seen = new Set<string>()
  for (const e of els) {
    const t = e.tags ?? {}; const kind = kindOf(t)
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon
    if (!kind || !t.name || la == null || lo == null) continue
    const id = `${e.type}/${e.id}`
    if (seen.has(id)) continue
    seen.add(id)
    const address = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:neighbourhood'], t['addr:city']].filter(Boolean).join(', ')
    out.push({
      id, name: t.name, kind, cuisine: (t.cuisine ?? '').split(';').map(s => s.replace(/_/g, ' ').trim()).filter(Boolean).slice(0, 3).join(', '),
      lat: la, lng: lo, address, phone: t.phone || t['contact:phone'] || '', hours: t.opening_hours || '',
      distanceKm: km([lat, lng], [la, lo])
    })
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm)
}

/** Fetch with a time limit that also respects the caller's abort signal. */
async function timedFetch(url: string, init: RequestInit, ms: number, outer?: AbortSignal): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  const onOuter = () => ctl.abort()
  outer?.addEventListener('abort', onOuter, { once: true })
  try { return await fetch(url, { ...init, signal: ctl.signal }) }
  finally { clearTimeout(timer); outer?.removeEventListener('abort', onOuter) }
}

async function viaOverpass(lat: number, lng: number, radiusM: number, signal?: AbortSignal): Promise<FoodPlace[]> {
  const around = `(around:${radiusM},${lat},${lng})`
  const query = `[out:json][timeout:25];(
    nwr["amenity"~"^(restaurant|fast_food|cafe|food_court|canteen|events_venue)$"]["name"]${around};
    nwr["shop"~"^(bakery|confectionery|pastry)$"]["name"]${around};
    nwr["tourism"~"^(hotel|hostel|guest_house)$"]["name"]${around};
  );out center tags 300;`
  let lastError: unknown = null
  for (const url of OVERPASS) {
    try {
      const r = await timedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      }, 20000, signal)
      if (!r.ok) throw new Error(`Map data service returned ${r.status}`)
      const j = await r.json() as { elements?: OsmEl[]; remark?: string }
      // Overpass sometimes answers "200 OK" with an empty list and an error remark when it is overloaded.
      if (!j.elements?.length && j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error(j.remark)
      return toPlaces(j.elements ?? [], lat, lng)
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Map data service unavailable')
}

/** Backup source: OpenStreetMap Nominatim search, used only if every Overpass server fails. */
async function viaNominatim(lat: number, lng: number, radiusM: number, signal?: AbortSignal): Promise<FoodPlace[]> {
  const dLat = radiusM / 111000, dLng = radiusM / (111000 * Math.cos((lat * Math.PI) / 180))
  const viewbox = `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`
  const terms: { q: string; kind: PlaceKind }[] = [
    { q: 'restaurant', kind: 'restaurant' }, { q: 'cafe', kind: 'cafe' },
    { q: 'bakery', kind: 'bakery' }, { q: 'hotel', kind: 'stay' }
  ]
  const out: FoodPlace[] = []
  for (let i = 0; i < terms.length; i++) {
    if (i > 0) await new Promise(res => setTimeout(res, 1100))   // Nominatim allows about 1 request per second
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    try {
      const r = await timedFetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(terms[i].q)}`,
        { headers: { 'Accept-Language': 'en' } }, 10000, signal)
      if (!r.ok) continue
      const rows = await r.json() as { osm_type: string; osm_id: number; lat: string; lon: string; name?: string; display_name: string }[]
      for (const x of rows) {
        if (!x.name) continue
        const la = Number(x.lat), lo = Number(x.lon)
        out.push({
          id: `${x.osm_type}/${x.osm_id}`, name: x.name, kind: terms[i].kind, cuisine: '', lat: la, lng: lo,
          address: x.display_name.split(',').slice(1, 4).join(',').trim(), phone: '', hours: '', distanceKm: km([lat, lng], [la, lo])
        })
      }
    } catch { if (signal?.aborted) throw new DOMException('aborted', 'AbortError') }
  }
  const unique = [...new Map(out.map(p => [p.id, p])).values()]
  return unique.sort((a, b) => a.distanceKm - b.distanceKm)
}

/** Finds named restaurants, cafes, bakeries, hotels/hostels and canteens around a point, nearest first. */
export async function fetchNearbyFoodPlaces(lat: number, lng: number, radiusM: number, signal?: AbortSignal): Promise<FoodPlace[]> {
  let first: FoodPlace[] = []
  try { first = await viaOverpass(lat, lng, radiusM, signal) }
  catch (e) { if (signal?.aborted) throw e }
  if (first.length) return first
  const backup = await viaNominatim(lat, lng, radiusM, signal).catch(e => { if (signal?.aborted) throw e; return [] as FoodPlace[] })
  if (backup.length) return backup
  return []
}

export const directionsUrl = (lat?: number | null, lng?: number | null, address?: string) =>
  lat != null && lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address ?? '')}`
