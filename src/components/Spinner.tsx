import { Loader2, Inbox } from 'lucide-react'
export const Spinner = () => <div className="flex justify-center p-10"><Loader2 className="animate-spin text-forest-600" aria-label="Loading" /></div>
export const CardSkeletons = ({ n = 3 }: { n?: number }) => (
  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
    {Array.from({ length: n }).map((_, i) => (
      <div key={i} className="card overflow-hidden"><div className="skeleton h-40 !rounded-none" /><div className="space-y-3 p-4"><div className="skeleton h-5 w-2/3" /><div className="skeleton h-4 w-1/2" /><div className="skeleton h-4 w-3/4" /></div></div>
    ))}
  </div>
)
export const Empty = ({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) => (
  <div className="rounded-xl2 border border-dashed border-forest-200 bg-cream-50 p-10 text-center">
    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-forest-100 text-forest-600"><Inbox size={22} aria-hidden /></span>
    <p className="font-semibold text-forest-900">{title}</p>
    {body && <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{body}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
)
