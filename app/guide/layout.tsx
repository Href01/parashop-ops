import { requireOpsAccess } from '@/lib/auth'

export default async function GuideLayout({ children }: { children: React.ReactNode }) {
  await requireOpsAccess()
  return children
}
