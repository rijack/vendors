import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vendor Tracker',
  description: 'Track vendors, contacts, and interactions',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
