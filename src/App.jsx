import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Crown, Trophy, Skull, Play, Pause, SkipForward, X, Swords, Wind, Search, ChevronRight, Lock, CheckCircle2, Zap, Award, ListOrdered, Maximize2, ArrowUpDown, Settings, Save, FolderOpen, Trash2, Plus, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

/* =====================================================================================
   VALORES PADRÃO — tudo isso agora também pode ser editado dentro do app, na aba
   "Configurações". O que está aqui só define o estado inicial na primeira vez que o
   app abre (ou quando não há nada salvo ainda).
   ===================================================================================== */
const DEFAULT_CONFIG = {
  totalPlayers: 100,        // quantos jogadores disputam o campeonato
  matchesPerDay: 6,         // partidas por dia
  totalDays: 2,             // quantidade de dias do campeonato
  matchLengthMinutes: 25,   // duração de cada partida, em minutos
  endgameStartMinute: 15,   // a partir de qual minuto a fase vira "ENDGAME"
  killPoints: 4,            // pontos ganhos por eliminação (sem limite de kills)
};
const DEFAULT_TEAM_SIZE = 2; // 1 = solo, 2 = dupla, 3 = trio, 4 = esquadrão

// Chave dos campeonatos salvos manualmente (com nome, na aba Configurações)
const SAVES_KEY = "fncs_saved_championships";
// Chave do progresso salvo automaticamente (o campeonato "atual", sem precisar dar nome)
const AUTOSAVE_KEY = "fncs_autosave_v1";

/* ============================== PALETTE / TOKENS ============================== */
const C = {
  void: "#0A0D14",
  panel: "#11151F",
  panel2: "#161B27",
  line: "#232A3A",
  purple: "#8B6CFF",
  purpleDim: "#4A3D8F",
  cyan: "#31E6C6",
  gold: "#FFB627",
  red: "#FF4D5E",
  text: "#EBEFF8",
  dim: "#7C8598",
  dim2: "#525A6E",
};

/* ============================== NOMES PADRÃO DOS JOGADORES ==============================
   Lista inicial. Dentro do app, aba "Configurações" -> "Nomes dos jogadores", dá pra editar
   isso direto (um nome por linha) sem mexer em código.
   =================================================================================== */
const DEFAULT_NAMES = [
  "Mack", "Diguera", "Lewa", "Romero", "KBR", "Pingu", "916Gon", "Night",
  "pardal", "señor seeyun", "Myst", "Caio", "edson", "Phzin", "Teuzz", "KING",
  "Randu", "Grx", "kaykywhale", "Lorde", "Pietriinnn", "renat0", "Fishy", "Wolfie",
  "fazer", "K1nG", "Nuti", "Gabzera", "Nahuxwq", "Sirence", "letz", "Azizis",
  "Rafast", "Puzera", "Monsterz", "K2G Jayaguǃ", "Arthurbc", "Felpsz Betrayed", "nickzrr", "EdRoadToGlory",
  "Thiaz", "kosov", "softy abreu1x.", "fdfsaxx157", "TIGERSYM 3ǃ", "cshiftm3m4", "Barroso", "Paulinyache32",
  "Xeat", "Scarpa", "Gonzalo", "Hazzense", "Marinn", "clemxntǃ", "pietrofn6", "Vinizin",
  "THEFELOZ 6", "Jxnes", "DETECT cavera", "beastylörrach", "Seven", "axadasz", "CLW", "Parkyn",
  "BG FINAL BOSS", "nxtftn", "killerkjj", "Nicksreyn", "Lucx", "Kitoz", "vadeyy", "Sanku",
  "alands3ǃ", "lex ramafíshyfvǃ", "eduzz semones", "Azulfv", "Pedrin", "Carlin", "izuki", "nov1ce",
  "Retlaw", "iMeyfishy", "Andrxzin", "nahu", "Tisco", "Cadu", "riqueessj.", "Chap",
  "Cauее", "kaduzinrr", "Mvxy", "Corvalan", "Deadgameplays157", "welcomebosshouse", "fxbin", "Winsler",
  "Peterpepabot", "BLST mends", "Sad1x", "ViGuiLa777"
];

// Limites do multiplicador de força individual. 1.0 = nível regular/padrão.
const MIN_SKILL = 0.3;
const MAX_SKILL = 2.5;
function clampSkill(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_SKILL, Math.max(MIN_SKILL, n));
}
function skillLabel(v) {
  if (v < 0.5) return "Muito fraco";
  if (v < 0.8) return "Fraco";
  if (v < 0.95) return "Abaixo da média";
  if (v <= 1.05) return "Regular";
  if (v <= 1.3) return "Bom";
  if (v <= 1.7) return "Ótimo";
  return "Elite";
}
function skillColor(v) {
  if (v < 0.8) return C.dim2;
  if (v <= 1.05) return C.dim;
  if (v <= 1.3) return C.cyan;
  if (v <= 1.7) return C.purple;
  return C.gold;
}

// Interpreta uma linha colada como "Nome, força" (aceita vírgula, dois-pontos, tab ou
// espaço como separador, e tanto ponto quanto vírgula como separador decimal do número).
function parseSkillLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(.*?)[\s,;:\t|]+([0-9]+(?:[.,][0-9]+)?)\s*x?$/i);
  if (!m) return null;
  const name = m[1].trim().replace(/[,:;|-]+$/, "").trim();
  let numStr = m[2];
  if (numStr.includes(",") && !numStr.includes(".")) numStr = numStr.replace(",", ".");
  else numStr = numStr.replace(/,/g, "");
  const value = parseFloat(numStr);
  if (!name || !Number.isFinite(value)) return null;
  return { name, value };
}

function generatePlayers(count, names, skills) {
  const pool = names && names.length ? names : DEFAULT_NAMES;
  const players = [];
  for (let i = 0; i < count; i++) {
    const name = pool[i % pool.length];
    players.push({
      id: `p${players.length + 1}`,
      name,
      hue: Math.floor(Math.random() * 360),
      skill: clampSkill(skills && skills[name]),
    });
  }
  return players;
}

/* ============================== SISTEMA DE PONTUAÇÃO ==============================
   Sistema CUMULATIVO: os pontos vão se somando conforme o jogador sobrevive e
   ultrapassa cada faixa de colocação. Dá pra editar isso na aba "Configurações"
   (seção "Sistema de pontuação"), ou mudando este array padrão:
   - { from, to, bonus }         -> soma "bonus" UMA VEZ quando o jogador alcança
                                      a colocação "to" (ex.: bônus de top 75).
   - { from, to, pointsPerPlace } -> soma "pointsPerPlace" para CADA posição
                                      sobrevivida dentro da faixa.
   A lista deve ir da pior colocação (maior número) pra melhor (1º lugar).
   =================================================================================== */
const DEFAULT_PLACEMENT_RULES = [
  { from: 6, to: 25, pointsPerPlace: 2 },
  { from: 2, to: 5, pointsPerPlace: 4 },
  { from: 1, to: 1, bonus: 9 },
];

function buildPlacementPoints(rules, maxPlayers) {
  const points = new Array(maxPlayers + 1).fill(0);
  let running = 0;
  for (let place = maxPlayers; place >= 1; place--) {
    for (const rule of rules) {
      if (place < rule.from || place > rule.to) continue;
      if (rule.pointsPerPlace !== undefined) running += rule.pointsPerPlace;
      if (rule.bonus !== undefined && place === rule.to) running += rule.bonus;
    }
    points[place] = running;
  }
  return points;
}

function rulesToDraft(rules) {
  const stamp = Date.now();
  return rules.map((r, i) => ({
    id: `r${i}_${stamp}`,
    from: r.from,
    to: r.to,
    type: r.pointsPerPlace !== undefined ? "perPlace" : "bonus",
    value: r.pointsPerPlace !== undefined ? r.pointsPerPlace : (r.bonus ?? 0),
  }));
}

function draftToRules(draftRules) {
  return draftRules
    .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.from > 0 && r.to > 0)
    .map((r) => (r.type === "bonus"
      ? { from: Math.min(r.from, r.to), to: Math.max(r.from, r.to), bonus: r.value }
      : { from: Math.min(r.from, r.to), to: Math.max(r.from, r.to), pointsPerPlace: r.value }));
}

/* ============================== FORMATO DO CAMPEONATO ============================== */
function scopeOptionsFor(totalDays) {
  return [
    ...Array.from({ length: totalDays }, (_, d) => ({ id: `day${d + 1}`, label: `Dia ${d + 1}` })),
    { id: "total", label: "Acumulado" },
  ];
}

/* ============================== MATCH ENGINE ============================== */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function phaseLabel(minute, endgameStart) {
  if (minute <= Math.round(endgameStart * 0.2)) return "Rota de Voo / Looting";
  if (minute <= Math.round(endgameStart * 0.55)) return "Tempestade — Fase 1-2";
  if (minute < endgameStart) return "Tempestade — Fase 3-4";
  return "ENDGAME";
}

// Curva-alvo de "quantos jogadores devem estar vivos" a cada minuto — controla o ritmo
// da partida. Definida como frações do tempo total e da lobby, então se adapta sozinha
// a mudanças de total de jogadores / duração / início do endgame.
function buildCurve(matchLength, endgameStart, totalPlayers) {
  const endgameFraction = Math.min(0.9, endgameStart / matchLength);
  const fractions = [
    [0, 1.00],
    [endgameFraction * 0.33, 0.85],
    [endgameFraction * 0.66, 0.68],
    [endgameFraction, 0.50],
    [endgameFraction + (1 - endgameFraction) * 0.25, 0.35],
    [endgameFraction + (1 - endgameFraction) * 0.45, 0.20],
    [endgameFraction + (1 - endgameFraction) * 0.65, 0.10],
    [endgameFraction + (1 - endgameFraction) * 0.80, 0.04],
    [endgameFraction + (1 - endgameFraction) * 0.90, 0.02],
    [1, 0],
  ];
  return fractions.map(([tFrac, aFrac], i) => [
    Math.round(tFrac * matchLength),
    i === fractions.length - 1 ? 1 : Math.max(2, Math.round(aFrac * totalPlayers)),
  ]);
}
function targetAlive(t, curve, matchLength, totalPlayers) {
  if (t <= 0) return totalPlayers;
  if (t >= matchLength) return 1;
  for (let i = 0; i < curve.length - 1; i++) {
    const [t0, a0] = curve[i], [t1, a1] = curve[i + 1];
    if (t >= t0 && t <= t1) return a0 + (a1 - a0) * ((t - t0) / Math.max(1, t1 - t0));
  }
  return 1;
}

function buildTeams(players, teamSize) {
  const teams = [];
  for (let i = 0; i < players.length; i += teamSize) {
    const members = players.slice(i, i + teamSize);
    teams.push({
      id: `t${teams.length + 1}`,
      name: members.map((p) => p.name).join(" + "),
      hue: members[0]?.hue || 0,
      memberIds: members.map((p) => p.id),
    });
  }
  return teams;
}

