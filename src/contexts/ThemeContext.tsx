import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'
interface Ctx { theme: Theme; toggle: () => void }
const ThemeCtx = createContext<Ctx>({ theme: 'light', toggle: () => {} })

/** Saved choice first, otherwise follow the device setting. */
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('rp_theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage blocked: fall through */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b120e' : '#ffffff')
  }, [theme])
  const toggle = () => setTheme(t => {
    const next: Theme = t === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem('rp_theme', next) } catch { /* ignore */ }
    return next
  })
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>
}
export const useTheme = () => useContext(ThemeCtx)
