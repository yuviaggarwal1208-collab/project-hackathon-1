import { Clock, MapPin, Utensils, Leaf, Drumstick, AlertTriangle } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { useI18n } from '../contexts/I18nContext'
import { imageUrl, timeLeft } from '../lib/utils'
import type { Donation } from '../lib/types'

export function DonationCard({ d, distanceKm, action }: { d: Donation; distanceKm?: number | null; action?: React.ReactNode }) {
  const { t } = useI18n()
  const tl = timeLeft(d.pickup_deadline)
  const img = imageUrl(d.image_path)
  return (
    <article className="card card-hover flex flex-col overflow-hidden">
      <div className="relative h-44 bg-gradient-to-br from-forest-100 to-cream-100">
        {img ? <img src={img} alt={d.title} loading="lazy" className="h-full w-full object-cover" />
             : <div className="flex h-full items-center justify-center text-forest-400"><Utensils size={40} aria-hidden /></div>}
        <div className="absolute left-3 top-3"><StatusBadge status={d.status} /></div>
        <span className={`absolute bottom-3 right-3 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow-card ${tl.urgent ? 'bg-urgent-500 text-white' : 'bg-white text-forest-800'}`}>
          <Clock size={12} aria-hidden />{tl.label}
        </span>
        {d.is_demo && <span className="absolute right-3 top-3 rounded-full bg-ink-900/80 px-2 py-0.5 text-xs text-white">{t('demo.label')}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <div>
          <h3 className="text-lg font-semibold leading-snug">{d.title}</h3>
          <p className="text-sm text-ink-500">{d.organizations?.name ?? '—'}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {(d.quantity_portions || d.quantity_kg) && (
            <span className="rounded-full bg-forest-50 px-2.5 py-1 text-forest-800">
              {d.quantity_portions ? `${d.quantity_portions} ${t('card.portions')}` : ''}{d.quantity_portions && d.quantity_kg ? ' · ' : ''}{d.quantity_kg ? `${d.quantity_kg} kg` : ''}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-cream-100 px-2.5 py-1 text-ink-700">
            {d.diet === 'veg' ? <Leaf size={12} className="text-forest-600" aria-hidden /> : <Drumstick size={12} aria-hidden />}{t('diet.' + d.diet)}
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-ink-700"><MapPin size={14} className="shrink-0 text-forest-600" aria-hidden />{d.area}, {d.city}{distanceKm != null ? ` · ${distanceKm.toFixed(1)} km away` : ''}</p>
        <p className="line-clamp-2 text-xs text-ink-500"><strong className="text-ink-700">{t('card.handling')}:</strong> {d.handling_info}</p>
        {d.allergens && <p className="flex items-start gap-1.5 text-xs text-urgent-600"><AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />Allergens: {d.allergens}</p>}
        {action && <div className="mt-auto border-t border-forest-100 pt-3">{action}</div>}
      </div>
    </article>
  )
}
