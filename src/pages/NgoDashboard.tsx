import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PackageCheck, Search, Truck, Utensils } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { StatusBadge } from '../components/StatusBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Empty, Spinner } from '../components/Spinner'
import type { Donation, Pickup } from '../lib/types'
import { errMsg, fmtDateTime, timeLeft } from '../lib/utils'
import { directionsUrl } from '../lib/geo'
import { Notifications, OrgGate, Stat, VerificationBanner } from './Dashboard'

type Row = Pickup & { donations: Donation & { donation_private: { pickup_address: string; instructions: string | null; exact_lat: number | null; exact_lng: number | null } | null } }

export default function NgoDashboard() {
  const { t } = useI18n()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [token, setToken] = useState(''); const [meals, setMeals] = useState<Record<string, string>>({})
  const [cancelId, setCancelId] = useState<string | null>(null)

  // donation_private rows are returned only while the pickup is active and belongs to this NGO (enforced by RLS)
  const load = () => supabase.from('pickups').select('*, donations(*, organizations(name), donation_private(pickup_address, instructions, exact_lat, exact_lng))')
    .order('claimed_at', { ascending: false }).then(({ data }) => setRows((data as unknown as Row[]) ?? []))
  useEffect(() => { void load() }, [])

  const active = (rows ?? []).filter(r => ['reserved', 'picked_up'].includes(r.status))
  const history = (rows ?? []).filter(r => ['delivered', 'cancelled'].includes(r.status))
  const delivered = history.filter(r => r.status === 'delivered')
  const totalMeals = delivered.reduce((s, r) => s + (r.meals_distributed ?? 0), 0)

  async function confirm() {
    const { data, error } = await supabase.rpc('confirm_pickup', { p_token: token.trim() })
    // invalid/expired/reused codes return no id (generic failure); permission errors raise
    if (error) toast.error(errMsg(error))
    else if (!data) toast.error('Invalid or expired code. Ask the donor to generate a fresh one.')
    else { toast.success('Pickup confirmed'); setToken('') }
    void load()
  }
  async function deliver(id: string) {
    const n = Number(meals[id])
    if (!Number.isInteger(n) || n < 0) return void toast.error('Enter the number of meals distributed.')
    const { error } = await supabase.rpc('complete_delivery', { p_pickup_id: id, p_meals: n })
    if (error) toast.error(errMsg(error)); else toast.success('Delivery recorded. Thank you!')
    void load()
  }
  async function requestVolunteer(id: string) {
    const { error } = await supabase.rpc('request_volunteer', { p_pickup_id: id })
    if (error) toast.error(errMsg(error)); else toast.success('Volunteers can now see this pickup (without the address).')
    void load()
  }
  async function release() {
    const { error } = await supabase.rpc('cancel_pickup', { p_pickup_id: cancelId }); setCancelId(null)
    if (error) toast.error(errMsg(error)); else toast.success('Pickup released'); void load()
  }

  return (
    <OrgGate>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader eyebrow="NGO" title={t('dash.ngo')} subtitle="Claim food, collect it, and report the meals you serve."
          actions={<Link to="/find" className="btn-primary"><Search size={16} aria-hidden />Browse available food</Link>} />
        <VerificationBanner />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat icon={<Truck size={20} />} label="Active pickups" value={active.length} />
          <Stat icon={<PackageCheck size={20} />} label="Collections delivered" value={delivered.length} />
          <Stat icon={<Utensils size={20} />} label="Meals reported distributed" value={totalMeals} />
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-8">
            <section aria-labelledby="act"><h2 id="act" className="mb-3 text-xl font-semibold">Active pickups</h2>
              {rows === null ? <Spinner /> : active.length === 0 ? <Empty title="No active pickups" body="Claim food from the marketplace and it will show up here with its pickup address." action={<Link to="/find" className="btn-primary">{t('hero.find')}</Link>} /> : (
                <ul className="space-y-3">{active.map(r => {
                  const tl = timeLeft(r.donations.pickup_deadline); const priv = r.donations.donation_private
                  return (
                    <li key={r.id} className="card p-4">
                      <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{r.donations.title}</p><StatusBadge status={r.donations.status} /></div>
                      <p className={`text-sm ${tl.urgent ? 'font-semibold text-urgent-600' : 'text-ink-500'}`}>Collect by {fmtDateTime(r.donations.pickup_deadline)} · {tl.label}</p>
                      {priv && <p className="mt-2 rounded-xl bg-cream-100 p-3 text-sm"><strong>Pickup address:</strong> {priv.pickup_address}{priv.instructions && <><br /><strong>Instructions:</strong> {priv.instructions}</>}<br /><a className="mt-2 inline-flex font-semibold text-forest-700 underline" target="_blank" rel="noreferrer" href={directionsUrl(priv.exact_lat, priv.exact_lng, priv.pickup_address)}>Open directions in Maps</a></p>}
                      <p className="mt-2 text-xs text-ink-500">Allergens: {r.donations.allergens ?? 'none listed'} · Check food quality before distributing.</p>
                      {r.status === 'reserved' && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {!r.volunteer_id && !r.needs_volunteer && <button className="btn-outline" onClick={() => requestVolunteer(r.id)}>Ask a volunteer to collect</button>}
                          {r.needs_volunteer && <span className="text-sm text-ink-500">Waiting for a volunteer…</span>}
                          {r.volunteer_id && <span className="text-sm text-forest-700">A volunteer is assigned</span>}
                          <button className="btn-ghost" onClick={() => setCancelId(r.id)}>Release this pickup</button>
                        </div>)}
                      {r.status === 'picked_up' && (
                        <div className="mt-3 flex flex-wrap items-end gap-2">
                          <div><label className="label" htmlFor={'m' + r.id}>Meals distributed</label><input id={'m' + r.id} type="number" min={0} className="input !w-36" value={meals[r.id] ?? ''} onChange={e => setMeals({ ...meals, [r.id]: e.target.value })} /></div>
                          <button className="btn-primary" onClick={() => deliver(r.id)}>Record delivery</button>
                        </div>)}
                    </li>)
                })}</ul>)}
            </section>
            <section className="card p-4" aria-labelledby="cf">
              <h2 id="cf" className="font-semibold">Confirm a pickup</h2>
              <p className="text-sm text-ink-500">Enter the one-time code shown by the donor. You must be the assigned collector.</p>
              <div className="mt-2 flex gap-2"><input aria-label="Pickup code" className="input" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste or type code" /><button className="btn-primary" disabled={!token.trim()} onClick={confirm}>Confirm</button></div>
            </section>
            <section aria-labelledby="hist"><h2 id="hist" className="mb-3 text-xl font-semibold">Collection history</h2>
              {history.length === 0 ? <p className="text-sm text-ink-500">Completed collections will appear here.</p> : (
                <ul className="divide-y divide-forest-100 rounded-xl2 border border-forest-100">{history.map(r => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><span>{r.donations.title}</span><span className="text-ink-500">{r.status === 'delivered' ? `${r.meals_distributed} meals · ${fmtDateTime(r.delivered_at!)}` : 'Cancelled'}</span></li>))}</ul>)}
            </section>
          </div>
          <Notifications />
        </div>
        <ConfirmDialog open={!!cancelId} danger title="Release this pickup?" body="The listing becomes available to other NGOs if time remains." confirmLabel="Release" onConfirm={release} onCancel={() => setCancelId(null)} />
      </div>
    </OrgGate>
  )
}
