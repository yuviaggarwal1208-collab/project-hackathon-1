import { supabase } from './supabase'

export function timeLeft(deadline: string): { label: string; urgent: boolean; expired: boolean } {
  const ms = new Date(deadline).getTime() - Date.now()
  if (ms <= 0) return { label: 'Expired', urgent: true, expired: true }
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4)
  return { label: h > 0 ? `${h}h ${m}m left` : `${m}m left`, urgent: ms < 2 * 36e5, expired: false }
}

export function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function imageUrl(path: string | null) {
  return path ? supabase.storage.from('food-images').getPublicUrl(path).data.publicUrl : null
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Turns technical errors into messages a person can act on. */
export function errMsg(e: unknown): string {
  const raw = e instanceof Error ? e.message : (e as { message?: string })?.message ?? ''
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return 'Cannot reach the server. Check your internet connection, then reload the page.'
  if (/invalid login credentials/i.test(raw)) return 'Wrong email or password.'
  if (/email not confirmed/i.test(raw)) return 'Please confirm your email first (check your inbox), then log in.'
  if (/user already registered/i.test(raw)) return 'This email is already registered. Try logging in.'
  if (/rate limit|too many/i.test(raw)) return 'Too many attempts. Please wait a minute and try again.'
  if (/database error saving new user/i.test(raw)) return 'Account setup failed on the server. The database schema may not be installed yet.'
  return raw || 'Something went wrong. Please try again.'
}
