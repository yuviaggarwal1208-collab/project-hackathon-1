import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

/** Sun/moon button. Remembers the choice in the browser. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button type="button" className="btn-ghost !px-3" onClick={toggle} aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  )
}
