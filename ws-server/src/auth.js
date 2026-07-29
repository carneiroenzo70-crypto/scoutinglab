/* Vérification du token de session VisionScore.
   Le Worker n'a pas le module `crypto` de Node : on refait la vérification HMAC en
   WebCrypto. Le format est celui de api/_auth.js : base64url(JSON).base64url(HMAC-SHA256).
   Aucun second système d'authentification — même secret, même token, mêmes règles. */

function base64urlEnBytes(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const comble = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const brut = atob(comble);
  const out = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
  return out;
}

export async function verifyToken(token, secret) {
  try {
    if (!token || typeof token !== 'string' || !secret) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;

    const cle = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valide = await crypto.subtle.verify(
      'HMAC', cle, base64urlEnBytes(sig), new TextEncoder().encode(data)
    );
    if (!valide) return null;

    const body = JSON.parse(new TextDecoder().decode(base64urlEnBytes(data)));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch (_) {
    return null;   // token malformé : refus, jamais d'exception
  }
}

/* Même repli que côté API : les tokens émis avant l'ajout de `org` n'en ont pas,
   et leur porteur est alors sa propre structure. */
export function orgOfToken(payload) {
  return (payload && payload.org) || (payload && payload.u) || null;
}
