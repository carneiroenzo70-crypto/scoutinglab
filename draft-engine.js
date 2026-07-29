/* Moteur de draft compétitive — fonction pure, aucune dépendance.
   Chargé DEUX FOIS : par app.html (affichage) et par le serveur WebSocket, qui applique
   les opérations de façon autoritaire — sinon un client pourrait imposer un état truqué.
   D'où le fichier partagé : deux copies divergeraient, et c'est la copie serveur qui fait foi.
   Écrit en ES5 pour rester cohérent avec app.html. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VSDraft = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* Séquence officielle du Tournament Draft, exprimée en 1er/2nd DRAFTEUR et non en
     bleu/rouge : depuis First Selection (2026) le côté de la carte et l'ordre de draft
     se choisissent séparément, un même côté peut donc drafter en premier ou en second. */
  var SEQUENCE = [
    { type: 'ban',  by: 'first'  }, { type: 'ban',  by: 'second' },
    { type: 'ban',  by: 'first'  }, { type: 'ban',  by: 'second' },
    { type: 'ban',  by: 'first'  }, { type: 'ban',  by: 'second' },
    { type: 'pick', by: 'first'  },
    { type: 'pick', by: 'second' }, { type: 'pick', by: 'second' },
    { type: 'pick', by: 'first'  }, { type: 'pick', by: 'first'  },
    { type: 'pick', by: 'second' },
    { type: 'ban',  by: 'second' }, { type: 'ban',  by: 'first'  },
    { type: 'ban',  by: 'second' }, { type: 'ban',  by: 'first'  },
    { type: 'pick', by: 'second' },
    { type: 'pick', by: 'first'  }, { type: 'pick', by: 'first'  },
    { type: 'pick', by: 'second' }
  ];

  function createGame() {
    return { actions: [], phaseStartedAt: null, phaseEndsAt: null, reserve: null, done: false };
  }

  function createState(opts) {
    opts = opts || {};
    var bo = (opts.bo === 3 || opts.bo === 5) ? opts.bo : 1;
    // Un seul côté est fourni : l'autre s'en déduit. Deux équipes du même côté
    // deviennent ainsi impossibles à représenter.
    var firstSide = opts.firstSide === 'red' ? 'red' : 'blue';
    return {
      format: {
        bo: bo,
        fearless: bo > 1,   // fearless en BO3/BO5, jamais en BO1
        turnSeconds: opts.turnSeconds != null ? opts.turnSeconds : 30,
        reserveSeconds: opts.reserveSeconds != null ? opts.reserveSeconds : 0
      },
      sides: { first: firstSide, second: firstSide === 'blue' ? 'red' : 'blue' },
      status: 'lobby',
      gameIndex: 0,
      games: [createGame()],
      usedChampions: []
    };
  }

  function clone(state) { return JSON.parse(JSON.stringify(state)); }
  function ok(state) { return { state: state, error: null }; }
  function err(state, message) { return { state: state, error: message }; }

  /* L'étape attendue maintenant, ou null si la draft n'est pas en cours. */
  function currentStep(state) {
    if (!state || state.status !== 'running') return null;
    var g = state.games[state.gameIndex];
    if (!g || g.done) return null;
    var i = g.actions.length;
    if (i >= SEQUENCE.length) return null;
    return { index: i, type: SEQUENCE[i].type, by: SEQUENCE[i].by };
  }

  /* Arme le chrono de l'étape à venir. L'échéance vaut le temps de base PLUS la réserve
     restante de l'équipe concernée : c'est bien le délai maximum dont elle dispose. */
  function armerChrono(state, game, now) {
    var suivant = SEQUENCE[game.actions.length];
    game.phaseStartedAt = now;
    game.phaseEndsAt = now + state.format.turnSeconds * 1000 + game.reserve[suivant.by];
  }

  /* Champions indisponibles à cet instant. Deux sources :
     — tout ce qui est déjà posé dans la game courante (bans ET picks) ;
     — en fearless, les champions PIKÉS dans les games précédentes du BO, pour les
       DEUX équipes. Les champions BANNIS, eux, redeviennent disponibles. */
  function unavailable(state) {
    var out = {};
    (state.usedChampions || []).forEach(function (c) { out[c] = true; });
    var g = state.games[state.gameIndex];
    if (g) g.actions.forEach(function (a) { if (a.champion) out[a.champion] = true; });
    return out;
  }

  /* Enregistre l'action courante puis arme l'étape suivante. `champion` vaut null
     quand le temps est écoulé : l'emplacement reste vide et la draft continue. */
  function avancer(s, now, champion) {
    var g = s.games[s.gameIndex];
    var step = SEQUENCE[g.actions.length];

    // La réserve est un crédit : seul le dépassement du temps de base y est prélevé.
    var base = s.format.turnSeconds * 1000;
    var ecoule = now - g.phaseStartedAt;
    if (ecoule > base) {
      g.reserve[step.by] = Math.max(0, g.reserve[step.by] - (ecoule - base));
    }

    g.actions.push({ type: step.type, by: step.by, champion: champion || null });

    if (g.actions.length >= SEQUENCE.length) {
      g.done = true;
      g.phaseStartedAt = null;
      g.phaseEndsAt = null;
      // Fearless : seuls les champions PIKÉS sortent du pool, et pour les DEUX équipes.
      // Les champions bannis redeviennent disponibles à la game suivante.
      if (s.format.fearless) {
        g.actions.forEach(function (a) {
          if (a.type === 'pick' && a.champion) s.usedChampions.push(a.champion);
        });
      }
      if (s.gameIndex >= s.format.bo - 1) s.status = 'done';
    } else {
      armerChrono(s, g, now);
    }
    return s;
  }

  function apply(state, op, now) {
    var type = op && op.type;

    if (type === 'start') {
      if (state.status !== 'lobby') return err(state, 'La draft a déjà démarré');
      var s = clone(state);
      var g = s.games[s.gameIndex];
      s.status = 'running';
      g.reserve = { first: s.format.reserveSeconds * 1000, second: s.format.reserveSeconds * 1000 };
      armerChrono(s, g, now);
      return ok(s);
    }

    if (type === 'select') {
      var step = currentStep(state);
      if (!step) return err(state, 'Aucune action attendue');
      if (op.by !== step.by) return err(state, "Ce n'est pas au " + (op.by === 'first' ? '1er' : '2nd') + ' drafteur de jouer');
      if (!op.champion) return err(state, 'Champion manquant');
      if (unavailable(state)[op.champion]) return err(state, op.champion + " n'est plus disponible");
      return ok(avancer(clone(state), now, op.champion));
    }

    if (type === 'timeout') {
      var stepT = currentStep(state);
      if (!stepT) return err(state, 'Aucune action en cours');
      var gT = state.games[state.gameIndex];
      if (now < gT.phaseEndsAt) return err(state, "Le temps n'est pas écoulé");
      // Emplacement laissé vide, comme en vrai : la draft ne s'arrête pas.
      return ok(avancer(clone(state), now, null));
    }

    if (type === 'nextGame') {
      var gN = state.games[state.gameIndex];
      if (!gN.done) return err(state, "La game en cours n'est pas terminée");
      if (state.gameIndex >= state.format.bo - 1) return err(state, 'Le BO est terminé');
      var sN = clone(state);
      sN.gameIndex++;
      sN.games.push(createGame());
      var nouvelle = sN.games[sN.gameIndex];
      nouvelle.reserve = { first: sN.format.reserveSeconds * 1000, second: sN.format.reserveSeconds * 1000 };
      sN.status = 'running';
      armerChrono(sN, nouvelle, now);
      return ok(sN);
    }

    if (type === 'replay') {
      // Réservé au BO1 : en BO3/BO5 le pool consommé par le fearless se construit d'une
      // game à l'autre, le remettre à zéro n'aurait pas de sens.
      if (state.format.bo !== 1) return err(state, "Rejouer n'est possible qu'en BO1");
      var sR = clone(state);
      sR.games = [createGame()];
      sR.gameIndex = 0;
      sR.usedChampions = [];
      sR.status = 'lobby';   // retour au lobby : ils peuvent inverser côté et priorité
      return ok(sR);
    }

    if (type === 'configure') {
      if (state.status !== 'lobby') return err(state, 'On ne change pas les règles en pleine draft');
      var sC = clone(state);
      if (op.firstSide === 'blue' || op.firstSide === 'red') {
        sC.sides = { first: op.firstSide, second: op.firstSide === 'blue' ? 'red' : 'blue' };
      }
      if (op.turnSeconds != null) sC.format.turnSeconds = op.turnSeconds;
      if (op.reserveSeconds != null) sC.format.reserveSeconds = op.reserveSeconds;
      return ok(sC);
    }

    return err(state, 'Opération inconnue : ' + type);
  }

  return {
    SEQUENCE: SEQUENCE, createGame: createGame, createState: createState,
    currentStep: currentStep, unavailable: unavailable, apply: apply
  };
});
