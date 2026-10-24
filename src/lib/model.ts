import {
  activeDrivers,
  calendar,
  driverByCode,
  getMetrics,
  getTeamMetrics,
  raceByRound,
  season,
  teamById,
  resultsByRound,
} from "./data";
import type {
  CircuitProfile,
  FactorBreakdown,
  Race,
  TeamMetrics,
  Weather,
} from "../types";

const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const DIMS: (keyof CircuitProfile)[] = [
  "power",
  "downforce",
  "tyre",
  "overtaking",
  "street",
];
const DIM_WEIGHTS = [1, 1, 0.8, 0.8, 0.6];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hashSeed = (parts: (string | number)[]) => {
  let h = 2166136261;
  for (const part of parts.join("|")) {
    h ^= part.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const similarity = (a: CircuitProfile, b: CircuitProfile) => {
  let sum = 0;
  let weights = 0;
  DIMS.forEach((dim, i) => {
    sum += DIM_WEIGHTS[i] * (a[dim] - b[dim]) ** 2;
    weights += DIM_WEIGHTS[i];
  });
  return 1 - Math.sqrt(sum / weights);
};

const similarRaces = (race: Race, uptoRound: number): Race[] =>
  calendar
    .filter((r) => r.round <= uptoRound && r.circuitId !== race.circuitId)
    .map((r) => ({ race: r, sim: similarity(race.profile, r.profile) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5)
    .map((x) => x.race);

export interface PredictionOptions {
  round: number;
  weather?: Weather;
  chaos?: number;
  sims?: number;
  uptoRound?: number;
  seed?: number;
}

export interface DriverPrediction {
  code: string;
  name: string;
  number: number;
  teamId: string;
  teamName: string;
  teamColor: string;
  flag: string;
  win: number;
  podium: number;
  top10: number;
  pole: number;
  dnf: number;
  points: number;
  avgFinish: number;
  avgGrid: number;
  factors: FactorBreakdown;
}

export interface RacePrediction {
  round: number;
  race: Race;
  weather: Weather;
  chaos: number;
  sims: number;
  drivers: DriverPrediction[];
  favorite: DriverPrediction;
  second: DriverPrediction;
  confidence: number;
  unpredictability: number;
  safetyCar: number;
  podiumCombo: { codes: string[]; probability: number };
  leaderAfter: { code: string; probability: number }[];
}

const predictionCache = new Map<string, RacePrediction>();

export function predictRace(options: PredictionOptions): RacePrediction {
  const {
    round,
    weather = "dry",
    chaos = 35,
    sims = 6000,
    uptoRound = season.throughRound,
    seed,
  } = options;
  const race = raceByRound.get(round);
  if (!race) throw new Error(`Etapa ${round} não encontrada`);
  const key = [round, weather, chaos, sims, uptoRound, seed ?? "auto"].join(":");
  const cached = predictionCache.get(key);
  if (cached) return cached;

  const metrics = getMetrics(uptoRound);
  const teamMetrics = getTeamMetrics(uptoRound);
  const similar = similarRaces(race, uptoRound);
  const c = chaos / 100;
  const wet = weather === "wet" ? 1 : weather === "mixed" ? 0.5 : 0;
  const rand = mulberry32(seed ?? hashSeed(["apex", round, weather, chaos, uptoRound]));

  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const teamFit = new Map<string, number>();
  for (const [teamId, team] of teamMetrics) {
    const fitRounds = similar.filter((r) =>
      (resultsByRound.get(r.round)?.results ?? []).some((x) => x.teamId === teamId),
    );
    const fitPoints = fitRounds.flatMap((r) =>
      (resultsByRound.get(r.round)?.results ?? []).filter((x) => x.teamId === teamId),
    );
    const fitPpr = fitRounds.length ? fitPoints.reduce((a, b) => a + b.points, 0) / fitRounds.length : team.gpPointsPerRace;
    teamFit.set(teamId, clamp((fitPpr - team.gpPointsPerRace) * 0.022, -0.13, 0.13));
  }

  const entries = activeDrivers.map((driver) => {
    const m = metrics.get(driver.code);
    const team = teamMetrics.get(driver.teamId) ?? ({} as TeamMetrics);
    const teamMeta = teamById.get(driver.teamId);
    const fit = teamFit.get(driver.teamId) ?? 0;

    const similarResults = similar.flatMap((r) =>
      (resultsByRound.get(r.round)?.results ?? []).filter(
        (x) => x.code === driver.code && x.finished,
      ),
    );
    const similarGain = similarResults.length
      ? similarResults.reduce((a, x) => a + (x.grid - x.position), 0) / similarResults.length
      : m?.positionsGained ?? 0;
    const track = clamp((similarGain - (m?.positionsGained ?? 0)) * 0.012, -0.06, 0.06);

    const qualiDelta = clamp(m?.qualiMedianDelta ?? 0, -0.4, 0.4);
    const raceDelta = clamp((m?.raceMedianDelta ?? 0) * 0.035, -0.15, 0.15);
    const formAvg = m?.form.length ? m.form.reduce((a, b) => a + b, 0) / m.form.length : 0;
    const formAdjust = clamp((formAvg - (m?.points ?? 0) / Math.max(m?.starts ?? 1, 1)) * 0.004, -0.05, 0.05);
    const wetAdjust = ((m?.attributes.wet ?? 75) - 78) * 0.0045 * wet;
    const tyreAdjust = -((m?.attributes.tyre ?? 65) - 70) * 0.0015 * race.profile.tyre;
    const dnfProb = clamp(
      0.025 +
        (m?.dnfRate ?? 0.15) * 0.34 +
        (team.dnfRate ?? 0.2) * 0.12 +
        c * 0.035 +
        wet * 0.025,
      0.02,
      0.5,
    );

    return {
      driver,
      m,
      teamMeta,
      teamPace: team.pace ?? 2.2,
      fit,
      track,
      qualiDelta,
      raceDelta,
      formAdjust,
      wetAdjust,
      tyreAdjust,
      dnfProb,
      grid: 0,
      raceScore: 0,
      dnf: false,
    };
  });

  const n = entries.length;
  const winCount = new Float64Array(n);
  const podiumCount = new Float64Array(n);
  const top10Count = new Float64Array(n);
  const poleCount = new Float64Array(n);
  const dnfCount = new Float64Array(n);
  const pointsSum = new Float64Array(n);
  const finishSum = new Float64Array(n);
  const gridSum = new Float64Array(n);
  const comboCount = new Map<string, number>();
  const leaderCount = new Map<string, number>();

  const currentPoints = new Map(
    season.drivers.map((d) => [d.code, d.points]),
  );

  const scProb = clamp(race.profile.chaos * 0.55 + c * 0.35 + wet * 0.15, 0.05, 0.85);
  const sigmaQ = 0.085 + c * 0.18 + wet * 0.04;
  const sigmaRace = 0.16 + c * 0.42 + wet * 0.1;
  const gridWeight = (1 - race.profile.overtaking * 0.72) * 0.028;

  for (let sim = 0; sim < sims; sim += 1) {
    // Classificação simulada
    const quali = entries.map((e, i) => ({
      i,
      perf:
        e.teamPace +
        e.fit * 0.5 +
        e.qualiDelta * 0.9 +
        e.track * 0.5 +
        e.formAdjust * 0.4 +
        e.wetAdjust +
        gauss() * sigmaQ,
    }));
    quali.sort((a, b) => a.perf - b.perf);
    quali.forEach((x, grid) => {
      entries[x.i].grid = grid;
      gridSum[x.i] += grid + 1;
    });
    poleCount[quali[0].i] += 1;

    // Ritmo de corrida
    const raceScores: number[] = new Array(n);
    const running: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const e = entries[i];
      e.dnf = rand() < e.dnfProb;
      if (e.dnf) {
        dnfCount[i] += 1;
        raceScores[i] = Number.POSITIVE_INFINITY;
        continue;
      }
      raceScores[i] =
        e.teamPace * 1.02 +
        e.fit +
        e.raceDelta +
        e.track +
        e.tyreAdjust +
        e.wetAdjust +
        e.formAdjust +
        e.grid * gridWeight +
        gauss() * sigmaRace;
      running.push(i);
    }

    // Safety car comprime o pelotão e aumenta a variância
    const hasSc = rand() < scProb;
    if (hasSc && running.length > 1) {
      const mean = running.reduce((a, i) => a + raceScores[i], 0) / running.length;
      for (const i of running) {
        raceScores[i] = mean + (raceScores[i] - mean) * 0.58 + gauss() * sigmaRace * 0.35;
      }
    }

    const order = [...running].sort((a, b) => raceScores[a] - raceScores[b]);
    const classified = [...order, ...entries.map((_, i) => i).filter((i) => entries[i].dnf)];
    const winner = order[0];

    winCount[winner] += 1;
    order.slice(0, 3).forEach((i) => {
      podiumCount[i] += 1;
    });
    order.slice(0, 10).forEach((i) => {
      top10Count[i] += 1;
    });
    order.forEach((i, pos) => {
      finishSum[i] += pos + 1;
      pointsSum[i] += POINTS[pos] ?? 0;
    });
    const combo = order.slice(0, 3).map((i) => entries[i].driver.code).sort().join("-");
    comboCount.set(combo, (comboCount.get(combo) ?? 0) + 1);

    // Liderança do campeonato após a prova
    let bestCode = "";
    let bestPoints = -Infinity;
    for (const [code, pts] of currentPoints) {
      const idx = entries.findIndex((e) => e.driver.code === code);
      const gained = idx >= 0 ? POINTS[classified.indexOf(idx)] ?? 0 : 0;
      const total = pts + gained;
      if (total > bestPoints) {
        bestPoints = total;
        bestCode = code;
      }
    }
    leaderCount.set(bestCode, (leaderCount.get(bestCode) ?? 0) + 1);
  }

  const drivers: DriverPrediction[] = entries.map((e, i) => {
    const team = teamMetadata(e.teamMeta);
    const factors: FactorBreakdown = {
      car: -e.teamPace,
      quali: -e.qualiDelta * 0.9,
      race: -e.raceDelta,
      track: -e.track,
      reliability: -e.dnfProb,
      tyres: -e.tyreAdjust,
      wet: -e.wetAdjust,
    };
    return {
      code: e.driver.code,
      name: e.driver.name,
      number: e.driver.number,
      teamId: e.driver.teamId,
      teamName: team.name,
      teamColor: team.color,
      flag: e.driver.flag,
      win: winCount[i] / sims,
      podium: podiumCount[i] / sims,
      top10: top10Count[i] / sims,
      pole: poleCount[i] / sims,
      dnf: dnfCount[i] / sims,
      points: pointsSum[i] / sims,
      avgFinish: finishSum[i] / sims,
      avgGrid: gridSum[i] / sims,
      factors,
    };
  });

  drivers.sort((a, b) => b.win - a.win || b.podium - a.podium || a.code.localeCompare(b.code));

  const probs = drivers.map((d) => d.win).filter((p) => p > 0.0001);
  const entropy = -probs.reduce((a, p) => a + p * Math.log(p), 0);
  const unpredictability = clamp(Math.round((entropy / Math.log(n)) * 100), 0, 100);
  const topCombo = [...comboCount.entries()].sort((a, b) => b[1] - a[1])[0];

  const leaderAfter = [...currentPoints.keys()]
    .map((code) => ({ code, probability: (leaderCount.get(code) ?? 0) / sims }))
    .filter((x) => x.probability > 0.005)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4);

  const prediction: RacePrediction = {
    round,
    race,
    weather,
    chaos,
    sims,
    drivers,
    favorite: drivers[0],
    second: drivers[1],
    confidence: clamp(Math.round((drivers[0].win - drivers[1].win) * 130), 0, 99),
    unpredictability,
    safetyCar: scProb,
    podiumCombo: {
      codes: topCombo ? topCombo[0].split("-") : [],
      probability: topCombo ? topCombo[1] / sims : 0,
    },
    leaderAfter,
  };

  predictionCache.set(key, prediction);
  return prediction;
}

const teamMetadata = (team: { id: string; name: string; color: string } | undefined) =>
  team ?? { id: "unknown", name: "—", color: "#6b7280" };

export interface BacktestRow {
  round: number;
  name: string;
  actualWinner: string;
  favorite: string;
  favoriteProb: number;
  hit: boolean;
  top3Hit: boolean;
  baselineFavorite: string;
  baselineHit: boolean;
  brier: number;
}

export interface BacktestResult {
  races: number;
  hits: number;
  baselineHits: number;
  top3Hits: number;
  avgWinnerProb: number;
  brier: number;
  rows: BacktestRow[];
}

const backtestCache = new Map<number, BacktestResult>();

export function runBacktest(sims = 500): BacktestResult {
  const cached = backtestCache.get(sims);
  if (cached) return cached;
  const rows: BacktestRow[] = [];

  for (let round = 2; round <= season.throughRound; round += 1) {
    const race = raceByRound.get(round);
    const actual = resultsByRound.get(round)?.results[0];
    const standing = season.standingsHistory.find((h) => h.round === round - 1);
    if (!race || !actual || !standing) continue;

    const prediction = predictRace({
      round,
      weather: "dry",
      chaos: 35,
      sims,
      uptoRound: round - 1,
      seed: 1000 + round,
    });
    const favorite = prediction.favorite.code;
    const top3 = prediction.drivers.slice(0, 3).map((d) => d.code);
    const baselineFavorite =
      [...season.drivers].sort((a, b) => {
        const pa = standing.drivers.find((x) => x.code === a.code)?.points ?? -1;
        const pb = standing.drivers.find((x) => x.code === b.code)?.points ?? -1;
        return pb - pa;
      })[0]?.code ?? "";
    const brier =
      prediction.drivers.reduce(
        (sum, d) => sum + (d.win - (d.code === actual.code ? 1 : 0)) ** 2,
        0,
      ) / prediction.drivers.length;

    rows.push({
      round,
      name: race.shortName,
      actualWinner: actual.code,
      favorite,
      favoriteProb: prediction.favorite.win,
      hit: favorite === actual.code,
      top3Hit: top3.includes(actual.code),
      baselineFavorite,
      baselineHit: baselineFavorite === actual.code,
      brier,
    });
  }

  const result: BacktestResult = {
    races: rows.length,
    hits: rows.filter((r) => r.hit).length,
    baselineHits: rows.filter((r) => r.baselineHit).length,
    top3Hits: rows.filter((r) => r.top3Hit).length,
    avgWinnerProb: rows.length
      ? rows.reduce((a, r) => a + r.favoriteProb, 0) / rows.length
      : 0,
    brier: rows.length ? rows.reduce((a, r) => a + r.brier, 0) / rows.length : 0,
    rows,
  };
  backtestCache.set(sims, result);
  return result;
}

export interface TitleContender {
  code: string;
  name: string;
  teamId: string;
  color: string;
  points: number;
  gap: number;
  maxPoints: number;
  alive: boolean;
  eliminatedReason: string | null;
}

export interface TitlePicture {
  throughRound: number;
  remainingRaces: number;
  maxRemainingPerDriver: number;
  leader: TitleContender;
  contenders: TitleContender[];
  aliveCount: number;
}

export function getTitlePicture(uptoRound = season.throughRound): TitlePicture {
  const remainingRaces = calendar.filter((r) => r.round > uptoRound).length;
  const maxRemainingPerDriver = remainingRaces * 25;
  const table = season.standingsHistory.find((h) => h.round === uptoRound)?.drivers ?? [];
  const leaderEntry = [...table].sort((a, b) => b.points - a.points)[0];
  const leaderDriver = season.drivers.find((d) => d.code === leaderEntry?.code) ?? season.drivers[0];

  const contenders: TitleContender[] = table
    .map((entry) => {
      const driver = driverByCode.get(entry.code);
      const team = driver ? teamById.get(driver.teamId) : undefined;
      const maxPoints = entry.points + maxRemainingPerDriver;
      const alive = maxPoints >= leaderDriver.points;
      return {
        code: entry.code,
        name: driver?.name ?? entry.code,
        teamId: driver?.teamId ?? "",
        color: team?.color ?? "#6b7280",
        points: entry.points,
        gap: leaderDriver.points - entry.points,
        maxPoints,
        alive,
        eliminatedReason: alive
          ? null
          : `Máximo de ${maxPoints} pts não alcança os ${leaderDriver.points} do líder`,
      };
    })
    .sort((a, b) => b.points - a.points);

  return {
    throughRound: uptoRound,
    remainingRaces,
    maxRemainingPerDriver,
    leader: contenders.find((c) => c.code === leaderDriver.code) ?? contenders[0],
    contenders,
    aliveCount: contenders.filter((c) => c.alive).length,
  };
}

export const pointsForPosition = (position: number) => POINTS[position - 1] ?? 0;
