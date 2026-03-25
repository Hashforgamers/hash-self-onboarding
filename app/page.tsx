"use client"

import { useCallback, useMemo, useState } from "react"
import Image from "next/image"
import type { DayKey, DocumentKey, OnboardingDraft, SelfOnboardResponse } from "@/lib/types"
import {
  CONSOLE_TYPES,
  DAY_KEYS,
  DEFAULT_AMENITIES,
  DOCUMENT_KEYS,
  normalizePhone,
  toPayload,
  validateStep
} from "@/lib/validation"
import MapLocationPicker, { type LocationPayload } from "@/app/components/map-location-picker"

const STEPS = [
  "Email OTP",
  "Cafe Identity",
  "Inventory & Hours",
  "Amenities & Documents",
  "Submit"
]

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
}

const DOCUMENT_LABELS: Record<DocumentKey, string> = {
  business_registration: "Business Registration",
  owner_identification_proof: "Owner ID Proof",
  tax_identification_number: "GST / Tax ID",
  bank_acc_details: "Bank Account Proof"
}

const BUSINESS_REGISTRATION_OPTIONS = [
  "GST Certificate",
  "Udyam / MSME Registration",
  "Shop & Establishment License",
  "Trade License",
  "Company Incorporation / LLP Certificate",
  "Partnership Deed",
  "Other"
]

const OWNER_PROOF_OPTIONS = ["Aadhaar", "PAN", "Voter ID", "Passport", "Driving License", "Other"]

const DOCUMENT_HINTS: Record<DocumentKey, string> = {
  business_registration:
    "Upload registration document matching the selected type. Ensure number is clearly visible on first page.",
  owner_identification_proof:
    "Upload owner KYC proof (Aadhaar/PAN/Voter/Passport). Front side must be clear and readable.",
  tax_identification_number:
    "Upload GST certificate or tax registration page. If not available, upload a declaration letter.",
  bank_acc_details:
    "Upload only first page/cancelled cheque with account holder name, account number, IFSC, and bank name."
}

const initialDraft: OnboardingDraft = {
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  otpCode: "",
  emailVerified: false,
  emailVerificationToken: "",
  cafeName: "",
  googlePlaceId: "",
  addressLine1: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  latitude: "",
  longitude: "",
  website: "",
  businessRegistrationType: "GST Certificate",
  businessRegistrationNumber: "",
  ownerProofType: "Aadhaar",
  ownerProofNumber: "",
  taxId: "",
  inventory: {
    pc: { count: 0, ratePerSlot: 0 },
    xbox: { count: 0, ratePerSlot: 0 },
    ps5: { count: 0, ratePerSlot: 0 },
    vr: { count: 0, ratePerSlot: 0 }
  },
  schedule: {
    mon: { isOpen: true, is24Hours: false, open: "09:00", close: "23:00", slotDuration: 30 },
    tue: { isOpen: true, is24Hours: false, open: "09:00", close: "23:00", slotDuration: 30 },
    wed: { isOpen: true, is24Hours: false, open: "09:00", close: "23:00", slotDuration: 30 },
    thu: { isOpen: true, is24Hours: false, open: "09:00", close: "23:00", slotDuration: 30 },
    fri: { isOpen: true, is24Hours: false, open: "09:00", close: "23:00", slotDuration: 30 },
    sat: { isOpen: true, is24Hours: false, open: "09:00", close: "23:00", slotDuration: 30 },
    sun: { isOpen: true, is24Hours: false, open: "09:00", close: "23:00", slotDuration: 30 }
  },
  amenities: Object.fromEntries(DEFAULT_AMENITIES.map((name) => [name, true])),
  notes: ""
}

const initialDocuments: Record<DocumentKey, File | null> = {
  business_registration: null,
  owner_identification_proof: null,
  tax_identification_number: null,
  bank_acc_details: null
}

