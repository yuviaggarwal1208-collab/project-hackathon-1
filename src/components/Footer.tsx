import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import { Logo } from './Logo'
import { useI18n } from '../contexts/I18nContext'

export function Footer() {
  const { t } = useI18n()
  const col = 'flex flex-col gap-2.5 text-sm text-forest-200'
  const a = 'transition hover:text-white'
  return (
    <footer className="bg-forest-900 text-forest-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <div className="[&_span]:!text-white"><Logo /></div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-forest-200">{t('footer.tag')}</p>
        </div>
        <nav aria-label="Platform" className={col}>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-forest-300">Platform</p>
          <Link to="/find" className={a}>{t('nav.find')}</Link>
          <Link to="/register" className={a}>{t('hero.donate')}</Link>
          <Link to="/impact" className={a}>{t('nav.impact')}</Link>
        </nav>
        <nav aria-label="Account" className={col}>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-forest-300">Account</p>
          <Link to="/login" className={a}>{t('nav.login')}</Link>
          <Link to="/register" className={a}>{t('nav.register')}</Link>
          <Link to="/dashboard" className={a}>{t('nav.dashboard')}</Link>
        </nav>
        <div className={col}>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-forest-300">{t('footer.contact')}</p>
          {/* TODO: replace with your real contact details */}
          <p className="flex items-center gap-2"><Mail size={14} aria-hidden /> hello@rescueplate.example</p>
          <p className="flex items-center gap-2"><Phone size={14} aria-hidden /> +91 00000 00000</p>
          <p className="flex items-center gap-2"><MapPin size={14} aria-hidden /> Uttar Pradesh, India</p>
        </div>
      </div>
      <div className="border-t border-forest-800 py-5 text-center text-xs text-forest-300">
        © {new Date().getFullYear()} RescuePlate · A college startup project · RescuePlate does not inspect food. Collectors should check quality before distributing.
      </div>
    </footer>
  )
}
