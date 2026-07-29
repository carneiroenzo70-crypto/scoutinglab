var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_modules_watch_stub();
  }
});

// node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// ../draft-engine.js
var require_draft_engine = __commonJS({
  "../draft-engine.js"(exports, module) {
    init_modules_watch_stub();
    (function(root, factory) {
      if (typeof module === "object" && module.exports) module.exports = factory();
      else root.VSDraft = factory();
    })(typeof self !== "undefined" ? self : globalThis, function() {
      "use strict";
      var SEQUENCE = [
        { type: "ban", by: "first" },
        { type: "ban", by: "second" },
        { type: "ban", by: "first" },
        { type: "ban", by: "second" },
        { type: "ban", by: "first" },
        { type: "ban", by: "second" },
        { type: "pick", by: "first" },
        { type: "pick", by: "second" },
        { type: "pick", by: "second" },
        { type: "pick", by: "first" },
        { type: "pick", by: "first" },
        { type: "pick", by: "second" },
        { type: "ban", by: "second" },
        { type: "ban", by: "first" },
        { type: "ban", by: "second" },
        { type: "ban", by: "first" },
        { type: "pick", by: "second" },
        { type: "pick", by: "first" },
        { type: "pick", by: "first" },
        { type: "pick", by: "second" }
      ];
      function createGame() {
        return { actions: [], phaseStartedAt: null, phaseEndsAt: null, reserve: null, done: false };
      }
      __name(createGame, "createGame");
      function createState(opts) {
        opts = opts || {};
        var bo = opts.bo === 3 || opts.bo === 5 ? opts.bo : 1;
        var firstSide = opts.firstSide === "red" ? "red" : "blue";
        return {
          format: {
            bo,
            fearless: bo > 1,
            // fearless en BO3/BO5, jamais en BO1
            turnSeconds: opts.turnSeconds != null ? opts.turnSeconds : 30,
            reserveSeconds: opts.reserveSeconds != null ? opts.reserveSeconds : 0
          },
          sides: { first: firstSide, second: firstSide === "blue" ? "red" : "blue" },
          status: "lobby",
          gameIndex: 0,
          games: [createGame()],
          usedChampions: []
        };
      }
      __name(createState, "createState");
      function clone(state) {
        return JSON.parse(JSON.stringify(state));
      }
      __name(clone, "clone");
      function ok(state) {
        return { state, error: null };
      }
      __name(ok, "ok");
      function err(state, message) {
        return { state, error: message };
      }
      __name(err, "err");
      function currentStep(state) {
        if (!state || state.status !== "running") return null;
        var g = state.games[state.gameIndex];
        if (!g || g.done) return null;
        var i = g.actions.length;
        if (i >= SEQUENCE.length) return null;
        return { index: i, type: SEQUENCE[i].type, by: SEQUENCE[i].by };
      }
      __name(currentStep, "currentStep");
      function armerChrono(state, game, now) {
        var suivant = SEQUENCE[game.actions.length];
        game.phaseStartedAt = now;
        game.phaseEndsAt = now + state.format.turnSeconds * 1e3 + game.reserve[suivant.by];
      }
      __name(armerChrono, "armerChrono");
      function unavailable(state) {
        var out = {};
        (state.usedChampions || []).forEach(function(c) {
          out[c] = true;
        });
        var g = state.games[state.gameIndex];
        if (g) g.actions.forEach(function(a) {
          if (a.champion) out[a.champion] = true;
        });
        return out;
      }
      __name(unavailable, "unavailable");
      function avancer(s, now, champion) {
        var g = s.games[s.gameIndex];
        var step = SEQUENCE[g.actions.length];
        var base = s.format.turnSeconds * 1e3;
        var ecoule = now - g.phaseStartedAt;
        if (ecoule > base) {
          g.reserve[step.by] = Math.max(0, g.reserve[step.by] - (ecoule - base));
        }
        g.actions.push({ type: step.type, by: step.by, champion: champion || null });
        if (g.actions.length >= SEQUENCE.length) {
          g.done = true;
          g.phaseStartedAt = null;
          g.phaseEndsAt = null;
          if (s.format.fearless) {
            g.actions.forEach(function(a) {
              if (a.type === "pick" && a.champion) s.usedChampions.push(a.champion);
            });
          }
          if (s.gameIndex >= s.format.bo - 1) s.status = "done";
        } else {
          armerChrono(s, g, now);
        }
        return s;
      }
      __name(avancer, "avancer");
      function apply(state, op, now) {
        var type = op && op.type;
        if (type === "start") {
          if (state.status !== "lobby") return err(state, "La draft a d\xE9j\xE0 d\xE9marr\xE9");
          var s = clone(state);
          var g = s.games[s.gameIndex];
          s.status = "running";
          g.reserve = { first: s.format.reserveSeconds * 1e3, second: s.format.reserveSeconds * 1e3 };
          armerChrono(s, g, now);
          return ok(s);
        }
        if (type === "select") {
          var step = currentStep(state);
          if (!step) return err(state, "Aucune action attendue");
          if (op.by !== step.by) return err(state, "Ce n'est pas au " + (op.by === "first" ? "1er" : "2nd") + " drafteur de jouer");
          if (!op.champion) return err(state, "Champion manquant");
          if (unavailable(state)[op.champion]) return err(state, op.champion + " n'est plus disponible");
          return ok(avancer(clone(state), now, op.champion));
        }
        if (type === "timeout") {
          var stepT = currentStep(state);
          if (!stepT) return err(state, "Aucune action en cours");
          var gT = state.games[state.gameIndex];
          if (now < gT.phaseEndsAt) return err(state, "Le temps n'est pas \xE9coul\xE9");
          return ok(avancer(clone(state), now, null));
        }
        if (type === "nextGame") {
          var gN = state.games[state.gameIndex];
          if (!gN.done) return err(state, "La game en cours n'est pas termin\xE9e");
          if (state.gameIndex >= state.format.bo - 1) return err(state, "Le BO est termin\xE9");
          var sN = clone(state);
          sN.gameIndex++;
          sN.games.push(createGame());
          var nouvelle = sN.games[sN.gameIndex];
          nouvelle.reserve = { first: sN.format.reserveSeconds * 1e3, second: sN.format.reserveSeconds * 1e3 };
          sN.status = "running";
          armerChrono(sN, nouvelle, now);
          return ok(sN);
        }
        if (type === "replay") {
          if (state.format.bo !== 1) return err(state, "Rejouer n'est possible qu'en BO1");
          var sR = clone(state);
          sR.games = [createGame()];
          sR.gameIndex = 0;
          sR.usedChampions = [];
          sR.status = "lobby";
          return ok(sR);
        }
        if (type === "configure") {
          if (state.status !== "lobby") return err(state, "On ne change pas les r\xE8gles en pleine draft");
          var sC = clone(state);
          if (op.firstSide === "blue" || op.firstSide === "red") {
            sC.sides = { first: op.firstSide, second: op.firstSide === "blue" ? "red" : "blue" };
          }
          if (op.turnSeconds != null) sC.format.turnSeconds = op.turnSeconds;
          if (op.reserveSeconds != null) sC.format.reserveSeconds = op.reserveSeconds;
          return ok(sC);
        }
        return err(state, "Op\xE9ration inconnue : " + type);
      }
      __name(apply, "apply");
      return {
        SEQUENCE,
        createGame,
        createState,
        currentStep,
        unavailable,
        apply
      };
    });
  }
});

