import { NextRequest, NextResponse } from "next/server"
import { getOnboardBackendBaseUrl } from "@/lib/backend"

export async function POST(request: NextRequest) {
  let payload: { email?: string; otp?: string }
  try {
    payload = (await request.json()) as { email?: string; otp?: string }
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 })
  }

  const email = String(payload.email || "").trim().toLowerCase()
  const otp = String(payload.otp || "").trim()
  if (!email || !otp) {
    return NextResponse.json({ success: false, message: "Email and OTP are required" }, { status: 400 })
  }

  try {
    const response = await fetch(`${getOnboardBackendBaseUrl()}/api/self-onboard/verify-email-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp })
    })

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean
      message?: string
      verification_token?: string
    }

    return NextResponse.json(
      {
        success: Boolean(data.success),
        message: data.message || (response.ok ? "OTP verified" : "OTP verification failed"),
        verification_token: data.verification_token || null
      },
      { status: response.status }
    )
  } catch {
    return NextResponse.json({ success: false, message: "OTP service unreachable" }, { status: 502 })
  }
}
