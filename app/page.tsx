import { requireOpsAccess } from '@/lib/auth'
import BosShell from '@/components/BosShell'
import GlowDashboard from './GlowDashboard'

export default async function HomePage() {
  await requireOpsAccess()

  return (
    <BosShell active="dashboard" title="Terminal" crumb="Overview">
      <GlowDashboard />
    </BosShell>
  )
}
