import { requireOpsAccess } from '@/lib/auth'

export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireOpsAccess()

  return children
}
