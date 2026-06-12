import { requireOpsAccess } from '@/lib/auth'

export default async function CustomersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireOpsAccess()

  return children
}
