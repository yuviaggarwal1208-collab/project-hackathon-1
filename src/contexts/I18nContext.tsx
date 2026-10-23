import { createContext, useContext, useState, type ReactNode } from 'react'
import { dictionaries, type Lang } from '../lib/i18n'
import { supabase } from '../lib/supabase'

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string }
const I18n = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: k => k })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('rp_lang') as Lang) || 'en')
  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem('rp_lang', l)
    document.documentElement.lang = l
    // Persist for signed-in users (RLS limits this to their own profile row)
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) supabase.from('profiles').update({ language: l }).eq('id', data.user.id).then(() => {})
    })
  }
  const t = (k: string) => dictionaries[lang][k] ?? dictionaries.en[k] ?? k
  return <I18n.Provider value={{ lang, setLang, t }}>{children}</I18n.Provider>
}
export const useI18n = () => useContext(I18n)
