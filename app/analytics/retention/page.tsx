import { redirigerVue } from '@/lib/analytics/redirection'

/** Ancienne adresse : renvoie vers /analytics/clientes en gardant les réglages. */
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return redirigerVue('/analytics/clientes', null, searchParams)
}
