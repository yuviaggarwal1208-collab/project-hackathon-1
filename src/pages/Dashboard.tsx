import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { errMsg, fmtDateTime } from '../lib/utils'
import { Empty } from '../components/Spinner'

export function DashboardRedirect() {
  const { profile } = useAuth()
  return <Navigate to={`/dashboard/${profile?.role ?? 'donor'}`} replace />
}

/** Creates the organization from the details given at sign-up (runs once, automatically). */
export function OrgGate({ children }: { children: React.ReactNode }) {
  const { session, profile, org, refresh } = useAuth()
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false)
  const meta = session?.user.user_metadata as { org_name?: string; org_type?: string } | undefined
  const needsOrg = !!profile && (profile.role === 'donor' || profile.role === 'ngo') && !org

  async function create(orgName: string) {
    if (!profile || busy) return
    setBusy(true)
    const { error } = await supabase.from('organizations').insert({
      owner_id: profile.id, name: orgName, org_type: profile.role === 'ngo' ? 'ngo' : meta?.org_type ?? 'restaurant' })
    setBusy(false)
    if (error) return void toast.error(errMsg(error))
    toast.success('Organization submitted for verification'); await refresh()
  }
  useEffect(() => { if (needsOrg && meta?.org_name && meta.org_name.trim().length >= 2) void create(meta.org_name.trim()) }, [needsOrg, meta?.org_name])

  if (!needsOrg) return <>{children}</>
  if (meta?.org_name) return <div className="p-16 text-center text-ink-500">Setting up your organization…</div>
  return (
    <form onSubmit={e => { e.preventDefault(); void create(name) }} className="card mx-auto my-12 max-w-md space-y-4 p-6">
      <h1 className="text-xl font-bold">Set up your organization</h1>
      <p className="text-sm text-ink-500">An administrator reviews every organization before it can list or claim food.</p>
      <div><label className="label" htmlFor="on">Organization name</label><input id="on" required minLength={2} className="input" value={name} onChange={e => setName(e.target.value)} /></div>
      <button className="btn-primary w-full" disabled={busy}>Submit for verification</button>
    </form>
  )
}

export function VerificationBanner() {
  const { org, profile } = useAuth()
  if (!org || profile?.role === 'volunteer') return null
  if (org.verification_status === 'verified') return null
  return (
    <p role="status" className="mb-6 rounded-xl bg-urgent-100 p-3 text-sm text-ink-900">
      {org.verification_status === 'pending' ? 'Your organization is awaiting administrator verification. Some actions unlock after approval.' : 'Your organization was not verified. Contact support for details.'}
    </p>
  )
}

export function Notifications() {
  const { t } = useI18n(); const { profile } = useAuth()
  const [items, setItems] = useState<{ id: string; title: string; body: string | null; created_at: string; read_at: string | null }[]>([])
  const load = () => supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(20).then(({ data }) => setItems(data ?? []))
  useEffect(() => {
    void load()
    if (!profile) return
    // realtime: new rows for this user arrive instantly
    const ch = supabase.channel('notif-' + profile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        p => { toast(String((p.new as { title: string }).title)); void load() }).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [profile?.id])
  async function readAll() { await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null); void load() }
  const unread = items.filter(i => !i.read_at).length
  return (
    <section className="card p-5" aria-labelledby="notif-h">
      <div className="flex items-center justify-between">
        <h2 id="notif-h" className="flex items-center gap-2 text-lg font-semibold"><Bell size={18} aria-hidden />{t('dash.notifications')}{unread > 0 && <span className="rounded-full bg-urgent-500 px-2 text-xs text-white">{unread}</span>}</h2>
        {unread > 0 && <button className="btn-ghost !py-1" onClick={readAll}>Mark all read</button>}
      </div>
      {items.length === 0 ? <p className="mt-3 text-sm text-ink-500">{t('dash.noNotifications')}</p> : (
        <ul className="mt-3 divide-y divide-forest-100">
          {items.map(n => <li key={n.id} className={`py-2 text-sm ${n.read_at ? 'text-ink-500' : 'font-medium'}`}>{n.title}{n.body ? ` · ${n.body}` : ''}<span className="block text-xs text-ink-500">{fmtDateTime(n.created_at)}</span></li>)}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-500">In-app only. Email, SMS and WhatsApp are not enabled until providers are configured.</p>
    </section>
  )
}

export const Stat = ({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) => (
  <div className="card flex items-center gap-4 p-5">
    {icon && <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">{icon}</span>}
    <div><p className="font-display text-2xl font-bold leading-none text-forest-900">{value}</p><p className="mt-1 text-sm text-ink-500">{label}</p></div>
  </div>
)
export { Empty }
