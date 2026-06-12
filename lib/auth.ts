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
    redirect('/auth/signin?callbackUrl=/')
  }

  if (!ALLOWED_EMAILS.includes(session.user.email)) {
    redirect('/auth/signin?error=AccessDenied')
  }

  return session
}

export async function getOpsSession() {
  const session = await getServerSession(authOptions)

  if (!isFounder(session?.user?.email)) {
    return null
  }

  return session
}

export function isFounder(email?: string | null): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.includes(email)
}
