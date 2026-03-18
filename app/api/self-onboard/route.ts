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

  if (!payload.email_verification_token) {
    return NextResponse.json({ success: false, message: "Email verification token is required" }, { status: 400 })
  }

  const uploadedDocs = Object.fromEntries(
    DOCUMENT_KEYS.map((key) => [key, formData.get(key)])
  ) as Record<DocumentKey, FormDataEntryValue | null>

  for (const key of DOCUMENT_KEYS) {
    if (!(uploadedDocs[key] instanceof File)) {
      return NextResponse.json(
        { success: false, message: `Missing required document: ${key}` },
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

  const backendPayload = {
    onboarding_source: "self_onboard",
    self_onboard_email_verification_token: payload.email_verification_token,
    cafe_name: payload.cafe_name,
    owner_name: payload.owner_name,
    description: payload.notes || "",
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
      business_type: "Gaming Cafe",
      tax_id: payload.tax_id || ""
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
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: data.message || data.error || "Onboarding failed"
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
