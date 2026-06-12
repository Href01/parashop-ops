import { requireOpsAccess } from '@/lib/auth'

export default async function CampaignsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireOpsAccess()

  return children
}
