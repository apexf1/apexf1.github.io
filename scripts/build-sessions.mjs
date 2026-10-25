#!/usr/bin/env node
/**
 * Constrói src/data/sessions2026.json a partir da API pública da OpenF1.
 *
 * Para cada ronda do calendário da app, encontra a reunião correspondente e
 * guarda os horários de FP1/FP2/FP3 e da qualificação. Os resultados vêm de
 * /v1/session_result: nos treinos, a melhor volta, as voltas e o gap ao líder;
 * na qualificação, os tempos de Q1/Q2/Q3 de cada piloto.
 *
 * Uso: npm run data:sessions
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(root, ".cache/openf1-sessions");
const OUT = resolve(root, "src/data/sessions2026.json");
const BASE = "https://api.openf1.org/v1";
const USER_AGENT = "apex-f1/1.0 (data build)";

const season = JSON.parse(await readFile(resolve(root, "src/data/season2026.json"), "utf8"));

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function getJson(path, cacheKey, { retry = 4 } = {}) {
  const file = resolve(CACHE, `${cacheKey}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    /* ainda não está em cache */
  }

  for (let attempt = 0; attempt < retry; attempt += 1) {
    const response = await fetch(BASE + path, { headers: { "User-Agent": USER_AGENT } });
    if (response.status === 429) {
      const wait = 1200 * (attempt + 1);
      console.warn(`429 em ${path}; a esperar ${wait} ms`);
      await sleep(wait);
      continue;
    }
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const data = await response.json();
    // erro devolvido com HTTP 200 (a API faz isto em alguns limites)
    if (data && !Array.isArray(data) && data.error) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    await writeFile(file, JSON.stringify(data));
    return data;
  }
  throw new Error(`${path}: desisti depois de ${retry} tentativas`);
}

const day = (iso) => new Date(iso).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

await mkdir(CACHE, { recursive: true });
await mkdir(dirname(OUT), { recursive: true });

console.log("A carregar reuniões e sessões de 2026…");
const meetings = await getJson("/meetings?year=2026", "meetings-2026");
const allSessions = await getJson("/sessions?year=2026", "sessions-2026");

const sessionsByMeeting = new Map();
for (const session of allSessions) {
  const list = sessionsByMeeting.get(session.meeting_key) ?? [];
  list.push(session);
  sessionsByMeeting.set(session.meeting_key, list);
}

const numberToCode = new Map(season.drivers.map((driver) => [driver.number, driver.code]));
const wanted = ["Practice 1", "Practice 2", "Practice 3", "Sprint Qualifying", "Qualifying"];
const ids = {
  "Practice 1": "fp1",
  "Practice 2": "fp2",
  "Practice 3": "fp3",
  "Sprint Qualifying": "sprint_quali",
  Qualifying: "quali",
};

/** Em sessões com várias fases a API devolve arrays; fica a melhor volta. */
const bestNumber = (value) => {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    const times = value.filter((item) => typeof item === "number" && item > 0);
    return times.length ? Math.min(...times) : null;
  }
  return null;
};

/** Duração por fase (Q1/Q2/Q3); a API devolve um array alinhado com as fases. */
const phases = (value) => {
  if (typeof value === "number") return [value > 0 ? value : null];
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "number" && item > 0 ? item : null));
};

const rounds = [];
let requests = 0;

for (const race of season.calendar) {
  // a reunião começa até 4 dias antes da corrida e no mesmo fim de semana
  const candidates = meetings
    .map((meeting) => ({
      meeting,
      distance: daysBetween(meeting.date_start, `${race.date}T12:00:00Z`),
    }))
    .filter(({ meeting, distance }) => distance <= 5 && day(meeting.date_start) <= race.date)
    .sort((a, b) => a.distance - b.distance);
  const meeting = candidates[0]?.meeting;

  const entry = {
    round: race.round,
    meetingKey: meeting?.meeting_key ?? null,
    sessions: [],
  };

  if (meeting) {
    const sessions = (sessionsByMeeting.get(meeting.meeting_key) ?? [])
      .filter((session) => wanted.includes(session.session_name))
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

    for (const session of sessions) {
      const record = {
        id: ids[session.session_name],
        name: session.session_name,
        start: session.date_start,
        end: session.date_end,
        cancelled: Boolean(session.is_cancelled),
      };

      const isQuali = session.session_name === "Qualifying";
      const timed =
        session.session_name.startsWith("Practice") ||
        session.session_name === "Sprint Qualifying" ||
        isQuali;
      if (timed && !session.is_cancelled) {
        if (requests > 0) await sleep(700);
        requests += 1;
        try {
          const result = await getJson(
            `/session_result?session_key=${session.session_key}`,
            `result-${session.session_key}`,
          );
          const timedRows = (Array.isArray(result) ? result : [])
            .filter((row) => numberToCode.has(row.driver_number))
            .map((row) => ({
              code: numberToCode.get(row.driver_number),
              position: row.position,
              laps: row.number_of_laps ?? 0,
              time: bestNumber(row.duration),
              gap: bestNumber(row.gap_to_leader),
              phases: phases(row.duration),
              note: row.dnf ? "DNF" : row.dns ? "DNS" : row.dsq ? "DSQ" : null,
            }));

          if (isQuali) {
            // grelha: posição e os tempos de cada fase, do mais rápido ao mais lento
            const quali = timedRows
              .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
              .map((row) => ({
                code: row.code,
                position: row.position,
                q1: row.phases[0] ?? null,
                q2: row.phases[1] ?? null,
                q3: row.phases[2] ?? null,
              }));
            if (quali.length) record.quali = quali;
          } else {
            const leaderTime = timedRows
              .filter((row) => row.time !== null)
              .reduce((best, row) => Math.min(best, row.time), Infinity);
            const rows = timedRows
              .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
              .map((row) => [
                row.code,
                row.position,
                row.laps,
                row.time,
                row.time !== null && Number.isFinite(leaderTime)
                  ? Math.max(0, Number((row.time - leaderTime).toFixed(3)))
                  : row.gap,
                row.note,
              ]);
            if (rows.length) record.results = rows;
          }
        } catch (error) {
          console.warn(`R${race.round} ${session.session_name}: ${error.message}`);
        }
      }

      entry.sessions.push(record);
    }
  }

  console.log(
    `R${String(race.round).padStart(2, "0")} ${race.shortName}: ` +
      (entry.sessions
        .map((s) => {
          const count = s.results?.length ?? s.quali?.length ?? 0;
          return s.id + (count ? `(${count})` : "");
        })
        .join(" ") || "sem sessões"),
  );
  rounds.push(entry);
}

const output = {
  generated: new Date().toISOString(),
  source: "OpenF1 (sessions + session_result)",
  season: season.season,
  rounds,
};

await writeFile(OUT, JSON.stringify(output));
const size = (await readFile(OUT)).length;
console.log(`\nEscrito ${OUT} (${(size / 1024).toFixed(1)} KB), ${requests} pedidos de resultados.`);
