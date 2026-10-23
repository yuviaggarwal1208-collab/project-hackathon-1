import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '../contexts/I18nContext'
import { DonationCard } from './DonationCard'
import type { Donation } from '../lib/types'

const makeDonation = (over: Partial<Donation> = {}): Donation => ({
  id: 'd1', title: 'Veg biryani', description: 'Freshly cooked', category: 'cooked_meal', diet: 'veg',
  quantity_portions: 40, quantity_kg: 14,
  prepared_at: '2026-10-21T10:00:00Z', handling_info: 'Kept hot above 60 C', allergens: 'None known',
  image_path: null, area: 'Vaishali', city: 'Ghaziabad',
  approx_lat: 28.64, approx_lng: 77.34,
  available_from: '2026-10-21T11:00:00Z', pickup_deadline: new Date(Date.now() + 3 * 36e5).toISOString(),
  status: 'available', is_demo: false, organizations: { name: 'Sunrise Kitchen' },
  ...over,
})

const renderCard = (d: Donation, action?: React.ReactNode) =>
  render(<I18nProvider><DonationCard d={d} action={action} /></I18nProvider>)

describe('DonationCard', () => {
  it('shows public information only: title, area, quantity, handling', () => {
    renderCard(makeDonation())
    expect(screen.getByText('Veg biryani')).toBeInTheDocument()
    expect(screen.getByText(/Vaishali, Ghaziabad/)).toBeInTheDocument()
    expect(screen.getByText(/40 portions/)).toBeInTheDocument()
    expect(screen.getByText(/Kept hot above 60 C/)).toBeInTheDocument()
    expect(screen.getByText(/Sunrise Kitchen/)).toBeInTheDocument()
  })

  it('never renders an exact street address or private instructions', () => {
    // The public Donation type has no address/instructions fields at all; a value that
    // only exists in donation_private must not appear in public cards.
    const d = makeDonation()
    const { container } = render(<I18nProvider><DonationCard d={d} /></I18nProvider>)
    expect(container.textContent).not.toMatch(/Block 12, Shop 3/)
    expect(container.textContent).not.toMatch(/pickup_address|instructions/i)
  })

  it('labels demo listings visibly', () => {
    renderCard(makeDonation({ is_demo: true }))
    expect(screen.getByText('Demonstration data')).toBeInTheDocument()
  })

  it('surfaces allergens prominently', () => {
    renderCard(makeDonation({ allergens: 'Nuts, dairy' }))
    expect(screen.getByText(/Allergens: Nuts, dairy/)).toBeInTheDocument()
  })

  it('renders a custom action area (e.g. claim button)', () => {
    renderCard(makeDonation(), <button>Claim donation</button>)
    expect(screen.getByRole('button', { name: /claim donation/i })).toBeInTheDocument()
  })
})
