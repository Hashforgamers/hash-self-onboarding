import type { DayKey, SelfOnboardPayload } from "./types"
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

export function toBackendPayload(payload: SelfOnboardPayload) {
  const availableGames = Object.entries(payload.inventory_summary)
    .filter(([, details]) => Number(details.count || 0) > 0)
    .map(([name, details]) => ({
      name,
      gaming_type: name.toUpperCase(),
      total_slot: Number(details.count || 0),
      rate_per_slot: Number(details.rate_per_slot || 0)
    }))

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

  const inventoryConfigSummary = Object.entries(payload.inventory_config || {})
    .filter(([slug]) => Number(payload.inventory_summary?.[slug]?.count || 0) > 0)
    .map(([slug, cfg]) => {
      const safeSlug = String(slug || "console").replace(/_/g, " ")
      const cap = Number(cfg.capacity || 1)
      const mode = String(cfg.input_mode || "controller")
      const policy = String(cfg.controller_policy || "none")
      const multi = cfg.supports_multiplayer ? "yes" : "no"
      const rate = Number(cfg.base_rate_per_slot || payload.inventory_summary?.[slug]?.rate_per_slot || 0)
      const area = cfg.play_area_sqft ? `, play-area: ${cfg.play_area_sqft} sq ft` : ""
      return `- ${safeSlug}: cap=${cap}, rate=₹${rate}, mode=${mode}, multiplayer=${multi}, controller=${policy}${area}`
    })
    .join("\n")

  const complianceSummary = [
    `Business registration type: ${payload.business_registration_type}`,
    `Owner proof: ${payload.owner_proof_type} (${payload.owner_proof_number})`,
    inventoryConfigSummary ? `Console capability mapping:\n${inventoryConfigSummary}` : ""
  ].join("\n")

  return {
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

}
