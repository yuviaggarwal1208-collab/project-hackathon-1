import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Logo } from './Logo'

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[1fr_1.05fr]">
      <aside className="hero-bg relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="dots absolute -left-8 bottom-8 h-56 w-56 opacity-60" aria-hidden />
        <Link to="/" aria-label="RescuePlate home"><Logo /></Link>
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight">Good food deserves a second chance.</h2>
          <ul className="mt-6 space-y-3 text-ink-700">
            {['Donors list surplus food in a minute', 'Verified NGOs and volunteers collect it in time', 'Every pickup is confirmed with a one-time code'].map(x => (
              <li key={x} className="flex items-start gap-3"><span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-forest-700 text-white"><Check size={12} aria-hidden /></span>{x}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-ink-500">Save Food. Feed People. Make Every Meal Count.</p>
      </aside>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="card w-full max-w-md animate-rise p-7 sm:p-9">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mb-6 mt-1.5 text-sm text-ink-500">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}
