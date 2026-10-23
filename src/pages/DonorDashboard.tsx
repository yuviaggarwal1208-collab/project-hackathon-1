import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { PackageCheck, Pencil, Plus, Scale, Utensils } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { StatusBadge } from '../components/StatusBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Empty, Spinner } from '../components/Spinner'
import { CATEGORIES, type Donation } from '../lib/types'
import { errMsg, fmtDateTime, timeLeft } from '../lib/utils'
import { LocationButton } from '../components/LocationButton'
import { Notifications, OrgGate, Stat, VerificationBanner } from './Dashboard'

type Row = Donation & {
  pickups: { id: string; status: string; meals_distributed: number | null; organizations: { name: string } | null }[]
  donation_private?: { pickup_address: string; instructions: string | null; exact_lat: number | null; exact_lng: number | null } | null
}

/** ISO string -> value for <input type="datetime-local"> in local time */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function DonationForm({ onDone, edit }: { onDone: () => void; edit?: Row }) {
  const { t } = useI18n(); const { profile, org } = useAuth()
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [acc, setAcc] = useState<number | null>(null)
  const [f, setF] = useState(() => ({
    title: edit?.title ?? '', description: edit?.description ?? '', category: edit?.category ?? 'cooked_meal', diet: edit?.diet ?? 'veg',
    portions: edit?.quantity_portions?.toString() ?? '', kg: edit?.quantity_kg?.toString() ?? '',
    prepared_at: toLocalInput(edit?.prepared_at), handling: edit?.handling_info ?? '', allergens: edit?.allergens ?? '',
    area: edit?.area ?? '', city: edit?.city ?? (org?.city ?? ''),
    lat: edit?.approx_lat != null ? String(edit.approx_lat) : '', lng: edit?.approx_lng != null ? String(edit.approx_lng) : '',
    from: toLocalInput(edit?.available_from), deadline: toLocalInput(edit?.pickup_deadline),
    address: edit?.donation_private?.pickup_address ?? '', instructions: edit?.donation_private?.instructions ?? '', safe: false
  }))
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !org) return
    if (!f.title.trim()) return void toast.error('Enter the food name.')
    if (!f.portions && !f.kg) return void toast.error('Enter the quantity in portions or kilograms.')
    if (!edit && !f.safe) return void toast.error('Please confirm the food-safety statement.')
    const from = f.from ? new Date(f.from) : new Date(), deadline = new Date(f.deadline)
    if (!(deadline > from) || deadline <= new Date()) return void toast.error('The pickup deadline must be in the future and after the available-from time.')
    if (new Date(f.prepared_at) > new Date()) return void toast.error('Preparation time cannot be in the future.')
    setBusy(true)
    try {
      let image_path: string | null = edit?.image_path ?? null
      if (file) {
        if (!/image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Image must be a JPG, PNG or WebP file.')
        if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB.')
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type as 'image/jpeg' | 'image/png' | 'image/webp']
        image_path = `${profile.id}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('food-images').upload(image_path, file); if (up.error) throw up.error
      }
      const fields = {
        title: f.title, description: f.description || null, category: f.category, diet: f.diet,
        quantity_portions: f.portions ? Number(f.portions) : null, quantity_kg: f.kg ? Number(f.kg) : null,
        prepared_at: new Date(f.prepared_at).toISOString(), handling_info: f.handling, allergens: f.allergens || null, image_path,
        area: f.area, city: f.city, approx_lat: f.lat ? Math.round(Number(f.lat) * 100) / 100 : null, approx_lng: f.lng ? Math.round(Number(f.lng) * 100) / 100 : null,
        available_from: from.toISOString(), pickup_deadline: deadline.toISOString()
      }
      let id: string
      if (edit) {
        // protected fields (status, donor, organization) are never sent; the DB guard trigger rejects them anyway
        const { data, error } = await supabase.from('donations').update(fields).eq('id', edit.id).select('id').single()
        if (error) throw error
        id = data.id
      } else {
        const { data, error } = await supabase.from('donations').insert({
          ...fields, donor_id: profile.id, organization_id: org.id, safety_confirmed: true }).select('id').single()
        if (error) throw error
        id = data.id
      }
      const priv = await supabase.from('donation_private').upsert(
        { donation_id: id, pickup_address: f.address, exact_lat: f.lat ? Number(f.lat) : null, exact_lng: f.lng ? Number(f.lng) : null, instructions: f.instructions || null },
        { onConflict: 'donation_id' })
      if (priv.error) throw priv.error
      toast.success(edit ? 'Listing updated' : 'Listing posted'); onDone()
    } catch (err) { toast.error(errMsg(err)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="card grid gap-4 p-5 sm:grid-cols-2">
      <h2 className="text-xl font-semibold sm:col-span-2">{edit ? `Edit “${edit.title}”` : t('dash.post')}</h2>
      <div className="sm:col-span-2"><label className="label" htmlFor="ti">Food name</label><input id="ti" required className="input" value={f.title} onChange={set('title')} /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="de">Description</label><textarea id="de" rows={2} className="input" value={f.description} onChange={set('description')} /></div>
      <div><label className="label" htmlFor="ca">Category</label><select id="ca" className="input" value={f.category} onChange={set('category')}>{CATEGORIES.map(c => <option key={c} value={c}>{t('cat.' + c)}</option>)}</select></div>
      <div><label className="label" htmlFor="di">Diet</label><select id="di" className="input" value={f.diet} onChange={set('diet')}>{(['veg', 'non_veg', 'mixed', 'not_applicable'] as const).map(d => <option key={d} value={d}>{t('diet.' + d)}</option>)}</select></div>
      <div><label className="label" htmlFor="po">Meal portions</label><input id="po" type="number" min={1} className="input" value={f.portions} onChange={set('portions')} /></div>
      <div><label className="label" htmlFor="kg">Weight (kg)</label><input id="kg" type="number" min={0.1} step={0.1} className="input" value={f.kg} onChange={set('kg')} /></div>
      <div><label className="label" htmlFor="pr">Prepared at</label><input id="pr" type="datetime-local" required className="input" value={f.prepared_at} onChange={set('prepared_at')} /></div>
      <div><label className="label" htmlFor="im">Food photo</label><input id="im" type="file" accept="image/jpeg,image/png,image/webp" className="input" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        {edit?.image_path && !file && <p className="mt-1 text-xs text-ink-500">A photo is already attached. Choose a new one to replace it.</p>}</div>
      <div className="sm:col-span-2"><label className="label" htmlFor="ha">Storage and handling (e.g. kept hot above 60°C, refrigerated)</label><input id="ha" required className="input" value={f.handling} onChange={set('handling')} /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="al">Known allergens (e.g. nuts, dairy, gluten)</label><input id="al" className="input" value={f.allergens} onChange={set('allergens')} /></div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-forest-50 p-3 sm:col-span-2">
        <LocationButton onFound={(fix, place) => {
          setAcc(fix.accuracy)
          setF(prev => ({ ...prev, lat: fix.lat.toFixed(5), lng: fix.lng.toFixed(5),
            area: place?.area || prev.area, city: place?.city || prev.city, address: place?.address || prev.address }))
        }} />
        <p className="text-xs text-ink-700">{f.lat ? `Location saved (about ${Math.round(acc ?? 0)} m accuracy). Review the fields below.` : 'Tap to fill your area, city, address and map position automatically. The public listing shows only an approximate area.'}</p>
      </div>
      <div><label className="label" htmlFor="ar">Area (shown publicly)</label><input id="ar" required className="input" value={f.area} onChange={set('area')} /></div>
      <div><label className="label" htmlFor="ci">City</label><input id="ci" required className="input" value={f.city} onChange={set('city')} /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="ad">Full pickup address (shared only with the NGO that claims it)</label><input id="ad" required className="input" value={f.address} onChange={set('address')} /></div>
      <div><label className="label" htmlFor="fr">Available from (blank = now)</label><input id="fr" type="datetime-local" className="input" value={f.from} onChange={set('from')} /></div>
      <div><label className="label" htmlFor="dl">Pickup deadline</label><input id="dl" type="datetime-local" required className="input" value={f.deadline} onChange={set('deadline')} /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="in">Special pickup instructions</label><input id="in" className="input" value={f.instructions} onChange={set('instructions')} /></div>
      {!edit && (
        <>
          <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={f.safe} onChange={e => setF({ ...f, safe: e.target.checked })} />{t('form.safety')}</label>
          <p className="text-xs text-ink-500 sm:col-span-2">{t('safety.note')}</p>
        </>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? t('common.loading') : edit ? 'Save changes' : 'Post listing'}</button>
        {edit && <button type="button" className="btn-ghost" onClick={onDone}>{t('common.cancel')}</button>}
      </div>
    </form>
  )
}

export default function DonorDashboard() {
  const { t } = useI18n(); const { org } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [qr, setQr] = useState<{ pickup: string; token: string } | null>(null)

  const load = () => supabase.from('donations').select('*, pickups(id,status,meals_distributed, organizations:ngo_org_id(name)), donation_private(pickup_address, instructions, exact_lat, exact_lng)')
    .order('created_at', { ascending: false }).then(({ data }) => setRows((data as unknown as Row[]) ?? []))
  useEffect(() => { void load() }, [])

  const done = (rows ?? []).filter(r => ['picked_up', 'delivered'].includes(r.status))
  const kg = done.reduce((s, r) => s + Number(r.quantity_kg ?? 0), 0)
  const meals = done.flatMap(r => r.pickups).reduce((s, p) => s + (p.status === 'delivered' ? p.meals_distributed ?? 0 : 0), 0)

  async function cancel() {
    const { error } = await supabase.rpc('cancel_donation', { p_donation_id: cancelId }); setCancelId(null)
    if (error) toast.error(errMsg(error)); else toast.success('Listing cancelled'); void load()
  }
  async function makeCode(pickupId: string) {
    const { data, error } = await supabase.rpc('create_pickup_token', { p_pickup_id: pickupId })
    if (error) return void toast.error(errMsg(error))
    setQr({ pickup: pickupId, token: data as string })
  }
  const canPost = org?.verification_status === 'verified'

  return (
    <OrgGate>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader eyebrow="Donor" title={t('dash.donor')} subtitle={org?.name}
          actions={<button className="btn-primary" disabled={!canPost} title={canPost ? '' : 'Available after verification'} onClick={() => { setEditing(null); setShowForm(!showForm) }}><Plus size={16} aria-hidden />{t('dash.post')}</button>} />
        <VerificationBanner />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat icon={<PackageCheck size={20} />} label="Collections completed" value={done.length} />
          <Stat icon={<Scale size={20} />} label="Food collected (kg)" value={kg.toFixed(1)} />
          <Stat icon={<Utensils size={20} />} label="Meals reported distributed" value={meals} />
        </div>
        {(showForm || editing) && (
          <div className="mt-6">
            <DonationForm edit={editing ?? undefined} onDone={() => { setShowForm(false); setEditing(null); void load() }} />
          </div>
        )}
        <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section aria-labelledby="mine">
            <h2 id="mine" className="mb-3 text-xl font-semibold">Your listings</h2>
            {rows === null ? <Spinner /> : rows.length === 0 ? <Empty title="No listings yet" body="Post your first surplus food listing once your organization is verified." /> : (
              <ul className="space-y-3">
                {rows.map(r => {
                  const live = r.pickups.find(p => p.status !== 'cancelled'); const tl = timeLeft(r.pickup_deadline)
                  return (
                    <li key={r.id} className="card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{r.title}</p><StatusBadge status={r.status} /></div>
                      <p className="text-sm text-ink-500">{r.quantity_portions ?? '—'} portions · deadline {fmtDateTime(r.pickup_deadline)} {r.status === 'available' && <span className={tl.urgent ? 'font-semibold text-urgent-600' : ''}>({tl.label})</span>}</p>
                      {live?.organizations && <p className="mt-1 text-sm">Claimed by <strong>{live.organizations.name}</strong></p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {live && r.status === 'reserved' && <button className="btn-outline" onClick={() => makeCode(live.id)}>Show pickup code</button>}
                        {r.status === 'available' && (
                          <button className="btn-ghost" onClick={() => { setEditing(r); setShowForm(false) }}><Pencil size={14} aria-hidden />Edit listing</button>
                        )}
                        {['available', 'reserved'].includes(r.status) && <button className="btn-ghost" onClick={() => setCancelId(r.id)}>Cancel listing</button>}
                      </div>
                      {r.status !== 'available' && r.status !== 'reserved' && (
                        <p className="mt-2 text-xs text-ink-500">Reserved and completed listings cannot be edited, to keep the audit trail intact.</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          <Notifications />
        </div>
        <ConfirmDialog open={!!cancelId} danger title="Cancel this listing?" body="Any NGO that claimed it will be notified." confirmLabel="Cancel listing" onConfirm={cancel} onCancel={() => setCancelId(null)} />
        <ConfirmDialog open={!!qr} title="Pickup code" confirmLabel="Done" onConfirm={() => setQr(null)} onCancel={() => setQr(null)}
          body="Valid for 15 minutes, one use. The assigned collector must enter or scan it while logged in. A code alone does not prove who they are.">
          {qr && <div className="mt-4 flex flex-col items-center gap-2"><QRCodeSVG value={qr.token} size={160} /><code className="break-all text-xs">{qr.token}</code></div>}
        </ConfirmDialog>
      </div>
    </OrgGate>
  )
}
