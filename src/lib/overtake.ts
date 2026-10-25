import { drivers, season, teamById } from "./data";

/**
 * "Segundo ecrã": previsão de ultrapassagem com dados em directo da OpenF1.
 *
 * - gap entre dois pilotos vem de /intervals (gap_to_leader);
 * - ritmo é a média das últimas 3 voltas limpas (sem out-laps nem voltas de
 *   safety car, descartadas por desvio à mediana);
 * - ETA = gap / ganho por volta.
 *
 * Tudo o que é cálculo puro está separado do fetch para poder ser testado.
 */

const API =
  (import.meta.env.VITE_OPENF1_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "https://api.openf1.org/v1";

const TIMEOUT_MS = 12_000;
const REQUEST_GAP_MS = 120;
export const POLL_MS = 10_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson<T>(path: string, attempt = 0): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (response.status === 429 && attempt < 1) {
      clearTimeout(timer);
      await pause(1200);
      return getJson<T>(path, attempt + 1);
    }
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface SessionDriver {
  number: number;
  code: string;
  name: string;
  team: string;
  color: string;
}

export interface LiveSession {
  key: number;
  name: string;
  circuit: string;
  country: string;
  start: string;
  end: string;
  /** voltas da corrida, quando o calendário local reconhece a prova */
  totalLaps: number | null;
}

export type DemoReason = "offline" | "no-session" | "not-race";

export type LiveProbe =
  | { status: "live"; session: LiveSession }
  | { status: "demo"; reason: DemoReason };

interface RawSession {
  session_key: number;
  session_name: string;
  date_start: string;
  date_end: string;
  circuit_short_name?: string;
  country_name?: string;
  location?: string;
}

interface RawDriver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_colour?: string;
}

interface RawInterval {
  date: string;
  driver_number: number;
  gap_to_leader: number | string | null;
  interval: number | string | null;
}

interface RawLap {
  lap_number: number;
  lap_duration: number | null;
  is_pit_out_lap?: boolean;
}

const hex = (colour?: string) => {
  if (!colour) return null;
  const clean = colour.replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(clean) ? `#${clean}` : null;
};

const latestByDriver = (rows: RawInterval[]): Map<number, RawInterval> => {
  const map = new Map<number, RawInterval>();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row.driver_number !== "number") continue;
    const previous = map.get(row.driver_number);
    if (!previous || Date.parse(row.date) >= Date.parse(previous.date)) {
      map.set(row.driver_number, row);
    }
  }
  return map;
};

/** "+1 LAP" e afins não são gaps numéricos: devolvem null. */
export function parseGap(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/^\+/, "");
  if (!clean || /lap/i.test(clean)) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export interface PaceStats {
  pace: number | null;
  laps: number[];
  lastLap: number | null;
  currentLap: number | null;
}

/**
 * Média das últimas `window` voltas limpas.
 *
 * Descarta voltas de entrada/saída das boxes, voltas atrás do safety car e
 * quaisquer tempos a mais de 3% da mediana recente — sem isto, uma única
 * volta lenta estragaria a previsão durante várias voltas.
 */
export function paceOf(raw: RawLap[], window = 3): PaceStats {
  const rows = (Array.isArray(raw) ? raw : [])
    .filter((lap) => Number.isFinite(lap.lap_number))
    .sort((a, b) => a.lap_number - b.lap_number);
  const currentLap = rows.length ? rows[rows.length - 1].lap_number : null;

  const valid = rows.filter(
    (lap): lap is RawLap & { lap_duration: number } =>
      typeof lap.lap_duration === "number" &&
      Number.isFinite(lap.lap_duration) &&
      lap.lap_duration >= 30 &&
      lap.lap_duration <= 300 &&
      !lap.is_pit_out_lap,
  );
  if (!valid.length) return { pace: null, laps: [], lastLap: null, currentLap };

  const sample = valid.slice(-12).map((lap) => lap.lap_duration);
  const sorted = [...sample].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const tolerance = Math.max(1.2, median * 0.03);
  const clean = valid
    .filter((lap) => Math.abs(lap.lap_duration - median) <= tolerance)
    .slice(-window);

  const laps = clean.map((lap) => Number(lap.lap_duration.toFixed(3)));
  const pace = laps.length ? laps.reduce((sum, time) => sum + time, 0) / laps.length : null;

  return {
    pace: pace === null ? null : Number(pace.toFixed(3)),
    laps,
    lastLap: valid[valid.length - 1].lap_duration,
    currentLap,
  };
}

export interface DriverState extends SessionDriver {
  gapToLeader: number | null;
  lapped: boolean;
  pace: number | null;
  laps: number[];
  lastLap: number | null;
  currentLap: number | null;
}

export type Verdict = "attack" | "stable" | "side-by-side" | "lapped" | "late" | "unknown";

