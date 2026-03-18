import { NextRequest, NextResponse } from "next/server"
import { getUserOnboardBackendBaseUrl } from "@/lib/backend"

type AddHashCoinsPayload = {
  amount?: unknown
  token?: unknown
}

function parseBearerToken(request: NextRequest, fallbackToken?: unknown) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || ""
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""
  if (headerToken) return headerToken
  if (typeof fallbackToken === "string" && fallbackToken.trim()) return fallbackToken.trim()
  return ""
}

export async function POST(request: NextRequest) {
  let payload: AddHashCoinsPayload
  try {
    payload = (await request.json()) as AddHashCoinsPayload
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 })
  }

  const amount = Number(payload.amount)
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ success: false, message: "Amount must be a positive integer" }, { status: 400 })
  }

  const token = parseBearerToken(request, payload.token)
  if (!token) {
    return NextResponse.json(
      { success: false, message: "Missing Authorization Bearer token" },
      { status: 401 }
    )
  }

  try {
    const upstreamResponse = await fetch(`${getUserOnboardBackendBaseUrl()}/api/users/hash-coins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ amount }),
      cache: "no-store"
    })

    const rawBody = await upstreamResponse.text()
    let upstreamData: Record<string, unknown> = {}

    if (rawBody) {
      try {
        upstreamData = JSON.parse(rawBody) as Record<string, unknown>
      } catch {
        upstreamData = { message: rawBody }
      }
    }

    const message =
      (typeof upstreamData.message === "string" && upstreamData.message) ||
      (typeof upstreamData.error === "string" && upstreamData.error) ||
      (upstreamResponse.ok ? "Hash coins credited" : "Failed to credit hash coins")

    return NextResponse.json(
      {
        success: upstreamResponse.ok,
        message,
        user_id: upstreamData.user_id ?? null,
        new_hash_coins: upstreamData.new_hash_coins ?? null,
        error: upstreamData.error ?? null
      },
      { status: upstreamResponse.status }
    )
  } catch {
    return NextResponse.json(
      { success: false, message: "User onboard service unreachable" },
      { status: 502 }
    )
  }
}
