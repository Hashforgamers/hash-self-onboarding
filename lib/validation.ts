import type { DayKey, DocumentKey, OnboardingDraft, SelfOnboardPayload } from "@/lib/types"

export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
export const CONSOLE_TYPES = ["pc", "xbox", "ps5", "vr"] as const
export const DOCUMENT_KEYS: DocumentKey[] = [
  "business_registration",
  "owner_identification_proof",
  "tax_identification_number",
  "bank_acc_details"
]
export const DEFAULT_AMENITIES = [
  "24/7",
  "Parking",
  "seating_area",
  "sound_system",
  "washroom",
  "air_conditioner",
  "food"
]

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validPhone(phone: string) {
  return /^[0-9]{10,15}$/.test(phone.replace(/\D/g, ""))
}

function parseHourMinute(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function toPayload(draft: OnboardingDraft): SelfOnboardPayload {
  const inventorySummary = Object.fromEntries(
    CONSOLE_TYPES.map((type) => [
      type,
      {
        count: Math.max(0, Number(draft.inventory[type].count || 0)),
        rate_per_slot: Math.max(0, Number(draft.inventory[type].ratePerSlot || 0))
      }
    ])
  ) as SelfOnboardPayload["inventory_summary"]

  return {
    owner_name: draft.ownerName.trim(),
    owner_email: draft.ownerEmail.trim().toLowerCase(),
    owner_phone: draft.ownerPhone.trim(),
    email_verification_token: draft.emailVerificationToken,
    cafe_name: draft.cafeName.trim(),
    google_place_id: draft.googlePlaceId || undefined,
    address_line_1: draft.addressLine1.trim(),
    city: draft.city.trim(),
    state: draft.state.trim(),
    pincode: draft.pincode.trim(),
    country: draft.country.trim() || "India",
    latitude: draft.latitude ? Number(draft.latitude) : undefined,
    longitude: draft.longitude ? Number(draft.longitude) : undefined,
    website: draft.website.trim() || undefined,
    business_registration_number: draft.businessRegistrationNumber.trim(),
    tax_id: draft.taxId.trim() || undefined,
    inventory_summary: inventorySummary,
    schedule: draft.schedule,
    amenities: draft.amenities,
    notes: draft.notes.trim() || undefined
  }
}

export function validateStep(
  draft: OnboardingDraft,
  step: number,
  documents: Partial<Record<DocumentKey, File | null>>
): string | null {
  if (step === 0) {
    if (!draft.ownerName.trim()) return "Owner name is required."
    if (!validEmail(draft.ownerEmail.trim())) return "Valid owner email is required."
    if (!validPhone(draft.ownerPhone.trim())) return "Valid owner phone is required."
    if (!draft.emailVerified) return "Please verify owner email with OTP before continuing."
  }

  if (step === 1) {
    if (!draft.cafeName.trim()) return "Cafe name is required."
    if (!draft.addressLine1.trim()) return "Address is required."
    if (!draft.city.trim() || !draft.state.trim()) return "City and state are required."
    if (!/^[0-9]{6}$/.test(draft.pincode.trim())) return "Pincode must be 6 digits."
    if (!draft.latitude.trim() || !draft.longitude.trim()) {
      return "Latitude and longitude are required. Use Google search or enter manually."
    }
  }

  if (step === 2) {
    const totalConsoles = CONSOLE_TYPES.reduce((sum, type) => sum + Number(draft.inventory[type].count || 0), 0)
    if (totalConsoles <= 0) return "At least one console quantity is required."

    const hasOpenDay = DAY_KEYS.some((day) => draft.schedule[day].isOpen)
    if (!hasOpenDay) return "At least one operating day must be open."

    for (const day of DAY_KEYS) {
      const config = draft.schedule[day]
      if (!config.isOpen) continue
      if (config.slotDuration <= 0) return "Slot duration must be greater than zero."
      if (config.is24Hours) continue

      const openMins = parseHourMinute(config.open)
      const closeMins = parseHourMinute(config.close)
      if (openMins === null || closeMins === null) {
        return "Enter valid opening and closing time in HH:MM format."
      }
      if (openMins === closeMins) {
        return "Open and close time cannot be same unless 24 hours is enabled."
      }
    }
  }

  if (step === 3) {
    if (!draft.businessRegistrationNumber.trim()) {
      return "Business registration number is required."
    }

    const missingDocs = DOCUMENT_KEYS.filter((key) => !documents[key])
    if (missingDocs.length > 0) {
      return "Please upload all required documents."
    }

    const enabledAmenityCount = Object.values(draft.amenities).filter(Boolean).length
    if (enabledAmenityCount === 0) {
      return "Select at least one amenity offered by the cafe."
    }
  }

  return null
}
