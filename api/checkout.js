// POST /api/checkout — crée une session Stripe Checkout (abonnement) pour la
// structure connectée, et renvoie l'URL de paiement.
//
// ⚠️ DORMANT tant que les variables d'env Stripe ne sont pas configurées sur
// Vercel (voir docs/STRIPE_SETUP.md). Sans clé → 503, aucun risque.
//
// Env attendues :
//   STRIPE_SECRET_KEY      = sk_live_… (ou sk_test_…)
//   STRIPE_PRICE_PRO       = price_…  (offre Pro, abonnement mensuel)
//   STRIPE_PRICE_ELITE     = price_…  (offre Elite)
//   PUBLIC_BASE_URL        = https://visionscore.gg  (pour les redirections)
const { verifyToken, getBearer } = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const SK = process.env.STRIPE_SECRET_KEY;
  if (!SK) return res.status(503).json({ error: 'Paiement pas encore activé.' });

  // Structure connectée (on rattache le paiement au compte)
  const payload = verifyToken(getBearer(req));
  if (!payload || !payload.u) return res.status(401).json({ error: 'Non authentifié' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
  const plan = ((body && body.plan) || '').trim().toLowerCase();

  const PRICES = { pro: process.env.STRIPE_PRICE_PRO, elite: process.env.STRIPE_PRICE_ELITE };
  const price = PRICES[plan];
  if (!price) return res.status(400).json({ error: "Offre inconnue ou prix non configuré (attendu : 'pro' ou 'elite')." });

  const base = (process.env.PUBLIC_BASE_URL || 'https://visionscore.gg').replace(/\/$/, '');

  // Corps form-encodé pour l'API REST Stripe (pas de dépendance npm).
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('line_items[0][price]', price);
  form.set('line_items[0][quantity]', '1');
  form.set('success_url', base + '/app?checkout=success');
  form.set('cancel_url', base + '/app?checkout=cancel');
  form.set('client_reference_id', payload.u);          // ← username → utilisé par le webhook
  form.set('metadata[username]', payload.u);
  form.set('metadata[plan]', plan);
  form.set('allow_promotion_codes', 'true');

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + SK, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: (data.error && data.error.message) || 'Erreur Stripe' });
    return res.status(200).json({ url: data.url, id: data.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
