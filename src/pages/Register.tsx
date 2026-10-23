import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { HandHeart, Loader2, Store, Users } from 'lucide-react'
import { AuthShell } from '../components/AuthShell'
import { isConfigured, supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { errMsg } from '../lib/utils'

// Administrators are NOT selectable here. Admin access is granted server-side (see README).
const ROLES = ['donor', 'ngo', 'volunteer'] as const
const ORG_TYPES = ['restaurant', 'hotel', 'venue', 'hostel', 'canteen']

export default function Register() {
  const { t, lang } = useI18n(); const nav = useNavigate()
  const [f, setF] = useState({ role: 'donor' as (typeof ROLES)[number], full_name: '', email: '', password: '', phone: '', org_name: '', org_type: 'restaurant' })
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const needsOrg = f.role !== 'volunteer'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConfigured) return void toast.error('Supabase keys are missing. Add them to .env and restart npm run dev.')
    if (f.password.length < 8) return void toast.error('Use a password with at least 8 characters.')
    if (needsOrg && f.org_name.trim().length < 2) return void toast.error('Enter your organization name.')
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: f.email, password: f.password,
      options: { data: { role: f.role, full_name: f.full_name, phone: f.phone, language: lang,
        org_name: needsOrg ? f.org_name : undefined, org_type: f.role === 'ngo' ? 'ngo' : f.org_type } }
    })
    setBusy(false)
    if (error) return void toast.error(errMsg(error))
    if (data.session) { toast.success('Account created'); nav('/dashboard') }
    else { toast.success('Check your email to confirm your account, then log in.'); nav('/login') }
  }

  const icons = { donor: Store, ngo: Users, volunteer: HandHeart }
  return (
    <AuthShell title="Create your account" subtitle="Join as a donor, NGO or volunteer. Administrators are added by the platform team.">
      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="label">{t('auth.account')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map(r => { const Icon = icons[r]; return (
              <label key={r} className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center text-xs font-semibold transition focus-within:ring-4 focus-within:ring-forest-100 ${f.role === r ? 'border-forest-700 bg-forest-50 text-forest-800' : 'border-ink-300 text-ink-700 hover:border-forest-400'}`}>
                <input type="radio" name="role" value={r} checked={f.role === r} onChange={set('role')} className="sr-only" />
                <Icon size={20} aria-hidden />{t('role.' + r)}
              </label>) })}
          </div>
        </fieldset>
        <div><label className="label" htmlFor="n">{t('auth.name')}</label><input id="n" required className="input" value={f.full_name} onChange={set('full_name')} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="e">{t('auth.email')}</label><input id="e" type="email" required autoComplete="email" className="input" value={f.email} onChange={set('email')} /></div>
          <div><label className="label" htmlFor="ph">{t('auth.phone')}</label><input id="ph" type="tel" className="input" value={f.phone} onChange={set('phone')} /></div>
        </div>
        <div><label className="label" htmlFor="p">{t('auth.password')}</label><input id="p" type="password" required minLength={8} autoComplete="new-password" className="input" value={f.password} onChange={set('password')} /><p className="mt-1 text-xs text-ink-500">At least 8 characters.</p></div>
        {needsOrg && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="o">{t('auth.org')}</label><input id="o" required className="input" value={f.org_name} onChange={set('org_name')} /></div>
              {f.role === 'donor' && (
                <div><label className="label" htmlFor="ot">{t('auth.orgtype')}</label>
                  <select id="ot" className="input" value={f.org_type} onChange={set('org_type')}>{ORG_TYPES.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
              )}
            </div>
            <p className="rounded-xl bg-cream-100 p-3 text-sm text-ink-700">{t('auth.verifyNote')}</p>
          </>
        )}
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}{busy ? t('common.loading') : t('auth.register')}</button>
        <p className="text-center text-sm text-ink-500">Already registered? <Link className="font-semibold text-forest-700 underline underline-offset-2" to="/login">{t('nav.login')}</Link></p>
      </form>
    </AuthShell>
  )
}
