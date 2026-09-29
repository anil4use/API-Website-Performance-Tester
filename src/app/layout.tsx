import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'API & Website Performance Tester',
  description: 'Generic local tool for API reliability, load, stress, and performance testing',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#08111f] text-[#c9d8e8] antialiased">
        {children}
      </body>
    </html>
  )
}
