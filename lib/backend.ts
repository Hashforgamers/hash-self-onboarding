export function getOnboardBackendBaseUrl() {
  return (process.env.SELF_ONBOARD_BACKEND_URL || "https://hfg-onboard.onrender.com").replace(/\/$/, "")
}
