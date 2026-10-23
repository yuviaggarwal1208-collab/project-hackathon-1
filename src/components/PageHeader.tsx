export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
