import { useEffect, useState } from 'react'
import { supabase, isConfigured } from '../lib/supabase'
import { SetupScreen } from './SetupScreen'
import { Spinner } from './Spinner'

/** Shows the setup screen when keys are missing or the database tables are not installed, instead of cryptic errors later. */
export function ConnectionGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | 'nodb' | 'offline'>(isConfigured ? 'checking' : 'ok')
  useEffect(() => {
    if (!isConfigured) return
    supabase.from('profiles').select('id').limit(1).then(({ error }) => {
      if (!error) return setState('ok')
      if (error.code === 'PGRST205' || error.code === '42P01') return setState('nodb')
      if (/failed to fetch|network/i.test(error.message)) return setState('offline')
      setState('ok')
    })
  }, [])
  if (window.location.pathname === '/setup') return <SetupScreen />
  if (!isConfigured) return <SetupScreen />
  if (state === 'checking') return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>
  if (state === 'nodb') return <SetupScreen initialMessage="Connected, but the database tables are not installed yet. Follow the steps below, then reconnect." />
  if (state === 'offline') return <SetupScreen initialMessage="Cannot reach your Supabase project. Check your internet, make sure the project is not paused, or re-enter the URL and key." />
  return <>{children}</>
}
