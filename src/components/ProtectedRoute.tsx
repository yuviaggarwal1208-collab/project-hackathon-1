import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../lib/types'

// UI convenience only. The real enforcement is Row Level Security and the SQL functions.
export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { session, profile, loading, signOut } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-forest-600" aria-label="Loading" /></div>
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!profile) return (
    <div className="mx-auto max-w-md p-12 text-center">
      <p className="font-semibold">We could not load your profile.</p>
      <p className="mt-1 text-sm text-ink-500">This usually means the database schema was not installed before you signed up. Run supabase/schema.sql, then sign up again with a new email.</p>
      <button className="btn-outline mt-4" onClick={signOut}>Log out</button>
    </div>
  )
  if (profile.suspended) return <p className="p-10 text-center">This account is suspended. Please contact support.</p>
  if (roles && !roles.includes(profile.role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
