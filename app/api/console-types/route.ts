import { NextResponse } from "next/server"
import { getBookingBackendBaseUrl } from "@/lib/backend"

export async function GET() {
  try {
    const response = await fetch(`${getBookingBackendBaseUrl()}/api/console-types`, {
      method: "GET",
      cache: "no-store",
      headers: process.env.SELF_ONBOARD_SERVICE_KEY
        ? { "x-service-key": process.env.SELF_ONBOARD_SERVICE_KEY }
        : undefined
    })

    const data = (await response.json().catch(() => ({}))) as {
      console_types?: Array<Record<string, unknown>>
      message?: string
      error?: string
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: data.message || data.error || "Failed to fetch console catalog",
          console_types: []
        },
        { status: response.status }
      )
    }

    return NextResponse.json(
      {
        success: true,
        console_types: data.console_types || []
      },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Console catalog service is unreachable",
        console_types: []
      },
      { status: 502 }
    )
  }
}
