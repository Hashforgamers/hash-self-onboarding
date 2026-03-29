export function getOnboardBackendBaseUrl() {
  return (process.env.SELF_ONBOARD_BACKEND_URL || "https://hfg-onboard.onrender.com").replace(/\/$/, "")
}

export function getUserOnboardBackendBaseUrl() {
  return (process.env.USER_ONBOARD_BACKEND_URL || "https://hfg-user-onboard.onrender.com").replace(/\/$/, "")
}

export function getBookingBackendBaseUrl() {
  return (process.env.BOOKING_BACKEND_URL || "https://hfg-booking.onrender.com").replace(/\/$/, "")
}
