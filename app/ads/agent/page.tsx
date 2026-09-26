import type { Metadata } from 'next'
import { requireOpsAccess } from '@/lib/auth'
import AgentMeta from './AgentMeta'

export const metadata: Metadata = {
  title: 'Agent Meta Ads | Shine Ops',
  robots: { index: false, follow: false },
}

export default async function AgentMetaPage() {
  await requireOpsAccess()
  return <AgentMeta />
}
