# Activer les paiements Stripe (quand vous serez prêts)

Le code est **déjà en place mais dormant** : sans les variables d'environnement
ci-dessous, les endpoints renvoient `503` et rien ne se passe (aucun risque).
Rien n'est facturé, aucune clé secrète n'est dans le dépôt.

> Rappel du modèle : on commence en **facturation manuelle** (devis/virement)
> pour le programme pilote. Stripe sert quand vous voudrez de l'abonnement
> self-service. Vous pouvez donc faire ça plus tard, sans blocage.

## Ce que VOUS faites (Claude ne peut pas créer de compte ni saisir de clés)

### 1. Compte + produits Stripe
1. Créez un compte sur [stripe.com](https://stripe.com).
2. **Products** → créez 2 produits d'abonnement mensuel, par ex. :
   - « VisionScore Pro » → notez le **Price ID** (`price_…`).
   - « VisionScore Elite » → notez le **Price ID** (`price_…`).

### 2. Variables d'environnement sur Vercel
Dans Vercel → votre projet → **Settings → Environment Variables**, ajoutez :

| Nom | Valeur |
|-----|--------|
| `STRIPE_SECRET_KEY` | `sk_live_…` (Developers → API keys) |
| `STRIPE_PRICE_PRO` | `price_…` (produit Pro) |
| `STRIPE_PRICE_ELITE` | `price_…` (produit Elite) |
| `PUBLIC_BASE_URL` | `https://visionscore.gg` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (voir étape 3) |

> Ces clés vivent **uniquement** dans Vercel, jamais dans le code/git.

### 3. Webhook Stripe
1. Stripe → **Developers → Webhooks → Add endpoint**.
2. URL : `https://visionscore.gg/api/stripe-webhook`
3. Événements à écouter : `checkout.session.completed` et
   `customer.subscription.deleted`.
4. Copiez le **Signing secret** (`whsec_…`) → variable `STRIPE_WEBHOOK_SECRET`.
5. Redeployez (Vercel redéploie tout seul après un changement de variables).

## Ce qui est déjà codé (côté VisionScore)

- **`/api/checkout`** — crée une session Stripe Checkout pour la structure
  connectée. Body : `{ "plan": "pro" | "elite" }` + header `Authorization: Bearer <token>`.
  Renvoie `{ url }` → on redirige le navigateur dessus.
- **`/api/stripe-webhook`** — à la fin du paiement (`checkout.session.completed`),
  passe le compte de la structure en `active: true` + applique l'offre payée.
  À l'annulation de l'abonnement, repasse le compte en `active: false`
  (couplé au système comptes actif/inactif déjà en place).

## Reste à faire quand les clés seront posées (petit + à valider)

- **Brancher un bouton** « Passer à l'offre Pro/Elite » dans l'app qui appelle
  `/api/checkout` puis `window.location = url`. (Volontairement pas encore mis
  en avant pour ne pas exposer un tunnel de paiement tant que Stripe est off.)
- **Tester le webhook** avec le Stripe CLI (`stripe listen --forward-to …`) :
  vérifier que le corps brut arrive bien intact pour la signature (le handler
  lit le flux brut ; à confirmer sur l'environnement Vercel réel).

Dites-moi quand le compte Stripe + les Price IDs existent : je branche le
bouton d'abonnement et on teste le tunnel de bout en bout.
