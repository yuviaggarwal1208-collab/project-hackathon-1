import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { AuthShell } from '../components/AuthShell'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { errMsg } from '../lib/utils'

/** Reached from the emailed recovery link (redirect target /reset). The link establishes a
 *  temporary session; the user then chooses a new password via supabase.auth.updateUser. */
export default function ResetPassword() {
  const { t } = useI18n(); const nav = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setHasSession(!!data.session); setReady(true) })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return void toast.error('Use a password with at least 8 characters.')
    if (password !== confirm) return void toast.error('The two passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return void toast.error(errMsg(error))
    toast.success('Password updated. You are logged in.')
    nav('/dashboard', { replace: true })
  }

  if (!ready) return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-forest-600" aria-label={t('common.loading')} /></div>
  if (!hasSession) return (
    <AuthShell title="Reset link needed" subtitle="This page is reached from the reset link we email you. Request a fresh link and open it within an hour.">
      <Link to="/login" className="btn-primary w-full !py-3">{t('auth.login')}</Link>
    </AuthShell>
  )
  return (
    <AuthShell title="Choose a new password" subtitle="For your security, your previous password no longer works.">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label" htmlFor="np">{t('auth.newPassword')}</label>
          <input id="np" type="password" required minLength={8} autoComplete="new-password" className="input" value={password} onChange={e => setPassword(e.target.value)} /></div>
        <div><label className="label" htmlFor="cp">{t('auth.confirmPassword')}</label>
          <input id="cp" type="password" required minLength={8} autoComplete="new-password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}{busy ? t('common.loading') : t('auth.savePassword')}</button>
      </form>
    </AuthShell>
  )
}
