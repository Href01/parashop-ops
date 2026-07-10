import { redirect } from 'next/navigation'

// "Suivi & Réappro" was merged into the Stock page (/inventory) so there is a
// single, demand-aware source of truth for stock. Keep this route as a redirect
// for any old links/bookmarks.
export default function FulfillmentRedirect() {
  redirect('/inventory')
}
