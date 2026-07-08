// POST /api/stripe-webhook — reçoit les événements Stripe et active/ajuste le
// compte après un paiement réussi.
//
// ⚠️ DORMANT tant que STRIPE_WEBHOOK_SECRET n'est pas configuré (503, aucun risque).
//
// Vérifie la signature « Stripe-Signature » (HMAC-SHA256 sur `${t}.${rawBody}`)
// — nécessite le CORPS BRUT, d'où bodyParser désactivé ci-dessous.
//
// Env : STRIPE_WEBHOOK_SECRET = whsec_…   (donné par Stripe à la création du endpoint)
const crypto = require('crypto');
const { upstash } = require('./_auth');

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Vérifie la signature Stripe (schéma officiel v1) sans dépendance.
function verifyStripeSig(rawBuf, sigHeader, secret, toleranceSec) {
  if (!sigHeader) return false;
  let t = null; const v1s = [];
  sigHeader.split(',').forEach((kv) => {
    const idx = kv.indexOf('=');
    if (idx < 0) return;
    const k = kv.slice(0, idx).trim(); const v = kv.slice(idx + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v);
  });
  if (!t || !v1s.length) return false;
  if (toleranceSec && Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > toleranceSec) return false;
  const signedPayload = t + '.' + rawBuf.toString('utf8');
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  return v1s.some((v1) => { const b = Buffer.from(v1); return a.length === b.length && crypto.timingSafeEqual(a, b); });
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const WHSEC = process.env.STRIPE_WEBHOOK_SECRET;
  if (!WHSEC) return res.status(503).json({ error: 'Webhook Stripe pas encore activé.' });

  let raw;
  try { raw = await readRaw(req); } catch (e) { return res.status(400).json({ error: 'Corps illisible' }); }

  const sig = req.headers['stripe-signature'];
  if (!verifyStripeSig(raw, sig, WHSEC, 300)) return res.status(400).json({ error: 'Signature invalide' });

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch (_) { return res.status(400).json({ error: 'JSON invalide' }); }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const username = (s.client_reference_id || (s.metadata && s.metadata.username) || '').toLowerCase();
      const plan = (s.metadata && s.metadata.plan) || 'pro';
      if (username) await setUserPlanActive(username, plan, s.customer, s.subscription);
    } else if (event.type === 'customer.subscription.deleted') {
      // Abonnement annulé/expiré → on désactive l'accès.
      const sub = event.data.object;
      const username = (sub.metadata && sub.metadata.username) || null;
      if (username) await deactivate(username.toLowerCase());
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

async function setUserPlanActive(username, plan, customer, subscription) {
  const r = await upstash(['GET', 'vs_user:' + username]);
  const user = r.result ? JSON.parse(r.result) : null;
  if (!user) return;
  user.active = true;
  delete user.deactivatedAt;
  if (['starter', 'pro', 'elite'].includes(plan)) user.plan = plan;
  if (customer) user.stripeCustomer = customer;
  if (subscription) user.stripeSubscription = subscription;
  user.paidAt = new Date().toISOString();
  await upstash(['SET', 'vs_user:' + username, JSON.stringify(user)]);
}

async function deactivate(username) {
  const r = await upstash(['GET', 'vs_user:' + username]);
  const user = r.result ? JSON.parse(r.result) : null;
  if (!user) return;
  user.active = false;
  user.deactivatedAt = new Date().toISOString();
  await upstash(['SET', 'vs_user:' + username, JSON.stringify(user)]);
}

// Export + désactive le parsing du body (corps brut requis pour la signature).
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