function simulateMatch(playerIds, teams, params) {
  const { matchLength, endgameStart, curve, totalPlayers, killPoints, placementPointsFn, playersById = {} } = params;
  const killsCount = {};
  const teamAliveCount = {};

  // Força individual de cada jogador (multiplicador em torno de 1.0, definido em Configurações -> Força dos jogadores).
  const skillOf = (id) => {
    const s = playersById[id]?.skill;
    return Number.isFinite(s) && s > 0 ? s : 1;
  };

  playerIds.forEach((id) => (killsCount[id] = 0));
  teams.forEach((team) => {
    teamAliveCount[team.id] = team.memberIds.length;
  });

  // Cada equipe possui seu próprio conjunto de jogadores vivos.
  // Isso impede que o motor trate uma Dupla/Trio/Esquadrão como vários solos.
  const aliveByTeam = {};
  teams.forEach((team) => {
    aliveByTeam[team.id] = [...team.memberIds];
  });

  const eliminationOrder = [];
  const teamEliminationOrder = [];
  const timeline = [];
  let minute = 0;
  const milestoneFractions = [0.5, 0.25, 0.1, 0.05, 0.03, 0.02, 0.01];
  const teamCount = teams.length;
  const thresholds = Array.from(new Set(milestoneFractions.map((f) => Math.max(1, Math.round(f * teamCount))))).sort((a, b) => b - a);
  let thPointer = 0;

  const getAliveTeams = () => teams.filter((team) => (aliveByTeam[team.id]?.length || 0) > 0);
  const getAlivePlayers = () => Object.values(aliveByTeam).flat();

  // Força da equipe: quantidade de integrantes vivos pesa bastante, mas a força individual
  // (skill) de cada um também conta — uma dupla com um jogador muito forte vence mais confrontos
  // do que uma dupla equivalente só de jogadores medianos.
  const teamStrength = (team) => {
    const aliveIds = aliveByTeam[team.id] || [];
    const n = aliveIds.length;
    if (!n) return 0;
    const avgSkill = aliveIds.reduce((sum, id) => sum + skillOf(id), 0) / n;
    // Expoente da força aumentado (1.35 -> 2.2): a força de um jogador engloba não só o
    // dano/mira, mas também a "visão de jogo" (posicionamento, decisão de quando lutar
    // ou fugir, etc.), então uma diferença de força agora pesa bem mais no resultado.
    return Math.pow(n, 1.65) * Math.pow(Math.max(0.05, avgSkill), 2.2);
  };

  function weightedPick(list, weightFn) {
    if (!list.length) return null;
    const weights = list.map((x) => Math.max(0.001, weightFn(x)));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < list.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  // Igual ao weightedPick, mas devolve o ÍNDICE — usado para tirar um jogador de dentro de
  // uma lista de ids vivos (aliveByTeam[...]) com splice, favorecendo jogadores mais fracos
  // como vítimas e jogadores mais fortes como autores da eliminação.
  function weightedPickIndex(ids, weightFn) {
    if (!ids.length) return -1;
    const weights = ids.map((id) => Math.max(0.001, weightFn(id)));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < ids.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return i;
    }
    return ids.length - 1;
  }
  // Dentro da equipe que está perdendo o confronto, o jogador mais fraco tem mais chance de ser
  // a vítima. Dentro da equipe vencedora, o jogador mais forte tem mais chance de ficar com o kill.
  const pickVictimIndex = (ids) => weightedPickIndex(ids, (id) => 1 / Math.pow(skillOf(id), 1.7));
  const pickKillerId = (ids) => (ids.length ? ids[weightedPickIndex(ids, (id) => Math.pow(skillOf(id), 1.7))] : null);

  // Escolhe o perdedor do confronto. A vantagem é baseada na força das equipes vivas
  // (teamStrength, que já leva a força/visão de jogo de cada jogador em conta), mas nunca
  // chega a 100%, para manter alguma imprevisibilidade mesmo num confronto muito desigual.
  function chooseLosingTeam(a, b) {
    const sa = teamStrength(a);
    const sb = teamStrength(b);
    const aWinChance = 0.05 + 0.9 * (sa / Math.max(0.001, sa + sb));
    return Math.random() < aWinChance ? b : a;
  }

  // Quantos jogadores o perdedor perde no confronto. Equipes pequenas ficam
  // mais expostas a serem totalmente eliminadas, enquanto equipes completas
  // normalmente perdem apenas 1 integrante por troca.
  function casualtiesFor(loser, winner) {
    const ln = aliveByTeam[loser.id].length;
    const wn = aliveByTeam[winner.id].length;
    if (ln <= 1) return 1;

    const disadvantage = Math.max(0, wn - ln) / Math.max(1, wn);
    let chanceTwo = 0.10 + disadvantage * 0.55;
    if (ln === 2) chanceTwo += 0.12;
    if (ln >= 4) chanceTwo -= 0.04;

    let casualties = Math.random() < chanceTwo ? 2 : 1;
    if (ln >= 4 && wn >= 4 && Math.random() < 0.08) casualties = 3;
    return Math.min(casualties, ln);
  }

  // Curva de jogadores vivos convertida em uma meta de equipes, mas com
  // tolerância para não quebrar equipes artificialmente.
  while (getAlivePlayers().length > 1 && minute < matchLength) {
    minute++;
    const alivePlayersNow = getAlivePlayers().length;
    const targetPlayers = Math.max(1, Math.round(targetAlive(minute, curve, matchLength, totalPlayers)));

    // Aproxima a quantidade de eliminações desejada para este minuto.
    // A unidade real da simulação continua sendo o confronto entre equipes.
    let desiredElims = Math.round(alivePlayersNow - targetPlayers) + randInt(-1, 1);
    desiredElims = Math.max(1, desiredElims);
    desiredElims = Math.min(desiredElims, Math.max(1, alivePlayersNow - 1));

    const events = [];
    let safety = 0;

    while (events.length < desiredElims && getAlivePlayers().length > 1 && safety < desiredElims * 5 + 10) {
      safety++;
      const battleTeams = getAliveTeams();
      if (battleTeams.length <= 1) break;

      // Equipes com poucos vivos têm maior chance de entrar em confronto.
      // Isso evita muitos solos sobrevivendo por vários minutos.
      const teamA = weightedPick(battleTeams, (team) => {
        const n = aliveByTeam[team.id].length;
        return 1 / Math.pow(n, 0.55);
      });
      const opponents = battleTeams.filter((t) => t.id !== teamA.id);
      const teamB = weightedPick(opponents, (team) => {
        const n = aliveByTeam[team.id].length;
        return 1 / Math.pow(n, 0.55);
      });
      if (!teamA || !teamB) break;

      const loser = chooseLosingTeam(teamA, teamB);
      const winner = loser.id === teamA.id ? teamB : teamA;
      let casualties = casualtiesFor(loser, winner);

      // No final da partida, a equipe em desvantagem tem risco maior de ser
      // completamente eliminada. Isso torna a sobrevivência solo rara.
      const remainingTeams = battleTeams.length;
      if (remainingTeams <= 4 && aliveByTeam[loser.id].length <= 2 && Math.random() < 0.55) {
        casualties = aliveByTeam[loser.id].length;
      }

      // Se o número de eliminações desejado já foi atingido, não criamos mortes extras.
      casualties = Math.min(casualties, desiredElims - events.length);
      casualties = Math.min(casualties, aliveByTeam[loser.id].length);
      if (casualties <= 0) break;

      // Integrantes da mesma equipe não se matam entre si. O vencedor do
      // confronto fornece os eliminadores, mantendo a lógica de equipe.
      for (let c = 0; c < casualties; c++) {
        const victimList = aliveByTeam[loser.id];
        if (!victimList.length) break;
        const victimIdx = pickVictimIndex(victimList);
        const victimId = victimList.splice(victimIdx, 1)[0];

        const winnerAlive = aliveByTeam[winner.id] || [];
        const killerId = pickKillerId(winnerAlive);

        if (killerId) killsCount[killerId]++;
        teamAliveCount[loser.id]--;
        eliminationOrder.push({ id: victimId, minute, killerId, teamId: loser.id });
        events.push({ victimId, killerId, teamId: loser.id });

        if (teamAliveCount[loser.id] === 0) {
          teamEliminationOrder.push({ teamId: loser.id, minute });
          break;
        }
      }
    }

    // Se houver pouquíssimas equipes, garantimos que a partida continue
    // progredindo sem transformar todos os sobreviventes em solos aleatórios.
    if (!events.length && getAlivePlayers().length > 1) {
      const battleTeams = getAliveTeams();
      if (battleTeams.length > 1) {
        const a = weightedPick(battleTeams, (team) => 1 / Math.pow(aliveByTeam[team.id].length, 0.55));
        const b = weightedPick(battleTeams.filter((t) => t.id !== a.id), (team) => 1 / Math.pow(aliveByTeam[team.id].length, 0.55));
        const loser = chooseLosingTeam(a, b);
        const winner = loser.id === a.id ? b : a;
        const victimList = aliveByTeam[loser.id];
        const victimId = victimList.splice(pickVictimIndex(victimList), 1)[0];
        const winnerAlive = aliveByTeam[winner.id];
        const killerId = pickKillerId(winnerAlive);
        if (killerId) killsCount[killerId]++;
        teamAliveCount[loser.id]--;
        eliminationOrder.push({ id: victimId, minute, killerId, teamId: loser.id });
        events.push({ victimId, killerId, teamId: loser.id });
        if (teamAliveCount[loser.id] === 0) teamEliminationOrder.push({ teamId: loser.id, minute });
      }
    }

    const alivePlayersAfter = getAlivePlayers();
    const aliveTeamIds = new Set(getAliveTeams().map((t) => t.id));
    const milestones = [];
    while (thPointer < thresholds.length && aliveTeamIds.size <= thresholds[thPointer]) {
      milestones.push(thresholds[thPointer]);
      thPointer++;
    }
    timeline.push({
      minute,
      phase: phaseLabel(minute, endgameStart),
      events,
      milestones,
      aliveAfter: alivePlayersAfter.length,
      teamsAliveAfter: aliveTeamIds.size,
    });
  }

  // Endgame: sempre através de confrontos entre as equipes restantes.
  while (getAliveTeams().length > 1) {
    minute++;
    const battleTeams = getAliveTeams();
    const a = battleTeams.slice().sort((x, y) => teamStrength(y) - teamStrength(x))[0];
    const b = weightedPick(battleTeams.filter((t) => t.id !== a.id), (team) => 1 / Math.pow(aliveByTeam[team.id].length, 0.55));
    const loser = chooseLosingTeam(a, b);
    const winner = loser.id === a.id ? b : a;
    const victimList = aliveByTeam[loser.id];
    const casualties = Math.min(casualtiesFor(loser, winner), victimList.length);
    const events = [];

    for (let c = 0; c < casualties; c++) {
      if (!victimList.length) break;
      const victimId = victimList.splice(pickVictimIndex(victimList), 1)[0];
      const winnerAlive = aliveByTeam[winner.id];
      const killerId = pickKillerId(winnerAlive);
      if (killerId) killsCount[killerId]++;
      teamAliveCount[loser.id]--;
      eliminationOrder.push({ id: victimId, minute, killerId, teamId: loser.id });
      events.push({ victimId, killerId, teamId: loser.id });
    }

    if (teamAliveCount[loser.id] === 0) teamEliminationOrder.push({ teamId: loser.id, minute });
    const aliveTeamIds = new Set(getAliveTeams().map((t) => t.id));
    timeline.push({ minute, phase: "ENDGAME", events, milestones: [], aliveAfter: getAlivePlayers().length, teamsAliveAfter: aliveTeamIds.size });
  }

  // Última equipe: seus integrantes continuam juntos até o fim. O campeão é
  // a equipe, e não um jogador escolhido aleatoriamente.
  const championTeam = getAliveTeams()[0] || teams.find((t) => teamAliveCount[t.id] > 0) || teams[0];
  const championTeamId = championTeam.id;

  const teamPlacementOrder = [
    championTeamId,
    ...teamEliminationOrder.slice().reverse().map((e) => e.teamId).filter((id, i, a) => a.indexOf(id) === i)
  ];
  const remainingTeams = teams.map((t) => t.id).filter((id) => !teamPlacementOrder.includes(id));
  teamPlacementOrder.push(...remainingTeams);

  const teamResults = teamPlacementOrder.map((teamId, idx) => {
    const team = teams.find((t) => t.id === teamId);
    const place = idx + 1;
    const memberResults = team.memberIds.map((id) => ({ id, teamId, place, kills: killsCount[id] || 0 }));
    const kills = memberResults.reduce((sum, r) => sum + r.kills, 0);
    return {
      id: teamId,
      teamId,
      name: team.name,
      hue: team.hue,
      memberIds: team.memberIds,
      members: memberResults,
      place,
      kills,
      points: placementPointsFn(place) + kills * killPoints
    };
  });
  const memberResults = teamResults.flatMap((t) => t.members.map((m) => ({ ...m, teamName: t.name, teamPoints: t.points })));
  return { timeline, results: teamResults, memberResults, durationMinutes: minute };
}

// tabela ao vivo: no modo em equipe, a classificação mostra as equipes.
function buildLiveTable(current, revealedCount, teams, playersById, placementPointsFn, killPoints) {
  const teamCount = teams.length;
  if (!current || revealedCount === 0) {
    return teams.map((team) => ({ id: team.id, name: team.name, hue: team.hue, memberIds: team.memberIds, alive: true, champion: false, kills: 0, points: 0, placement: null }));
  }

  const killsSoFar = {};
  Object.keys(playersById).forEach((id) => (killsSoFar[id] = 0));
  const eliminatedOrderIds = [];
  for (let i = 0; i < revealedCount; i++) {
    current.timeline[i].events.forEach((e) => {
      eliminatedOrderIds.push(e.victimId);
      if (e.killerId) killsSoFar[e.killerId] = (killsSoFar[e.killerId] || 0) + 1;
    });
  }

  const eliminatedSet = new Set(eliminatedOrderIds);
  const teamRows = teams.map((team) => {
    const aliveMembers = team.memberIds.filter((id) => !eliminatedSet.has(id));
    const kills = team.memberIds.reduce((sum, id) => sum + (killsSoFar[id] || 0), 0);
    return { team, aliveMembers, kills };
  });
  const aliveTeams = teamRows.filter((r) => r.aliveMembers.length > 0);
  const eliminatedTeams = teamRows
    .filter((r) => r.aliveMembers.length === 0)
    .sort((a, b) => {
      const aLast = Math.max(...a.team.memberIds.map((id) => eliminatedOrderIds.lastIndexOf(id)));
      const bLast = Math.max(...b.team.memberIds.map((id) => eliminatedOrderIds.lastIndexOf(id)));
      return aLast - bLast;
    });

  const eliminatedRows = eliminatedTeams.map((r, i) => {
    const lastElim = [...eliminatedOrderIds].reverse().find((id) => r.team.memberIds.includes(id));
    const teamPlacement = teamCount - i;
    return {
      id: r.team.id, name: r.team.name, hue: r.team.hue, memberIds: r.team.memberIds,
      alive: false, champion: false, kills: r.kills,
      placement: teamPlacement, points: placementPointsFn(teamPlacement) + r.kills * killPoints,
      lastEliminatedMember: lastElim,
    };
  }).reverse();

  const livePlacementPoints = placementPointsFn(aliveTeams.length);
  const aliveRows = aliveTeams.map((r) => ({
    id: r.team.id, name: r.team.name, hue: r.team.hue, memberIds: r.team.memberIds,
    alive: true, champion: false, kills: r.kills, points: livePlacementPoints + r.kills * killPoints, placement: null,
  })).sort((a, b) => b.points - a.points || b.kills - a.kills);

  if (aliveTeams.length === 1) {
    const r = aliveTeams[0];
    aliveRows.splice(0, 1, { id: r.team.id, name: r.team.name, hue: r.team.hue, memberIds: r.team.memberIds, alive: false, champion: true, kills: r.kills, placement: 1, points: placementPointsFn(1) + r.kills * killPoints });
  }
  return [...aliveRows, ...eliminatedRows];
}

