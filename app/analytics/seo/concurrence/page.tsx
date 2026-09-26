import type { Metadata } from 'next'
import { requireOpsAccess } from '@/lib/auth'
import Concurrence from './Concurrence'

export const metadata: Metadata = {
  title: 'Concurrence SEO | Shine Ops',
  robots: { index: false, follow: false },
}

export default async function ConcurrencePage() {
  await requireOpsAccess()
  return <Concurrence />
}
