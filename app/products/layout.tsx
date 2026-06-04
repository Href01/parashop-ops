import { requireOpsAccess } from '@/lib/auth'

export default async function ProductsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireOpsAccess()

  return children
}
