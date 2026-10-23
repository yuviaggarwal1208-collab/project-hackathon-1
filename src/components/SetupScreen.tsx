import { useState } from 'react'
import { CheckCircle2, Loader2, PlugZap, XCircle } from 'lucide-react'
import { Logo } from './Logo'
import { checkConnection, saveConfig, type Check } from '../lib/supabase'

export function SetupScreen({ initialMessage }: { initialMessage?: string }) {
  const [url, setUrl] = useState(''); const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<Check | null>(null)

  async function connect(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setRes(null)
    const r = await checkConnection(url, key); setRes(r); setBusy(false)
    if (r.ok || r.step === 'database') { saveConfig(url, key); if (r.ok) setTimeout(() => (window.location.href = '/'), 700) }
  }
  return (
    <div className="hero-bg min-h-screen px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Logo />
        <div className="card mt-8 p-7 sm:p-9">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-100 text-forest-700"><PlugZap aria-hidden /></span>
          <h1 className="mt-4 text-3xl font-bold">Connect your database</h1>
          <p className="mt-2 text-sm text-ink-500">{initialMessage ?? 'One-time setup. Paste the two values from your Supabase project (Project Settings → API Keys).'}</p>
          <form onSubmit={connect} className="mt-6 space-y-4">
            <div><label className="label" htmlFor="u">Project URL</label>
              <input id="u" required className="input" placeholder="https://abcdxyz.supabase.co" value={url} onChange={e => setUrl(e.target.value)} />
              <p className="mt-1 text-xs text-ink-500">Anything after <code>.supabase.co</code> is removed for you.</p></div>
            <div><label className="label" htmlFor="k">Publishable (or anon) key</label>
              <input id="k" required className="input" placeholder="sb_publishable_..." value={key} onChange={e => setKey(e.target.value)} autoComplete="off" />
              <p className="mt-1 text-xs text-ink-500">Never paste a <strong>secret</strong> or <strong>service_role</strong> key here.</p></div>
            <button className="btn-primary w-full !py-3" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Test and connect</button>
          </form>
          {res && (
            <p role="status" className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${res.ok ? 'bg-forest-50 text-forest-800' : 'bg-urgent-100 text-ink-900'}`}>
              {res.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden /> : <XCircle size={18} className="mt-0.5 shrink-0 text-urgent-600" aria-hidden />}{res.message}
            </p>
          )}
          {res?.step === 'database' && (
            <div className="mt-3 text-sm text-ink-700">
              <ol className="list-decimal space-y-1 pl-5">
                <li>In Supabase open <strong>SQL Editor → New query</strong>.</li>
                <li>Open <code>supabase/schema.sql</code> in VS Code, press Ctrl+A, Ctrl+C.</li>
                <li>Paste into Supabase and click <strong>Run</strong>.</li>
                <li>Come back here and click <strong>Test and connect</strong> again.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
