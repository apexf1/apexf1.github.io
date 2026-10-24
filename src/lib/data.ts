import seasonJson from "../data/season2026.json";
import type {
  Driver,
  DriverMetrics,
  Race,
  RoundQualifying,
  RoundResults,
  Season,
  Team,
  TeamMetrics,
} from "../types";

export const season = seasonJson as unknown as Season;

export const ACTIVE_MIN_STARTS = 5;

export const drivers: Driver[] = season.drivers;
export const teams: Team[] = season.teams;
export const calendar: Race[] = season.calendar;
export const activeDrivers: Driver[] = drivers.filter((d) => d.starts >= ACTIVE_MIN_STARTS);

export const driverByCode = new Map(drivers.map((d) => [d.code, d]));
export const teamById = new Map(teams.map((t) => [t.id, t]));
export const raceByRound = new Map(calendar.map((r) => [r.round, r]));

export const resultsByRound = new Map<number, RoundResults>(
  season.results.map((r) => [r.round, r]),
);
export const qualifyingByRound = new Map<number, RoundQualifying>(
  season.qualifying.map((q) => [q.round, q]),
);

const WET_PRIOR: Record<string, number> = {
  VER: 98, HAM: 96, ALO: 94, RUS: 89, SAI: 87, PER: 88, LEC: 85, NOR: 84,
  GAS: 84, HUL: 83, BOT: 82, ANT: 82, PIA: 80, OCO: 78, ALB: 78, TSU: 76,
  HAD: 75, LAW: 74, STR: 72, BEA: 70, COL: 70, BOR: 68, LIN: 66,
};

export const driverTeam = (code: string): Team | undefined => {
  const driver = driverByCode.get(code);
  return driver ? teamById.get(driver.teamId) : undefined;
};

export const teammateOf = (code: string, uptoRound = season.throughRound): Driver | null => {
  const driver = driverByCode.get(code);
  if (!driver) return null;
  const sameTeam = activeDrivers.filter((d) => d.teamId === driver.teamId && d.code !== code);
  if (!sameTeam.length) return null;
  const shared = (candidate: Driver) =>
    season.results
      .filter((r) => r.round <= uptoRound)
      .filter(
        (r) =>
          r.results.some((x) => x.code === code) &&
          r.results.some((x) => x.code === candidate.code),
      ).length;
  return [...sameTeam].sort((a, b) => shared(b) - shared(a))[0] ?? null;
};

const bestQualiTime = (entry: { q1: number | null; q2: number | null; q3: number | null }) =>
  entry.q3 ?? entry.q2 ?? entry.q1 ?? null;

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const stdev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const minMax = (values: number[], lo = 35, hi = 99): ((v: number) => number) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return () => (lo + hi) / 2;
  return (v) => lo + ((v - min) / (max - min)) * (hi - lo);
};

const metricsCache = new Map<number, Map<string, DriverMetrics>>();

