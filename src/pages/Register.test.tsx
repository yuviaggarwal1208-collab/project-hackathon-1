import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../contexts/I18nContext'
import Register from './Register'

const signUp = vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null })

vi.mock('../lib/supabase', () => ({
  isConfigured: true,
  supabase: { auth: { signUp: (...a: unknown[]) => signUp(...a) } },
}))

const renderPage = () => render(
  <MemoryRouter><I18nProvider><Register /></I18nProvider></MemoryRouter>
)

beforeEach(() => signUp.mockClear())

describe('Register page', () => {
  it('offers exactly donor, NGO and volunteer as roles — never admin', async () => {
    renderPage()
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map(r => r.value).sort()).toEqual(['donor', 'ngo', 'volunteer'])
    expect(radios.some(r => r.value === 'admin')).toBe(false)
  })

  it('registers a selected NGO role through Supabase auth metadata', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('radio', { name: /ngo/i }))
    await user.type(screen.getByLabelText(/full name/i), 'Test Person')
    await user.type(screen.getByLabelText(/email/i), 'ngo@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/organization name/i), 'Helping Hands')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(signUp).toHaveBeenCalledTimes(1)
    const [payload] = signUp.mock.calls[0] as [{ options: { data: { role: string } } }]
    expect(payload.options.data.role).toBe('ngo')
    // Even if the page were tampered with, the server ignores any 'admin' role in metadata.
    expect(payload.options.data.role).not.toBe('admin')
  })

  it('requires an 8-character password', async () => {
    renderPage()
    const pw = screen.getByLabelText(/^password/i) as HTMLInputElement
    expect(pw.minLength).toBe(8)
  })
})
