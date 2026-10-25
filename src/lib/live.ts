import { useEffect, useState } from "react";
import type { QualifyingEntry } from "../types";
import { drivers } from "./data";
import type { SessionId, WeekendSession } from "./sessions";

/**
 * Sessões do fim de semana em directo da OpenF1.
 *
 * O JSON incluído na build serve de base (e de fallback offline); esta camada
 * substitui-o pelos dados mais recentes, para que uma qualificação ou um treino
 * apareçam sem ser preciso gerar e publicar a app de novo.
 */

const API =
  (import.meta.env.VITE_OPENF1_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "https://api.openf1.org/v1";

/** Enquanto há sessão a decorrer (ou a começar) vamos buscar de novo com frequência. */
const LIVE_REFRESH = 45_000;
const IDLE_REFRESH = 5 * 60_000;

const SESSION_IDS: Record<string, SessionId> = {
  "Practice 1": "fp1",
  "Practice 2": "fp2",
  "Practice 3": "fp3",
  "Sprint Qualifying": "sprint_quali",
  Qualifying: "quali",
};

interface RawSession {
  session_key: number;
  session_name: string;
  date_start: string;
  date_end: string;
  is_cancelled?: boolean;
}

interface RawResult {
  driver_number: number;
  position: number | null;
  number_of_laps?: number | null;
  duration?: number | number[] | null;
  gap_to_leader?: number | number[] | null;
  dnf?: boolean;
  dns?: boolean;
  dsq?: boolean;
}

const numberToCode = new Map(drivers.map((driver) => [driver.number, driver.code] as const));

const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

const series = (value: unknown): (number | null)[] =>
  Array.isArray(value) ? value.map(positive) : [positive(value)];

const best = (value: unknown): number | null => {
  const times = series(value).filter((time): time is number => time !== null);
  return times.length ? Math.min(...times) : null;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** A API limita pedidos por minuto; um 429 merece uma segunda tentativa calma. */
async function getResult(sessionKey: number): Promise<RawResult[]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await getJson<RawResult[]>(`/session_result?session_key=${sessionKey}`);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      const retryable = String(error).includes("429");
      if (!retryable || attempt >= 2) return [];
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const note = (row: RawResult) =>
  row.dnf ? "DNF" : row.dns ? "DNS" : row.dsq ? "DSQ" : null;

function toQualifying(rows: RawResult[]): QualifyingEntry[] {
  return rows
    .filter((row) => row.position !== null && numberToCode.has(row.driver_number))
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((row) => {
      const phases = series(row.duration);
      return {
        code: numberToCode.get(row.driver_number)!,
        position: row.position!,
        q1: phases[0] ?? null,
        q2: phases[1] ?? null,
        q3: phases[2] ?? null,
      };
    });
}

function toPractice(rows: RawResult[]): NonNullable<WeekendSession["results"]> {
  const timed = rows
    .filter((row) => row.position !== null && numberToCode.has(row.driver_number))
    .map((row) => ({
      code: numberToCode.get(row.driver_number)!,
      position: row.position!,
      laps: row.number_of_laps ?? 0,
      time: best(row.duration),
      note: note(row),
    }));
  const leader = timed.reduce(
    (best, row) => (row.time !== null ? Math.min(best, row.time) : best),
    Number.POSITIVE_INFINITY,
  );
  return timed
    .sort((a, b) => a.position - b.position)
    .map((row) => [
      row.code,
      row.position,
      row.laps,
      row.time,
      row.time !== null && Number.isFinite(leader) ? Math.max(0, Number((row.time - leader).toFixed(3))) : null,
      row.note,
    ]);
}

/** Horário e resultados de todas as sessões de uma reunião. */
export async function fetchLiveWeekend(meetingKey: number): Promise<WeekendSession[]> {
  const raw = await getJson<RawSession[]>(`/sessions?meeting_key=${meetingKey}`);
  const wanted = (Array.isArray(raw) ? raw : [])
    .filter((item) => SESSION_IDS[item.session_name])
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());

  const sessions: WeekendSession[] = [];
  let resultRequests = 0;
  for (const item of wanted) {
    const id = SESSION_IDS[item.session_name];
    const session: WeekendSession = {
      id,
      name: item.session_name,
      start: item.date_start,
      end: item.date_end,
      cancelled: Boolean(item.is_cancelled),
    };
    if (session.cancelled) {
      sessions.push(session);
      continue;
    }

    // nada a pedir antes de a sessão começar (evita 404 e pedidos inúteis)
    if (new Date(item.date_start).getTime() > Date.now()) {
      sessions.push(session);
      continue;
    }

    // pedidos em série e espaçados: em paralelo a API responde 429
    if (resultRequests > 0) await pause(350);
    resultRequests += 1;
    const rows = await getResult(item.session_key);
    if (rows.length) {
      if (id === "quali") {
        const quali = toQualifying(rows);
        if (quali.length) session.quali = quali;
      } else {
        const results = toPractice(rows);
        if (results.length) session.results = results;
      }
    }
    sessions.push(session);
  }
  return sessions;
}

interface CacheEntry {
  at: number;
  sessions: WeekendSession[];
}

const cache = new Map<number, CacheEntry>();

export interface LiveWeekend {
  sessions: WeekendSession[] | null;
  updatedAt: number | null;
  status: "idle" | "loading" | "live" | "error";
}

const refreshing = (sessions: WeekendSession[] | null, now: number): boolean =>
  Boolean(
    sessions?.some((session) => {
      const start = new Date(session.start).getTime();
      const end = new Date(session.end).getTime();
      return now >= start - 10 * 60_000 && now <= end + 5 * 60_000;
    }),
  );

/**
 * @param poll true para o fim de semana em curso (actualiza sozinho);
 *             false para etapas antigas, que já não mudam.
 */
export function useLiveWeekend(
  round: number,
  meetingKey: number | null,
  poll: boolean,
): LiveWeekend {
  const [state, setState] = useState<LiveWeekend>(() => {
    const hit = cache.get(round);
    return hit
      ? { sessions: hit.sessions, updatedAt: hit.at, status: "live" }
      : { sessions: null, updatedAt: null, status: "idle" };
  });

  useEffect(() => {
    const hit = cache.get(round);
    setState(
      hit
        ? { sessions: hit.sessions, updatedAt: hit.at, status: "live" }
        : { sessions: null, updatedAt: null, status: meetingKey ? "loading" : "idle" },
    );
    if (!meetingKey) return;

    let active = true;
    let timer: number | undefined;

    const load = async () => {
      try {
        const sessions = await fetchLiveWeekend(meetingKey);
        const at = Date.now();
        cache.set(round, { at, sessions });
        if (!active) return;
        setState({ sessions, updatedAt: at, status: "live" });
        if (poll) timer = window.setTimeout(load, refreshing(sessions, at) ? LIVE_REFRESH : IDLE_REFRESH);
      } catch {
        if (!active) return;
        setState((current) =>
          current.sessions
            ? { ...current, status: "live" }
            : { sessions: null, updatedAt: null, status: "error" },
        );
        // a API limita pedidos por minuto: volta a tentar cedo, sem bloquear a UI
        if (poll) timer = window.setTimeout(load, 30_000);
      }
    };

    void load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [round, meetingKey, poll]);

  return state;
}