export function getMetrics(uptoRound = season.throughRound): Map<string, DriverMetrics> {
  const cached = metricsCache.get(uptoRound);
  if (cached) return cached;

  const results = season.results.filter((r) => r.round <= uptoRound);
  const qualifying = season.qualifying.filter((q) => q.round <= uptoRound);
  const raw: Omit<DriverMetrics, "attributes">[] = [];

  for (const driver of drivers) {
    const own = results
      .map((round) => ({
        round: round.round,
        result: round.results.find((x) => x.code === driver.code),
      }))
      .filter((x): x is { round: number; result: NonNullable<typeof x.result> } => Boolean(x.result));

    const starts = own.length;
    if (!starts) {
      raw.push({
        code: driver.code,
        teamId: driver.teamId,
        starts: 0,
        points: driver.points,
        wins: driver.wins,
        podiums: driver.podiums,
        dnfRate: 0,
        avgFinish: 20,
        avgGrid: 20,
        positionsGained: 0,
        form: [],
        consistency: 6,
        qualiWins: 0,
        qualiLosses: 0,
        qualiMedianDelta: 0,
        raceWins: 0,
        raceLosses: 0,
        raceMedianDelta: 0,
        tyreGain: 0,
        teammate: null,
      });
      continue;
    }

    const teammate = teammateOf(driver.code, uptoRound);
    const qualiWins: number[] = [];
    const qualiLosses: number[] = [];
    const qualiDeltas: number[] = [];
    const raceWins: number[] = [];
    const raceLosses: number[] = [];
    const raceDeltas: number[] = [];

    for (const round of results) {
      const mine = round.results.find((x) => x.code === driver.code);
      const theirs = teammate ? round.results.find((x) => x.code === teammate.code) : null;
      if (!mine || !theirs) continue;
      if (mine.finished && theirs.finished) {
        if (mine.position < theirs.position) raceWins.push(round.round);
        if (mine.position > theirs.position) raceLosses.push(round.round);
        raceDeltas.push(mine.position - theirs.position);
      }
      const q = qualifying.find((x) => x.round === round.round);
      const qMine = q?.results.find((x) => x.code === driver.code);
      const qTheirs = teammate ? q?.results.find((x) => x.code === teammate.code) : undefined;
      if (qMine && qTheirs) {
        if (qMine.position < qTheirs.position) qualiWins.push(round.round);
        if (qMine.position > qTheirs.position) qualiLosses.push(round.round);
        const tMine = bestQualiTime(qMine);
        const tTheirs = bestQualiTime(qTheirs);
        if (tMine !== null && tTheirs !== null) qualiDeltas.push(tMine - tTheirs);
      }
    }

    const effectivePositions = own.map(({ result }) =>
      result.finished ? result.position : 21,
    );
    const finished = own.filter(({ result }) => result.finished);
    const avgFinish =
      effectivePositions.reduce((a, b) => a + b, 0) / Math.max(effectivePositions.length, 1);
    const avgGrid =
      own.filter(({ result }) => result.grid > 0).reduce((a, { result }) => a + result.grid, 0) /
      Math.max(own.filter(({ result }) => result.grid > 0).length, 1);
    const positionsGained = finished.length
      ? finished.reduce((a, { result }) => a + (result.grid - result.position), 0) / finished.length
      : 0;
    const tyreRaces = finished.filter(({ round }) => {
      const race = raceByRound.get(round);
      return (race?.profile.tyre ?? 0) >= 0.65;
    });
    const tyreGain = tyreRaces.length
      ? tyreRaces.reduce((a, { result }) => a + (result.grid - result.position), 0) / tyreRaces.length
      : 0;

    const form = own.slice(-5).map(({ result }) => result.points);

    raw.push({
      code: driver.code,
      teamId: driver.teamId,
      starts,
      points: driver.points,
      wins: driver.wins,
      podiums: driver.podiums,
      dnfRate: own.filter(({ result }) => !result.finished).length / starts,
      avgFinish,
      avgGrid,
      positionsGained,
      form,
      consistency: stdev(effectivePositions),
      qualiWins: qualiWins.length,
      qualiLosses: qualiLosses.length,
      qualiMedianDelta: median(qualiDeltas),
      raceWins: raceWins.length,
      raceLosses: raceLosses.length,
      raceMedianDelta: median(raceDeltas),
      tyreGain,
      teammate: teammate?.code ?? null,
    });
  }

  const activeRaw = raw.filter((m) => m.starts >= ACTIVE_MIN_STARTS);
  const normalize = {
    quali: minMax(activeRaw.map((m) => -m.qualiMedianDelta * 120 - m.avgGrid * 1.4)),
    race: minMax(activeRaw.map((m) => -m.raceMedianDelta * 4 + m.positionsGained * 2.2)),
    consistency: minMax(activeRaw.map((m) => -m.consistency)),
    tyre: minMax(activeRaw.map((m) => m.tyreGain)),
    reliability: minMax(activeRaw.map((m) => -m.dnfRate)),
  };

  const result = new Map<string, DriverMetrics>();
  for (const m of raw) {
    result.set(m.code, {
      ...m,
      attributes: {
        quali: Math.round(normalize.quali(-m.qualiMedianDelta * 120 - m.avgGrid * 1.4)),
        race: Math.round(normalize.race(-m.raceMedianDelta * 4 + m.positionsGained * 2.2)),
        consistency: Math.round(normalize.consistency(-m.consistency)),
        tyre: Math.round(normalize.tyre(m.tyreGain)),
        wet: WET_PRIOR[m.code] ?? 72,
        reliability: Math.round(normalize.reliability(-m.dnfRate)),
      },
    });
  }
  metricsCache.set(uptoRound, result);
  return result;
}

