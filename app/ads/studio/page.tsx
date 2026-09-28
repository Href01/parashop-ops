import type { Metadata } from 'next'
import { requireOpsAccess } from '@/lib/auth'
import StudioCreatif from './StudioCreatif'

export const metadata: Metadata = {
  title: 'Studio créatif | Shine Ops',
  robots: { index: false, follow: false },
}

export default async function StudioCreatifPage() {
  await requireOpsAccess()
  return <StudioCreatif />
}
