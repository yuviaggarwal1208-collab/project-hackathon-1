import { describe, expect, it } from 'vitest'
import { checkConnection, normalizeUrl } from './supabase'

describe('normalizeUrl', () => {
  it('keeps a plain project URL', () => {
    expect(normalizeUrl('https://abcdxyz.supabase.co')).toBe('https://abcdxyz.supabase.co')
  })

  it('strips paths and trailing slashes (paste safety)', () => {
    expect(normalizeUrl('https://abcdxyz.supabase.co/rest/v1/')).toBe('https://abcdxyz.supabase.co')
    expect(normalizeUrl(' https://abcdxyz.supabase.co/ ')).toBe('https://abcdxyz.supabase.co')
  })

  it('returns empty string for junk', () => {
    expect(normalizeUrl('not a url')).toBe('')
    expect(normalizeUrl('')).toBe('')
  })
})

describe('checkConnection input validation (pre-network checks)', () => {
  it('rejects non-Supabase URLs before any network call', async () => {
    const r = await checkConnection('https://evil.example.com', 'sb_publishable_abcdefghijklmnop')
    expect(r.ok).toBe(false)
    expect(r.step).toBe('url')
  })

  it('rejects keys that are too short', async () => {
    const r = await checkConnection('https://abcdxyz.supabase.co', 'short')
    expect(r.ok).toBe(false)
    expect(r.step).toBe('key')
  })

  it('explicitly refuses secret/service_role keys (SECURITY.md §12)', async () => {
    const r = await checkConnection('https://abcdxyz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role_secret_key_value')
    expect(r.ok).toBe(false)
    expect(r.step).toBe('key')
    expect(r.message).toMatch(/secret/i)
  })

  it('refuses sb_secret_ prefixed keys', async () => {
    const r = await checkConnection('https://abcdxyz.supabase.co', 'sb_secret_abcdefghijklmnopqrstuv')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/secret/i)
  })
})
