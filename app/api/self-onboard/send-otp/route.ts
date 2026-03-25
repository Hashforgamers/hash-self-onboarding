import { NextRequest, NextResponse } from "next/server"
import { getOnboardBackendBaseUrl } from "@/lib/backend"

export async function POST(request: NextRequest) {
  let payload: { email?: string; cafe_name?: string; owner_phone?: string }
  try {
    payload = (await request.json()) as { email?: string; cafe_name?: string }
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 })
  }

  const email = String(payload.email || "").trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 })
  }

  try {
    const response = await fetch(`${getOnboardBackendBaseUrl()}/api/self-onboard/send-email-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        cafe_name: payload.cafe_name || "",
        owner_phone: payload.owner_phone || ""
      })
    })

    const data = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string }
    return NextResponse.json(
      {
        success: Boolean(data.success),
        message: data.message || (response.ok ? "OTP sent" : "Failed to send OTP")
      },
      { status: response.status }
    )
  } catch {
    return NextResponse.json({ success: false, message: "OTP service unreachable" }, { status: 502 })
  }
}
