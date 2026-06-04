import { requireOpsAccess } from '@/lib/auth'
import DashboardPage from './DashboardPage'

export default async function HomePage() {
  await requireOpsAccess()

  return <DashboardPage />
}
