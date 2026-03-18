import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || ""
  if (query.length < 3) {
    return NextResponse.json({ success: false, message: "Search query must be at least 3 characters" }, { status: 400 })
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY
  if (!googleKey) {
    return NextResponse.json({ success: false, message: "Google API key is not configured" }, { status: 500 })
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json")
    url.searchParams.set("query", `${query} gaming cafe`)
    url.searchParams.set("type", "cafe")
    url.searchParams.set("key", googleKey)

    const response = await fetch(url.toString(), { cache: "no-store" })
    const data = (await response.json()) as {
      status?: string
      error_message?: string
      results?: Array<{ place_id: string; name: string; formatted_address: string }>
    }

    if (!response.ok || (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
      return NextResponse.json(
        {
          success: false,
          message: data.error_message || `Google Places search failed: ${data.status || response.status}`
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, items: (data.results || []).slice(0, 8) })
  } catch {
    return NextResponse.json({ success: false, message: "Failed to reach Google Places" }, { status: 502 })
  }
}
