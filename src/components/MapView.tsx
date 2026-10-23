import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPoint { id: string; lat: number; lng: number; title: string; sub: string; color?: string; legend?: string }

function popup(title: string, sub: string) {
  const box = document.createElement('div')
  const b = document.createElement('strong'); b.textContent = title
  const s = document.createElement('div'); s.textContent = sub
  box.append(b, s)
  return box
}

const NONE: MapPoint[] = []   // stable empty list so the map does not re-fit on every render
export const FOOD_COLOR = '#16a34a'   // bright green: food is available here right now

/**
 * Big green pins = food available right now (listed on RescuePlate).
 * Small coloured pins (extra) = nearby restaurants, cafes, bakeries... with no food listed. Orange = you.
 */
export function MapView({ points, extra = NONE, me, height = 440 }: { points: MapPoint[]; extra?: MapPoint[]; me: [number, number] | null; height?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView([28.6692, 77.4538], 11)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  useEffect(() => {
    if (!map.current || !layer.current) return
    layer.current.clearLayers()
    const bounds: L.LatLngTuple[] = []
    extra.forEach(p => {
      L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: p.color ?? '#2563eb', fillOpacity: 1 }).bindPopup(popup(p.title, p.sub)).addTo(layer.current!)
      bounds.push([p.lat, p.lng])
    })
    points.forEach(p => {
      L.circleMarker([p.lat, p.lng], { radius: 16, color: FOOD_COLOR, weight: 2, fillColor: FOOD_COLOR, fillOpacity: 0.25 }).addTo(layer.current!)
      L.circleMarker([p.lat, p.lng], { radius: 10, color: '#fff', weight: 3, fillColor: FOOD_COLOR, fillOpacity: 1 }).bindPopup(popup(p.title, p.sub)).addTo(layer.current!)
      bounds.push([p.lat, p.lng])
    })
    if (me) {
      L.circleMarker(me, { radius: 8, color: '#fff', weight: 3, fillColor: '#f27a1a', fillOpacity: 1 }).bindPopup('You are here').addTo(layer.current)
      bounds.push(me)
    }
    if (bounds.length) map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    setTimeout(() => map.current?.invalidateSize(), 50)
  }, [points, extra, me])

  // one legend entry per colour/kind that is actually on the map
  const legend = new Map<string, string>()
  extra.forEach(p => legend.set(p.legend ?? 'Nearby restaurants', p.color ?? '#2563eb'))

  return (
    <div>
      <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl2 border border-forest-100 shadow-card" role="region" aria-label="Map of available food and nearby restaurants" />
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500" aria-label="Map legend">
        <li className="flex items-center gap-1.5 font-semibold text-forest-800"><span className="h-4 w-4 rounded-full ring-2 ring-white" style={{ background: FOOD_COLOR }} aria-hidden />Food available now</li>
        {[...legend].map(([label, color]) => (
          <li key={label} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: color }} aria-hidden />{label} (no food listed)</li>
        ))}
        {me && <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-urgent-500 ring-2 ring-white" aria-hidden />You</li>}
      </ul>
    </div>
  )
}