/* ============================== SMALL UI PIECES ============================== */
function Avatar({ name, hue, size = 28 }) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${hue},70%,45%), hsl(${(hue + 40) % 360},70%,30%))`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Rajdhani, sans-serif", fontWeight: 700, color: "#fff",
      fontSize: size * 0.38, letterSpacing: "0.5px",
    }}>{initials}</div>
  );
}

function PlacementBadge({ place }) {
  let bg = C.panel2, color = C.dim, icon = null;
  if (place === 1) { bg = "rgba(255,182,39,0.15)"; color = C.gold; icon = <Crown size={12} />; }
  else if (place <= 3) { bg = "rgba(255,182,39,0.08)"; color = C.gold; }
  else if (place <= 10) { bg = "rgba(139,108,255,0.12)"; color = C.purple; }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, background: bg, color,
      borderRadius: 6, padding: "2px 8px", fontFamily: "Rajdhani, sans-serif",
      fontWeight: 700, fontSize: 13, minWidth: 34, justifyContent: "center",
    }}>{icon}#{place}</span>
  );
}

function LivePill() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(49,230,198,0.1)", color: C.cyan,
      borderRadius: 6, padding: "2px 8px", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 11,
      minWidth: 34, justifyContent: "center", textTransform: "uppercase", letterSpacing: "0.5px",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.cyan, animation: "pulseGold 1s infinite" }} />
      vivo
    </span>
  );
}

function DeadPill() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(82,90,110,0.15)", color: C.dim2,
      borderRadius: 6, padding: "2px 8px", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 11,
      minWidth: 34, justifyContent: "center", textTransform: "uppercase", letterSpacing: "0.5px",
    }}>
      <Skull size={10} /> fora
    </span>
  );
}

/* ============================== TEAM MODAL ============================== */
function TeamModal({ team, current, currentRev, playersById, onClose }) {
  const deathMap = {};
  const killsMap = {};
  if (current) {
    for (let i = 0; i < currentRev; i++) {
      const entry = current.timeline[i];
      entry.events.forEach((ev) => {
        if (ev.killerId) killsMap[ev.killerId] = (killsMap[ev.killerId] || 0) + 1;
        if (team.memberIds.includes(ev.victimId)) {
          deathMap[ev.victimId] = { minute: entry.minute, killerId: ev.killerId };
        }
      });
    }
  }

  const memberStats = team.memberIds.map((id) => {
    const player = playersById[id];
    const death = deathMap[id];
    const kills = killsMap[id] || 0;
    return { player, death, kills };
  });

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(5,6,10,0.78)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, width: "100%",
        maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={team.name} hue={team.hue} size={44} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20 }}>{team.name}</div>
              <div style={{ color: C.dim, fontSize: 12 }}>Detalhes da equipe · Partida {current ? "em andamento" : "não iniciada"}</div>
            </div>
            <button onClick={onClose} style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.dim, borderRadius: 7, padding: "5px 9px", cursor: "pointer" }}>✕</button>
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.line}`, display: "flex", gap: 18 }}>
          <div><div style={{ fontFamily: "Teko, sans-serif", fontSize: 26, color: C.gold }}>{current?.results?.find((r) => r.id === team.id)?.kills || 0}</div><div style={{ color: C.dim, fontSize: 10, textTransform: "uppercase" }}>kills da equipe</div></div>
          <div><div style={{ fontFamily: "Teko, sans-serif", fontSize: 26, color: C.cyan }}>{memberStats.filter((m) => !m.death).length}</div><div style={{ color: C.dim, fontSize: 10, textTransform: "uppercase" }}>jogadores vivos</div></div>
          <div><div style={{ fontFamily: "Teko, sans-serif", fontSize: 26, color: C.purple }}>{memberStats.filter((m) => m.death).length}</div><div style={{ color: C.dim, fontSize: 10, textTransform: "uppercase" }}>eliminados</div></div>
        </div>

        <div style={{ overflowY: "auto", padding: "8px 0" }}>
          {memberStats.map(({ player, death, kills }) => (
            <div key={player.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderBottom: `1px solid ${C.line}` }}>
              <Avatar name={player.name} hue={player.hue} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{player.name}</div>
                <div style={{ color: death ? C.dim2 : C.cyan, fontSize: 11, marginTop: 2 }}>
                  {death ? `Eliminado no minuto ${death.minute}${death.killerId && playersById[death.killerId] ? ` · por ${playersById[death.killerId].name}` : " · tempestade"}` : "VIVO"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.dim, fontSize: 12 }}><Skull size={12} /> {kills}</div>
              {death ? <DeadPill /> : <LivePill />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================== PLAYER MODAL ============================== */
function PlayerModal({ player, matchesData, onClose }) {
  const rows = [];
  matchesData.forEach((m, idx) => {
    if (!m) return;
    const r = m.memberResults?.find((x) => x.id === player.id);
    if (r) rows.push({ match: idx + 1, ...r });
  });
  const totalPts = rows.reduce((s, r) => s + (r.teamPoints ?? 0), 0);
  const totalKills = rows.reduce((s, r) => s + r.kills, 0);
  const avgPlace = rows.length ? (rows.reduce((s, r) => s + r.place, 0) / rows.length).toFixed(1) : "-";
  const wins = rows.filter((r) => r.place === 1).length;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(5,6,10,0.75)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, width: "100%",
        maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={player.name} hue={player.hue} size={44} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20, color: C.text }}>{player.name}</div>
            <div style={{ fontFamily: "Rajdhani, sans-serif", color: C.dim, fontSize: 13 }}>{rows.length} partida{rows.length !== 1 ? "s" : ""} jogada{rows.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: C.line }}>
          {[["Pontos", totalPts, C.gold], ["Kills", totalKills, C.red], ["Vitórias", wins, C.cyan], ["Colocação Média", avgPlace, C.purple]].map(([label, val, col]) => (
            <div key={label} style={{ background: C.panel2, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontFamily: "Teko, sans-serif", fontSize: 28, color: col, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: C.dim, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ overflowY: "auto", padding: "8px 0" }}>
          {rows.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.dim, fontFamily: "Rajdhani, sans-serif" }}>Ainda não disputou nenhuma partida.</div>}
          {rows.map((r) => (
            <div key={r.match} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", fontFamily: "Rajdhani, sans-serif" }}>
              <div style={{ width: 70, color: C.dim, fontSize: 13 }}>Partida {r.match}</div>
              <PlacementBadge place={r.place} />
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.text, fontSize: 13, width: 60 }}><Skull size={12} color={C.red} /> {r.kills}</div>
              <div style={{ marginLeft: "auto", fontWeight: 700, color: C.gold, fontSize: 15 }}>{r.teamPoints ?? 0} pts</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================== MODAL DE EQUIPE (classificação) ==============================
   Usado quando se clica numa linha da tabela de classificação (que representa a equipe inteira
   em modo dupla/trio/esquadrão). Mostra as estatísticas da equipe já SOMADAS (pontos e kills dos
   dois/três/quatro integrantes juntos) — antes o clique abria só o jogador em memberIds[0].
   =================================================================================== */
function TeamStandingsModal({ team, matchesData, playersById, onClose }) {
  const rows = [];
  matchesData.forEach((m, idx) => {
    if (!m) return;
    const r = m.results?.find((x) => x.id === team.id);
    if (r) rows.push({ match: idx + 1, place: r.place, kills: r.kills, points: r.points });
  });
  const totalPts = rows.reduce((s, r) => s + (r.points ?? 0), 0);
  const totalKills = rows.reduce((s, r) => s + r.kills, 0);
  const wins = rows.filter((r) => r.place === 1).length;
  const avgPlace = rows.length ? (rows.reduce((s, r) => s + r.place, 0) / rows.length).toFixed(1) : "-";
  const members = team.memberIds.map((id) => playersById[id]).filter(Boolean);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(5,6,10,0.75)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, width: "100%",
        maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={team.name} hue={team.hue} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20, color: C.text }}>{team.name}</div>
            <div style={{ fontFamily: "Rajdhani, sans-serif", color: C.dim, fontSize: 13 }}>
              Equipe ({members.length} jogador{members.length !== 1 ? "es" : ""}) · {rows.length} partida{rows.length !== 1 ? "s" : ""} jogada{rows.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: C.line }}>
          {[["Pontos", totalPts, C.gold], ["Kills", totalKills, C.red], ["Vitórias", wins, C.cyan], ["Colocação Média", avgPlace, C.purple]].map(([label, val, col]) => (
            <div key={label} style={{ background: C.panel2, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontFamily: "Teko, sans-serif", fontSize: 28, color: col, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: C.dim, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 20px", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
          {members.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 20, padding: "3px 10px 3px 4px" }}>
              <Avatar name={p.name} hue={p.hue} size={20} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</span>
            </div>
          ))}
        </div>
        <div style={{ overflowY: "auto", padding: "8px 0" }}>
          {rows.length === 0 && <div style={{ padding: 24, textAlign: "center", color: C.dim, fontFamily: "Rajdhani, sans-serif" }}>Ainda não disputou nenhuma partida.</div>}
          {rows.map((r) => (
            <div key={r.match} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", fontFamily: "Rajdhani, sans-serif" }}>
              <div style={{ width: 70, color: C.dim, fontSize: 13 }}>Partida {r.match}</div>
              <PlacementBadge place={r.place} />
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.text, fontSize: 13, width: 60 }}><Skull size={12} color={C.red} /> {r.kills}</div>
              <div style={{ marginLeft: "auto", fontWeight: 700, color: C.gold, fontSize: 15 }}>{r.points ?? 0} pts</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================== CLASSIFICAÇÃO (cálculo, com suporte a partida ao vivo) ==============================
   `liveOverlay` (opcional) = { idx, rows } — quando informado, a partida `idx` usa os
   pontos PARCIAIS de `rows` (vindos de buildLiveTable) em vez de esperar ela terminar.
   É isso que faz a tabela de classificação atualizar minuto a minuto.
   =================================================================================== */
function computeStandings(teams, players, matchesData, matchDone, indices, liveOverlay) {
  const map = {};
  teams.forEach((team) => (map[team.id] = { ...team, points: 0, kills: 0, wins: 0, played: 0, placeSum: 0, top10: 0, top25: 0 }));
  indices.forEach((idx) => {
    if (liveOverlay && liveOverlay.idx === idx) {
      liveOverlay.rows.forEach((r) => {
        const row = map[r.id];
        if (!row) return;
        row.points += r.points;
        row.kills += r.kills;
        if (r.placement) {
          row.played += 1;
          row.placeSum += r.placement;
          if (r.placement === 1) row.wins += 1;
          if (r.placement <= 10) row.top10 += 1;
          if (r.placement <= 25) row.top25 += 1;
        }
      });
      return;
    }
    const m = matchesData[idx];
    if (!m || !matchDone[idx]) return;
    m.results.forEach((r) => {
      const row = map[r.id];
      if (!row) return;
      row.points += r.points;
      row.kills += r.kills;
      row.played += 1;
      row.placeSum += r.place;
      if (r.place === 1) row.wins += 1;
      if (r.place <= 10) row.top10 += 1;
      if (r.place <= 25) row.top25 += 1;
    });
  });
  return Object.values(map)
    .map((r) => ({ ...r, avgKills: r.played ? r.kills / r.played : 0, avgPlacement: r.played ? r.placeSum / r.played : null }))
    .sort((a, b) => b.points - a.points || b.kills - a.kills);
}

/* ============================== SCOPE TOGGLE (Dia 1 / Dia 2 / Acumulado) ============================== */
function ScopeToggle({ scope, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 4, background: C.panel2, borderRadius: 8, padding: 3, border: `1px solid ${C.line}` }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          flex: 1, padding: "6px 8px", borderRadius: 6, border: "none", cursor: "pointer",
          background: scope === o.id ? C.purple : "transparent", color: scope === o.id ? "#fff" : C.dim,
          fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

/* ============================== FULL STANDINGS MODAL ============================== */
function FullStandingsModal({ standings, scope, scopeOptions, scopeLabel, onScopeChange, onClose, onSelect, liveAliveById, liveMatchNumber }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("points");
  const [sortDir, setSortDir] = useState("desc");

  const cols = [
    { key: "points", label: "Pontos" },
    { key: "played", label: "Partidas" },
    { key: "wins", label: "Vitórias" },
    { key: "top10", label: "Top 10" },
    { key: "kills", label: "Kills" },
    { key: "avgKills", label: "Média Kills" },
    { key: "avgPlacement", label: "Média Colocação" },
  ];

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir(key === "avgPlacement" ? "asc" : "desc"); }
  }

  const rows = useMemo(() => {
    let list = q ? standings.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : standings.slice();
    list = list.slice().sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortDir === "asc" ? Infinity : -Infinity);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [standings, q, sortKey, sortDir]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(5,6,10,0.8)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, width: "100%",
        maxWidth: 980, height: "min(88vh, 760px)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Trophy size={18} color={C.gold} />
          <div style={{ fontFamily: "Teko, sans-serif", fontSize: 24, letterSpacing: "0.5px" }}>TABELA — {scopeLabel.toUpperCase()}</div>
          <div style={{ width: 220 }}><ScopeToggle scope={scope} onChange={onScopeChange} options={scopeOptions} /></div>
          {liveAliveById && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7,
              background: "rgba(49,230,198,0.1)", border: `1px solid rgba(49,230,198,0.3)`,
              fontFamily: "Rajdhani, sans-serif", fontSize: 11.5, fontWeight: 700, color: C.cyan, whiteSpace: "nowrap",
            }}><LiveStatusDot alive={true} /> Partida {liveMatchNumber} ao vivo</span>
          )}
          <div style={{ position: "relative", marginLeft: "auto" }}>
            <Search size={14} color={C.dim} style={{ position: "absolute", left: 9, top: 9 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar equipe..." style={{
              background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, width: 200,
              padding: "7px 10px 7px 30px", color: C.text, fontFamily: "Rajdhani, sans-serif", fontSize: 13, outline: "none",
            }} />
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Rajdhani, sans-serif" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: C.panel, zIndex: 1 }}>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.dim2, textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${C.line}` }}>#</th>
                <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, color: C.dim2, textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${C.line}` }}>Jogador</th>
                {liveAliveById && (
                  <th style={{ textAlign: "center", padding: "8px 10px", fontSize: 11, color: C.dim2, textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>Nesta partida</th>
                )}
                {cols.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} style={{
                    textAlign: "right", padding: "8px 10px", fontSize: 11, color: sortKey === c.key ? C.purple : C.dim2,
                    textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${C.line}`, cursor: "pointer", whiteSpace: "nowrap",
                  }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{c.label}<ArrowUpDown size={10} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const rank = standings.indexOf(p) + 1;
                return (
                  <tr key={p.id} onClick={() => onSelect(p)} style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.panel2)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "7px 10px", fontFamily: "Teko, sans-serif", fontSize: 17, color: rank === 1 ? C.gold : rank <= 3 ? C.purple : C.dim }}>{rank}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar name={p.name} hue={p.hue} size={24} />
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</span>
                      </div>
                    </td>
                    {liveAliveById && (
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        {liveAliveById[p.id] ? <LivePill /> : <DeadPill />}
                      </td>
                    )}
                    <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "Teko, sans-serif", fontSize: 18, color: C.gold }}>{p.points}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 13 }}>{p.played}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 13, color: p.wins > 0 ? C.gold : C.dim }}>{p.wins}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 13 }}>{p.top10}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 13, color: C.red }}>{p.kills}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 13 }}>{p.avgKills.toFixed(1)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 13 }}>{p.avgPlacement ? p.avgPlacement.toFixed(1) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================== LIVE STATUS DOT ============================== */
function LiveStatusDot({ alive }) {
  return (
    <span
      title={alive ? "Ainda vivo na partida em andamento" : "Já eliminado na partida em andamento"}
      style={{
        width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
        background: alive ? C.cyan : C.dim2,
        border: alive ? "none" : `1px solid ${C.dim}`,
        animation: alive ? "pulseGold 1s infinite" : "none",
      }}
    />
  );
}

/* ============================== STANDINGS SIDEBAR ============================== */
function Standings({ standings, scope, scopeOptions, scopeLabel, onScopeChange, completedInScope, totalInScope, onSelect, onExpand, onHistory, liveAliveById, liveMatchNumber }) {
  const [q, setQ] = useState("");
  const filtered = q ? standings.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : standings;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, color: C.text, fontSize: 14, letterSpacing: "1px", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <Trophy size={15} color={C.gold} /> Classificação
          </div>
          <div style={{display:"flex",gap:5}}>
            <button onClick={onExpand} title="Expandir tabela completa" style={{
              background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6, padding: 5, cursor: "pointer", color: C.dim, display: "flex",
            }}><Maximize2 size={13} /></button>
            <button onClick={onHistory} title="Histórico da classificação" style={{
              background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: C.dim, fontWeight: 800, fontSize: 10,
            }}>HIST.</button>
          </div>
        </div>
        <div style={{ fontFamily: "Rajdhani, sans-serif", color: C.dim, fontSize: 12, marginTop: 2 }}>{completedInScope}/{totalInScope} partidas concluídas · {scopeLabel}</div>
        <div style={{ marginTop: 10 }}>
          <ScopeToggle scope={scope} onChange={onScopeChange} options={scopeOptions} />
        </div>
        {liveAliveById && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "6px 8px",
            background: "rgba(49,230,198,0.08)", border: `1px solid rgba(49,230,198,0.3)`, borderRadius: 8,
          }}>
            <LiveStatusDot alive={true} />
            <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: C.cyan, fontWeight: 700 }}>
              Partida {liveMatchNumber} ao vivo — pontos atualizando a cada minuto
            </span>
          </div>
        )}
        <div style={{ position: "relative", marginTop: 10 }}>
          <Search size={14} color={C.dim} style={{ position: "absolute", left: 9, top: 9 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar equipe..." style={{
            width: "100%", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8,
            padding: "7px 10px 7px 30px", color: C.text, fontFamily: "Rajdhani, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box",
          }} />
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "0 8px 12px" }}>
        {filtered.map((p) => {
          const rank = standings.indexOf(p) + 1;
          const isAliveNow = liveAliveById ? liveAliveById[p.id] : null;
          return (
            <div key={p.id} onClick={() => onSelect(p)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, cursor: "pointer",
              opacity: isAliveNow === false ? 0.6 : 1,
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.panel2)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ width: 20, textAlign: "center", fontFamily: "Teko, sans-serif", fontSize: 16, color: rank === 1 ? C.gold : rank <= 3 ? C.purple : C.dim }}>{rank}</div>
              <Avatar name={p.name} hue={p.hue} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 600, color: isAliveNow === false ? C.dim2 : C.text, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
              </div>
              {p.wins > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, color: C.gold, fontSize: 11, fontFamily: "Rajdhani, sans-serif" }}><Crown size={10} />{p.wins}</div>}
              {isAliveNow !== null && <LiveStatusDot alive={isAliveNow} />}
              <div style={{ fontFamily: "Teko, sans-serif", fontSize: 20, color: C.gold, minWidth: 34, textAlign: "right" }}>{p.points}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================== STORM RING ============================== */
