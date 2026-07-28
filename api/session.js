// GET /api/session — vérifie que la session est toujours valide ET que le compte
// est toujours actif (révocation d'accès prise en compte même token encore valide).
// Renvoie 200 { ok:true, ... } si OK, sinon 401 (session) / 403 (compte désactivé).
const { verifyToken, getBearer, upstash, ingestKey, orgOfUser } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = getBearer(req);
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ ok: false, error: 'Session invalide ou expirée' });

  // Re-vérifie l'état du compte en base (le token est stateless — c'est ici qu'on
  // applique une désactivation faite après l'émission du token).
  let user = null;
  try {
    const r = await upstash(['GET', 'vs_user:' + payload.u]);
    user = r.result ? JSON.parse(r.result) : null;
  } catch (e) {
    // En cas d'indispo du store, on ne déconnecte pas (évite les faux positifs réseau).
    return res.status(200).json({ ok: true, degraded: true, plan: payload.plan, label: payload.label });
  }

  if (!user) return res.status(403).json({ ok: false, error: 'Compte introuvable' });
  if (user.active === false) return res.status(403).json({ ok: false, error: 'Compte désactivé' });

  // Garantit la correspondance code d'ingestion → STRUCTURE (idempotent). Le lien est
  // celui de la structure : tous ses coachs voient et partagent le même formulaire.
  const org = orgOfUser(user);
  const ik = ingestKey(org);
  try { await upstash(['SET', 'vs_ingest:' + ik, org]); } catch (_) { /* non bloquant */ }

  return res.status(200).json({ ok: true, plan: user.plan || payload.plan, label: user.label || payload.label, org, ingestKey: ik });
};
