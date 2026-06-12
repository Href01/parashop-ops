import { requireOpsAccess } from '@/lib/auth'

export default async function ContentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireOpsAccess()

  return children
}
