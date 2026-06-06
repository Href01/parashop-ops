import { requireOpsAccess } from '@/lib/auth'
import BosShell from '@/components/BosShell'
import ModernDashboard from './ModernDashboard'

export default async function HomePage() {
  await requireOpsAccess()

  return (
    <BosShell active="dashboard" title="Dashboard" crumb="Overview">
      <ModernDashboard />
    </BosShell>
  )
}
