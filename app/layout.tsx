import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Hash Cafe Self Onboarding",
  description: "OTP-verified self onboarding for new gaming cafes."
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
