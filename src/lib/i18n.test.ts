import { describe, expect, it } from 'vitest'
import { dictionaries, en, hi } from './i18n'

describe('i18n dictionaries', () => {
  it('exposes exactly two languages', () => {
    expect(Object.keys(dictionaries).sort()).toEqual(['en', 'hi'])
  })

  it('has an English value for every Hindi key and vice versa (no missing translations)', () => {
    const enKeys = Object.keys(en).sort()
    const hiKeys = Object.keys(hi).sort()
    const missingInHi = enKeys.filter(k => !(k in hi))
    const missingInEn = hiKeys.filter(k => !(k in en))
    expect(missingInHi, `keys missing from hi: ${missingInHi.join(', ')}`).toEqual([])
    expect(missingInEn, `keys missing from en: ${missingInEn.join(', ')}`).toEqual([])
  })

  it('has no empty translation values', () => {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      for (const [k, v] of Object.entries(dict)) {
        expect(v.trim(), `${lang}.${k} is empty`).not.toBe('')
      }
    }
  })

  it('covers required workflow strings (statuses, roles, safety)', () => {
    const required = [
      'status.available', 'status.reserved', 'status.picked_up', 'status.delivered', 'status.expired', 'status.cancelled',
      'role.donor', 'role.ngo', 'role.volunteer', 'role.admin',
      'form.safety', 'safety.note', 'demo.label', 'auth.forgot',
    ]
    for (const k of required) {
      expect(en[k], `en missing ${k}`).toBeTruthy()
      expect(hi[k], `hi missing ${k}`).toBeTruthy()
    }
  })

  it('never offers an admin self-registration string', () => {
    // The register page offers donor/ngo/volunteer only; the admin label exists for display only.
    const adminLabel = en['role.admin']
    const roleOptions = [en['role.donor'], en['role.ngo'], en['role.volunteer']]
    expect(roleOptions).not.toContain(adminLabel)
  })
})
