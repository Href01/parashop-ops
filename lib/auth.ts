import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

// Founders-only access control
const ALLOWED_EMAILS = [
  'mekouar01@gmail.com',      // Founder 1
  'marjanhajar20@gmail.com',  // Founder 2
]

export async function requireOpsAccess() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect('/api/auth/signin?callbackUrl=/')
  }

  if (!ALLOWED_EMAILS.includes(session.user.email)) {
    return new Response('Unauthorized - Founders only', { status: 403 })
  }

  return session
}

export function isFounder(email?: string | null): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.includes(email)
}
