import 'server-only'

/**
 * REVEILLER LE DIRECTEUR ARTISTIQUE TOUT DE SUITE, au lieu d'attendre son
 * passage horaire : l'API « fire » des routines Claude Code.
 *
 *   ADS_DA_ROUTINE_ID  la routine « Directeur artistique » (trig_…)
 *   ADS_DA_FIRE_TOKEN  le jeton de son declencheur API (cree dans claude.ai/code/routines)
 *
 * Sans ces deux variables, rien ne casse : la demande attend dans la file et la
 * routine la prend a son prochain passage. Un echec ici ne bloque jamais la demande.
 */
export async function reveillerDirecteur(demandeId: number): Promise<boolean> {
  const routine = process.env.ADS_DA_ROUTINE_ID, jeton = process.env.ADS_DA_FIRE_TOKEN
  if (!routine || !jeton || !/^trig_\w+$/.test(routine)) return false
  try {
    const r = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${routine}/fire`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${jeton}`,
        'anthropic-beta': 'experimental-cc-routine-2026-04-01',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: `Direction artistique #${demandeId} en attente dans le BOS.` }),
    })
    return r.ok
  } catch {
    return false
  }
}
