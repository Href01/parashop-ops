import { redirect } from 'next/navigation'

/**
 * The conversation thread now lives inside the 3-pane /messages app. This old
 * per-phone route just opens that app with the conversation pre-selected.
 */
export default async function ThreadRedirect({ params }: { params: Promise<{ phone: string }> }) {
  const { phone } = await params
  redirect(`/messages?phone=${encodeURIComponent(phone)}`)
}
