export type ConsoleType = "pc" | "xbox" | "ps5" | "vr"
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

export type DaySchedule = {
  isOpen: boolean
  is24Hours: boolean
  open: string
  close: string
  slotDuration: number
}

export type DocumentKey =
  | "business_registration"
  | "owner_identification_proof"
  | "tax_identification_number"
  | "bank_acc_details"

export type CafeSearchItem = {
  place_id: string
  name: string
  formatted_address: string
}

export type CafePlaceDetails = {
  place_id: string
  name: string
  formatted_address: string
  latitude: number | null
  longitude: number | null
  city: string
  state: string
  pincode: string
  country: string
  street: string
}

export type OnboardingDraft = {
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  otpCode: string
  emailVerified: boolean
  emailVerificationToken: string
  cafeName: string
  googlePlaceId: string
  addressLine1: string
  city: string
  state: string
  pincode: string
  country: string
  latitude: string
  longitude: string
  website: string
  businessRegistrationType: string
  businessRegistrationNumber: string
  ownerProofType: string
  ownerProofNumber: string
  taxId: string
  inventory: Record<ConsoleType, { count: number; ratePerSlot: number }>
  schedule: Record<DayKey, DaySchedule>
  amenities: Record<string, boolean>
  notes: string
}

export type SelfOnboardPayload = {
  owner_name: string
  owner_email: string
  owner_phone: string
  email_verification_token: string
  cafe_name: string
  google_place_id?: string
  address_line_1: string
  city: string
  state: string
  pincode: string
  country: string
  latitude?: number
  longitude?: number
  website?: string
  business_registration_type: string
  business_registration_number: string
  owner_proof_type: string
  owner_proof_number: string
  tax_id?: string
  inventory_summary: Record<ConsoleType, { count: number; rate_per_slot: number }>
  schedule: Record<DayKey, DaySchedule>
  amenities: Record<string, boolean>
  notes?: string
}

export type SelfOnboardResponse = {
  success: boolean
  message: string
  vendor_id?: number
  documents_uploaded?: number
  code?: string
  dashboard_url?: string
}
