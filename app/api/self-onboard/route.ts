import { NextRequest, NextResponse } from "next/server"
import type { DayKey, DocumentKey, SelfOnboardPayload } from "@/lib/types"
import { getOnboardBackendBaseUrl } from "@/lib/backend"

const DOCUMENT_KEYS: DocumentKey[] = [
  "business_registration",
  "owner_identification_proof",
  "tax_identification_number",
  "bank_acc_details"
]

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
const ALLOWED_DOC_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"]
const MAX_DOC_SIZE_BYTES = 8 * 1024 * 1024

function to12Hour(time24: string) {
  const [hRaw, mRaw] = String(time24 || "00:00").split(":")
  const hour = Number(hRaw)
  const minute = Number(mRaw)
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return "12:00 AM"
  }

  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`
}

function parsePayload(raw: FormDataEntryValue | null) {
  if (!raw || typeof raw !== "string") {
    return { payload: null, error: "Missing payload" }
  }

  try {
    return { payload: JSON.parse(raw) as SelfOnboardPayload, error: null }
  } catch {
    return { payload: null, error: "Invalid payload JSON" }
  }
}

function parseHourMinute(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""))
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function validatePayload(payload: SelfOnboardPayload) {
  const ownerName = (payload.owner_name || "").trim()
  if (ownerName.length < 2) return "Owner name is required."
  if (!/^[A-Za-z][A-Za-z\s.'-]{1,79}$/.test(ownerName)) return "Owner name format is invalid."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((payload.owner_email || "").trim())) return "Valid email is required."
  if (!/^[6-9][0-9]{9}$/.test((payload.owner_phone || "").trim())) return "Phone number must be 10 digits."
  if (!(payload.email_verification_token || "").trim()) return "Email verification token is required."
  if ((payload.cafe_name || "").trim().length < 3) return "Cafe name is required."
  if ((payload.cafe_name || "").trim().length > 120) return "Cafe name is too long."
  if (!(payload.address_line_1 || "").trim()) return "Address is required."
  if ((payload.address_line_1 || "").trim().length < 5) return "Address should be at least 5 characters."
  if (!(payload.city || "").trim() || !(payload.state || "").trim()) return "City and state are required."
  if ((payload.city || "").trim().length < 2 || (payload.state || "").trim().length < 2) {
    return "City/state must be at least 2 characters."
  }
  if (!/^[0-9]{6}$/.test((payload.pincode || "").trim())) return "Pincode must be 6 digits."

  const lat = Number(payload.latitude)
  const lng = Number(payload.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Latitude and longitude are required."
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "Latitude/longitude is invalid."

  const totalCount = Object.values(payload.inventory_summary || {}).reduce((sum, details) => {
    return sum + Number(details.count || 0)
  }, 0)
  if (totalCount <= 0) return "At least one console count is required."

  const hasOpenDay = DAY_KEYS.some((day) => payload.schedule?.[day]?.isOpen)
  if (!hasOpenDay) return "At least one operating day must be open."

  for (const day of DAY_KEYS) {
    const schedule = payload.schedule?.[day]
    if (!schedule?.isOpen) continue
    if (![15, 30, 45, 60, 90, 120].includes(Number(schedule.slotDuration))) {
      return "Slot duration is invalid."
    }
    if (schedule.is24Hours) continue
    const start = parseHourMinute(schedule.open)
    const end = parseHourMinute(schedule.close)
    if (start === null || end === null) return "Invalid operating time format."
    if (start === end) return "Open and close time cannot be same unless 24h is enabled."
  }

  if (!(payload.business_registration_type || "").trim()) {
    return "Business registration document type is required."
  }
  if ((payload.business_registration_number || "").trim().length < 3) {
    return "Business registration number is required."
  }
  if (!(payload.owner_proof_type || "").trim()) return "Owner proof type is required."
  if ((payload.owner_proof_number || "").trim().length < 4) return "Owner proof number is required."
  if ((payload.notes || "").trim().length > 1000) return "Notes can be up to 1000 characters."
  return null
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || ""
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ success: false, message: "Use multipart/form-data" }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ success: false, message: "Invalid form data" }, { status: 400 })
  }

  const { payload, error } = parsePayload(formData.get("payload"))
  if (!payload) {
    return NextResponse.json({ success: false, message: error || "Invalid payload" }, { status: 400 })
  }

  const payloadValidationError = validatePayload(payload)
  if (payloadValidationError) {
    return NextResponse.json({ success: false, message: payloadValidationError }, { status: 400 })
  }

  const uploadedDocs = Object.fromEntries(
    DOCUMENT_KEYS.map((key) => [key, formData.get(key)])
  ) as Record<DocumentKey, FormDataEntryValue | null>

  for (const key of DOCUMENT_KEYS) {
    const file = uploadedDocs[key]
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: `Missing required document: ${key}` },
        { status: 400 }
      )
    }
    const fileName = file.name.toLowerCase()
    if (!ALLOWED_DOC_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
      return NextResponse.json(
        { success: false, message: `Invalid file type for ${key}` },
        { status: 400 }
      )
    }
    if (file.size > MAX_DOC_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, message: `File too large for ${key}. Max 8MB.` },
        { status: 400 }
      )
    }
  }

  const availableGames = Object.entries(payload.inventory_summary)
    .filter(([, details]) => Number(details.count || 0) > 0)
    .map(([name, details]) => ({
      name,
      gaming_type: name.toUpperCase(),
      total_slot: Number(details.count || 0),
      rate_per_slot: Number(details.rate_per_slot || 0)
    }))

  if (availableGames.length === 0) {
    return NextResponse.json({ success: false, message: "At least one console count is required" }, { status: 400 })
  }

  const timing = Object.fromEntries(
    DAY_KEYS.map((day) => {
      const schedule = payload.schedule[day]
      const isClosed = !schedule?.isOpen
      const is24Hours = Boolean(schedule?.is24Hours)
      return [
        day,
        {
          open: isClosed ? "" : is24Hours ? "12:00 AM" : to12Hour(schedule.open),
          close: isClosed ? "" : is24Hours ? "12:00 AM" : to12Hour(schedule.close),
          closed: isClosed,
          is_24_hours: is24Hours,
          slot_duration: Number(schedule?.slotDuration || 30)
        }
      ]
    })
  )

  const complianceSummary = [
    `Business registration type: ${payload.business_registration_type}`,
    `Owner proof: ${payload.owner_proof_type} (${payload.owner_proof_number})`
  ].join("\n")

  const backendPayload = {
    onboarding_source: "self_onboard",
    self_onboard_email_verification_token: payload.email_verification_token,
    cafe_name: payload.cafe_name,
    owner_name: payload.owner_name,
    description: [payload.notes || "", complianceSummary].filter(Boolean).join("\n\n"),
    vendor_account_email: payload.owner_email,
    contact_info: {
      email: payload.owner_email,
      phone: payload.owner_phone,
      website: payload.website || ""
    },
    physicalAddress: {
      street: payload.address_line_1,
      city: payload.city,
      state: payload.state,
      zipCode: payload.pincode,
      country: payload.country || "India",
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null
    },
    business_registration_details: {
      registration_number: payload.business_registration_number,
      registration_type: payload.business_registration_type,
      business_type: "Gaming Cafe",
      tax_id: payload.tax_id || ""
    },
    owner_proof_details: {
      type: payload.owner_proof_type,
      number: payload.owner_proof_number
    },
    timing,
    opening_day: new Date().toISOString().split("T")[0],
    available_games: availableGames,
    amenities: payload.amenities,
    document_submitted: {
      business_registration: true,
      owner_identification_proof: true,
      tax_identification_number: true,
      bank_acc_details: true
    }
  }

  const upstreamForm = new FormData()
  upstreamForm.append("json", JSON.stringify(backendPayload))
  for (const key of DOCUMENT_KEYS) {
    const file = uploadedDocs[key]
    if (file instanceof File) {
      upstreamForm.append(key, file, file.name)
    }
  }

  try {
    const response = await fetch(`${getOnboardBackendBaseUrl()}/api/onboard`, {
      method: "POST",
      headers: process.env.SELF_ONBOARD_SERVICE_KEY
        ? { "x-service-key": process.env.SELF_ONBOARD_SERVICE_KEY }
        : undefined,
      body: upstreamForm
    })

    const data = (await response.json().catch(() => ({}))) as {
      message?: string
      vendor_id?: number
      documents_uploaded?: number
      error?: string
      code?: string
      dashboard_url?: string
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: data.message || data.error || "Onboarding failed",
          code: data.code,
          dashboard_url: data.dashboard_url
        },
        { status: response.status }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "Onboarding submitted successfully. Check your email for confirmation. Credentials and dashboard link will be shared shortly.",
        vendor_id: data.vendor_id,
        documents_uploaded: data.documents_uploaded
      },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ success: false, message: "Onboarding backend is unreachable" }, { status: 502 })
  }
}
