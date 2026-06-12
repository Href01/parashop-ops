import { requireOpsAccess } from '@/lib/auth'

export default async function InventoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireOpsAccess()

  return children
}