const teamMetricsCache = new Map<number, Map<string, TeamMetrics>>();

export function getTeamMetrics(uptoRound = season.throughRound): Map<string, TeamMetrics> {
  const cached = teamMetricsCache.get(uptoRound);
  if (cached) return cached;
  const recentRounds = season.results.filter((r) => r.round <= uptoRound).slice(-5);
  const raw = new Map<string, TeamMetrics>();

  for (const team of teams) {
    const teamResults = season.results
      .filter((r) => r.round <= uptoRound)
      .flatMap((r) => r.results.filter((x) => x.teamId === team.id));
    const starts = teamResults.length;
    const gpPoints = teamResults.reduce((a, b) => a + b.points, 0);
    const recentPoints = recentRounds
      .flatMap((r) => r.results.filter((x) => x.teamId === team.id))
      .reduce((a, b) => a + b.points, 0);
    const roundsWithTeam = new Set(
      season.results
        .filter((r) => r.round <= uptoRound)
        .filter((r) => r.results.some((x) => x.teamId === team.id)).map((r) => r.round),
    ).size;
    raw.set(team.id, {
      teamId: team.id,
      gpPointsPerRace: roundsWithTeam ? gpPoints / roundsWithTeam : 0,
      recentPointsPerRace: recentRounds.length ? recentPoints / recentRounds.length : 0,
      dnfRate: starts ? teamResults.filter((x) => !x.finished).length / starts : 0,
      pace: 0,
    });
  }

  const priors = new Map(
    teams.map((t) => [t.id, (t.base2025 || 0) / 24]),
  );
  const scores = [...raw.values()].map(
    (m) =>
      0.55 * m.gpPointsPerRace +
      0.35 * m.recentPointsPerRace +
      0.1 * (priors.get(m.teamId) ?? 0),
  );
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const spread = Math.max(maxScore - minScore, 0.001);

  for (const [id, metric] of raw) {
    const idx = [...raw.keys()].indexOf(id);
    const score = scores[idx];
    metric.pace = ((maxScore - score) / spread) * 2.35;
  }

  const result = new Map([...raw.entries()].map(([id, m]) => [id, { ...m }]));
  teamMetricsCache.set(uptoRound, result);
  return result;
}

export const getDriverMetrics = (code: string, uptoRound = season.throughRound) =>
  getMetrics(uptoRound).get(code);

export function getUpcomingRace(now: Date = new Date()): Race {
  const upcoming = calendar.find((race) => new Date(race.startUTC).getTime() > now.getTime());
  return upcoming ?? calendar[calendar.length - 1];
}

export function getNextRounds(count: number, now: Date = new Date()): Race[] {
  const next = getUpcomingRace(now);
  return calendar.filter((race) => race.round >= next.round).slice(0, count);
}

export function isRaceDone(round: number): boolean {
  return resultsByRound.has(round);
}

export function winnerOfRound(round: number): string | null {
  return resultsByRound.get(round)?.results[0]?.code ?? null;
}

export const seasonProgress = season.results.length / calendar.length;

export const totalGpPointsAvailable = (fromRound: number) =>
  calendar.filter((race) => race.round >= fromRound).length * 25;
