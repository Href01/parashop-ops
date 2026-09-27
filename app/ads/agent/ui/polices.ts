import { Caveat, DM_Sans, Tajawal } from 'next/font/google'

/*
 * Les polices de shinecosmetics.ma, pour les visuels et les Reels dessines en
 * canvas : DM Sans (titres), Tajawal (arabe), Caveat (la touche manuscrite).
 * Le BOS n'utilise que Geist ; celles-ci ne se telechargent que lorsque le
 * studio dessine (document.fonts.load).
 */
const dm = DM_Sans({ subsets: ['latin'], weight: ['600', '800'], display: 'swap' })
const tajawal = Tajawal({ subsets: ['arabic'], weight: ['700', '800'], display: 'swap' })
const caveat = Caveat({ subsets: ['latin'], weight: ['700'], display: 'swap' })

export const POLICES = { titre: dm.style.fontFamily, arabe: tajawal.style.fontFamily, main: caveat.style.fontFamily }

/** Attend que les polices soient la avant de dessiner (sinon le canvas prend la police de secours). */
export async function policesPretes() {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all([
    document.fonts.load(`800 64px ${POLICES.titre}`), document.fonts.load(`600 32px ${POLICES.titre}`),
    document.fonts.load(`800 64px ${POLICES.arabe}`, 'أ'), document.fonts.load(`700 48px ${POLICES.main}`),
  ]).catch(() => {})
}

/** La palette du site. */
export const COULEURS = { vert: '#0C6B52', prune: '#9B3070', beurre: '#F7DE92', creme: '#F7F6F2', brun: '#1C1410', menthe: '#E1F5EE' }
