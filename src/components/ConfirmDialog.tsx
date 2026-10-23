import { useEffect, useRef } from 'react'
import { useI18n } from '../contexts/I18nContext'

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, danger, children }: {
  children?: React.ReactNode
  open: boolean; title: string; body?: string; confirmLabel?: string; danger?: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useI18n()
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onCancel} className="w-[min(92vw,26rem)] rounded-xl2 p-6 shadow-card backdrop:bg-ink-900/40">
      <h2 className="text-lg font-semibold">{title}</h2>
      {body && <p className="mt-2 text-sm text-ink-700">{body}</p>}
      {children}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>{t('common.cancel')}</button>
        <button className={danger ? 'btn-urgent' : 'btn-primary'} onClick={onConfirm}>{confirmLabel ?? t('common.confirm')}</button>
      </div>
    </dialog>
  )
}
