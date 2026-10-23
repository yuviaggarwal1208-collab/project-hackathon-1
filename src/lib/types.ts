export type Role = 'donor' | 'ngo' | 'volunteer' | 'admin'
export type DonationStatus = 'available' | 'reserved' | 'picked_up' | 'delivered' | 'expired' | 'cancelled'
export type Diet = 'veg' | 'non_veg' | 'mixed' | 'not_applicable'

export interface Profile {
  id: string; full_name: string; role: Role; phone: string | null
  language: 'en' | 'hi'; suspended: boolean; organization_id: string | null
}
export interface Organization {
  id: string; name: string; org_type: string; city: string | null
  verification_status: 'pending' | 'verified' | 'rejected'; is_demo: boolean
}
export interface Donation {
  id: string; title: string; description: string | null; category: string; diet: Diet
  quantity_portions: number | null; quantity_kg: number | null
  prepared_at: string; handling_info: string; allergens: string | null
  image_path: string | null; area: string; city: string
  approx_lat: number | null; approx_lng: number | null
  available_from: string; pickup_deadline: string; status: DonationStatus
  is_demo: boolean; organizations?: { name: string } | null
}
export interface Pickup {
  id: string; donation_id: string; status: 'reserved' | 'picked_up' | 'delivered' | 'cancelled'
  needs_volunteer: boolean; volunteer_id: string | null; claimed_at: string
  picked_up_at: string | null; delivered_at: string | null; meals_distributed: number | null
  donations?: Donation | null
}
export interface ImpactStats {
  kg_collected: number; portions_collected: number; successful_pickups: number
  meals_distributed: number; active_donors: number; verified_ngos: number; includes_demo: boolean
}
export const CATEGORIES = ['cooked_meal', 'bakery', 'fruits_veg', 'packaged', 'dairy', 'other'] as const
export const REPORT_CATEGORIES = ['unsafe_food', 'misleading_listing', 'pickup_issue', 'other'] as const
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]
export const REPORT_LABELS: Record<ReportCategory, string> = {
  unsafe_food: 'Unsafe food', misleading_listing: 'Misleading listing',
  pickup_issue: 'Pickup problem', other: 'Other concern'
}
export interface Report {
  id: string; donation_id: string; reporter_id: string; category: ReportCategory
  reason: string; status: 'open' | 'investigating' | 'resolved' | 'dismissed'
  admin_notes: string | null; created_at: string
}
