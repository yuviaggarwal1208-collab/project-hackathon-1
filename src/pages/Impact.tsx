import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../lib/supabase'
import { PageHeader } from '../components/PageHeader'
import { Spinner } from '../components/Spinner'
import { useTheme } from '../contexts/ThemeContext'
import type { ImpactStats } from '../lib/types'

type Bucket = 'day' | 'week' | 'month'
export default function Impact() {
  const dark = useTheme().theme === 'dark'
  const [stats, setStats] = useState<ImpactStats | null>(null)
  const [bucket, setBucket] = useState<Bucket>('week')
  const [trend, setTrend] = useState<{ period: string; portions: number; kg: number }[] | null>(null)
  const [demo, setDemo] = useState(false)

  useEffect(() => { supabase.rpc('get_impact_stats', { p_include_demo: demo }).then(({ data }) => setStats(data as ImpactStats)) }, [demo])
  useEffect(() => {
    setTrend(null)
    supabase.rpc('get_impact_trend', { p_bucket: bucket, p_include_demo: demo }).then(({ data }) => setTrend((data as never) ?? []))
  }, [bucket, demo])

  const items = stats ? [
    ['Food collected', `${Number(stats.kg_collected).toLocaleString()} kg`], ['Meal portions collected', Number(stats.portions_collected).toLocaleString()],
    ['Successful pickups', stats.successful_pickups], ['Active donor organizations', stats.active_donors],
    ['Verified NGO partners', stats.verified_ngos], ['Meals reported distributed', Number(stats.meals_distributed).toLocaleString()]
  ] : []
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageHeader eyebrow="Transparency" title="Impact"
        subtitle="“Collected” counts food handed to a collector. “Distributed” counts only meals an NGO or volunteer reported after delivery. Each donation is counted once." />
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} /> Include demonstration data</label>
      {demo && <p className="mt-2 inline-block rounded-full bg-urgent-100 px-3 py-1 text-xs font-semibold text-urgent-600">Demonstration data is included. These numbers are not real-world impact.</p>}
      {!stats ? <Spinner /> : (
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([k, v]) => <div key={String(k)} className="card p-5"><dd className="font-display text-3xl font-bold text-forest-800">{v}</dd><dt className="text-sm text-ink-500">{k}</dt></div>)}
        </dl>
      )}
      <div className="card mt-8 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Meal portions collected</h2>
          <div role="group" aria-label="Trend period" className="flex gap-1">
            {(['day', 'week', 'month'] as Bucket[]).map(b => <button key={b} onClick={() => setBucket(b)} aria-pressed={bucket === b} className={bucket === b ? 'btn-primary !py-1.5' : 'btn-ghost !py-1.5'}>{b}</button>)}
          </div>
        </div>
        <div className="mt-4 h-72" role="img" aria-label="Bar chart of meal portions collected over time">
          {trend === null ? <Spinner /> : trend.length === 0 ? <p className="p-10 text-center text-ink-500">No completed pickups to chart yet.</p> : (
            <ResponsiveContainer>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? '#2c4636' : '#e5e7eb'} />
                <XAxis dataKey="period" tick={{ fill: dark ? '#93a59a' : '#5b6460', fontSize: 12 }} stroke={dark ? '#2c4636' : '#c9cfcc'} />
                <YAxis allowDecimals={false} tick={{ fill: dark ? '#93a59a' : '#5b6460', fontSize: 12 }} stroke={dark ? '#2c4636' : '#c9cfcc'} />
                <Tooltip cursor={{ fill: dark ? 'rgba(255,255,255,.05)' : 'rgba(29,86,51,.06)' }}
                  contentStyle={{ background: dark ? '#16231b' : '#fff', border: `1px solid ${dark ? '#2c4636' : '#dcece1'}`, borderRadius: 12, color: dark ? '#e6eee8' : '#1f2522' }} />
                <Bar dataKey="portions" fill={dark ? '#55a073' : '#1d5633'} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
