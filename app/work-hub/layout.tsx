import { requireOpsAccess } from '@/lib/auth'

export default async function WorkHubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireOpsAccess()

  return children
}
