'use client'

import Link from 'next/link'
import {
  LayoutDashboard, Target, Package, Box, Users, Megaphone, Calendar, Sparkles, Flame, ArrowRight,
} from 'lucide-react'
import BosShell from '@/components/BosShell'

export default function GuidePage() {
  return (
    <BosShell active="guide" title="Guide" crumb="Aide">
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 24px 80px' }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>COMMENT UTILISER LE BOS</div>
        <h1 className="serif-display" style={{ fontSize: 34, lineHeight: 1.04 }}>Guide d&apos;utilisation</h1>
        <p style={{ fontSize: 14, color: 'var(--tx-mid)', marginTop: 10, lineHeight: 1.6 }}>
          Ton centre de pilotage Shine Cosmetics. Tout est connecté à la même base que le site —
          les chiffres sont réels et à jour. Voici à quoi sert chaque section et comment t&apos;en servir.
        </p>

        {/* The 2 things to do first */}
        <div style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 'var(--radius-lg)', padding: 20, marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 10 }}>⭐ À faire en premier (2 minutes qui débloquent tout)</h2>
          <Step n={1} title="Remplir les coûts d'achat des produits">
            Va dans <GLink href="/products">Produits</GLink> → <b>Coûts en masse</b> → méthode « marge cible » (ex. 30%) → coche tout → enregistre.
            Ça débloque la <b>marge</b> et les <b>winners/losers</b> dans Focus.
          </Step>
          <Step n={2} title="Tagger le canal de chaque commande">
            Dans <GLink href="/orders">Commandes</GLink>, colonne <b>Canal</b> : choisis Instagram / TikTok / WhatsApp…
            Ça débloque le <b>P&amp;L par canal</b> (tu verras quel canal rapporte vraiment).
          </Step>
        </div>

        {/* Sections */}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx-hi)', margin: '32px 0 4px' }}>Les sections</h2>

        <Card icon={<LayoutDashboard />} href="/" title="Vue d'ensemble (Dashboard)">
          Ton aperçu quotidien : CA 7 jours, profit, commandes, panier moyen, taux de livraison, ROAS,
          la courbe de CA, l&apos;objectif du jour, et tes top produits / canaux. C&apos;est la photo « comment va le business aujourd&apos;hui ».
        </Card>

        <Card icon={<Target />} href="/intelligence" title="Focus — où on gagne, où on perd">
          Le cœur stratégique. <b>Économie COD</b> (taux de confirmation/annulation, CA livré vs à risque vs perdu),
          <b> vélocité</b> (ce qui se vend, le dead stock), <b>marge winners/losers</b> (à pousser vs à revoir),
          et <b>P&amp;L par canal</b>. Clique un produit pour ouvrir sa fiche.
          Les sections marge &amp; canal se débloquent quand tu remplis coûts &amp; canaux.
        </Card>

        <Card icon={<Package />} href="/orders" title="Commandes">
          Crée et suis les commandes (WhatsApp, Insta, TikTok, téléphone). Filtres par statut/date, recherche,
          <b> tag du canal en un clic</b>, <b>Sync Sendit</b> pour rafraîchir les livraisons. Clique une ligne pour le détail.
        </Card>

        <Card icon={<Box />} href="/products" title="Produits">
          Catalogue synchronisé avec le site. Renseigne les <b>coûts d&apos;achat</b> (clé pour la marge),
          vois prix / marge / stock. Clique un produit pour sa fiche : marge, total vendu, et les commandes qui le contiennent.
        </Card>

        <Card icon={<Box />} href="/inventory" title="Stock">
          Niveaux de stock, alertes de rupture, points de réappro. Acquitte les alertes, ouvre la fiche produit concernée.
        </Card>

        <Card icon={<Users />} href="/customers" title="Clientes">
          Base clientes avec segments (VIP, à risque…) et niveaux. Clique une cliente pour son profil :
          total dépensé, panier moyen, dernière commande et tout son historique.
        </Card>

        <Card icon={<Megaphone />} href="/campaigns" title="Campagnes & Pub">
          Suivi P&amp;L réel des campagnes : dépense pub, CA, profit, ROAS, ROI. Identifie tes meilleures campagnes.
        </Card>

        <Card icon={<Calendar />} href="/events" title="Événements">
          Ramadan, Black Friday, soldes saisonnières… mesure leur impact sur le CA et les commandes.
        </Card>

        <Card icon={<Flame />} href="/work-hub" title="Work Hub — votre stratégie">
          Votre espace d&apos;équipe. <b>Tâches en Kanban</b> (glisse une carte pour changer son statut),
          <b> journal de décisions</b> (garde la trace de tes choix + le pourquoi), et
          <b> expériences de croissance</b> (hypothèse → métrique → résultat). Tout est sauvegardé.
        </Card>

        <Card icon={<Sparkles />} href="/content" title="Content Hub">
          Ton <b>calendrier de contenu</b> en Kanban : Idées → À produire → Planifié → Publié.
          Glisse une carte pour la faire avancer ; tag la plateforme (Insta/TikTok…), le type (Reel, Post…) et l&apos;échéance.
        </Card>

        {/* Workflow */}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tx-hi)', margin: '32px 0 12px' }}>La routine recommandée</h2>
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
          <Routine when="Chaque matin" what="Dashboard → coup d'œil CA/commandes du jour. Commandes → confirme/traite les nouvelles, sync Sendit." />
          <Routine when="Chaque commande" what="Tague son canal (Insta/TikTok/WhatsApp) au moment de la saisie ou dans la liste." />
          <Routine when="Chaque semaine" what="Focus → regarde annulations COD, dead stock, winners/losers, et quel canal performe. Work Hub → planifie les priorités." />
          <Routine when="Quand tu décides un truc" what="Note-le dans le journal de décisions (avec le pourquoi) — tu te remercieras plus tard." last />
        </div>

        <p style={{ fontSize: 12, color: 'var(--tx-faint)', marginTop: 24, textAlign: 'center' }}>
          Une question ou un bug ? Tout le code est versionné — signale et on corrige.
        </p>
      </div>
    </BosShell>
  )
}

function Card({ icon, href, title, children }: { icon: React.ReactNode; href: string; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ display: 'block', textDecoration: 'none', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 18, marginTop: 12, boxShadow: 'var(--shadow-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--rose-bg)', color: 'var(--rose-bright)', flexShrink: 0 }}>
          <span style={{ display: 'grid', placeItems: 'center' }}>{icon}</span>
        </span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', flex: 1 }}>{title}</h3>
        <ArrowRight style={{ width: 16, height: 16, color: 'var(--tx-faint)' }} />
      </div>
      <p style={{ fontSize: 13, color: 'var(--tx-mid)', lineHeight: 1.6 }}>{children}</p>
    </Link>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--rose-bright)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{n}</span>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx-hi)', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--tx-mid)', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

function Routine({ when, what, last }: { when: string; what: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--line-soft)' }}>
      <span style={{ flexShrink: 0, width: 130, fontSize: 12, fontWeight: 700, color: 'var(--rose)' }}>{when}</span>
      <span style={{ fontSize: 13, color: 'var(--tx-mid)', lineHeight: 1.5 }}>{what}</span>
    </div>
  )
}

function GLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ color: 'var(--rose-bright)', fontWeight: 600, textDecoration: 'none' }}>{children}</Link>
}
