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
const ALLOWED_DOC_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"]
const MAX_DOC_SIZE_BYTES = 8 * 1024 * 1024

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function normalizePhone(phone: string) {
  return (phone || "").replace(/\D/g, "").slice(0, 10)
}

function validPhone(phone: string) {
  const normalized = normalizePhone(phone)
  return /^[6-9][0-9]{9}$/.test(normalized)
}

function validOwnerName(name: string) {
  return /^[A-Za-z][A-Za-z\s.'-]{1,79}$/.test(name)
}

function parseHourMinute(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function validLatLng(lat: string, lng: string) {
  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false
  return latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180
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
    business_registration_type: draft.businessRegistrationType.trim(),
    business_registration_number: draft.businessRegistrationNumber.trim(),
    owner_proof_type: draft.ownerProofType.trim(),
    owner_proof_number: draft.ownerProofNumber.trim(),
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
    if (draft.ownerName.trim().length < 2) return "Owner name must be at least 2 characters."
    if (!validOwnerName(draft.ownerName.trim())) {
      return "Owner name should contain only letters, spaces, dot, apostrophe, or hyphen."
    }
    if (!validEmail(draft.ownerEmail.trim())) return "Valid owner email is required."
    if (!validPhone(draft.ownerPhone.trim())) return "Phone number must be 10 digits (starting from 6-9)."
    if (!draft.emailVerified) return "Please verify owner email with OTP before continuing."
  }

  if (step === 1) {
    if (draft.cafeName.trim().length < 3) return "Cafe name must be at least 3 characters."
    if (!draft.addressLine1.trim()) return "Address is required."
    if (draft.addressLine1.trim().length < 5) return "Address must be at least 5 characters."
    if (!draft.city.trim() || !draft.state.trim()) return "City and state are required."
    if (draft.city.trim().length < 2 || draft.state.trim().length < 2) {
      return "City/state must be at least 2 characters."
    }
    if (!/^[0-9]{6}$/.test(draft.pincode.trim())) return "Pincode must be 6 digits."
    if (!draft.latitude.trim() || !draft.longitude.trim()) {
      return "Latitude and longitude are required. Use map picker or enter manually."
    }
    if (!validLatLng(draft.latitude.trim(), draft.longitude.trim())) {
      return "Latitude/longitude is invalid."
    }
    if (draft.website.trim() && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(draft.website.trim())) {
      return "Website should start with http:// or https://"
    }
  }

  if (step === 2) {
    const totalConsoles = CONSOLE_TYPES.reduce((sum, type) => sum + Number(draft.inventory[type].count || 0), 0)
    if (totalConsoles <= 0) return "At least one console quantity is required."
    if (totalConsoles > 500) return "Total console quantity looks too high. Please verify."

    for (const type of CONSOLE_TYPES) {
      const count = Number(draft.inventory[type].count || 0)
      const rate = Number(draft.inventory[type].ratePerSlot || 0)
      if (!Number.isInteger(count) || count < 0) return "Console quantity must be a whole number."
      if (count > 200) return "Console quantity per type cannot exceed 200."
      if (!Number.isFinite(rate) || rate < 0) return "Rate per slot must be non-negative."
      if (rate > 100000) return "Rate per slot is too high. Please verify."
    }

    const hasOpenDay = DAY_KEYS.some((day) => draft.schedule[day].isOpen)
    if (!hasOpenDay) return "At least one operating day must be open."

    for (const day of DAY_KEYS) {
      const config = draft.schedule[day]
      if (!config.isOpen) continue
      if (![15, 30, 45, 60, 90, 120].includes(Number(config.slotDuration))) {
        return "Slot duration must be one of: 15, 30, 45, 60, 90, 120 minutes."
      }
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
    if (!draft.businessRegistrationType.trim()) {
      return "Please select business registration document type."
    }
    if (draft.businessRegistrationNumber.trim().length < 3) {
      return "Business registration number is required."
    }
    if (!draft.ownerProofType.trim()) {
      return "Please select owner identity proof type."
    }
    if (draft.ownerProofNumber.trim().length < 4) {
      return "Owner proof number must be at least 4 characters."
    }
    if (draft.notes.trim().length > 1000) return "Notes can be up to 1000 characters."

    const missingDocs = DOCUMENT_KEYS.filter((key) => !documents[key])
    if (missingDocs.length > 0) {
      return "Please upload all required documents."
    }
    for (const key of DOCUMENT_KEYS) {
      const file = documents[key]
      if (!file) continue
      const lower = file.name.toLowerCase()
      const extension = ALLOWED_DOC_EXTENSIONS.find((ext) => lower.endsWith(ext))
      if (!extension) return `Invalid file type for ${key}.`
      if (file.size > MAX_DOC_SIZE_BYTES) return `File too large for ${key}. Max 8MB allowed.`
    }

    const enabledAmenityCount = Object.values(draft.amenities).filter(Boolean).length
    if (enabledAmenityCount === 0) {
      return "Select at least one amenity offered by the cafe."
    }
  }

  return null
}