function StormRing({ alive, total }) {
  const pct = Math.max(0, Math.min(1, alive / total));
  const deg = pct * 360;
  return (
    <div style={{
      width: 140, height: 140, borderRadius: "50%", position: "relative", flexShrink: 0,
      background: `conic-gradient(${C.purple} ${deg}deg, ${C.panel2} ${deg}deg)`,
      display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.5s ease",
    }}>
      <div style={{
        width: 114, height: 114, borderRadius: "50%", background: C.panel,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `1px solid ${C.line}`,
      }}>
        <div style={{ fontFamily: "Teko, sans-serif", fontSize: 46, color: C.text, lineHeight: 0.9 }}>{alive}</div>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "1px" }}>vivos</div>
      </div>
    </div>
  );
}

/* ============================== BIG MATCH TABLE ============================== */
function MatchTable({ rows, playersById, onSelect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", fontFamily: "Rajdhani, sans-serif",
        fontSize: 11, fontWeight: 700, color: C.dim2, textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${C.line}`,
      }}>
        <div style={{ width: 44 }}>Status</div>
        <div style={{ width: 26 }} />
        <div style={{ flex: 1 }}>Equipe</div>
        <div style={{ width: 60 }}>Kills</div>
        <div style={{ width: 60, textAlign: "right" }}>Pontos</div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "4px 6px" }}>
        {rows.map((r) => {
          const p = playersById[r.id];
          const isTop = r.placement && r.placement === 1;
          return (
            <div key={r.id} onClick={() => onSelect(p)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 8, cursor: "pointer",
              borderLeft: isTop ? `3px solid ${C.gold}` : r.placement && r.placement <= 10 ? `3px solid ${C.purple}` : "3px solid transparent",
              background: isTop ? "rgba(255,182,39,0.06)" : "transparent", marginBottom: 1,
              opacity: r.alive ? 1 : 0.62,
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = isTop ? "rgba(255,182,39,0.1)" : C.panel2)}
              onMouseLeave={(e) => (e.currentTarget.style.background = isTop ? "rgba(255,182,39,0.06)" : "transparent")}
            >
              <div style={{ width: 44 }}>{r.alive ? <LivePill /> : r.placement ? <PlacementBadge place={r.placement} /> : <DeadPill />}</div>
              <Avatar name={p.name} hue={p.hue} size={24} />
              <div style={{ flex: 1, fontFamily: "Rajdhani, sans-serif", fontWeight: 600, color: r.alive ? C.text : C.dim2, fontSize: 13.5 }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.dim, fontSize: 13, fontFamily: "Rajdhani, sans-serif", width: 60 }}><Skull size={12} /> {r.kills}</div>
              <div style={{ width: 60, textAlign: "right", fontFamily: "Teko, sans-serif", fontSize: 19, color: r.alive ? C.dim : C.gold }}>
                {r.points}{r.alive && <span style={{ fontSize: 10, color: C.dim2, marginLeft: 2 }}>*</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "6px 14px", fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: C.dim2, borderTop: `1px solid ${C.line}` }}>
        * pontuação parcial (apenas kills) — a pontuação de colocação é definida quando a equipe é eliminada ou vence. Nomes esmaecidos = equipe já eliminada.
      </div>
    </div>
  );
}

/* ============================== PREMIAÇÃO TAB ============================== */
function PremiacaoTab({ totalPlayers, killPoints, scoringBands, placementPointsFn }) {
  const [showFull, setShowFull] = useState(false);
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Award size={20} color={C.gold} />
        <div style={{ fontFamily: "Teko, sans-serif", fontSize: 30, letterSpacing: "0.5px" }}>PREMIAÇÃO POR COLOCAÇÃO</div>
      </div>
      <div style={{ color: C.dim, fontSize: 14, marginBottom: 18 }}>
        Sistema <b style={{ color: C.text }}>cumulativo</b>: os pontos vão se somando conforme o jogador sobrevive e passa de faixa em faixa,
        mais <b style={{ color: C.text }}>+{killPoints} pontos por eliminação</b>, sem limite de kills. Edite tudo isso na aba Configurações.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: 16 }}>
        {scoringBands.map((b) => (
          <div key={b.label} style={{
            background: C.panel2, border: `1px solid ${b.from === 1 ? C.gold : C.line}`, borderRadius: 12, padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: b.from === 1 ? C.gold : C.text, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 13.5 }}>
              {b.from === 1 && <Crown size={13} />} {b.label}
            </div>
            <div style={{ fontFamily: "Teko, sans-serif", fontSize: 28, color: b.from === 1 ? C.gold : C.purple, lineHeight: 1 }}>
              {b.minPts === b.maxPts ? b.maxPts : `${b.minPts}–${b.maxPts}`}<span style={{ fontSize: 13, color: C.dim, marginLeft: 4 }}>pts</span>
            </div>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11.5, color: C.dim2 }}>{b.rule}</div>
          </div>
        ))}
        <div style={{
          background: "rgba(255,77,94,0.08)", border: `1px solid ${C.red}`, borderRadius: 12, padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.red, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 13.5 }}>
            <Skull size={13} /> Cada eliminação
          </div>
          <div style={{ fontFamily: "Teko, sans-serif", fontSize: 28, color: C.red, lineHeight: 1 }}>+{killPoints}<span style={{ fontSize: 13, color: C.dim, marginLeft: 4 }}>pts</span></div>
          <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11.5, color: C.dim2 }}>por posição, sem acúmulo</div>
        </div>
      </div>

      <button onClick={() => setShowFull((s) => !s)} style={{
        background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, padding: "8px 14px",
        fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
      }}><ListOrdered size={14} /> {showFull ? "Ocultar" : "Ver"} tabela completa (1º ao {totalPlayers}º)</button>

      {showFull && (
        <div style={{ marginTop: 12, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 12, maxHeight: 360, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 1, padding: 10 }}>
            {Array.from({ length: totalPlayers }, (_, i) => i + 1).map((place) => (
              <div key={place} style={{
                display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 4px", borderRadius: 6,
                background: place === 1 ? "rgba(255,182,39,0.1)" : "transparent",
              }}>
                <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: C.dim }}>#{place}</div>
                <div style={{ fontFamily: "Teko, sans-serif", fontSize: 20, color: place === 1 ? C.gold : C.text }}>{placementPointsFn(place)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== HISTÓRICO DA CLASSIFICAÇÃO ============================== */
function StandingsHistoryModal({ players, teamSize, matchesData, matchDone, totalMatches, onClose, onSelect }) {
  const [selectedMatch, setSelectedMatch] = useState(0);
  const [referenceMatch, setReferenceMatch] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (selectedMatch === 0) {
      setReferenceMatch(null);
    } else {
      setReferenceMatch((current) => {
        if (current == null || current >= selectedMatch || !matchDone[current]) return selectedMatch - 1;
        return current;
      });
    }
  }, [selectedMatch, matchDone]);

  const current = useMemo(() => computeStandings(buildTeams(players, teamSize), players, matchesData, matchDone, Array.from({length: selectedMatch + 1}, (_, i) => i), null), [players, teamSize, matchesData, matchDone, selectedMatch]);
  const reference = useMemo(() => referenceMatch == null ? [] : computeStandings(buildTeams(players, teamSize), players, matchesData, matchDone, Array.from({length: referenceMatch + 1}, (_, i) => i), null), [players, teamSize, matchesData, matchDone, referenceMatch]);
  const referenceRank = useMemo(() => Object.fromEntries(reference.map((p, i) => [p.id, i + 1])), [reference]);

  const rows = useMemo(() => current.map((p, i) => {
    const rank = i + 1;
    const old = referenceRank[p.id] ?? null;
    return {...p, rank, movement: old == null ? null : old - rank};
  }).filter(p => {
    const q = search.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q);
  }), [current, referenceRank, search]);

  return <div style={{position:"fixed",inset:0,zIndex:80,background:"rgba(5,6,10,.88)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{width:"min(1100px,96vw)",maxHeight:"90vh",background:C.panel,border:`1px solid ${C.line}`,borderRadius:12,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.line}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontFamily:"Teko,sans-serif",fontSize:28}}>HISTÓRICO DA CLASSIFICAÇÃO</div><div style={{fontSize:12,color:C.dim}}>Compare qualquer classificação com uma tabela de referência.</div></div>
        <button onClick={onClose} style={{background:C.panel2,border:`1px solid ${C.line}`,color:C.text,borderRadius:7,padding:"7px 12px",cursor:"pointer",fontWeight:700}}>FECHAR</button>
      </div>
      <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.line}`,display:"flex",gap:6,flexWrap:"wrap"}}>
        {Array.from({length:totalMatches},(_,i)=> <button key={i} disabled={!matchDone[i]} onClick={()=>{if(matchDone[i]){setSelectedMatch(i);setSearch("");}}} style={{background:selectedMatch===i?C.purple:C.panel2,border:`1px solid ${selectedMatch===i?C.purple:C.line}`,color:matchDone[i]?C.text:C.dim2,borderRadius:6,padding:"5px 9px",cursor:matchDone[i]?"pointer":"not-allowed",fontWeight:700,fontSize:11}}>{i+1}</button>)}
      </div>
      <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.line}`,display:"flex",gap:8,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar equipe..." style={{flex:"1 1 250px",background:C.panel2,border:`1px solid ${C.line}`,borderRadius:7,padding:"8px 10px",color:C.text,outline:"none"}} />
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:C.dim,fontWeight:700,whiteSpace:"nowrap"}}>TABELA DE REFERÊNCIA:</span>
          <select value={referenceMatch == null ? "" : referenceMatch} disabled={selectedMatch === 0} onChange={e=>setReferenceMatch(e.target.value === "" ? null : Number(e.target.value))} style={{background:C.panel2,border:`1px solid ${C.line}`,borderRadius:7,padding:"8px 10px",color:C.text}}>
            {selectedMatch === 0 && <option value="">Nenhuma</option>}
            {Array.from({length:selectedMatch},(_,i)=>i).filter(i=>matchDone[i]).map(i=><option key={i} value={i}>Após a Partida {i+1}</option>)}
          </select>
        </div>
        {search && <button onClick={()=>setSearch("")} style={{background:C.panel2,border:`1px solid ${C.line}`,color:C.dim,borderRadius:7,padding:"7px 10px",cursor:"pointer"}}>LIMPAR</button>}
      </div>
      <div style={{padding:"8px 18px",fontSize:12,color:C.dim}}>Partida {selectedMatch+1} · {rows.length} equipe(s){referenceMatch != null ? ` · MOV. calculado em relação à Partida ${referenceMatch+1}` : " · selecione uma tabela de referência para calcular o movimento"}</div>
      <div style={{overflow:"auto",padding:"0 18px 18px"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{position:"sticky",top:0,background:C.panel2}}>
          {['#','JOGADOR','MOV.','PONTOS','PARTIDAS','WINS','TOP 10','KILLS'].map((h,i)=><th key={h} style={{padding:"9px 10px",textAlign:i<2?"left":"right",color:C.dim,fontSize:11}}>{h}</th>)}
        </tr></thead><tbody>
          {rows.map(p=><tr key={p.id} style={{borderTop:`1px solid ${C.line}`}}>
            <td style={{padding:"7px 10px",fontFamily:"Teko,sans-serif",fontSize:20}}>{p.rank}</td>
            <td onClick={()=>onSelect(p)} style={{padding:"7px 10px",fontWeight:700,cursor:"pointer"}}>{p.name}</td>
            <td style={{padding:"7px 10px",textAlign:"right",fontWeight:800}}>{p.movement==null?<span style={{color:C.dim2}}>—</span>:p.movement>0?<span style={{color:C.cyan}}>↑ {p.movement}</span>:p.movement<0?<span style={{color:C.red}}>↓ {Math.abs(p.movement)}</span>:<span style={{color:C.dim}}>—</span>}</td>
            <td style={{padding:"7px 10px",textAlign:"right",color:C.gold,fontFamily:"Teko,sans-serif",fontSize:19}}>{p.points}</td><td style={{padding:"7px 10px",textAlign:"right"}}>{p.played}</td><td style={{padding:"7px 10px",textAlign:"right"}}>{p.wins}</td><td style={{padding:"7px 10px",textAlign:"right"}}>{p.top10}</td><td style={{padding:"7px 10px",textAlign:"right",color:C.red}}>{p.kills}</td>
          </tr>)}
          {!rows.length && <tr><td colSpan={8} style={{padding:35,textAlign:"center",color:C.dim}}>Nenhum jogador encontrado.</td></tr>}
        </tbody></table>
      </div>
    </div>
  </div>;
}

/* ============================== ESTILOS COMPARTILHADOS DA ABA CONFIGURAÇÕES ============================== */
const cardStyle = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "18px 20px", marginBottom: 16 };
const labelStyle = { display: "block", fontSize: 11, color: C.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5 };
const inputStyle = { width: "100%", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontFamily: "Rajdhani, sans-serif", fontSize: 14, outline: "none", boxSizing: "border-box" };
const smallInputStyle = { ...inputStyle, width: 72, textAlign: "center", padding: "6px 6px" };
const primaryBtnStyle = { background: `linear-gradient(135deg, ${C.purple}, #5B3FE0)`, border: "none", color: "#fff", padding: "10px 18px", borderRadius: 9, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 };
const secondaryBtnStyle = { background: C.panel2, border: `1px solid ${C.line}`, color: C.text, padding: "10px 16px", borderRadius: 9, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" };

function NumberField({ label, value, onChange, min = 0 }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" min={min} value={value} onChange={(e) => onChange(Number(e.target.value))} style={inputStyle} />
    </div>
  );
}

/* ============================== ABA CONFIGURAÇÕES ============================== */
function ConfigTab({
  draftConfig, setDraftConfig, mode, onModeChange,
  draftNamesText, setDraftNamesText,
  draftRules, onUpdateRule, onRemoveRule, onAddRule,
  draftSkills, onUpdateSkill, onResetSkills, onRandomizeSkills,
  onApply, onResetDraft, onNewChampionship,
  savesList, newSaveName, setNewSaveName, onSave, onLoad, onDelete,
}) {
  const nameCount = draftNamesText.split("\n").map((s) => s.trim()).filter(Boolean).length;
  const savesArr = Object.values(savesList).sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  const [skillSearch, setSkillSearch] = useState("");
  const [showBulkSkills, setShowBulkSkills] = useState(false);
  const [bulkSkillsText, setBulkSkillsText] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const uniqueNames = useMemo(() => {
    const list = draftNamesText.split("\n").map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set(list));
  }, [draftNamesText]);
  const filteredSkillNames = skillSearch ? uniqueNames.filter((n) => n.toLowerCase().includes(skillSearch.toLowerCase())) : uniqueNames;

  function applyBulkSkills() {
    const lines = bulkSkillsText.split("\n");
    const lowerMap = {};
    uniqueNames.forEach((n) => { lowerMap[n.toLowerCase()] = n; });
    let applied = 0;
    const notFound = [];
    lines.forEach((line) => {
      const parsed = parseSkillLine(line);
      if (!parsed) return;
      const actualName = lowerMap[parsed.name.toLowerCase()];
      if (actualName) {
        onUpdateSkill(actualName, parsed.value);
        applied++;
      } else {
        notFound.push(parsed.name);
      }
    });
    setBulkResult({ applied, notFound });
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 60px", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Settings size={20} color={C.purple} />
        <div style={{ fontFamily: "Teko, sans-serif", fontSize: 30, letterSpacing: "0.5px" }}>CONFIGURAÇÕES DO CAMPEONATO</div>
      </div>

      <div style={{ ...cardStyle, borderColor: "rgba(49,230,198,0.35)", background: "rgba(49,230,198,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 14, color: C.cyan }}>
          <Save size={15} /> Progresso salvo automaticamente
        </div>
        <div style={{ color: C.dim, fontSize: 12.5, marginTop: 6 }}>
          O campeonato atual (jogadores, partidas já disputadas e pontuação) é salvo sozinho a cada mudança neste navegador, então dar F5 ou fechar a aba não zera nada.
          (Fica salvo só neste navegador/dispositivo — não sincroniza entre computadores diferentes.) Use "Salvar campeonato atual" abaixo só se quiser guardar um snapshot com nome, para carregar depois além do progresso automático.
        </div>
        <button onClick={onNewChampionship} style={{ ...secondaryBtnStyle, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={13} /> Começar campeonato novo do zero
        </button>
      </div>

      <div style={cardStyle}>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Formato do campeonato</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
          <NumberField label="Total de jogadores" min={2} value={draftConfig.totalPlayers} onChange={(v) => setDraftConfig((d) => ({ ...d, totalPlayers: v }))} />
          <NumberField label="Partidas por dia" min={1} value={draftConfig.matchesPerDay} onChange={(v) => setDraftConfig((d) => ({ ...d, matchesPerDay: v }))} />
          <NumberField label="Quantidade de dias" min={1} value={draftConfig.totalDays} onChange={(v) => setDraftConfig((d) => ({ ...d, totalDays: v }))} />
          <NumberField label="Duração da partida (min)" min={1} value={draftConfig.matchLengthMinutes} onChange={(v) => setDraftConfig((d) => ({ ...d, matchLengthMinutes: v }))} />
          <NumberField label="Início do endgame (min)" min={1} value={draftConfig.endgameStartMinute} onChange={(v) => setDraftConfig((d) => ({ ...d, endgameStartMinute: v }))} />
          <NumberField label="Pontos por eliminação" min={0} value={draftConfig.killPoints} onChange={(v) => setDraftConfig((d) => ({ ...d, killPoints: v }))} />
          <div>
            <label style={labelStyle}>Modo de jogo</label>
            <select value={mode} onChange={onModeChange} style={inputStyle}>
              <option value={1}>Solo</option>
              <option value={2}>Dupla</option>
              <option value={3}>Trio</option>
              <option value={4}>Esquadrão</option>
            </select>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Nomes dos jogadores</div>
        <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 8 }}>
          Um nome por linha ({nameCount} cadastrado{nameCount !== 1 ? "s" : ""}). Se houver menos nomes do que jogadores, a lista se repete em ciclo.
        </div>
        <textarea value={draftNamesText} onChange={(e) => setDraftNamesText(e.target.value)} rows={10}
          style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, resize: "vertical" }} />
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 15 }}>Força dos jogadores</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setShowBulkSkills((s) => !s)} style={{ ...secondaryBtnStyle, padding: "5px 10px", fontSize: 11.5, borderColor: showBulkSkills ? C.purple : C.line, color: showBulkSkills ? C.purple : C.text }}>
              {showBulkSkills ? "Fechar colagem" : "Colar lista"}
            </button>
            <button onClick={onRandomizeSkills} style={{ ...secondaryBtnStyle, padding: "5px 10px", fontSize: 11.5 }}>Aleatorizar níveis</button>
            <button onClick={onResetSkills} style={{ ...secondaryBtnStyle, padding: "5px 10px", fontSize: 11.5 }}>Resetar tudo pra 1.00x</button>
          </div>
        </div>
        <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 10 }}>
          1.00x = nível regular. Jogadores mais fortes vencem mais confrontos e conseguem mais eliminações; dentro da mesma equipe,
          o integrante mais fraco costuma ser o primeiro a cair. O nível é vinculado ao <b style={{ color: C.text }}>nome</b> — se dois jogadores
          tiverem o mesmo nome, eles compartilham o nível.
        </div>

        {showBulkSkills && (
          <div style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8 }}>
              Cole uma lista, um jogador por linha, no formato <b style={{ color: C.text }}>Nome, força</b> (aceita vírgula, dois-pontos, tab ou
              espaço como separador — ex: <span style={{ fontFamily: "monospace", color: C.text }}>Mack, 1.5</span> ou{" "}
              <span style={{ fontFamily: "monospace", color: C.text }}>Diguera: 0.8</span>). Só nomes que já existem na lista de "Nomes dos jogadores" acima são atualizados.
            </div>
            <textarea
              value={bulkSkillsText}
              onChange={(e) => setBulkSkillsText(e.target.value)}
              rows={7}
              placeholder={"Mack, 1.5\nDiguera, 0.8\nLewa: 1.2"}
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12.5, resize: "vertical" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={applyBulkSkills} style={{ ...primaryBtnStyle, padding: "7px 14px", fontSize: 12.5 }}>Aplicar lista</button>
              {bulkResult && (
                <div style={{ fontSize: 12, color: bulkResult.notFound.length ? C.gold : C.cyan }}>
                  {bulkResult.applied} jogador{bulkResult.applied !== 1 ? "es" : ""} atualizado{bulkResult.applied !== 1 ? "s" : ""}
                  {bulkResult.notFound.length ? ` · ${bulkResult.notFound.length} não encontrado(s): ${bulkResult.notFound.slice(0, 5).join(", ")}${bulkResult.notFound.length > 5 ? "..." : ""}` : ""}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ position: "relative", marginBottom: 10 }}>
          <Search size={14} color={C.dim} style={{ position: "absolute", left: 9, top: 9 }} />
          <input value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} placeholder="Buscar jogador..." style={{ ...inputStyle, padding: "7px 10px 7px 30px" }} />
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
          {filteredSkillNames.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>Nenhum jogador encontrado.</div>}
          {filteredSkillNames.map((name) => {
            const val = clampSkill(draftSkills[name]);
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 10px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 120px", minWidth: 90, fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                <input type="range" min={MIN_SKILL} max={MAX_SKILL} step={0.05} value={val}
                  onChange={(e) => onUpdateSkill(name, Number(e.target.value))} style={{ flex: "2 1 120px", minWidth: 100, accentColor: C.purple }} />
                <div style={{ width: 52, textAlign: "right", fontFamily: "Teko, sans-serif", fontSize: 18, color: skillColor(val) }}>{val.toFixed(2)}x</div>
                <div style={{ width: 96, fontSize: 11, color: skillColor(val), textAlign: "right" }}>{skillLabel(val)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Sistema de pontuação por colocação</div>
        <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 10 }}>
          Faixas listadas da pior colocação pra melhor. "Bônus único" soma uma vez ao alcançar a colocação final da faixa; "por posição" soma a cada posição dentro da faixa.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {draftRules.map((r, idx) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 10px" }}>
              <span style={{ color: C.dim, fontSize: 12 }}>Do lugar</span>
              <input type="number" min={1} value={r.from} onChange={(e) => onUpdateRule(idx, { from: Number(e.target.value) })} style={smallInputStyle} />
              <span style={{ color: C.dim, fontSize: 12 }}>até</span>
              <input type="number" min={1} value={r.to} onChange={(e) => onUpdateRule(idx, { to: Number(e.target.value) })} style={smallInputStyle} />
              <select value={r.type} onChange={(e) => onUpdateRule(idx, { type: e.target.value })} style={{ ...inputStyle, width: 170 }}>
                <option value="perPlace">pontos por posição</option>
                <option value="bonus">bônus único</option>
              </select>
              <input type="number" value={r.value} onChange={(e) => onUpdateRule(idx, { value: Number(e.target.value) })} style={smallInputStyle} />
              <button onClick={() => onRemoveRule(idx)} title="Remover faixa" style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.red, borderRadius: 7, padding: 6, cursor: "pointer", display: "flex" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <button onClick={onAddRule} style={{ ...secondaryBtnStyle, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Adicionar faixa</button>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <button onClick={onApply} style={primaryBtnStyle}><CheckCircle2 size={15} /> Aplicar e reiniciar simulação</button>
        <button onClick={onResetDraft} style={secondaryBtnStyle}>Descartar alterações</button>
      </div>
      <div style={{ color: C.dim2, fontSize: 12, marginBottom: 24 }}>Aplicar reinicia todas as partidas do campeonato atual (jogadores, pontuação e formato mudam).</div>

      <div style={cardStyle}>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Campeonatos salvos com nome</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={newSaveName} onChange={(e) => setNewSaveName(e.target.value)} placeholder="Nome para este save..." style={{ ...inputStyle, flex: "1 1 220px" }} />
          <button onClick={onSave} disabled={!newSaveName.trim()} style={{ ...primaryBtnStyle, opacity: newSaveName.trim() ? 1 : 0.5, cursor: newSaveName.trim() ? "pointer" : "not-allowed" }}><Save size={14} /> Salvar campeonato atual</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginTop: 14 }}>
          {savesArr.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>Nenhum campeonato salvo com nome ainda.</div>}
          {savesArr.map((s) => (
            <div key={s.name} style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{s.savedAt ? new Date(s.savedAt).toLocaleString("pt-BR") : "data desconhecida"}</div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
                {s.mode === 1 ? "Solo" : s.mode === 2 ? "Dupla" : s.mode === 3 ? "Trio" : "Esquadrão"} · {s.config?.totalPlayers ?? "?"} jogadores · Dia {s.day || 1}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button onClick={() => onLoad(s.name)} style={{ ...secondaryBtnStyle, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}><FolderOpen size={13} /> Carregar</button>
                <button onClick={() => onDelete(s.name)} style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.red, borderRadius: 8, padding: "6px 9px", cursor: "pointer", display: "flex" }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================== APP ============================== */
export default function App() {
  const [mode, setMode] = useState(DEFAULT_TEAM_SIZE);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [playerNames, setPlayerNames] = useState(DEFAULT_NAMES);
  const [placementRules, setPlacementRules] = useState(DEFAULT_PLACEMENT_RULES);
  const [playerSkills, setPlayerSkills] = useState({}); // { nomeDoJogador: multiplicadorDeForça }

  const [draftConfig, setDraftConfig] = useState(DEFAULT_CONFIG);
  const [draftNamesText, setDraftNamesText] = useState(DEFAULT_NAMES.join("\n"));
  const [draftRules, setDraftRules] = useState(() => rulesToDraft(DEFAULT_PLACEMENT_RULES));
  const [draftSkills, setDraftSkills] = useState({});

  // campeonatos salvos manualmente (com nome) — carregados do armazenamento persistente ao montar
  const [savesList, setSavesList] = useState({});
  const [newSaveName, setNewSaveName] = useState("");

  // controla o carregamento inicial do progresso salvo automaticamente (evita "piscar" com dados padrão)
  const [loaded, setLoaded] = useState(false);
  const [showRestored, setShowRestored] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const autosaveTimer = useRef(null);

  const [players, setPlayers] = useState(() => generatePlayers(DEFAULT_CONFIG.totalPlayers, DEFAULT_NAMES));
  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const teams = useMemo(() => buildTeams(players, mode), [players, mode]);
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const playerIds = useMemo(() => players.map((p) => p.id), [players]);

  const totalMatches = useMemo(() => config.matchesPerDay * config.totalDays, [config.matchesPerDay, config.totalDays]);
  const dayIndices = useMemo(() => Array.from({ length: config.totalDays }, (_, d) =>
    Array.from({ length: config.matchesPerDay }, (_, m) => d * config.matchesPerDay + m)
  ), [config.totalDays, config.matchesPerDay]);
  const allIndices = useMemo(() => dayIndices.flat(), [dayIndices]);
  const scopeOptions = useMemo(() => scopeOptionsFor(config.totalDays), [config.totalDays]);
  const scopeToIndicesFn = useCallback((scope) => {
    if (scope === "total") return allIndices;
    const d = parseInt(scope.replace("day", ""), 10) - 1;
    return dayIndices[d] || allIndices;
  }, [dayIndices, allIndices]);

  const curve = useMemo(() => buildCurve(config.matchLengthMinutes, config.endgameStartMinute, config.totalPlayers), [config.matchLengthMinutes, config.endgameStartMinute, config.totalPlayers]);

  const placementPointsArr = useMemo(() => buildPlacementPoints(placementRules, Math.max(config.totalPlayers, 100)), [placementRules, config.totalPlayers]);
  const placementPointsFn = useCallback((place) => {
    if (place < 1 || place >= placementPointsArr.length) return placementPointsArr[placementPointsArr.length - 1] || 0;
    return placementPointsArr[place];
  }, [placementPointsArr]);

  const scoringBands = useMemo(() => placementRules.slice().reverse().map((rule) => {
    const label = rule.from === rule.to
      ? (rule.from === 1 ? "Vitória Royale (1º)" : `${rule.from}º lugar`)
      : `${rule.from}º ao ${rule.to}º lugar`;
    const ruleText = rule.pointsPerPlace !== undefined
      ? `+${rule.pointsPerPlace} por posição`
      : rule.from === rule.to ? `bônus fixo +${rule.bonus}` : `bônus único +${rule.bonus} ao alcançar`;
    return { label, from: rule.from, to: rule.to, rule: ruleText, minPts: placementPointsFn(rule.to), maxPts: placementPointsFn(rule.from) };
  }), [placementRules, placementPointsFn]);

  const [matchesData, setMatchesData] = useState(() => Array(DEFAULT_CONFIG.matchesPerDay * DEFAULT_CONFIG.totalDays).fill(null));
  const [revealMap, setRevealMap] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1100);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedStandingsTeam, setSelectedStandingsTeam] = useState(null);
  // Usado nas tabelas de classificação: se a linha for uma equipe com mais de um
  // integrante, abre o modal com TODOS os integrantes; senão (modo solo), abre o jogador direto.
  function openStandingsRow(p) {
    if (p.memberIds && p.memberIds.length > 1) setSelectedStandingsTeam(p);
    else setSelectedPlayer(playersById[p.memberIds?.[0]] || p);
  }
  const [showFinal, setShowFinal] = useState(false);
  const [day, setDay] = useState(1);
  const [tab, setTab] = useState("simulador");
  const [showFullStandings, setShowFullStandings] = useState(false);
  const [showStandingsHistory, setShowStandingsHistory] = useState(false);
  const [standingsScope, setStandingsScope] = useState("total");
  const [showSaved, setShowSaved] = useState(false);
  const intervalRef = useRef(null);

  /* ============================== PERSISTÊNCIA (auto-save + saves com nome) ==============================
     Usa localStorage do navegador. Funciona no seu próprio site/hospedagem normalmente — cada domínio tem
     o seu próprio armazenamento, então o progresso fica salvo por domínio + navegador (não sincroniza entre
     dispositivos diferentes nem entre navegadores diferentes no mesmo PC).
     =================================================================================== */
  function hasStorage() {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
      const testKey = "__fncs_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false; // ex.: modo privado do Safari com quota zerada, storage bloqueado, etc.
    }
  }
  function safeGet(key) {
    if (!hasStorage()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function safeSet(key, value) {
    if (!hasStorage()) return false;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }
  function safeDelete(key) {
    if (!hasStorage()) return false;
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Carrega, ao montar, tanto a lista de campeonatos salvos com nome quanto o progresso automático.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasStorage()) {
        setStorageAvailable(false);
        setLoaded(true);
        return;
      }
      const savesRaw = safeGet(SAVES_KEY);
      if (!cancelled && savesRaw) {
        try { setSavesList(JSON.parse(savesRaw)); } catch (e) { /* ignora save corrompido */ }
      }
      const autoRaw = safeGet(AUTOSAVE_KEY);
      if (!cancelled && autoRaw) {
        try {
          const save = JSON.parse(autoRaw);
          const loadedConfig = save.config || DEFAULT_CONFIG;
          const loadedNames = save.playerNames && save.playerNames.length ? save.playerNames : DEFAULT_NAMES;
          const loadedRules = save.placementRules && save.placementRules.length ? save.placementRules : DEFAULT_PLACEMENT_RULES;
          const loadedSkills = save.playerSkills || {};
          setConfig(loadedConfig);
          setPlayerNames(loadedNames);
          setPlacementRules(loadedRules);
          setPlayerSkills(loadedSkills);
          setMode(save.mode || DEFAULT_TEAM_SIZE);
          setPlayers(save.players && save.players.length ? save.players : generatePlayers(loadedConfig.totalPlayers, loadedNames, loadedSkills));
          setMatchesData(Array.isArray(save.matchesData) ? save.matchesData : Array(loadedConfig.matchesPerDay * loadedConfig.totalDays).fill(null));
          setRevealMap(save.revealMap || {});
          setCurrentIdx(Number.isInteger(save.currentIdx) ? save.currentIdx : 0);
          setSpeed(save.speed || 1100);
          setDay(save.day || 1);
          setStandingsScope(save.standingsScope || "total");
          setDraftConfig(loadedConfig);
          setDraftNamesText(loadedNames.join("\n"));
          setDraftRules(rulesToDraft(loadedRules));
          setDraftSkills(loadedSkills);
          setShowRestored(true);
          window.setTimeout(() => setShowRestored(false), 2500);
        } catch (e) { /* ignora autosave corrompido, começa do padrão */ }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Sempre mantém, numa ref, o "retrato" mais atual do estado que precisa ser salvo.
  // Serve pra podermos gravar no localStorage IMEDIATAMENTE (sem esperar o debounce)
  // em momentos críticos, como pouco antes da página recarregar/fechar (F5).
  const autosaveStateRef = useRef(null);
  useEffect(() => {
    autosaveStateRef.current = {
      savedAt: new Date().toISOString(), mode, players, playerNames, config, placementRules, playerSkills,
      matchesData, revealMap, currentIdx, speed, day, standingsScope,
    };
  }, [mode, players, playerNames, config, placementRules, playerSkills, matchesData, revealMap, currentIdx, speed, day, standingsScope]);

  const flushAutosave = useCallback(() => {
    if (!storageAvailable || !autosaveStateRef.current) return;
    safeSet(AUTOSAVE_KEY, JSON.stringify(autosaveStateRef.current));
  }, [storageAvailable]);

  // Salva automaticamente (com debounce) sempre que algo relevante do campeonato atual muda.
  useEffect(() => {
    if (!loaded || !storageAvailable) return; // não sobrescreve o autosave enquanto ele ainda está sendo restaurado, e não tenta se o storage não existe neste ambiente
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(flushAutosave, 300);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [loaded, storageAvailable, flushAutosave, mode, players, playerNames, config, placementRules, playerSkills, matchesData, revealMap, currentIdx, speed, day, standingsScope]);

  // Rede de segurança contra o F5: grava a força (e todo o resto) na hora, sem esperar o
  // debounce, no exato momento em que a aba está sendo recarregada/fechada/minimizada.
  // Isso evita perder as últimas mudanças de força quando o F5 é apertado logo em seguida.
  useEffect(() => {
    if (!loaded || !storageAvailable) return;
    const handleFlush = () => flushAutosave();
    const handleVisibility = () => { if (document.visibilityState === "hidden") flushAutosave(); };
    window.addEventListener("beforeunload", handleFlush);
    window.addEventListener("pagehide", handleFlush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleFlush);
      window.removeEventListener("pagehide", handleFlush);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loaded, storageAvailable, flushAutosave]);

  const matchStatus = (idx) => {
    const m = matchesData[idx];
    if (!m) return "notStarted";
    const rev = revealMap[idx] || 0;
    return rev >= m.timeline.length ? "finished" : "live";
  };
  const matchDone = matchesData.map((_, idx) => matchStatus(idx) === "finished");

  const current = matchesData[currentIdx];
  const currentRev = revealMap[currentIdx] || 0;
  const status = matchStatus(currentIdx);

  useEffect(() => {
    if (isPlaying && status === "live") {
      intervalRef.current = setInterval(() => {
        setRevealMap((prev) => {
          const cur = prev[currentIdx] || 0;
          const tl = matchesData[currentIdx]?.timeline.length || 0;
          const next = Math.min(cur + 1, tl);
          if (next >= tl) setIsPlaying(false);
          return { ...prev, [currentIdx]: next };
        });
      }, speed);
      return () => clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, status, currentIdx, speed, matchesData]);

  function startMatch(idx) {
    const { results, timeline, memberResults } = simulateMatch(playerIds, teams, {
      matchLength: config.matchLengthMinutes,
      endgameStart: config.endgameStartMinute,
      curve,
      totalPlayers: config.totalPlayers,
      killPoints: config.killPoints,
      placementPointsFn,
      playersById,
    });
    setMatchesData((prev) => { const c = [...prev]; c[idx] = { results, timeline, memberResults }; return c; });
    setRevealMap((prev) => ({ ...prev, [idx]: 0 }));
    setCurrentIdx(idx);
    setIsPlaying(true);
  }
  function stepMinute() {
    setRevealMap((prev) => {
      const cur = prev[currentIdx] || 0;
      const tl = matchesData[currentIdx]?.timeline.length || 0;
      return { ...prev, [currentIdx]: Math.min(cur + 1, tl) };
    });
  }
  function skipToEnd() {
    setIsPlaying(false);
    setRevealMap((prev) => ({ ...prev, [currentIdx]: matchesData[currentIdx]?.timeline.length || 0 }));
  }
  function canStart(idx) { return idx === 0 || matchStatus(idx - 1) === "finished"; }

  function handleModeChange(e) {
    const nextMode = Number(e.target.value);
    setIsPlaying(false);
    setMatchesData(Array(totalMatches).fill(null));
    setRevealMap({});
    setCurrentIdx(0);
    setMode(nextMode);
  }

  function updateDraftRule(idx, patch) {
    setDraftRules((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeDraftRule(idx) {
    setDraftRules((rs) => rs.filter((_, i) => i !== idx));
  }
  function addDraftRule() {
    setDraftRules((rs) => [...rs, { id: `r_new_${Date.now()}_${rs.length}`, from: 1, to: 1, type: "bonus", value: 0 }]);
  }
  function updateDraftSkill(name, value) {
    setDraftSkills((s) => ({ ...s, [name]: clampSkill(value) }));
  }
  function resetDraftSkills() {
    setDraftSkills({});
  }
  function randomizeDraftSkills() {
    const names = Array.from(new Set(draftNamesText.split("\n").map((s) => s.trim()).filter(Boolean)));
    setDraftSkills((prev) => {
      const next = { ...prev };
      names.forEach((n) => { next[n] = clampSkill(+(0.75 + Math.random() * 0.6).toFixed(2)); }); // variação moderada: ~0.75x a 1.35x
      return next;
    });
  }
  function resetDraft() {
    setDraftConfig(config);
    setDraftNamesText(playerNames.join("\n"));
    setDraftRules(rulesToDraft(placementRules));
    setDraftSkills(playerSkills);
  }

  function applyConfig() {
    const cleanNames = draftNamesText.split("\n").map((s) => s.trim()).filter(Boolean);
    const finalNames = cleanNames.length ? cleanNames : playerNames;
    const finalRules = draftToRules(draftRules);
    const safeConfig = {
      totalPlayers: Math.max(2, Math.round(draftConfig.totalPlayers) || DEFAULT_CONFIG.totalPlayers),
      matchesPerDay: Math.max(1, Math.round(draftConfig.matchesPerDay) || DEFAULT_CONFIG.matchesPerDay),
      totalDays: Math.max(1, Math.round(draftConfig.totalDays) || DEFAULT_CONFIG.totalDays),
      matchLengthMinutes: Math.max(1, Math.round(draftConfig.matchLengthMinutes) || DEFAULT_CONFIG.matchLengthMinutes),
      endgameStartMinute: Math.max(1, Math.round(draftConfig.endgameStartMinute) || DEFAULT_CONFIG.endgameStartMinute),
      killPoints: Math.max(0, Number.isFinite(draftConfig.killPoints) ? Math.round(draftConfig.killPoints) : DEFAULT_CONFIG.killPoints),
    };
    const finalRulesOrDefault = finalRules.length ? finalRules : DEFAULT_PLACEMENT_RULES;
    const newPlayers = generatePlayers(safeConfig.totalPlayers, finalNames, draftSkills);
    const newMatchesData = Array(safeConfig.matchesPerDay * safeConfig.totalDays).fill(null);

    setConfig(safeConfig);
    setPlayerNames(finalNames);
    setPlacementRules(finalRulesOrDefault);
    setPlayerSkills(draftSkills);
    setPlayers(newPlayers);
    setIsPlaying(false);
    setMatchesData(newMatchesData);
    setRevealMap({});
    setCurrentIdx(0);
    setDay(1);
    setSelectedPlayer(null);
    setSelectedTeam(null);
    setShowFinal(false);
    setStandingsScope("total");
    setTab("simulador");

    // Grava a força (e o resto) no localStorage NA HORA, sem esperar o debounce do
    // autosave — é o clique em "Aplicar" que mais precisa sobreviver a um F5 logo em seguida.
    if (storageAvailable) {
      safeSet(AUTOSAVE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(), mode, players: newPlayers, playerNames: finalNames,
        config: safeConfig, placementRules: finalRulesOrDefault, playerSkills: draftSkills,
        matchesData: newMatchesData, revealMap: {}, currentIdx: 0, speed, day: 1, standingsScope: "total",
      }));
    }
  }

  // Apaga o progresso automático e recomeça um campeonato do zero (não mexe nos saves com nome).
  function handleNewChampionship() {
    if (!window.confirm("Isso vai apagar o progresso atual (partidas já jogadas e pontos) e começar um campeonato novo. Campeonatos salvos com nome não são afetados. Continuar?")) return;
    safeDelete(AUTOSAVE_KEY);
    setConfig(DEFAULT_CONFIG);
    setPlayerNames(DEFAULT_NAMES);
    setPlacementRules(DEFAULT_PLACEMENT_RULES);
    setPlayerSkills({});
    setMode(DEFAULT_TEAM_SIZE);
    setPlayers(generatePlayers(DEFAULT_CONFIG.totalPlayers, DEFAULT_NAMES, {}));
    setMatchesData(Array(DEFAULT_CONFIG.matchesPerDay * DEFAULT_CONFIG.totalDays).fill(null));
    setRevealMap({});
    setCurrentIdx(0);
    setDay(1);
    setStandingsScope("total");
    setDraftConfig(DEFAULT_CONFIG);
    setDraftNamesText(DEFAULT_NAMES.join("\n"));
    setDraftRules(rulesToDraft(DEFAULT_PLACEMENT_RULES));
    setDraftSkills({});
    setIsPlaying(false);
    setSelectedPlayer(null);
    setSelectedTeam(null);
    setShowFinal(false);
    setTab("simulador");
  }

  function handleSaveChampionship() {
    const name = newSaveName.trim();
    if (!name) return;
    const saves = { ...savesList };
    saves[name] = {
      name, savedAt: new Date().toISOString(), mode, players, playerNames, config, placementRules, playerSkills,
      matchesData, revealMap, currentIdx, speed, day, standingsScope,
    };
    setSavesList(saves);
    safeSet(SAVES_KEY, JSON.stringify(saves));
    setNewSaveName("");
    setShowSaved(true);
    window.setTimeout(() => setShowSaved(false), 2500);
  }
  function handleLoadChampionship(name) {
    const save = savesList[name];
    if (!save) return;
    const loadedConfig = save.config || DEFAULT_CONFIG;
    const loadedNames = save.playerNames && save.playerNames.length ? save.playerNames : DEFAULT_NAMES;
    const loadedRules = save.placementRules && save.placementRules.length ? save.placementRules : DEFAULT_PLACEMENT_RULES;
    const loadedSkills = save.playerSkills || {};
    setIsPlaying(false);
    setConfig(loadedConfig);
    setPlayerNames(loadedNames);
    setPlacementRules(loadedRules);
    setPlayerSkills(loadedSkills);
    setMode(save.mode || DEFAULT_TEAM_SIZE);
    setPlayers(save.players || generatePlayers(loadedConfig.totalPlayers, loadedNames, loadedSkills));
    setMatchesData(Array.isArray(save.matchesData) ? save.matchesData : Array(loadedConfig.matchesPerDay * loadedConfig.totalDays).fill(null));
    setRevealMap(save.revealMap || {});
    setCurrentIdx(Number.isInteger(save.currentIdx) ? save.currentIdx : 0);
    setSpeed(save.speed || 1100);
    setDay(save.day || 1);
    setStandingsScope(save.standingsScope || "total");
    setDraftConfig(loadedConfig);
    setDraftNamesText(loadedNames.join("\n"));
    setDraftRules(rulesToDraft(loadedRules));
    setDraftSkills(loadedSkills);
    setSelectedPlayer(null);
    setSelectedTeam(null);
    setShowFinal(false);
    setTab("simulador");
  }
  function handleDeleteSave(name) {
    if (!window.confirm(`Apagar o campeonato salvo "${name}"?`)) return;
    const saves = { ...savesList };
    delete saves[name];
    setSavesList(saves);
    safeSet(SAVES_KEY, JSON.stringify(saves));
  }

  const alive = !current ? teams.length : currentRev === 0 ? teams.length : (current.timeline[currentRev - 1].teamsAliveAfter ?? teams.length);
  const alivePlayers = !current ? players.length : currentRev === 0 ? players.length : (current.timeline[currentRev - 1].aliveAfter ?? players.length);
  const curMinuteEntry = current && currentRev > 0 ? current.timeline[currentRev - 1] : null;
  const phase = curMinuteEntry ? curMinuteEntry.phase : "Aguardando início";

  const chartData = useMemo(() => {
    if (!current) return [{ minute: 0, alive: config.totalPlayers }];
    const d = [{ minute: 0, alive: config.totalPlayers }];
    for (let i = 0; i < currentRev; i++) d.push({ minute: current.timeline[i].minute, alive: current.timeline[i].aliveAfter });
    return d;
  }, [current, currentRev, config.totalPlayers]);

  const feed = useMemo(() => {
    if (!current) return [];
    const items = [];
    for (let i = 0; i < currentRev; i++) {
      const t = current.timeline[i];
      t.milestones.forEach((ms) => items.push({ type: "milestone", minute: t.minute, value: ms }));
      t.events.forEach((ev) => items.push({ type: "kill", minute: t.minute, ...ev }));
    }
    return items.reverse().slice(0, 8);
  }, [current, currentRev]);

  const liveTableRows = useMemo(() => buildLiveTable(current, currentRev, teams, playersById, placementPointsFn, config.killPoints), [current, currentRev, teams, playersById, placementPointsFn, config.killPoints]);

  // Mapa id -> vivo/morto NA PARTIDA QUE ESTÁ SENDO ASSISTIDA AGORA (status === "live").
  const liveAliveById = useMemo(() => {
    if (status !== "live") return null;
    const map = {};
    liveTableRows.forEach((r) => { map[r.id] = r.alive; });
    return map;
  }, [status, liveTableRows]);

  const liveOverlay = useMemo(() => (status === "live" ? { idx: currentIdx, rows: liveTableRows } : null), [status, currentIdx, liveTableRows]);

  const allDone = matchDone.length > 0 && matchDone.every(Boolean);

  const totalStandings = useMemo(() => computeStandings(teams, players, matchesData, matchDone, allIndices, liveOverlay), [teams, players, matchesData, matchDone, allIndices, liveOverlay]);

  const scopeIndices = useMemo(() => scopeToIndicesFn(standingsScope), [scopeToIndicesFn, standingsScope]);
  const scopedStandings = useMemo(() => computeStandings(teams, players, matchesData, matchDone, scopeIndices, liveOverlay), [teams, players, matchesData, matchDone, scopeIndices, liveOverlay]);
  const completedInScope = scopeIndices.filter((i) => matchDone[i]).length;
  const scopeLabel = useMemo(() => scopeOptions.find((s) => s.id === standingsScope)?.label || "Acumulado", [scopeOptions, standingsScope]);

  const dayMatches = dayIndices[day - 1] || [];

  // Enquanto o progresso automático ainda está sendo restaurado, mostra uma tela simples de carregamento
  // em vez de piscar com os dados padrão antes de trocar pelos dados salvos.
  if (!loaded) {
    return (
      <div style={{ height: "100vh", background: C.void, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Rajdhani, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap');`}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Teko, sans-serif", fontSize: 34, color: C.purple, letterSpacing: "1px" }}>CARREGANDO CAMPEONATO...</div>
          <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>Restaurando seu progresso salvo</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", background: C.void, color: C.text, fontFamily: "Rajdhani, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Rajdhani:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 4px; }
        @keyframes pulseGold { 0%,100%{opacity:1} 50%{opacity:0.55} }
        @keyframes slideIn { from{opacity:0; transform:translateY(-4px)} to{opacity:1; transform:translateY(0)} }
        .feedItem { animation: slideIn 0.25s ease; }
      `}</style>

      {selectedPlayer && <PlayerModal player={selectedPlayer} matchesData={matchesData} onClose={() => setSelectedPlayer(null)} />}
      {selectedTeam && <TeamModal team={selectedTeam} current={current} currentRev={currentRev} playersById={playersById} onClose={() => setSelectedTeam(null)} />}
      {selectedStandingsTeam && <TeamStandingsModal team={selectedStandingsTeam} matchesData={matchesData} playersById={playersById} onClose={() => setSelectedStandingsTeam(null)} />}

      {showFullStandings && (
        <FullStandingsModal
          standings={scopedStandings}
          scope={standingsScope}
          scopeOptions={scopeOptions}
          scopeLabel={scopeLabel}
          onScopeChange={setStandingsScope}
          onClose={() => setShowFullStandings(false)}
          onSelect={openStandingsRow}
          liveAliveById={liveAliveById}
          liveMatchNumber={currentIdx + 1}
        />
      )}

      {showStandingsHistory && <StandingsHistoryModal
        players={players}
        teamSize={mode}
        matchesData={matchesData}
        matchDone={matchDone}
        totalMatches={totalMatches}
        onClose={() => setShowStandingsHistory(false)}
        onSelect={openStandingsRow}
      />}

      {showFinal && (
        <div onClick={() => setShowFinal(false)} style={{ position: "fixed", inset: 0, background: "rgba(5,6,10,0.85)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 28 }}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <Trophy size={40} color={C.gold} style={{ animation: "pulseGold 2s infinite" }} />
              <div style={{ fontFamily: "Teko, sans-serif", fontSize: 40, color: C.gold, letterSpacing: "1px", marginTop: 4 }}>CAMPEÃO DO TORNEIO</div>
              {totalStandings[0] && <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700 }}>{totalStandings[0].name}</div>}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 22 }}>
              {[1, 0, 2].map((pos, i) => totalStandings[pos] && (
                <div key={pos} style={{ order: i === 1 ? 0 : i, background: C.panel2, borderRadius: 12, padding: "14px 16px", textAlign: "center", border: pos === 0 ? `1px solid ${C.gold}` : `1px solid ${C.line}`, transform: pos === 0 ? "translateY(-8px)" : "none" }}>
                  <Avatar name={totalStandings[pos].name} hue={totalStandings[pos].hue} size={pos === 0 ? 48 : 38} />
                  <div style={{ fontFamily: "Teko, sans-serif", fontSize: pos === 0 ? 30 : 24, color: pos === 0 ? C.gold : C.dim, marginTop: 6 }}>#{pos + 1}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{totalStandings[pos].name}</div>
                  <div style={{ fontSize: 12, color: C.dim }}>{totalStandings[pos].points} pts</div>
                </div>
              ))}
            </div>
            <div>
              {totalStandings.slice(0, 20).map((p, idx) => (
                <div key={p.id} onClick={() => openStandingsRow(p)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, cursor: "pointer" }}>
                  <div style={{ width: 22, fontFamily: "Teko, sans-serif", fontSize: 18, color: idx === 0 ? C.gold : C.dim }}>{idx + 1}</div>
                  <Avatar name={p.name} hue={p.hue} size={24} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: C.dim, display: "flex", alignItems: "center", gap: 3 }}><Skull size={11} />{p.kills}</div>
                  <div style={{ fontFamily: "Teko, sans-serif", fontSize: 20, color: C.gold, width: 44, textAlign: "right" }}>{p.points}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.line}`, background: C.panel, padding: "12px 20px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.purple}, ${C.cyan})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Zap size={17} color="#0A0D14" />
          </div>
          <div>
            <div style={{ fontFamily: "Teko, sans-serif", fontSize: 21, letterSpacing: "1px", lineHeight: 1 }}>FNCS {mode === 1 ? "SOLO" : mode === 2 ? "DUO" : mode === 3 ? "TRIO" : "SQUADS"} SIMULATOR</div>
            <div style={{ fontSize: 10.5, color: C.dim, letterSpacing: "0.5px" }}>{config.totalPlayers} jogadores · {teams.length} equipes · {totalMatches} partidas · {config.matchLengthMinutes} min cada</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, background: C.panel2, borderRadius: 9, padding: 3, border: `1px solid ${C.line}` }}>
          {[["simulador", "Simulador", Play], ["premiacao", "Premiação", Award], ["config", "Configurações", Settings]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "6px 13px", borderRadius: 7, border: "none", cursor: "pointer",
              background: tab === id ? C.purple : "transparent", color: tab === id ? "#fff" : C.dim,
              fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 5,
            }}><Icon size={13} /> {label}</button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 11, color: C.dim, fontWeight: 700 }}>MODO:</span>
          <select value={mode} onChange={handleModeChange} style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 8, padding: "7px 10px", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, cursor: "pointer" }}>
            <option value={1}>Solo</option>
            <option value={2}>Dupla</option>
            <option value={3}>Trio</option>
            <option value={4}>Esquadrão</option>
          </select>
        </div>

        {showSaved && (
          <div style={{ position: "fixed", top: 72, right: 20, zIndex: 100, background: C.panel2, border: `1px solid ${C.cyan}`, color: C.cyan, borderRadius: 10, padding: "10px 14px", fontWeight: 700, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
            ✓ Campeonato salvo com sucesso
          </div>
        )}
        {showRestored && (
          <div style={{ position: "fixed", top: 72, right: 20, zIndex: 100, background: C.panel2, border: `1px solid ${C.purple}`, color: C.purple, borderRadius: 10, padding: "10px 14px", fontWeight: 700, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
            ↺ Progresso restaurado automaticamente
          </div>
        )}
        {!storageAvailable && (
          <div style={{ position: "fixed", top: 72, right: 20, zIndex: 100, background: C.panel2, border: `1px solid ${C.red}`, color: C.red, borderRadius: 10, padding: "10px 14px", fontWeight: 700, fontSize: 12.5, maxWidth: 300, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>
            ⚠ O navegador bloqueou o armazenamento local (ex.: aba anônima/privada, ou cookies/site data desativados). O progresso não vai ser salvo — um F5 aqui vai zerar tudo.
          </div>
        )}

        {tab === "simulador" && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {Array.from({ length: config.totalDays }, (_, i) => i + 1).map((d) => (
              <button key={d} onClick={() => setDay(d)} style={{
                padding: "7px 16px", borderRadius: 8, border: `1px solid ${day === d ? C.purple : C.line}`,
                background: day === d ? "rgba(139,108,255,0.15)" : "transparent", color: day === d ? C.purple : C.dim,
                fontFamily: "Rajdhani, sans-serif", fontWeight: 700, cursor: "pointer", fontSize: 13,
              }}>DIA {d}</button>
            ))}
            {allDone && (
              <button onClick={() => setShowFinal(true)} style={{
                padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.gold}`, background: "rgba(255,182,39,0.12)",
                color: C.gold, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6,
              }}><Trophy size={14} /> Resultado Final</button>
            )}
          </div>
        )}
      </div>

      {tab === "simulador" && (
        <div style={{ display: "flex", gap: 8, padding: "10px 20px", borderBottom: `1px solid ${C.line}`, overflowX: "auto", flexShrink: 0 }}>
          {dayMatches.map((idx) => {
            const st = matchStatus(idx);
            const locked = st === "notStarted" && !canStart(idx);
            return (
              <button key={idx} disabled={locked} onClick={() => setCurrentIdx(idx)} style={{
                flexShrink: 0, padding: "7px 14px", borderRadius: 9, cursor: locked ? "not-allowed" : "pointer",
                border: `1px solid ${currentIdx === idx ? C.purple : C.line}`,
                background: currentIdx === idx ? "rgba(139,108,255,0.15)" : C.panel2,
                color: locked ? C.dim2 : st === "finished" ? C.cyan : C.text,
                display: "flex", alignItems: "center", gap: 6, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 13,
              }}>
                {st === "finished" ? <CheckCircle2 size={13} color={C.cyan} /> : locked ? <Lock size={12} /> : <Play size={12} />}
                Partida {idx + 1}
              </button>
            );
          })}
        </div>
      )}

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 280, borderRight: `1px solid ${C.line}`, background: C.panel, minHeight: 0, flexShrink: 0 }}>
          <Standings
            standings={scopedStandings}
            scope={standingsScope}
            scopeOptions={scopeOptions}
            scopeLabel={scopeLabel}
            onScopeChange={setStandingsScope}
            completedInScope={completedInScope}
            totalInScope={scopeIndices.length}
            onSelect={openStandingsRow}
            onExpand={() => setShowFullStandings(true)}
            onHistory={() => setShowStandingsHistory(true)}
            liveAliveById={liveAliveById}
            liveMatchNumber={currentIdx + 1}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: tab === "simulador" ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
          {tab === "premiacao" && <PremiacaoTab totalPlayers={config.totalPlayers} killPoints={config.killPoints} scoringBands={scoringBands} placementPointsFn={placementPointsFn} />}

          {tab === "config" && (
            <ConfigTab
              draftConfig={draftConfig}
              setDraftConfig={setDraftConfig}
              mode={mode}
              onModeChange={handleModeChange}
              draftNamesText={draftNamesText}
              setDraftNamesText={setDraftNamesText}
              draftRules={draftRules}
              onUpdateRule={updateDraftRule}
              onRemoveRule={removeDraftRule}
              onAddRule={addDraftRule}
              draftSkills={draftSkills}
              onUpdateSkill={updateDraftSkill}
              onResetSkills={resetDraftSkills}
              onRandomizeSkills={randomizeDraftSkills}
              onApply={applyConfig}
              onResetDraft={resetDraft}
              onNewChampionship={handleNewChampionship}
              savesList={savesList}
              newSaveName={newSaveName}
              setNewSaveName={setNewSaveName}
              onSave={handleSaveChampionship}
              onLoad={handleLoadChampionship}
              onDelete={handleDeleteSave}
            />
          )}

          {tab === "simulador" && status === "notStarted" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: "Teko, sans-serif", fontSize: 54, color: C.dim }}>PARTIDA {currentIdx + 1}</div>
              <div style={{ color: C.dim, marginBottom: 20, maxWidth: 380 }}>{teams.length} equipes ({config.totalPlayers} jogadores) saltam do Ônibus de Batalha. {config.matchLengthMinutes} minutos de tempestade, com o ENDGAME começando no minuto {config.endgameStartMinute}, até restar um único campeão.</div>
              {canStart(currentIdx) ? (
                <button onClick={() => startMatch(currentIdx)} style={{
                  background: `linear-gradient(135deg, ${C.purple}, #5B3FE0)`, border: "none", color: "#fff",
                  padding: "12px 28px", borderRadius: 10, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                  fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                }}><Play size={16} /> Iniciar Partida {currentIdx + 1}</button>
              ) : (
                <div style={{ color: C.dim2, display: "flex", alignItems: "center", gap: 6 }}><Lock size={14} /> Termine a partida anterior primeiro</div>
              )}
            </div>
          )}

          {tab === "simulador" && status !== "notStarted" && current && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "16px 20px 0" }}>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12, flexShrink: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}><StormRing alive={alive} total={teams.length} /><div style={{ display: "flex", gap: 10, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 12 }}><span style={{ color: C.cyan }}>{alivePlayers} jogadores vivos</span><span style={{ color: C.dim }}>•</span><span style={{ color: C.purple }}>{alive} equipes vivas</span></div></div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: "1px",
                      padding: "3px 10px", borderRadius: 6, textTransform: "uppercase",
                      background: phase === "ENDGAME" ? "rgba(255,77,94,0.15)" : "rgba(139,108,255,0.15)",
                      color: phase === "ENDGAME" ? C.red : C.purple,
                      animation: phase === "ENDGAME" && status === "live" ? "pulseGold 1.2s infinite" : "none",
                    }}>{phase}</span>
                    {status === "finished" && <span style={{ color: C.cyan, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={13} /> FINALIZADA</span>}
                    {status === "finished" && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <Crown size={14} color={C.gold} /> <b style={{ color: C.gold }}>{teamsById[current.results[0].id].name}</b>
                        {currentIdx < totalMatches - 1 && (
                          <button onClick={() => setCurrentIdx(currentIdx + 1)} style={{
                            background: `linear-gradient(135deg, ${C.purple}, #5B3FE0)`, border: "none", color: "#fff",
                            padding: "5px 12px", borderRadius: 7, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "Rajdhani, sans-serif", fontSize: 12, marginLeft: 8,
                          }}>Próxima <ChevronRight size={13} /></button>
                        )}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "Teko, sans-serif", fontSize: 38, lineHeight: 1 }}>MINUTO {curMinuteEntry ? curMinuteEntry.minute : 0}<span style={{ fontSize: 18, color: C.dim2 }}> / {config.matchLengthMinutes}</span></div>
                  <div style={{ height: 58, marginTop: 4 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="aliveFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={C.purple} stopOpacity={0.5} />
                            <stop offset="100%" stopColor={C.purple} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="minute" hide />
                        <YAxis hide domain={[0, config.totalPlayers]} />
                        <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: "Rajdhani, sans-serif" }} labelFormatter={(m) => `Minuto ${m}`} formatter={(v) => [v, "vivos"]} />
                        <Area type="monotone" dataKey="alive" stroke={C.purple} strokeWidth={2} fill="url(#aliveFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {status === "live" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap", flexShrink: 0 }}>
                  <button onClick={() => setIsPlaying((p) => !p)} style={{
                    background: isPlaying ? C.panel2 : `linear-gradient(135deg, ${C.purple}, #5B3FE0)`, border: `1px solid ${isPlaying ? C.line : "transparent"}`,
                    color: "#fff", padding: "8px 15px", borderRadius: 9, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "Rajdhani, sans-serif", fontSize: 13,
                  }}>{isPlaying ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Reproduzir</>}</button>
                  <button onClick={stepMinute} style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text, padding: "8px 13px", borderRadius: 9, fontWeight: 700, cursor: "pointer", fontFamily: "Rajdhani, sans-serif", fontSize: 12.5 }}>+1 Minuto</button>
                  <button onClick={skipToEnd} style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.dim, padding: "8px 13px", borderRadius: 9, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "Rajdhani, sans-serif", fontSize: 12.5 }}><SkipForward size={13} /> Pular para o fim</button>
                  <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                    {[["1x", 1100], ["2x", 550], ["4x", 260]].map(([label, ms]) => (
                      <button key={label} onClick={() => setSpeed(ms)} style={{
                        background: speed === ms ? "rgba(139,108,255,0.2)" : "transparent", border: `1px solid ${speed === ms ? C.purple : C.line}`,
                        color: speed === ms ? C.purple : C.dim, padding: "6px 10px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Rajdhani, sans-serif",
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
              )}

              {status === "live" && feed.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 10, flexShrink: 0, maxHeight: 78, overflowY: "auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "4px 10px" }}>
                  {feed.map((it, i) => it.type === "milestone" ? (
                    <div key={i} className="feedItem" style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", color: C.gold, fontWeight: 700, fontSize: 12 }}>
                      <Zap size={12} /> TOP {it.value} JOGADORES{it.value <= 5 ? " — TENSÃO MÁXIMA" : ""}
                    </div>
                  ) : (
                    <div key={i} className="feedItem" style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 12.5 }}>
                      <span style={{ color: C.dim2, width: 30, fontSize: 10.5 }}>Min {it.minute}</span>
                      {it.killerId ? <Swords size={12} color={C.red} /> : <Wind size={12} color={C.purple} />}
                      {it.killerId && <span onClick={() => setSelectedPlayer(playersById[it.killerId])} style={{ fontWeight: 700, cursor: "pointer" }}>{playersById[it.killerId].name}</span>}
                      <span style={{ color: C.dim }}>{it.killerId ? "eliminou" : "eliminado pela tempestade —"}</span>
                      <span onClick={() => setSelectedPlayer(playersById[it.victimId])} style={{ cursor: "pointer" }}>{playersById[it.victimId].name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ flex: 1, minHeight: 0, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
                <MatchTable rows={liveTableRows} playersById={teamsById} onSelect={(team) => setSelectedTeam(team)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}