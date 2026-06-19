import { redirect } from 'next/navigation'

/**
 * The customer 360° lives at /customers/[id] (the canonical route used by the
 * sidebar). This old /clients/[id] route just redirects there to avoid a
 * duplicate page.
 */
export default async function ClientRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/customers/${id}`)
}
