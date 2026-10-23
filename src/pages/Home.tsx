import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Bike, Building2, ClipboardList, Clock, HandHeart, Lock, MapPin, QrCode, ShieldCheck, Soup, Store, Timer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { DonationCard } from '../components/DonationCard'
import { CardSkeletons, Empty } from '../components/Spinner'
import type { Donation, ImpactStats } from '../lib/types'

export default function Home() {
  const { t } = useI18n()
  const [donations, setDonations] = useState<Donation[] | null>(null)
  const [partners, setPartners] = useState<{ id: string; name: string; is_demo: boolean }[]>([])
  const [stats, setStats] = useState<ImpactStats | null>(null)

  useEffect(() => {
    supabase.from('donations').select('*, organizations(name)').eq('status', 'available')
      .gt('pickup_deadline', new Date().toISOString()).order('pickup_deadline').limit(3)
      .then(({ data }) => setDonations((data as Donation[]) ?? []))
    supabase.from('organizations').select('id,name,is_demo').eq('verification_status', 'verified').limit(8)
      .then(({ data }) => setPartners(data ?? []))
    supabase.rpc('get_impact_stats', { p_include_demo: false }).then(({ data }) => setStats(data as ImpactStats))
  }, [])

  const steps = [
    { icon: ClipboardList, title: t('how.1'), text: 'List quantity, handling, allergens and a pickup deadline in about a minute.' },
    { icon: BadgeCheck, title: t('how.2'), text: 'Only verified NGOs can claim, and only one can reserve each listing.' },
    { icon: QrCode, title: t('how.3'), text: 'A one-time, short-lived code is checked against the assigned collector.' },
    { icon: HandHeart, title: t('how.4'), text: 'Collectors report how many meals were served, and impact updates from real records.' }
  ]
  const trust = [
    { icon: ShieldCheck, text: 'Verified NGOs only' }, { icon: Lock, text: 'Addresses shared after claim' },
    { icon: Timer, text: 'Auto-expiring listings' }, { icon: QrCode, text: 'One-time pickup codes' }
  ]
  const statItems = stats ? [
    [stats.portions_collected, 'Meal portions collected'], [Number(stats.kg_collected), 'Kilograms collected'],
    [stats.successful_pickups, 'Successful pickups'], [stats.meals_distributed, 'Meals reported distributed']
  ] : []

  return (
    <>
      <section className="hero-bg relative overflow-hidden">
        <div className="blob -left-24 top-0 h-72 w-72 bg-forest-300/30 dark:bg-forest-500/20" aria-hidden />
        <div className="blob -right-20 bottom-0 h-80 w-80 bg-urgent-500/20" aria-hidden />
        <div className="dots pointer-events-none absolute -right-10 top-10 h-64 w-64 opacity-60" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-rise">
            <p className="eyebrow rounded-full bg-white px-4 py-1.5 shadow-card !text-forest-700 !tracking-wide !normal-case !text-sm !font-semibold">
              <span className="h-2 w-2 rounded-full bg-urgent-500" aria-hidden /> Save Food. Feed People. Make Every Meal Count.
            </p>
            <h1 className="text-gradient mt-5 pb-1 text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-[3.5rem]">{t('hero.title')}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-700">{t('hero.body')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary !px-7 !py-3.5 text-base">{t('hero.donate')} <ArrowRight size={18} aria-hidden /></Link>
              <Link to="/find" className="btn-outline !px-7 !py-3.5 text-base"><MapPin size={18} aria-hidden />{t('hero.find')}</Link>
            </div>
            <ul className="mt-9 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3 text-sm font-medium text-ink-700">
              {trust.map(x => <li key={x.text} className="flex items-center gap-2"><x.icon size={16} className="text-forest-600" aria-hidden />{x.text}</li>)}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-md animate-rise [animation-delay:.15s]" aria-hidden>
            <div className="card relative p-5 shadow-lift">
              <span className="absolute -top-3 right-5 rounded-full bg-ink-900 px-3 py-0.5 text-xs font-semibold text-white">{t('demo.label')}</span>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-100 text-forest-700"><Soup /></span>
                <div><p className="font-semibold">Veg biryani · 40 portions</p><p className="text-sm text-ink-500">Sample listing · Wedding venue</p></div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-urgent-100 px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-urgent-600"><Clock size={16} /> Pickup by 9:30 PM</span>
                <span className="text-sm font-bold text-urgent-600">1h 45m left</span>
              </div>
              <div className="mt-5 flex items-center gap-1.5 text-[11px] font-bold">
                {['Available', 'Reserved', 'Picked up', 'Delivered'].map((s, i) => (
                  <span key={s} className={`flex-1 rounded-full py-1.5 text-center ${i === 0 ? 'bg-forest-700 text-white' : 'bg-forest-50 text-forest-700'}`}>{s}</span>
                ))}
              </div>
            </div>
            <div className="card absolute -bottom-6 -left-4 flex animate-float items-center gap-2.5 px-4 py-3 shadow-lift">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest-700 text-white"><BadgeCheck size={18} /></span>
              <div><p className="text-sm font-semibold leading-tight">Claimed by verified NGO</p><p className="text-xs text-ink-500">Sample notification</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <p className="eyebrow">Simple by design</p>
        <h2 className="section-title">{t('how.title')}</h2>
        <ol className="relative mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={i} className="card card-hover p-6">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-100 text-forest-700"><s.icon size={22} aria-hidden /></span>
                <span className="font-display text-4xl font-bold text-forest-100">{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-cream-100 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <p className="eyebrow">Built for everyone in the chain</p>
          <h2 className="section-title">Who is RescuePlate for?</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { icon: Store, title: 'Restaurants, hotels & canteens', text: 'Turn leftover food into meals. Post it in a minute and see exactly who collected it.', cta: 'Donate food', to: '/register' },
              { icon: Building2, title: 'NGOs & food banks', text: 'Find nearby surplus food, claim it before the deadline and report how many people you fed.', cta: 'Register your NGO', to: '/register' },
              { icon: Bike, title: 'Volunteers', text: 'Help carry food from the donor to the people who need it, one pickup at a time.', cta: 'Become a volunteer', to: '/register' }
            ].map(r => (
              <div key={r.title} className="card card-hover flex flex-col p-7">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-forest-600 to-forest-800 text-white shadow-card"><r.icon size={26} aria-hidden /></span>
                <h3 className="mt-5 text-xl font-semibold">{r.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">{r.text}</p>
                <Link to={r.to} className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-forest-700 hover:gap-2.5 transition-all">{r.cta} <ArrowRight size={15} aria-hidden /></Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="eyebrow">Live listings</p><h2 className="section-title">{t('section.available')}</h2></div>
            <Link to="/find" className="btn-outline">{t('nav.find')} <ArrowRight size={16} aria-hidden /></Link>
          </div>
          <div className="mt-10">
            {donations === null ? <CardSkeletons /> : donations.length ? (
              <div className="grid gap-5 md:grid-cols-3">{donations.map(d => <DonationCard key={d.id} d={d} />)}</div>
            ) : <Empty title="No food is listed right now" body="When donors post surplus food, it appears here." action={<Link to="/register" className="btn-primary">{t('hero.donate')}</Link>} />}
          </div>
        </div>
      </section>

      <section className="bg-cream-100">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="eyebrow">Trusted network</p>
          <h2 className="section-title">{t('section.partners')}</h2>
          {partners.length ? (
            <ul className="mt-8 flex flex-wrap gap-3">
              {partners.map(p => (
                <li key={p.id} className="card flex items-center gap-2 px-5 py-3 text-sm font-semibold">
                  <BadgeCheck size={16} className="text-forest-600" aria-hidden />{p.name}
                  {p.is_demo && <span className="rounded-full bg-ink-900/80 px-2 py-0.5 text-[11px] font-medium text-white">{t('demo.label')}</span>}
                </li>
              ))}
            </ul>
          ) : <div className="mt-8"><Empty title="No verified partners yet" body="Organizations appear here after an administrator verifies them." /></div>}
        </div>
      </section>

      <section className="relative overflow-hidden bg-forest-900 py-20 text-white">
        <div className="dots absolute inset-0 opacity-10" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4">
          <p className="eyebrow !text-forest-300">Real numbers only</p>
          <h2 className="section-title !text-white">{t('section.impact')}</h2>
          <p className="mt-2 text-sm text-forest-200">Live totals from completed pickups. Demonstration data is excluded.</p>
          {stats && stats.successful_pickups > 0 ? (
            <dl className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {statItems.map(([v, k]) => <div key={String(k)} className="border-l-2 border-urgent-500 pl-5"><dd className="font-display text-5xl font-bold">{Number(v).toLocaleString()}</dd><dt className="mt-1 text-sm text-forest-200">{k}</dt></div>)}
            </dl>
          ) : <p className="mt-8 max-w-xl rounded-xl2 border border-forest-700 bg-forest-800/60 p-6 text-forest-100">No completed pickups yet. Numbers appear here as real donations are collected and delivered.</p>}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <p className="eyebrow">Voices</p>
        <h2 className="section-title">{t('section.testimonials')}</h2>
        <p className="mt-3 inline-block rounded-full bg-urgent-100 px-3 py-1 text-xs font-bold text-urgent-600">{t('demo.testimonials')}</p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[['Sample restaurant owner', 'Posting leftovers takes a minute, and we know where the food goes.'],
            ['Sample NGO coordinator', 'We see pickup deadlines clearly and can plan our volunteers around them.'],
            ['Sample volunteer', 'The pickup code makes handover simple for everyone.']].map(([who, q]) => (
            <figure key={who} className="card card-hover p-6">
              <span className="font-display text-5xl leading-none text-forest-200" aria-hidden>“</span>
              <blockquote className="-mt-3 text-ink-700">{q}</blockquote>
              <figcaption className="mt-4 text-sm font-semibold text-forest-800">{who}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="hero-bg mx-auto max-w-6xl rounded-xl3 px-6 py-14 text-center shadow-card">
          <h2 className="section-title">{t('section.cta')}</h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-700">Whether you have food to share, an organization to feed people, or time to help, there is a place for you.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn-primary !px-7 !py-3.5 text-base">{t('hero.donate')}</Link>
            <Link to="/register" className="btn-outline !px-7 !py-3.5 text-base">Join as NGO or volunteer</Link>
          </div>
        </div>
      </section>
    </>
  )
}
