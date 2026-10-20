/**
 * LE GROUPE TELEGRAM « Shinecosmetics.ma » — trois sujets :
 *   commandes (nouvelles commandes, annulations, retours, paniers a rappeler),
 *   alertes (boutique en erreur, suivi des visites arrete, codes WhatsApp, Meta),
 *   rapport (le bilan de 21 h).
 * Le jeton du bot et l'identifiant du groupe vivent dans les variables Vercel ;
 * sans eux, rien n'est envoye et rien ne casse.
 */

export type Sujet = 'commandes' | 'alertes' | 'rapport'

const FILS: Record<Sujet, string | undefined> = {
  commandes: process.env.TELEGRAM_THREAD_COMMANDES,
  alertes: process.env.TELEGRAM_THREAD_ALERTES,
  rapport: process.env.TELEGRAM_THREAD_RAPPORT,
}

export const BOS = 'https://ops.shinecosmetics.ma'

/** Le texte vient de la base (noms, villes) : il doit etre echappe pour le HTML de Telegram. */
export const h = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const mad = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n))} MAD`

export function telegramConfigure() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
}

export async function envoyer(sujet: Sujet, texte: string, bouton?: { texte: string; url: string }): Promise<boolean> {
  const jeton = process.env.TELEGRAM_BOT_TOKEN, groupe = process.env.TELEGRAM_CHAT_ID
  if (!jeton || !groupe) return false
  const fil = FILS[sujet]
  const r = await fetch(`https://api.telegram.org/bot${jeton}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: groupe,
      ...(fil ? { message_thread_id: Number(fil) } : {}),
      text: texte.slice(0, 4000),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(bouton ? { reply_markup: { inline_keyboard: [[{ text: bouton.texte, url: bouton.url }]] } } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!r?.ok) console.error('[telegram] envoi refuse', sujet, r?.status, await r?.text().catch(() => ''))
  return Boolean(r?.ok)
}