export interface OvertakePrediction {
  ahead: DriverState;
  behind: DriverState;
  gap: number | null;
  /** segundos por volta ganhos pelo piloto de trás (positivo = mais rápido) */
  gain: number | null;
  lapsToPass: number | null;
  targetLap: number | null;
  currentLap: number | null;
  totalLaps: number | null;
  remainingLaps: number | null;
  verdict: Verdict;
}

const emptyPrediction = (
  ahead: DriverState,
  behind: DriverState,
  totalLaps: number | null,
): Omit<OvertakePrediction, "verdict"> => {
  const currentLap = Math.max(ahead.currentLap ?? 0, behind.currentLap ?? 0) || null;
  return {
    ahead,
    behind,
    gap: null,
    gain: null,
    lapsToPass: null,
    targetLap: null,
    currentLap,
    totalLaps,
    remainingLaps:
      totalLaps !== null && currentLap !== null ? Math.max(0, totalLaps - currentLap) : null,
  };
};

export function predictOvertake(
  ahead: DriverState,
  behind: DriverState,
  totalLaps: number | null = null,
): OvertakePrediction {
  const base = emptyPrediction(ahead, behind, totalLaps);
  if (ahead.lapped || behind.lapped) return { ...base, verdict: "lapped" };
  if (ahead.gapToLeader === null || behind.gapToLeader === null) {
    return { ...base, verdict: "unknown" };
  }

  const gap = Math.max(0, behind.gapToLeader - ahead.gapToLeader);
  const gain =
    ahead.pace !== null && behind.pace !== null ? ahead.pace - behind.pace : null;

  if (gap <= 0.15) return { ...base, gap, gain, verdict: "side-by-side" };
  if (gain === null) return { ...base, gap, verdict: "unknown" };
  if (gain <= 0.02) return { ...base, gap, gain, verdict: "stable" };

  // arredondar evita que 9.9999999… suba uma volta inteira no ceil
  const lapsToPass = Number((gap / gain).toFixed(2));
  if (base.remainingLaps !== null && lapsToPass > base.remainingLaps + 0.5) {
    return { ...base, gap, gain, lapsToPass, verdict: "late" };
  }
  const targetLap =
    base.currentLap === null
      ? null
      : base.currentLap + Math.max(1, Math.ceil(lapsToPass));

  return { ...base, gap, gain, lapsToPass, targetLap, verdict: "attack" };
}

/** 0 = sem pressão; 1 = ultrapassagem iminente. Usado na barra do painel. */
export function pressureOf(prediction: OvertakePrediction): number {
  if (prediction.verdict === "side-by-side") return 1;
  if (prediction.verdict !== "attack" || prediction.lapsToPass === null) return 0;
  return Math.min(0.96, Math.max(0.05, 1 - prediction.lapsToPass / 12));
}

/** Qual das duas leituras está à frente (o menor gap ao líder). */
export function orderPair(
  first: DriverState,
  second: DriverState,
): [DriverState, DriverState] {
  if (first.lapped && !second.lapped) return [second, first];
  if (second.lapped && !first.lapped) return [first, second];
  if (first.gapToLeader === null) return [second, first];
  if (second.gapToLeader === null) return [first, second];
  return first.gapToLeader <= second.gapToLeader ? [first, second] : [second, first];
}

/** Corrida (ou sprint) em directo; qualquer outra coisa cai no modo demo. */
export async function probeLiveSession(now = Date.now()): Promise<LiveProbe> {
  let rows: RawSession[];
  try {
    rows = await getJson<RawSession[]>(`/sessions?session_key=latest`);
  } catch {
    return { status: "demo", reason: "offline" };
  }
  if (!Array.isArray(rows) || !rows.length) return { status: "demo", reason: "no-session" };

  const latest = [...rows].sort(
    (a, b) => Date.parse(b.date_start) - Date.parse(a.date_start),
  )[0];
  if (!/^(race|sprint)$/i.test(latest.session_name ?? "")) {
    return { status: "demo", reason: "not-race" };
  }

  const start = Date.parse(latest.date_start);
  const end = Date.parse(latest.date_end);
  const live = Number.isFinite(start) && Number.isFinite(end) && now >= start - 10 * 60_000 && now <= end + 20 * 60_000;
  if (!live) return { status: "demo", reason: "no-session" };

  return {
    status: "live",
    session: {
      key: latest.session_key,
      name: latest.session_name,
      circuit: latest.circuit_short_name ?? "",
      country: latest.country_name ?? latest.location ?? "",
      start: latest.date_start,
      end: latest.date_end,
      totalLaps: totalLapsFor(latest.date_start),
    },
  };
}

/** A corrida do calendário local começa à mesma hora que a sessão da OpenF1. */
function totalLapsFor(start: string): number | null {
  const at = Date.parse(start);
  if (!Number.isFinite(at)) return null;
  const race = season.calendar.find(
    (entry) => Math.abs(Date.parse(entry.startUTC) - at) <= 3 * 60 * 60 * 1000,
  );
  return race?.laps ?? null;
}

