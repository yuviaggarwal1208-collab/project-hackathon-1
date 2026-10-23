import { describe, expect, it } from 'vitest'
import { errMsg, fmtDateTime, haversineKm, timeLeft } from './utils'

describe('timeLeft', () => {
  it('reports expired for a deadline in the past', () => {
    const r = timeLeft(new Date(Date.now() - 60_000).toISOString())
    expect(r.expired).toBe(true)
    expect(r.label).toBe('Expired')
    expect(r.urgent).toBe(true)
  })

  it('reports hours and minutes for a far-future deadline', () => {
    const r = timeLeft(new Date(Date.now() + 3 * 36e5 + 30 * 6e4).toISOString())
    expect(r.expired).toBe(false)
    expect(r.urgent).toBe(false)
    expect(r.label).toBe('3h 30m left')
  })

  it('reports only minutes under an hour, and marks <2h as urgent', () => {
    const r = timeLeft(new Date(Date.now() + 45 * 6e4).toISOString())
    expect(r.label).toBe('45m left')
    expect(r.urgent).toBe(true)
  })

  it('is urgent between 1 and 2 hours', () => {
    expect(timeLeft(new Date(Date.now() + 90 * 6e4).toISOString()).urgent).toBe(true)
    expect(timeLeft(new Date(Date.now() + 5 * 36e5).toISOString()).urgent).toBe(false)
  })
})

describe('haversineKm', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineKm([28.64, 77.34], [28.64, 77.34])).toBeCloseTo(0, 5)
  })

  it('matches a known distance (Vaishali to Indirapuram area, ~13 km)', () => {
    const d = haversineKm([28.64, 77.34], [28.61, 77.21])
    expect(d).toBeGreaterThan(10)
    expect(d).toBeLessThan(16)
  })

  it('is symmetric', () => {
    const a: [number, number] = [28.64, 77.34]
    const b: [number, number] = [28.61, 77.21]
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9)
  })
})

describe('errMsg', () => {
  it('translates network failures into an actionable message', () => {
    expect(errMsg(new Error('TypeError: Failed to fetch'))).toMatch(/Cannot reach the server/)
  })

  it('translates invalid credentials', () => {
    expect(errMsg(new Error('Invalid login credentials'))).toBe('Wrong email or password.')
  })

  it('translates unconfirmed email', () => {
    expect(errMsg(new Error('Email not confirmed'))).toMatch(/confirm your email/i)
  })

  it('translates already-registered emails', () => {
    expect(errMsg(new Error('User already registered'))).toMatch(/already registered/i)
  })

  it('passes through unknown messages as-is', () => {
    expect(errMsg(new Error('donation is no longer available'))).toBe('donation is no longer available')
  })

  it('never returns an empty message', () => {
    expect(errMsg(undefined).length).toBeGreaterThan(0)
  })
})

describe('fmtDateTime', () => {
  it('produces a readable date for an ISO timestamp', () => {
    expect(fmtDateTime('2026-01-05T15:30:00Z')).toBeTruthy()
  })
})
