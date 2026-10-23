import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'

export function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { session, profile, signOut } = useAuth()
  const { t } = useI18n()
  const nav = useNavigate(); const loc = useLocation()
  useEffect(() => { setOpen(false) }, [loc.pathname])
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on)
  }, [])
  const links = [{ to: '/', label: t('nav.home') }, { to: '/find', label: t('nav.find') }, { to: '/impact', label: t('nav.impact') }]
  const cls = ({ isActive }: { isActive: boolean }) =>
    `relative rounded-full px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-forest-50 text-forest-800' : 'text-ink-700 hover:bg-forest-50/70 hover:text-forest-800'}`
  const logout = async () => { await signOut(); nav('/') }
  return (
    <header className={`sticky top-0 z-40 bg-white/85 backdrop-blur-md transition-shadow ${scrolled ? 'shadow-card' : 'border-b border-forest-100'}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" aria-label="RescuePlate home"><Logo /></Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map(l => <NavLink key={l.to} to={l.to} end className={cls}>{l.label}</NavLink>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <LanguageSwitcher />
          {session && profile ? (
            <>
              <Link to="/dashboard" className="btn-primary"><LayoutDashboard size={16} aria-hidden />{t('nav.dashboard')}</Link>
              <button className="btn-ghost !px-3" onClick={logout} aria-label={t('nav.logout')}><LogOut size={16} aria-hidden /></button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">{t('nav.login')}</Link>
              <Link to="/register" className="btn-primary">{t('nav.register')}</Link>
            </>
          )}
        </div>
        <button className="rounded-xl p-2 hover:bg-forest-50 md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="animate-rise border-t border-forest-100 bg-white px-4 pb-5 md:hidden">
          <nav className="flex flex-col gap-1 py-3" aria-label="Mobile">
            {links.map(l => <NavLink key={l.to} to={l.to} end className={cls}>{l.label}</NavLink>)}
          </nav>
          <div className="flex flex-wrap gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
            {session ? (
              <><Link to="/dashboard" className="btn-primary">{t('nav.dashboard')}</Link><button className="btn-outline" onClick={logout}>{t('nav.logout')}</button></>
            ) : (
              <><Link to="/login" className="btn-outline">{t('nav.login')}</Link><Link to="/register" className="btn-primary">{t('nav.register')}</Link></>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
