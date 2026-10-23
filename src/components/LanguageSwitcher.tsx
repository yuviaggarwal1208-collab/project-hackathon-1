import { Languages } from 'lucide-react'
import { useI18n } from '../contexts/I18nContext'

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n()
  return (
    <button className="btn-ghost !px-3" aria-label={lang === 'en' ? 'हिन्दी में बदलें' : 'Switch to English'}
      onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>
      <Languages size={16} aria-hidden /> {lang === 'en' ? 'हिन्दी' : 'English'}
    </button>
  )
}