// .wrangler/tmp/bundle-bcxDK3/middleware-loader.entry.ts
init_modules_watch_stub();

// .wrangler/tmp/bundle-bcxDK3/middleware-insertion-facade.js
init_modules_watch_stub();

// src/index.js
init_modules_watch_stub();
var import_draft_engine = __toESM(require_draft_engine(), 1);

// src/auth.js
init_modules_watch_stub();
function base64urlEnBytes(s) {
  const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const comble = b64 + "=".repeat((4 - b64.length % 4) % 4);
  const brut = atob(comble);
  const out = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
  return out;
}
__name(base64urlEnBytes, "base64urlEnBytes");
async function verifyToken(token, secret) {
  try {
    if (!token || typeof token !== "string" || !secret) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const cle = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valide = await crypto.subtle.verify(
      "HMAC",
      cle,
      base64urlEnBytes(sig),
      new TextEncoder().encode(data)
    );
    if (!valide) return null;
    const body = JSON.parse(new TextDecoder().decode(base64urlEnBytes(data)));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1e3)) return null;
    return body;
  } catch (_) {
    return null;
  }
}
__name(verifyToken, "verifyToken");
function orgOfToken(payload) {
  return payload && payload.org || payload && payload.u || null;
}
__name(orgOfToken, "orgOfToken");

