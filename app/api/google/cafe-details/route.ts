import { NextRequest, NextResponse } from "next/server"

type AddressComponent = {
  long_name: string
  short_name: string
  types: string[]
}

function pickComponent(components: AddressComponent[], type: string) {
  return components.find((c) => c.types.includes(type))?.long_name || ""
}

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("placeId")?.trim() || ""
  if (!placeId) {
    return NextResponse.json({ success: false, message: "placeId is required" }, { status: 400 })
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY
  if (!googleKey) {
    return NextResponse.json({ success: false, message: "Google API key is not configured" }, { status: 500 })
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json")
    url.searchParams.set("place_id", placeId)
    url.searchParams.set(
      "fields",
      "place_id,name,formatted_address,geometry,address_component"
    )
    url.searchParams.set("key", googleKey)

    const response = await fetch(url.toString(), { cache: "no-store" })
    const data = (await response.json()) as {
      status?: string
      error_message?: string
      result?: {
        place_id: string
        name: string
        formatted_address: string
        geometry?: {
          location?: { lat?: number; lng?: number }
        }
        address_components?: AddressComponent[]
      }
    }

    if (!response.ok || !data.result || (data.status && data.status !== "OK")) {
      return NextResponse.json(
        {
          success: false,
          message: data.error_message || `Google place details failed: ${data.status || response.status}`
        },
        { status: 502 }
      )
    }

    const components = data.result.address_components || []
    const streetNumber = pickComponent(components, "street_number")
    const route = pickComponent(components, "route")
    const neighborhood = pickComponent(components, "sublocality") || pickComponent(components, "neighborhood")

    const street = [streetNumber, route, neighborhood].filter(Boolean).join(" ") || data.result.formatted_address
    const city =
      pickComponent(components, "locality") ||
      pickComponent(components, "administrative_area_level_2") ||
      pickComponent(components, "sublocality")

    const details = {
      place_id: data.result.place_id,
      name: data.result.name,
      formatted_address: data.result.formatted_address,
      latitude: data.result.geometry?.location?.lat ?? null,
      longitude: data.result.geometry?.location?.lng ?? null,
      city,
      state: pickComponent(components, "administrative_area_level_1"),
      pincode: pickComponent(components, "postal_code"),
      country: pickComponent(components, "country") || "India",
      street
    }

    return NextResponse.json({ success: true, details })
  } catch {
    return NextResponse.json({ success: false, message: "Failed to reach Google Places" }, { status: 502 })
  }
}
