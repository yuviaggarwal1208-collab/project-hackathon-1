import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { isConfigured, supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { errMsg } from '../lib/utils'
import { AuthShell } from '../components/AuthShell'

export default function Login() {
  const { t } = useI18n(); const nav = useNavigate(); const loc = useLocation()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConfigured) return void toast.error('Supabase keys are missing. Add them to .env and restart npm run dev.')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) return void toast.error(errMsg(error))
    nav((loc.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true })
  }
  async function forgot() {
    if (!email) return void toast.error('Enter your email address first, then click “Forgot password”.')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` })
    setBusy(false)
    // Do not reveal whether the email has an account (SECURITY.md §4)
    if (error) return void toast.error(errMsg(error))
    setResetSent(true)
  }
  return (
    <AuthShell title="Welcome back" subtitle="Log in to manage donations, pickups and impact.">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label" htmlFor="email">{t('auth.email')}</label><input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">{t('auth.password')}</label><input id="pw" type="password" required autoComplete="current-password" className="input" value={password} onChange={e => setPassword(e.target.value)} /></div>
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}{busy ? t('common.loading') : t('auth.login')}</button>
        <button type="button" className="w-full text-center text-sm font-semibold text-forest-700 underline underline-offset-2 disabled:opacity-50" onClick={forgot} disabled={busy}>{t('auth.forgot')}</button>
        {resetSent && <p role="status" className="rounded-xl bg-forest-50 p-3 text-sm text-forest-800">If an account exists for that email, a password reset link has been sent. Check your inbox (and spam folder).</p>}
        <p className="text-center text-sm text-ink-500">New to RescuePlate? <Link className="font-semibold text-forest-700 underline underline-offset-2" to="/register">{t('nav.register')}</Link></p>
      </form>
    </AuthShell>
  )
}
