// GET /api/cron-snapshot — collecte quotidienne (déclenchée par le cron Vercel)
// Protégé par CRON_SECRET. Parcourt les rosters suivis, récupère les stats Solo Q
// brutes (throttlé) et stocke un snapshot du jour par roster.
const { upstash } = require('./_auth');

const PLATFORM_TO_REGIONAL = {
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia', oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
};
const TIER_IDX = { IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const THROTTLE = 220; // ms entre appels Riot (clé personnelle)

async function riot(url, key) {
  try {
    const r = await fetch(url, { headers: { 'X-Riot-Token': key } });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

// Récupère les stats brutes Solo Q d'un joueur (les entrées de calcProspectScore)
async function fetchPlayerRaw(pseudo, tag, server, key) {
  const regional = PLATFORM_TO_REGIONAL[server] || 'europe';
  const acc = await riot('https://' + regional + '.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' + encodeURIComponent(pseudo) + '/' + encodeURIComponent(tag || 'EUW'), key);
  await sleep(THROTTLE);
  if (!acc || !acc.puuid) return null;
  const league = await riot('https://' + server + '.api.riotgames.com/lol/league/v4/entries/by-puuid/' + acc.puuid, key);
  await sleep(THROTTLE);
  const entries = Array.isArray(league) ? league : (league && league.entries) || [];
  const soloQ = entries.find(e => e.queueType === 'RANKED_SOLO_5x5');
  const tier = soloQ ? soloQ.tier : null;
  const lp = soloQ ? (soloQ.leaguePoints || 0) : 0;
  const ids = await riot('https://' + regional + '.api.riotgames.com/lol/match/v5/matches/by-puuid/' + acc.puuid + '/ids?queue=420&count=8&type=ranked', key);
  await sleep(THROTTLE);
  let n = 0, w = 0, kS = 0, dS = 0, aS = 0, csT = 0, durT = 0, visT = 0, dmgT = 0, kp = 0;
  if (Array.isArray(ids)) {
    for (const mid of ids.slice(0, 6)) {
      const m = await riot('https://' + regional + '.api.riotgames.com/lol/match/v5/matches/' + mid, key);
      await sleep(THROTTLE);
      const info = m && m.info; if (!info) continue;
      const p = (info.participants || []).find(x => x.puuid === acc.puuid); if (!p) continue;
      const dur = (info.gameDuration || 0) / 60; if (dur < 5) continue;
      const team = (info.participants || []).filter(x => x.teamId === p.teamId);
      const tk = team.reduce((s, x) => s + (x.kills || 0), 0);
      const td = team.reduce((s, x) => s + (x.totalDamageDealtToChampions || 0), 0);
      n++; if (p.win) w++; kS += p.kills || 0; dS += p.deaths || 0; aS += p.assists || 0;
      csT += (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0); durT += dur;
      visT += (p.visionScore || 0) / dur;
      dmgT += td ? (p.totalDamageDealtToChampions || 0) / td * 100 : 0;
      kp += tk ? ((p.kills || 0) + (p.assists || 0)) / tk * 100 : 0;
    }
  }
  // WR : préférer le ranked officiel (wins/losses) sinon les matchs analysés
  let wr = null;
  if (soloQ && (soloQ.wins != null) && (soloQ.losses != null) && (soloQ.wins + soloQ.losses) > 0) {
    wr = Math.round(soloQ.wins / (soloQ.wins + soloQ.losses) * 100);
  } else if (n) { wr = Math.round(w / n * 100); }
  return {
    tier: tier, lp: lp, wr: wr,
    kda: n ? +((kS + aS) / Math.max(1, dS)).toFixed(2) : null,
    csMin: durT ? +(csT / durT).toFixed(2) : null,
    visMin: n ? +(visT / n).toFixed(2) : null,
    killPart: n ? +(kp / n).toFixed(1) : null,
    dmgShare: n ? +(dmgT / n).toFixed(1) : null
  };
}

function todayUTC() { return new Date().toISOString().slice(0, 10); }

module.exports = async function handler(req, res) {
  // Authentification du cron
  const secret = process.env.CRON_SECRET || '';
  const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query && req.query.secret) || '';
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Non autorisé' });

  const key = process.env.RIOT_API_KEY;
  if (!key) return res.status(500).json({ error: 'RIOT_API_KEY non configurée' });

  try {
    const usersRes = await upstash(['SMEMBERS', 'vs_track_users']);
    const users = (usersRes && usersRes.result) || [];
    let players = 0, rosters = 0;
    const today = todayUTC();

    for (const u of users) {
      const tr = await upstash(['GET', 'vs_track:' + u]);
      let list; try { list = JSON.parse((tr && tr.result) || '[]'); } catch (_) { list = []; }
      for (const r of list) {
        const snapPlayers = [];
        for (const pl of (r.players || [])) {
          if (!pl.pseudo) continue;
          const raw = await fetchPlayerRaw(pl.pseudo, pl.tag, pl.server || 'euw1', key);
          if (raw) snapPlayers.push(Object.assign({ role: pl.role, pseudo: pl.pseudo }, raw));
          players++;
        }
        if (!snapPlayers.length) continue;
        const snapKey = 'vs_snaps:' + u + ':' + r.rosterId;
        const cur = await upstash(['GET', snapKey]);
        let snaps; try { snaps = JSON.parse((cur && cur.result) || '[]'); } catch (_) { snaps = []; }
        // 1 point/jour : remplace si un snapshot du jour existe déjà
        snaps = snaps.filter(s => (s.date || '').slice(0, 10) !== today);
        snaps.push({ date: new Date().toISOString(), players: snapPlayers });
        if (snaps.length > 90) snaps.splice(0, snaps.length - 90);
        await upstash(['SET', snapKey, JSON.stringify(snaps)]);
        rosters++;
      }
    }
    return res.status(200).json({ ok: true, users: users.length, rosters, players });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
