import "./globals.css"
import type { Metadata } from "next"

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://onboard.hashforgamers.com"

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Hash Cafe Self Onboarding | Hash For Gamers",
  description:
    "Self onboarding for new gaming cafes. Verify email with OTP, submit cafe details and documents, and go live with Hash For Gamers.",
  applicationName: "Hash Cafe Self Onboarding",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
    other: [
      {
        rel: "android-chrome",
        url: "/web-app-manifest-192x192.png"
      },
      {
        rel: "android-chrome",
        url: "/web-app-manifest-512x512.png"
      }
    ]
  },
  openGraph: {
    title: "Hash Cafe Self Onboarding",
    description:
      "Complete self onboarding for your gaming cafe with OTP verification, inventory setup, and document upload.",
    url: appUrl,
    siteName: "Hash For Gamers",
    type: "website",
    images: [
      {
        url: "/hash-logo.png",
        width: 512,
        height: 512,
        alt: "Hash For Gamers"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Hash Cafe Self Onboarding",
    description:
      "Start your gaming cafe onboarding journey with Hash For Gamers in a few guided steps.",
    images: ["/hash-logo.png"]
  }
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
