import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PackageCheck, Truck } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { StatusBadge } from '../components/StatusBadge'
import { Empty, Spinner } from '../components/Spinner'
import type { Donation, Pickup } from '../lib/types'
import { errMsg, fmtDateTime, timeLeft } from '../lib/utils'
import { directionsUrl } from '../lib/geo'
import { Notifications, Stat } from './Dashboard'

type Open = { pickup_id: string; title: string; area: string; city: string; pickup_deadline: string; quantity_portions: number | null }
type Mine = Pickup & { donations: Donation & { donation_private: { pickup_address: string; instructions: string | null; exact_lat: number | null; exact_lng: number | null } | null } }

export default function VolunteerDashboard() {
  const { t } = useI18n()
  const [open, setOpen] = useState<Open[] | null>(null); const [mine, setMine] = useState<Mine[] | null>(null)
  const [token, setToken] = useState(''); const [meals, setMeals] = useState<Record<string, string>>({})

  async function load() {
    const [o, m] = await Promise.all([
      supabase.rpc('open_volunteer_pickups'),
      supabase.from('pickups').select('*, donations(*, donation_private(pickup_address, instructions, exact_lat, exact_lng))').order('claimed_at', { ascending: false })])
    setOpen((o.data as Open[]) ?? []); setMine((m.data as unknown as Mine[]) ?? [])
  }
  useEffect(() => { void load() }, [])

  async function accept(id: string) {
    const { error } = await supabase.rpc('accept_pickup', { p_pickup_id: id })
    if (error) toast.error(errMsg(error)); else toast.success('Pickup accepted. Address and instructions are now visible.')
    void load()
  }
  async function confirm() {
    const { data, error } = await supabase.rpc('confirm_pickup', { p_token: token.trim() })
    if (error) toast.error(errMsg(error))
    else if (!data) toast.error('Invalid or expired code. Ask the donor to generate a fresh one.')
    else { toast.success('Pickup confirmed'); setToken('') }
    void load()
  }
  async function deliver(id: string) {
    const n = Number(meals[id])
    if (!Number.isInteger(n) || n < 0) return void toast.error('Enter the number of meals handed over.')
    const { error } = await supabase.rpc('complete_delivery', { p_pickup_id: id, p_meals: n })
    if (error) toast.error(errMsg(error)); else toast.success('Handover recorded')
    void load()
  }
  const active = (mine ?? []).filter(p => ['reserved', 'picked_up'].includes(p.status))
  const done = (mine ?? []).filter(p => p.status === 'delivered')

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader eyebrow="Volunteer" title={t('dash.volunteer')} subtitle="Accept open pickups and complete handovers." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat icon={<Truck size={20} />} label="Assigned pickups" value={active.length} />
        <Stat icon={<PackageCheck size={20} />} label="Completed" value={done.length} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <section aria-labelledby="mine"><h2 id="mine" className="mb-3 text-xl font-semibold">My assignments</h2>
            {mine === null ? <Spinner /> : active.length === 0 ? <Empty title="No assigned pickups" body="Accept an open pickup below to see its address and instructions." /> : (
              <ul className="space-y-3">{active.map(p => {
                const priv = p.donations.donation_private; const tl = timeLeft(p.donations.pickup_deadline)
                return (
                  <li key={p.id} className="card p-4">
                    <div className="flex justify-between gap-2"><p className="font-semibold">{p.donations.title}</p><StatusBadge status={p.donations.status} /></div>
                    <p className={`text-sm ${tl.urgent ? 'font-semibold text-urgent-600' : 'text-ink-500'}`}>Deadline {fmtDateTime(p.donations.pickup_deadline)} · {tl.label}</p>
                    {priv && <p className="mt-2 rounded-xl bg-cream-100 p-3 text-sm"><strong>Address:</strong> {priv.pickup_address}{priv.instructions && <><br /><strong>Instructions:</strong> {priv.instructions}</>}<br /><a className="mt-2 inline-flex font-semibold text-forest-700 underline" target="_blank" rel="noreferrer" href={directionsUrl(priv.exact_lat, priv.exact_lng, priv.pickup_address)}>Open directions in Maps</a></p>}
                    {p.status === 'picked_up' && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <div><label className="label" htmlFor={'v' + p.id}>Meals handed over</label><input id={'v' + p.id} type="number" min={0} className="input !w-36" value={meals[p.id] ?? ''} onChange={e => setMeals({ ...meals, [p.id]: e.target.value })} /></div>
                        <button className="btn-primary" onClick={() => deliver(p.id)}>Record handover</button>
                      </div>)}
                  </li>)
              })}</ul>)}
          </section>
          <section className="card p-4"><h2 className="font-semibold">Confirm pickup</h2>
            <p className="text-sm text-ink-500">Enter the one-time code shown by the donor.</p>
            <div className="mt-2 flex gap-2"><input aria-label="Pickup code" className="input" value={token} onChange={e => setToken(e.target.value)} /><button className="btn-primary" disabled={!token.trim()} onClick={confirm}>Confirm</button></div>
          </section>
          <section aria-labelledby="open"><h2 id="open" className="mb-3 text-xl font-semibold">Open pickups needing a volunteer</h2>
            <p className="mb-3 text-sm text-ink-500">Street addresses stay hidden until you accept.</p>
            {open === null ? <Spinner /> : open.length === 0 ? <Empty title="Nothing open right now" body="When an NGO asks for a volunteer, the pickup appears here." /> : (
              <ul className="space-y-3">{open.map(o => (
                <li key={o.pickup_id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div><p className="font-semibold">{o.title}</p><p className="text-sm text-ink-500">{o.area}, {o.city} · {o.quantity_portions ?? '—'} portions · by {fmtDateTime(o.pickup_deadline)}</p></div>
                  <button className="btn-primary" onClick={() => accept(o.pickup_id)}>Accept pickup</button>
                </li>))}</ul>)}
          </section>
        </div>
        <Notifications />
      </div>
    </div>
  )
}
