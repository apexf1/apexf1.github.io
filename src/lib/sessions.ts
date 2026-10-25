import sessionsJson from "../data/sessions2026.json";
import { qualifyingByRound } from "./data";
import type { QualifyingEntry } from "../types";

/** [código, posição, voltas, melhor volta, gap, nota] */
type PracticeRow = [string, number, number, number | null, number | null, string | null];

export type SessionId = "fp1" | "fp2" | "fp3" | "sprint_quali" | "quali";

export interface WeekendSession {
  id: SessionId;
  name: string;
  start: string;
  end: string;
  cancelled: boolean;
  results?: PracticeRow[];
  /** Q1/Q2/Q3 por piloto; presente nas sessões de qualificação publicadas. */
  quali?: QualifyingEntry[];
}

export interface Weekend {
  round: number;
  meetingKey: number | null;
  sessions: WeekendSession[];
}

interface SessionsFile {
  generated: string;
  source: string;
  season: number;
  rounds: Weekend[];
}

const file = sessionsJson as unknown as SessionsFile;

export const sessionsGenerated = file.generated;
export const weekendByRound = new Map(file.rounds.map((weekend) => [weekend.round, weekend]));

export type SessionState = "done" | "live" | "upcoming" | "missed" | "cancelled";

const hasTiming = (session: WeekendSession, round: number): boolean => {
  if (session.id === "quali") return Boolean(session.quali?.length) || qualifyingByRound.has(round);
  return Boolean(session.results?.length);
};

export function sessionState(
  session: WeekendSession,
  round: number,
  now: Date = new Date(),
): SessionState {
  if (session.cancelled) return "cancelled";
  const start = new Date(session.start).getTime();
  const end = new Date(session.end).getTime();
  if (now.getTime() >= start && now.getTime() <= end) return "live";
  if (hasTiming(session, round)) return "done";
  if (now.getTime() > end) return "missed";
  return "upcoming";
}

export interface ClassificationRow {
  code: string;
  position: number;
  laps?: number;
  time: number | null;
  gap: number | null;
  note?: string | null;
  q1?: number | null;
  q2?: number | null;
  q3?: number | null;
}

const bestQualifyingTime = (entry: QualifyingEntry): number | null =>
  entry.q3 ?? entry.q2 ?? entry.q1 ?? null;

/** Classificação de uma sessão, já ordenada e com gaps calculados. */
export function classificationFor(round: number, session: WeekendSession): ClassificationRow[] {
  if (session.id === "quali") {
    const entries = session.quali?.length
      ? session.quali
      : qualifyingByRound.get(round)?.results ?? [];
    const best = entries
      .map(bestQualifyingTime)
      .filter((time): time is number => time !== null);
    const pole = best.length ? Math.min(...best) : null;
    return [...entries]
      .sort((a, b) => a.position - b.position)
      .map((entry) => {
        const time = bestQualifyingTime(entry);
        return {
          code: entry.code,
          position: entry.position,
          time,
          gap: time !== null && pole !== null ? Math.max(0, time - pole) : null,
          q1: entry.q1,
          q2: entry.q2,
          q3: entry.q3,
        };
      });
  }

  return (session.results ?? [])
    .map(([code, position, laps, time, gap, note]) => ({
      code,
      position,
      laps,
      time,
      gap,
      note,
    }))
    .sort((a, b) => a.position - b.position);
}

/** Sessão que deve abrir por omissão: a última concluída ou a próxima. */
export function defaultSessionId(
  sessions: WeekendSession[],
  round: number,
  now: Date = new Date(),
): SessionId | null {
  const done = sessions.filter((session) => sessionState(session, round, now) === "done");
  if (done.length) return done[done.length - 1].id;
  const live = sessions.find((session) => sessionState(session, round, now) === "live");
  if (live) return live.id;
  return sessions[0]?.id ?? null;
}

export const sessionShortLabel = (session: WeekendSession): string => {
  if (session.id === "sprint_quali") return "SQ";
  if (session.id === "quali") return "Q";
  return `FP${session.id.slice(-1)}`;
};

export const sessionNumber = (session: WeekendSession): string | null => {
  if (session.id.startsWith("fp")) return session.id.slice(-1);
  return null;
};