// src/index.js
var DraftRoom = class {
  static {
    __name(this, "DraftRoom");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  /* L'identité est attachée à la socket (tag) et non gardée en mémoire : elle survit
     ainsi à l'hibernation du Durable Object. */
  infos(ws) {
    try {
      return JSON.parse(this.state.getTags(ws)[0] || "{}");
    } catch (_) {
      return {};
    }
  }
  async lireEtat() {
    return await this.state.storage.get("etat") || null;
  }
  async ecrireEtat(e) {
    await this.state.storage.put("etat", e);
  }
  async fetch(request) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    const boBrut = parseInt(url.searchParams.get("bo") || "1", 10);
    const payload = await verifyToken(token, this.env.SESSION_SECRET);
    if (!payload) return new Response("non authentifi\xE9", { status: 401 });
    const org = orgOfToken(payload);
    const proprietaire = await this.state.storage.get("org");
    if (!proprietaire) await this.state.storage.put("org", org);
    else if (proprietaire !== org) return new Response("salle d'une autre structure", { status: 403 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("websocket attendu", { status: 426 });
    }
    let etat = await this.lireEtat();
    if (!etat) {
      etat = import_draft_engine.default.createState({ bo: boBrut === 3 || boBrut === 5 ? boBrut : 1, firstSide: "blue" });
      await this.ecrireEtat(etat);
    }
    const paire = new WebSocketPair();
    const [client, serveur] = Object.values(paire);
    this.state.acceptWebSocket(serveur, [JSON.stringify({ u: payload.u, org })]);
    serveur.send(JSON.stringify({ type: "state", state: etat }));
    this.diffuserPresence();
    return new Response(null, { status: 101, webSocket: client });
  }
  diffuser(message, sauf) {
    const brut = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      if (ws === sauf) continue;
      try {
        ws.send(brut);
      } catch (_) {
      }
    }
  }
  diffuserPresence() {
    const gens = this.state.getWebSockets().map((ws) => this.infos(ws).u).filter(Boolean);
    this.diffuser({ type: "presence", users: [...new Set(gens)] });
  }
  async webSocketMessage(ws, brut) {
    let msg;
    try {
      msg = JSON.parse(brut);
    } catch (_) {
      return;
    }
    if (msg.type === "cursor") {
      this.diffuser({ type: "cursor", from: this.infos(ws).u, x: msg.x, y: msg.y }, ws);
      return;
    }
    if (msg.type !== "op") return;
    const etat = await this.lireEtat();
    if (!etat) return;
    const r = import_draft_engine.default.apply(etat, msg.op, Date.now());
    if (r.error) {
      ws.send(JSON.stringify({ type: "error", message: r.error }));
      return;
    }
    await this.ecrireEtat(r.state);
    this.diffuser({ type: "state", state: r.state });
  }
  async webSocketClose() {
    this.diffuserPresence();
  }
  async webSocketError() {
    this.diffuserPresence();
  }
};
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{6,64})$/);
    if (!m) return new Response("introuvable", { status: 404 });
    const id = env.DRAFT_ROOMS.idFromName(m[1]);
    return env.DRAFT_ROOMS.get(id).fetch(request);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
init_modules_watch_stub();
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_modules_watch_stub();
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-bcxDK3/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
init_modules_watch_stub();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-bcxDK3/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  DraftRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
