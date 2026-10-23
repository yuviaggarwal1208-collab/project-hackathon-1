import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Organization, Profile } from '../lib/types'

interface Ctx {
  session: Session | null; profile: Profile | null; org: Organization | null
  loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void>
}
const Auth = createContext<Ctx>({} as Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(s: Session | null) {
    if (!s) { setProfile(null); setOrg(null); setLoading(false); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile(p as Profile | null)
    if (p?.organization_id) {
      const { data: o } = await supabase.from('organizations').select('*').eq('id', p.organization_id).maybeSingle()
      setOrg(o as Organization | null)
    } else setOrg(null)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); void load(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(true)               // hold protected pages until the profile has loaded
      setTimeout(() => void load(s), 0) // never await Supabase calls inside this callback
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const refresh = () => load(session)
  const signOut = async () => { await supabase.auth.signOut() }
  return <Auth.Provider value={{ session, profile, org, loading, refresh, signOut }}>{children}</Auth.Provider>
}
export const useAuth = () => useContext(Auth)
