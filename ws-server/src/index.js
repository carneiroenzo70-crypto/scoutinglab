/* Serveur temps réel des salles de draft.
   Un Durable Object = une salle. Il FAIT AUTORITÉ : les opérations sont appliquées ici
   avec draft-engine.js — le MÊME fichier que le navigateur — pour qu'un client ne puisse
   jamais imposer un état truqué. Le navigateur propose, le serveur dispose. */
import VSDraft from '../../draft-engine.js';
import { verifyToken, orgOfToken } from './auth.js';

export class DraftRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  /* L'identité est attachée à la socket (tag) et non gardée en mémoire : elle survit
     ainsi à l'hibernation du Durable Object. */
  infos(ws) {
    try { return JSON.parse(this.state.getTags(ws)[0] || '{}'); } catch (_) { return {}; }
  }

  async lireEtat() { return (await this.state.storage.get('etat')) || null; }
  async ecrireEtat(e) { await this.state.storage.put('etat', e); }

  async fetch(request) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const boBrut = parseInt(url.searchParams.get('bo') || '1', 10);

    const payload = await verifyToken(token, this.env.SESSION_SECRET);
    if (!payload) return new Response('non authentifié', { status: 401 });
    const org = orgOfToken(payload);

    /* La salle appartient à la structure qui l'a créée. Un lien qui fuite ne donne donc
       rien à quelqu'un d'une autre structure — une draft est la donnée la plus sensible
       d'une équipe. */
    const proprietaire = await this.state.storage.get('org');
    if (!proprietaire) await this.state.storage.put('org', org);
    else if (proprietaire !== org) return new Response("salle d'une autre structure", { status: 403 });

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('websocket attendu', { status: 426 });
    }

    let etat = await this.lireEtat();
    if (!etat) {
      etat = VSDraft.createState({ bo: (boBrut === 3 || boBrut === 5) ? boBrut : 1, firstSide: 'blue' });
      await this.ecrireEtat(etat);
    }

    const paire = new WebSocketPair();
    const [client, serveur] = Object.values(paire);

    /* acceptWebSocket (et non accept) : c'est l'API d'hibernation. Sans elle, la salle
       serait facturée tant qu'une socket est ouverte, même totalement inactive. */
    this.state.acceptWebSocket(serveur, [JSON.stringify({ u: payload.u, org })]);

    serveur.send(JSON.stringify({ type: 'state', state: etat }));
    this.diffuserPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  diffuser(message, sauf) {
    const brut = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      if (ws === sauf) continue;
      try { ws.send(brut); } catch (_) { /* socket morte : le runtime la nettoiera */ }
    }
  }

  diffuserPresence() {
    const gens = this.state.getWebSockets().map(ws => this.infos(ws).u).filter(Boolean);
    this.diffuser({ type: 'presence', users: [...new Set(gens)] });
  }

  async webSocketMessage(ws, brut) {
    let msg;
    try { msg = JSON.parse(brut); } catch (_) { return; }

    /* Les curseurs sont éphémères : relayés tels quels, jamais persistés. Ils n'ont
       aucun intérêt une fois la session terminée. */
    if (msg.type === 'cursor') {
      this.diffuser({ type: 'cursor', from: this.infos(ws).u, x: msg.x, y: msg.y }, ws);
      return;
    }

    if (msg.type !== 'op') return;

    const etat = await this.lireEtat();
    if (!etat) return;

    // L'autorité est ici : une opération invalide est rejetée, jamais appliquée.
    const r = VSDraft.apply(etat, msg.op, Date.now());
    if (r.error) { ws.send(JSON.stringify({ type: 'error', message: r.error })); return; }

    await this.ecrireEtat(r.state);
    // diffuser() sans exclusion touche déjà l'émetteur : pas de second envoi, sinon
    // il recevrait l'état en double et re-rendrait deux fois.
    this.diffuser({ type: 'state', state: r.state });
  }

  async webSocketClose() { this.diffuserPresence(); }
  async webSocketError() { this.diffuserPresence(); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');

    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{6,64})$/);
    if (!m) return new Response('introuvable', { status: 404 });

    const id = env.DRAFT_ROOMS.idFromName(m[1]);
    return env.DRAFT_ROOMS.get(id).fetch(request);
  }
};
