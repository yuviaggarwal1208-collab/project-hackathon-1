import { createClient } from '@supabase/supabase-js'

const LS_KEY = 'rp_supabase_config'

/** Keeps only https://xxxx.supabase.co, so pasting ".../rest/v1/" or a trailing slash still works. */
export function normalizeUrl(u: string): string {
  try { return new URL(u.trim()).origin } catch { return '' }
}

function readConfig(): { url: string; key: string } | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (envUrl && envKey && normalizeUrl(envUrl)) return { url: normalizeUrl(envUrl), key: envKey.trim() }
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (s?.url && s?.key && normalizeUrl(s.url)) return { url: normalizeUrl(s.url), key: String(s.key).trim() }
  } catch { /* ignore */ }
  return null
}

const cfg = readConfig()
export const isConfigured = Boolean(cfg)
export const supabase = createClient(cfg?.url ?? 'https://not-configured.supabase.co', cfg?.key ?? 'not-configured')

export function saveConfig(url: string, key: string) {
  localStorage.setItem(LS_KEY, JSON.stringify({ url: normalizeUrl(url), key: key.trim() }))
}
export function clearConfig() { localStorage.removeItem(LS_KEY) }

export type Check = { ok: boolean; step: 'url' | 'key' | 'database' | 'ready'; message: string }

/** Plain-English connection test used by the setup screen and the start-up check. */
export async function checkConnection(rawUrl: string, key: string): Promise<Check> {
  const url = normalizeUrl(rawUrl)
  if (!url || !/\.supabase\.(co|in)$/.test(new URL(url).hostname))
    return { ok: false, step: 'url', message: 'That does not look like a Supabase project URL. It should look like https://abcdxyz.supabase.co' }
  if (key.trim().length < 20) return { ok: false, step: 'key', message: 'The key looks too short. Paste the full publishable (or anon) key.' }
  if (/service_role|sb_secret_/.test(key)) return { ok: false, step: 'key', message: 'That is a secret key. Never use it in a website. Use the publishable or anon key.' }
  try {
    const client = createClient(url, key.trim())
    const { error } = await client.from('profiles').select('id').limit(1)
    if (!error) return { ok: true, step: 'ready', message: 'Connected. Database is ready.' }
    const msg = error.message || ''
    if (error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|does not exist/i.test(msg))
      return { ok: false, step: 'database', message: 'Connected to Supabase, but the database tables are missing. Run supabase/schema.sql in the SQL Editor.' }
    if (/invalid api key|jwt/i.test(msg) || error.code === '401') return { ok: false, step: 'key', message: 'Supabase rejected this key. Copy the publishable key again from Settings → API Keys.' }
    return { ok: false, step: 'database', message: msg }
  } catch {
    return { ok: false, step: 'url', message: 'Could not reach that URL. Check your internet and that the project is not paused (open it on supabase.com).' }
  }
}