function prettifyAmenity(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

export default function Page() {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<OnboardingDraft>(initialDraft)
  const [documents, setDocuments] = useState<Record<DocumentKey, File | null>>(initialDocuments)
  const [error, setError] = useState<string | null>(null)
  const [existingDashboardUrl, setExistingDashboardUrl] = useState<string>("")
  const [otpState, setOtpState] = useState<"idle" | "sending" | "sent" | "verifying" | "verified">("idle")
  const [otpMessage, setOtpMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SelfOnboardResponse | null>(null)
  const mapApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  const openConsoleTotal = useMemo(
    () => CONSOLE_TYPES.reduce((sum, type) => sum + Number(draft.inventory[type].count || 0), 0),
    [draft.inventory]
  )

  function updateField<K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value }
      if (key === "ownerEmail") {
        next.emailVerified = false
        next.emailVerificationToken = ""
        setOtpState("idle")
      }
      return next
    })
  }

  function updateSchedule(day: DayKey, changes: Partial<OnboardingDraft["schedule"][DayKey]>) {
    setDraft((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [day]: {
          ...prev.schedule[day],
          ...changes
        }
      }
    }))
  }

  function updateInventory(type: (typeof CONSOLE_TYPES)[number], key: "count" | "ratePerSlot", value: string) {
    const parsed = Number(value)
    setDraft((prev) => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [type]: {
          ...prev.inventory[type],
          [key]: Number.isNaN(parsed) ? 0 : Math.max(0, parsed)
        }
      }
    }))
  }

  function setDocument(key: DocumentKey, file: File | null) {
    setDocuments((prev) => ({ ...prev, [key]: file }))
  }

  async function sendOtp() {
    setError(null)
    setExistingDashboardUrl("")
    if (draft.ownerName.trim().length < 2) {
      setError("Enter owner name before requesting OTP.")
      return
    }
    if (!/^[6-9][0-9]{9}$/.test(normalizePhone(draft.ownerPhone))) {
      setError("Enter a valid 10-digit owner phone number before requesting OTP.")
      return
    }
    if (!draft.ownerEmail.trim()) {
      setError("Enter owner email to receive OTP.")
      return
    }
    setOtpState("sending")
    setOtpMessage("")

    try {
      const response = await fetch("/api/self-onboard/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: draft.ownerEmail,
          cafe_name: draft.cafeName,
          owner_phone: draft.ownerPhone
        })
      })
      const data = (await response.json()) as {
        success?: boolean
        message?: string
        dashboard_url?: string
      }
      if (!response.ok) {
        setError(data.message || "Unable to send OTP.")
        setExistingDashboardUrl(data.dashboard_url || "")
        setOtpState("idle")
        return
      }
      setOtpMessage(data.message || "OTP sent to your email.")
      setOtpState("sent")
    } catch {
      setError("Network error while sending OTP.")
      setOtpState("idle")
    }
  }

  async function verifyOtp() {
    setError(null)
    setExistingDashboardUrl("")
    if (!draft.otpCode.trim()) {
      setError("Enter OTP to verify email.")
      return
    }

    setOtpState("verifying")
    try {
      const response = await fetch("/api/self-onboard/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: draft.ownerEmail, otp: draft.otpCode })
      })
      const data = (await response.json()) as {
        success?: boolean
        message?: string
        verification_token?: string
        dashboard_url?: string
      }

      if (!response.ok || !data.verification_token) {
        setError(data.message || "OTP verification failed.")
        setExistingDashboardUrl(data.dashboard_url || "")
        setOtpState("sent")
        return
      }

      setDraft((prev) => ({
        ...prev,
        emailVerified: true,
        emailVerificationToken: data.verification_token || ""
      }))
      setOtpState("verified")
      setOtpMessage("Email verified successfully.")
    } catch {
      setError("Network error while verifying OTP.")
      setOtpState("sent")
    }
  }

  const handleMapLocationChange = useCallback((location: LocationPayload) => {
    setDraft((prev) => ({
      ...prev,
      cafeName: (location.name || "").trim() || prev.cafeName,
      addressLine1: (location.address || "").trim() || prev.addressLine1,
      city: (location.city || "").trim() || prev.city,
      state: (location.state || "").trim() || prev.state,
      pincode: (location.pincode || "").replace(/\D/g, "").slice(0, 6) || prev.pincode,
      country: (location.country || "").trim() || prev.country || "India",
      googlePlaceId: location.placeId || prev.googlePlaceId,
      latitude: String(location.lat),
      longitude: String(location.lng)
    }))
  }, [])

  function goNext() {
    const validationError = validateStep(draft, step, documents)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setStep((prev) => Math.min(prev + 1, STEPS.length - 1))
  }

  function goBack() {
    setError(null)
    setStep((prev) => Math.max(prev - 1, 0))
  }

  async function submitOnboarding() {
    const validationError = validateStep(draft, 3, documents)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setExistingDashboardUrl("")
    setSubmitting(true)

    try {
      const payload = toPayload(draft)
      const form = new FormData()
      form.append("payload", JSON.stringify(payload))

      for (const key of DOCUMENT_KEYS) {
        const file = documents[key]
        if (file) {
          form.append(key, file)
        }
      }

      const response = await fetch("/api/self-onboard", {
        method: "POST",
        body: form
      })

      const data = (await response.json()) as SelfOnboardResponse
      if (!response.ok) {
        setError(data.message || "Onboarding failed.")
        setExistingDashboardUrl(data.dashboard_url || "")
        setSubmitting(false)
        return
      }

      setResult(data)
      setStep(4)
    } catch {
      setError("Network error while submitting onboarding.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="shell">
      <header className="header">
        <div className="logo-row">
          <Image
            src="/hash-logo.png"
            alt="Hash For Gamers Logo"
            className="logo"
            width={52}
            height={52}
            priority
          />
          <div>
            <h1 className="title">Hash Cafe Self Onboarding</h1>
            <p className="subtitle">Complete details, verify email, submit documents, and finish onboarding.</p>
          </div>
        </div>
      </header>

      <section className="grid">
        <aside className="card step-list">
          {STEPS.map((name, index) => (
            <div
              key={name}
              className={`step-item ${index === step ? "active" : ""} ${index < step ? "done" : ""}`}
            >
              {index + 1}. {name}
            </div>
          ))}
        </aside>

        <article className="card form-card">
          <div className="onboard-logo-banner">
            <Image
              src="/hash-logo.png"
              alt="Hash For Gamers Logo"
              width={40}
              height={40}
              className="logo logo-sm"
              priority
            />
            <div>
              <strong>Hash For Gamers</strong>
              <small>Self Onboarding</small>
            </div>
          </div>

          {error && (
            <div className="banner error">
              <div>{error}</div>
              {existingDashboardUrl && (
                <a
                  className="banner-link"
                  href={existingDashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Cafe already exists? Open Dashboard
                </a>
              )}
            </div>
          )}
          {otpMessage && step === 0 && <div className="banner ok">{otpMessage}</div>}

          {step === 0 && (
            <>
              <div className="row two">
                <label>
                  <span className="label">Owner Name</span>
                  <input
                    className="input"
                    value={draft.ownerName}
                    onChange={(e) => updateField("ownerName", e.target.value)}
                    placeholder="Full name"
                  />
                </label>
                <label>
                  <span className="label">Owner Phone</span>
                  <input
                    className="input"
                    value={draft.ownerPhone}
                    onChange={(e) => updateField("ownerPhone", normalizePhone(e.target.value))}
                    placeholder="10 digit phone number"
                    inputMode="numeric"
                    maxLength={10}
                  />
                </label>
              </div>

              <div className="row two">
                <label>
                  <span className="label">Owner Email</span>
                  <input
                    className="input"
                    value={draft.ownerEmail}
                    onChange={(e) => updateField("ownerEmail", e.target.value)}
                    placeholder="owner@cafename.com"
                  />
                </label>
                <label>
                  <span className="label">OTP</span>
                  <input
                    className="input"
                    value={draft.otpCode}
                    onChange={(e) => updateField("otpCode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6 digit OTP"
                    inputMode="numeric"
                    maxLength={6}
                  />
                </label>
              </div>

              <div className="otp-actions">
                <button className="btn ghost" type="button" onClick={sendOtp} disabled={otpState === "sending"}>
                  {otpState === "sending" ? "Sending OTP..." : "Send OTP"}
                </button>
                <button
                  className="btn primary"
                  type="button"
                  onClick={verifyOtp}
                  disabled={otpState === "verifying" || otpState === "sending"}
                >
                  {otpState === "verifying" ? "Verifying..." : "Verify OTP"}
                </button>
                {draft.emailVerified && <span className="verified-chip">Email Verified</span>}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="identity-layout">
                <div>
                  <div className="row two">
                    <label>
                      <span className="label">Cafe Name</span>
                      <input
                        className="input"
                        value={draft.cafeName}
                        onChange={(e) => updateField("cafeName", e.target.value)}
                        placeholder="Cafe business name"
                      />
                    </label>
                    <label>
                      <span className="label">Website (optional)</span>
                      <input
                        className="input"
                        value={draft.website}
                        onChange={(e) => updateField("website", e.target.value)}
                        placeholder="https://yourcafe.com"
                      />
                    </label>
                  </div>

                  <div className="row">
                    <label>
                      <span className="label">Address</span>
                      <input
                        className="input"
                        value={draft.addressLine1}
                        onChange={(e) => updateField("addressLine1", e.target.value)}
                        placeholder="Street and area"
                      />
                    </label>
                  </div>

                  <div className="row two">
                    <label>
                      <span className="label">City</span>
                      <input className="input" value={draft.city} onChange={(e) => updateField("city", e.target.value)} />
                    </label>
                    <label>
                      <span className="label">State</span>
                      <input className="input" value={draft.state} onChange={(e) => updateField("state", e.target.value)} />
                    </label>
                  </div>

                  <div className="row three">
                    <label>
                      <span className="label">Pincode</span>
                      <input
                        className="input"
                        value={draft.pincode}
                        onChange={(e) => updateField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="6 digits"
                        inputMode="numeric"
                        maxLength={6}
                      />
                    </label>
                    <label>
                      <span className="label">Latitude</span>
                      <input
                        className="input"
                        value={draft.latitude}
                        onChange={(e) => updateField("latitude", e.target.value)}
                        placeholder="18.5204"
                      />
                    </label>
                    <label>
                      <span className="label">Longitude</span>
                      <input
                        className="input"
                        value={draft.longitude}
                        onChange={(e) => updateField("longitude", e.target.value)}
                        placeholder="73.8567"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <MapLocationPicker
                    apiKey={mapApiKey}
                    initialLat={draft.latitude ? Number(draft.latitude) : undefined}
                    initialLng={draft.longitude ? Number(draft.longitude) : undefined}
                    onChange={handleMapLocationChange}
                  />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="section-title">Console Inventory</p>
              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Console</th>
                      <th>Quantity</th>
                      <th>Rate / Slot (optional)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CONSOLE_TYPES.map((type) => (
                      <tr key={type}>
                        <td>{type.toUpperCase()}</td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={draft.inventory[type].count}
                            onChange={(e) => updateInventory(type, "count", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={draft.inventory[type].ratePerSlot}
                            onChange={(e) => updateInventory(type, "ratePerSlot", e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="helper">Total selected consoles: {openConsoleTotal}</p>

              <p className="section-title">Operating Hours</p>
              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Open</th>
                      <th>24h</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Slot (min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAY_KEYS.map((day) => (
                      <tr key={day}>
                        <td>{DAY_LABELS[day]}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={draft.schedule[day].isOpen}
                            onChange={(e) => updateSchedule(day, { isOpen: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={draft.schedule[day].is24Hours}
                            onChange={(e) =>
                              updateSchedule(day, {
                                is24Hours: e.target.checked,
                                open: e.target.checked ? "00:00" : draft.schedule[day].open,
                                close: e.target.checked ? "00:00" : draft.schedule[day].close
                              })
                            }
                            disabled={!draft.schedule[day].isOpen}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            type="time"
                            value={draft.schedule[day].open}
                            onChange={(e) => updateSchedule(day, { open: e.target.value })}
                            disabled={!draft.schedule[day].isOpen || draft.schedule[day].is24Hours}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            type="time"
                            value={draft.schedule[day].close}
                            onChange={(e) => updateSchedule(day, { close: e.target.value })}
                            disabled={!draft.schedule[day].isOpen || draft.schedule[day].is24Hours}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min={15}
                            step={15}
                            value={draft.schedule[day].slotDuration}
                            onChange={(e) =>
                              updateSchedule(day, {
                                slotDuration: Math.max(15, Number(e.target.value || 30))
                              })
                            }
                            disabled={!draft.schedule[day].isOpen}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="row two">
                <label>
                  <span className="label">Business Registration Document Type</span>
                  <select
                    className="select"
                    value={draft.businessRegistrationType}
                    onChange={(e) => updateField("businessRegistrationType", e.target.value)}
                  >
                    {BUSINESS_REGISTRATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <span className="helper">
                    Accepted: GST, Udyam/MSME, Shop & Establishment, Trade License, Incorporation, Partnership Deed.
                  </span>
                </label>
                <label>
                  <span className="label">Business Registration Number</span>
                  <input
                    className="input"
                    value={draft.businessRegistrationNumber}
                    onChange={(e) => updateField("businessRegistrationNumber", e.target.value)}
                    placeholder={`Enter ${draft.businessRegistrationType} number`}
                  />
                </label>
              </div>

              <div className="row two">
                <label>
                  <span className="label">Owner Identity Proof Type</span>
                  <select
                    className="select"
                    value={draft.ownerProofType}
                    onChange={(e) => updateField("ownerProofType", e.target.value)}
                  >
                    {OWNER_PROOF_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <span className="helper">Choose one: Aadhaar, PAN, Voter ID, Passport, etc.</span>
                </label>
                <label>
                  <span className="label">Owner Identity Proof Number</span>
                  <input
                    className="input"
                    value={draft.ownerProofNumber}
                    onChange={(e) => updateField("ownerProofNumber", e.target.value)}
                    placeholder={`Enter ${draft.ownerProofType} number`}
                  />
                </label>
              </div>

              <div className="row two">
                <label>
                  <span className="label">GST / Tax ID (optional)</span>
                  <input
                    className="input"
                    value={draft.taxId}
                    onChange={(e) => updateField("taxId", e.target.value)}
                    placeholder="GST / Tax ID"
                  />
                </label>
              </div>

              <p className="section-title">Amenities</p>
              <div className="checkbox-grid">
                {DEFAULT_AMENITIES.map((amenity) => (
                  <label className="check-item" key={amenity}>
                    <input
                      type="checkbox"
                      checked={Boolean(draft.amenities[amenity])}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          amenities: { ...prev.amenities, [amenity]: e.target.checked }
                        }))
                      }
                    />
                    <span>{prettifyAmenity(amenity)}</span>
                  </label>
                ))}
              </div>

              <p className="section-title">Document Uploads</p>
              <div className="row two">
                {DOCUMENT_KEYS.map((key) => (
                  <label key={key}>
                    <span className="label">{DOCUMENT_LABELS[key]}</span>
                    <span className="helper">{DOCUMENT_HINTS[key]}</span>
                    <input
                      className="input"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => setDocument(key, e.target.files?.[0] || null)}
                    />
                    {documents[key] && <span className="helper">Selected: {documents[key]?.name}</span>}
                  </label>
                ))}
              </div>

              <div className="row">
                <label>
                  <span className="label">Notes (optional)</span>
                  <textarea
                    className="textarea"
                    value={draft.notes}
                    onChange={(e) => updateField("notes", e.target.value)}
                    placeholder="Any additional info for onboarding team"
                  />
                </label>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="banner ok">
                {result?.message || "Onboarding completed."}
                {result?.vendor_id ? ` Vendor ID: ${result.vendor_id}` : ""}
              </div>
              <p className="summary-text">
                Please check your email. Your onboarding is completed and our team will send credentials and dashboard
                inventory link shortly.
              </p>
            </>
          )}

          <div className="actions">
            <button className="btn ghost" type="button" onClick={goBack} disabled={step === 0 || submitting}>
              Back
            </button>

            {step < 3 && (
              <button className="btn primary" type="button" onClick={goNext}>
                Continue
              </button>
            )}

            {step === 3 && (
              <button className="btn primary" type="button" onClick={submitOnboarding} disabled={submitting}>
                {submitting ? "Submitting..." : "Complete Onboarding"}
              </button>
            )}
          </div>
        </article>
      </section>
    </main>
  )
}
