export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="RescuePlate logo">
      <rect width="40" height="40" rx="11" fill="#1d5633" />
      <circle cx="20" cy="22" r="11" fill="#fffdf8" />
      <circle cx="20" cy="22" r="6.5" fill="none" stroke="#1d5633" strokeWidth="1.6" />
      <path d="M20 11c0-4 2.6-6.5 6.5-6.5 0 4-2.6 6.5-6.5 6.5z" fill="#f27a1a" />
    </svg>
  )
}
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-xl font-bold text-forest-900">RescuePlate</span>
    </span>
  )
}