export async function fetchSessionDrivers(sessionKey: number): Promise<SessionDriver[]> {
  const rows = await getJson<RawDriver[]>(`/drivers?session_key=${sessionKey}`);
  const seen = new Set<number>();
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    if (!row || typeof row.driver_number !== "number" || !row.name_acronym) return [];
    if (seen.has(row.driver_number)) return [];
    seen.add(row.driver_number);
    const fallback = drivers.find((driver) => driver.number === row.driver_number);
    const team = fallback ? teamById.get(fallback.teamId) : undefined;
    return [
      {
        number: row.driver_number,
        code: row.name_acronym,
        name: row.full_name || fallback?.name || row.name_acronym,
        team: row.team_name || team?.name || "",
        color: hex(row.team_colour) ?? team?.color ?? "#8b95a7",
      },
    ];
  });
}

/** Último gap ao líder de cada piloto (uma leitura por piloto). */
export async function fetchGapBoard(
  sessionKey: number,
): Promise<Map<number, { gap: number | null; lapped: boolean }>> {
  const rows = await getJson<RawInterval[]>(`/intervals?session_key=${sessionKey}`);
  const map = new Map<number, { gap: number | null; lapped: boolean }>();
  for (const [number, row] of latestByDriver(rows)) {
    map.set(number, {
      gap: parseGap(row.gap_to_leader),
      lapped: parseGap(row.gap_to_leader) === null && /lap/i.test(String(row.gap_to_leader)),
    });
  }
  return map;
}

async function latestInterval(
  sessionKey: number,
  driverNumber: number,
): Promise<RawInterval | null> {
  const rows = await getJson<RawInterval[]>(
    `/intervals?session_key=${sessionKey}&driver_number=${driverNumber}`,
  );
  const latest = latestByDriver(rows).get(driverNumber);
  return latest ?? null;
}

/** Gap, estado de volta e ritmo recente de um piloto na sessão. */
export async function fetchDriverState(
  sessionKey: number,
  driver: SessionDriver,
): Promise<DriverState> {
  const interval = await latestInterval(sessionKey, driver.number);
  await pause(REQUEST_GAP_MS);
  const laps = await getJson<RawLap[]>(
    `/laps?session_key=${sessionKey}&driver_number=${driver.number}`,
  );
  const gap = interval ? parseGap(interval.gap_to_leader) : null;
  return {
    ...driver,
    gapToLeader: gap,
    lapped: gap === null && interval ? /lap/i.test(String(interval.gap_to_leader)) : false,
    ...paceOf(laps),
  };
}

/* ───────────────────────── modo demonstração ───────────────────────── */

const DEMO_CODES = ["VER", "NOR", "LEC", "ANT", "HAM", "RUS"];

export const DEMO_DRIVERS: SessionDriver[] = DEMO_CODES.flatMap((code) => {
  const driver = drivers.find((entry) => entry.code === code);
  if (!driver) return [];
  const team = teamById.get(driver.teamId);
  return [
    {
      number: driver.number,
      code: driver.code,
      name: driver.name,
      team: team?.name ?? driver.teamId,
      color: team?.color ?? "#8b95a7",
    },
  ];
});

/**
 * Corrida simulada: o gap fecha-se ~0.25s por volta simulada (10s reais).
 * Devolve sempre os dois pilotos pedidos, com o primeiro na frente.
 */
export function demoDuel(
  elapsedMs: number,
  ahead: SessionDriver,
  behind: SessionDriver,
): { ahead: DriverState; behind: DriverState } {
  const laps = Math.max(0, Math.floor(elapsedMs / POLL_MS));
  const seed = Math.abs(ahead.number - behind.number) % 4;
  const gain = 0.22 + seed * 0.04;
  const startGap = 2.3 + (seed % 3) * 0.55;
  const gap = Math.max(0.08, startGap - gain * laps);
  const base = 91.4 + seed * 0.12;
  const currentLap = 21 + laps;
  const behindPace = base - gain;

  const window = (pace: number) => [
    Number((pace + 0.24).toFixed(3)),
    Number((pace + 0.09).toFixed(3)),
    Number(pace.toFixed(3)),
  ];

  return {
    ahead: {
      ...ahead,
      gapToLeader: 0,
      lapped: false,
      pace: Number(base.toFixed(3)),
      laps: window(base),
      lastLap: Number(base.toFixed(3)),
      currentLap,
    },
    behind: {
      ...behind,
      gapToLeader: gap,
      lapped: false,
      pace: Number(behindPace.toFixed(3)),
      laps: window(behindPace),
      lastLap: Number(behindPace.toFixed(3)),
      currentLap,
    },
  };
}
