import clsx from 'clsx'
import { useI18n } from '../contexts/I18nContext'
import type { DonationStatus } from '../lib/types'

const tone: Record<DonationStatus, string> = {
  available: 'bg-forest-100 text-forest-800', reserved: 'bg-urgent-100 text-urgent-600',
  picked_up: 'bg-blue-100 text-blue-800', delivered: 'bg-forest-700 text-white',
  expired: 'bg-ink-500/15 text-ink-700', cancelled: 'bg-red-100 text-red-700'
}
export function StatusBadge({ status }: { status: DonationStatus }) {
  const { t } = useI18n()
  return <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-semibold', tone[status])}>{t('status.' + status)}</span>
}
