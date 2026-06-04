import { requireOpsAccess } from '@/lib/auth'

export default async function OrdersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireOpsAccess()

  return children
}
