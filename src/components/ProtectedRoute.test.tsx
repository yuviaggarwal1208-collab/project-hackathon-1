import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '../contexts/AuthContext'
import type { Profile } from '../lib/types'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
const useAuthMock = vi.mocked(useAuth)

const baseProfile: Profile = {
  id: 'u1', full_name: 'Test User', role: 'donor', phone: null,
  language: 'en', suspended: false, organization_id: null,
}

function renderRoute(auth: Partial<ReturnType<typeof useAuthMock>>) {
  useAuthMock.mockReturnValue({
    session: { user: { id: 'u1' } } as never,
    profile: baseProfile, org: null, loading: false,
    refresh: async () => {}, signOut: async () => {},
    ...auth,
  })
  return render(
    <MemoryRouter initialEntries={['/dashboard/donor']}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/dashboard" element={<div>dashboard home</div>} />
        <Route path="/dashboard/donor" element={
          <ProtectedRoute roles={['donor']}><div>donor page</div></ProtectedRoute>
        } />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedRoute (UX-only guard; RLS is authoritative)', () => {
  it('shows a loading state while the profile loads', () => {
    renderRoute({ loading: true })
    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument()
  })

  it('redirects unauthenticated visitors to /login', () => {
    renderRoute({ session: null, profile: null })
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('redirects users without the required role to their own dashboard', () => {
    renderRoute({ profile: { ...baseProfile, role: 'ngo' } })
    expect(screen.getByText('dashboard home')).toBeInTheDocument()
  })

  it('blocks suspended accounts with a clear message', () => {
    renderRoute({ profile: { ...baseProfile, suspended: true } })
    expect(screen.getByText(/account is suspended/i)).toBeInTheDocument()
  })

  it('renders the protected page for an eligible user', () => {
    renderRoute({})
    expect(screen.getByText('donor page')).toBeInTheDocument()
  })
})
