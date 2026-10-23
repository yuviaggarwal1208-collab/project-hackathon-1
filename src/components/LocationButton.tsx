import { useState } from 'react'
import { Crosshair, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getPreciseLocation, reverseGeocode, type Fix, type Place } from '../lib/geo'

/** One-click "use my precise location": GPS fix + readable address. */
export function LocationButton({ onFound, label = 'Use my precise location', className = 'btn-outline' }: {
  onFound: (fix: Fix, place: Place | null) => void; label?: string; className?: string
}) {
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    try {
      const fix = await getPreciseLocation()
      const place = await reverseGeocode(fix.lat, fix.lng)
      onFound(fix, place)
      toast.success(`Location found (accurate to about ${Math.round(fix.accuracy)} m)`)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <button type="button" className={className} onClick={go} disabled={busy}>
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Crosshair size={16} aria-hidden />}{busy ? 'Finding you…' : label}
    </button>
  )
}
