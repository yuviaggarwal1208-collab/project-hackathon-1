import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BadgeCheck, ClipboardList, Clock, Flag, Hourglass, PackageCheck, Users, Utensils } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { Empty, Spinner } from '../components/Spinner'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { errMsg, fmtDateTime } from '../lib/utils'
import { Notifications, Stat } from './Dashboard'

interface Overview { users: number; pending_orgs: number; verified_orgs: number; donations: number; available: number; pickups: number; expired: number; open_reports: number }
interface Org { id: string; owner_id: string; name: string; org_type: string; city: string | null; registration_number: string | null; verification_status: string; created_at: string }
interface Rep { id: string; reason: string; status: string; category: string; created_at: string; donations: { title: string } | null }
interface Usr { id: string; full_name: string; role: string; suspended: boolean }

export default function AdminDashboard() {
  const { t } = useI18n()
  const [ov, setOv] = useState<Overview | null>(null); const [orgs, setOrgs] = useState<Org[]>([]); const [reps, setReps] = useState<Rep[]>([]); const [users, setUsers] = useState<Usr[]>([])
  const [suspend, setSuspend] = useState<Usr | null>(null)

  async function load() {
    const [o, g, r, u] = await Promise.all([
      supabase.rpc('admin_overview'),
      supabase.from('organizations').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('reports').select('*, donations(title)').order('created_at', { ascending: false }).limit(50),
      supabase.from('profiles').select('id,full_name,role,suspended').order('created_at', { ascending: false }).limit(50)])
    if (o.error) toast.error(errMsg(o.error)); setOv(o.data as Overview)
    setOrgs((g.data as Org[]) ?? []); setReps((r.data as unknown as Rep[]) ?? []); setUsers((u.data as Usr[]) ?? [])
  }
  useEffect(() => { void load() }, [])

  async function decide(id: string, status: 'verified' | 'rejected') {
    const { error } = await supabase.rpc('admin_set_org_verification', { p_org: id, p_status: status })
    if (error) toast.error(errMsg(error)); else toast.success(`Organization ${status}`); void load()
  }
  async function toggleSuspend() {
    if (!suspend) return
    const { error } = await supabase.rpc('admin_set_suspended', { p_user: suspend.id, p_suspended: !suspend.suspended }); setSuspend(null)
    if (error) toast.error(errMsg(error)); else toast.success('Account updated'); void load()
  }
  async function setReport(id: string, status: string) {
    // audited server-side operation (records actor, decision and timestamp)
    const { error } = await supabase.rpc('admin_set_report_status', { p_report: id, p_status: status })
    if (error) toast.error(errMsg(error)); else toast.success('Report updated'); void load()
  }

  if (!ov) return <Spinner />
  const pending = orgs.filter(o => o.verification_status === 'pending')
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader eyebrow="Administrator" title={t('dash.admin')} subtitle="Verify organizations, review safety reports and monitor the platform." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Users size={20} />} label="Registered users" value={ov.users} />
        <Stat icon={<Hourglass size={20} />} label="Pending verifications" value={ov.pending_orgs} />
        <Stat icon={<BadgeCheck size={20} />} label="Verified organizations" value={ov.verified_orgs} />
        <Stat icon={<ClipboardList size={20} />} label="Total donations" value={ov.donations} />
        <Stat icon={<Utensils size={20} />} label="Available now" value={ov.available} />
        <Stat icon={<PackageCheck size={20} />} label="Successful pickups" value={ov.pickups} />
        <Stat icon={<Clock size={20} />} label="Expired donations" value={ov.expired} />
        <Stat icon={<Flag size={20} />} label="Open safety reports" value={ov.open_reports} />
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <section aria-labelledby="ver"><h2 id="ver" className="mb-3 text-xl font-semibold">Verification requests</h2>
            {pending.length === 0 ? <Empty title="No pending requests" /> : <ul className="space-y-3">{pending.map(o => (
              <li key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div><p className="font-semibold">{o.name}</p><p className="text-sm text-ink-500">{o.org_type} · {o.city ?? 'city not given'} · applied {fmtDateTime(o.created_at)}</p></div>
                <div className="flex gap-2"><button className="btn-primary" onClick={() => decide(o.id, 'verified')}>Verify</button><button className="btn-ghost" onClick={() => decide(o.id, 'rejected')}>Reject</button></div>
              </li>))}</ul>}
          </section>
          <section aria-labelledby="rep"><h2 id="rep" className="mb-3 text-xl font-semibold">Safety reports</h2>
            {reps.length === 0 ? <Empty title="No reports" body="Reports on unsafe or misleading food appear here." /> : <ul className="space-y-3">{reps.map(r => (
              <li key={r.id} className="card p-4"><p className="font-semibold">{r.donations?.title ?? 'Listing'} <span className="ml-1 rounded-full bg-cream-100 px-2 py-0.5 text-xs font-medium text-ink-700">{r.category.replace('_', ' ')}</span></p><p className="text-sm">{r.reason}</p>
                <div className="mt-2 flex items-center gap-2 text-sm"><label htmlFor={'s' + r.id} className="sr-only">Report status</label>
                  <select id={'s' + r.id} className="input !w-auto" value={r.status} onChange={e => setReport(r.id, e.target.value)}>{['open', 'investigating', 'resolved', 'dismissed'].map(s => <option key={s}>{s}</option>)}</select>
                  <span className="text-ink-500">{fmtDateTime(r.created_at)}</span></div></li>))}</ul>}
          </section>
          <section aria-labelledby="usr"><h2 id="usr" className="mb-3 text-xl font-semibold">Accounts</h2>
            <ul className="divide-y divide-forest-100 rounded-xl2 border border-forest-100">{users.map(u => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{u.full_name} · {u.role}{u.suspended && <strong className="ml-2 text-urgent-600">suspended</strong>}</span>
                {u.role !== 'admin' && <button className="btn-ghost !py-1" onClick={() => setSuspend(u)}>{u.suspended ? 'Restore' : 'Suspend'}</button>}</li>))}</ul>
          </section>
        </div>
        <Notifications />
      </div>
      <ConfirmDialog open={!!suspend} danger title={suspend?.suspended ? 'Restore this account?' : 'Suspend this account?'} confirmLabel={suspend?.suspended ? 'Restore' : 'Suspend'} onConfirm={toggleSuspend} onCancel={() => setSuspend(null)} />
    </div>
  )
}
