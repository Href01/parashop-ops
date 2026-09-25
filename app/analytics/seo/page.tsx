import type { Metadata } from 'next'
import { requireOpsAccess } from '@/lib/auth'
import SeoDashboard from './SeoDashboard'

export const metadata: Metadata = {
  title: 'SEO Insights | Shine Ops',
  robots: { index: false, follow: false },
}
export default async function SeoPage() {
  await requireOpsAccess()
  return <SeoDashboard />
}
