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

    return err(state, 'Opération inconnue : ' + type);
  }

  return {
    SEQUENCE: SEQUENCE, createGame: createGame, createState: createState,
    currentStep: currentStep, apply: apply
  };
});
