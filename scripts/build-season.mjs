#!/usr/bin/env node
/**
 * Actualiza src/data/season2026.json com os resultados oficiais da temporada
 * em curso, a partir da API Jolpica-F1 (sucessora da Ergast).
 *
 * Mantém tudo o que é editorial (calendário, perfis de pista, briefings,
 * cores e nomes de equipas) e substitui apenas o que muda de corrida para
 * corrida: classificação de cada GP, tempos de qualificação, pontos e posições
 * de pilotos e equipas, e o histórico de classificação por ronda.
 *
 * Sem cache em disco: cada execução lê a API, para que uma corrida publicada
 * apareça no site na execução seguinte (o workflow de refresh corre a cada 30
 * minutos).
 *
 * Uso: npm run data:season
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "src/data/season2026.json");
const BASE = "https://api.jolpi.ca/ergast/f1";
const UA = "apex-f1/1.0 (data build)";
const PAGE = 100;
const retries = 4;

const season = JSON.parse(await readFile(OUT, "utf8"));
const year = season.season;
const sleep = (ms) => new Promise((wake) => setTimeout(wake, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA } });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
      const data = await response.json();
      await sleep(550); // a API pública limita a ~4 pedidos por segundo
      return data;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`desisti de ${url}`);
}

/** Junta as páginas da API e as corridas que chegam partidas entre páginas. */
async function paginate(path, key, listKey) {
  const races = new Map();
  let offset = 0;
  for (;;) {
    const page = await getJson(`${BASE}${path}?limit=${PAGE}&offset=${offset}`);
    const rows = page.MRData.RaceTable.Races ?? [];
    for (const race of rows) {
      const round = Number(race.round);
      const list = (race[listKey] ?? []).filter((row) => row[key]);
      if (!list.length) continue;
      const previous = races.get(round);
      if (!previous) {
        races.set(round, { race, rows: [...list] });
        continue;
      }
      const seen = new Set(previous.rows.map((row) => row[key].driverId));
      for (const row of list) {
        if (!seen.has(row[key].driverId)) {
          previous.rows.push(row);
          seen.add(row[key].driverId);
        }
      }
    }
    offset += PAGE;
    if (offset >= Number(page.MRData.total) || !rows.length) break;
  }
  return races;
}

const codeByDriverId = new Map(season.drivers.map((driver) => [driver.driverId, driver.code]));
const codeFor = (driver) => codeByDriverId.get(driver.driverId) ?? driver.code ?? null;

console.log(`A ler resultados de ${year}…`);
const races = await paginate(`/${year}/results.json`, "Driver", "Results");
console.log(`A ler qualificação de ${year}…`);
const quali = await paginate(`/${year}/qualifying.json`, "Driver", "QualifyingResults");

const parseTime = (value) => {
  if (!value) return null;
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(value).trim());
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  return Math.round((minutes * 60 + seconds) * 1000) / 1000;
};

const byPosition = (a, b) => a.position - b.position;

const results = [];
const qualifying = [];
for (const [round, { race, rows }] of [...races].sort((a, b) => a[0] - b[0])) {
  const entries = rows
    .map((row) => ({
      code: codeFor(row.Driver),
      teamId: row.Constructor?.constructorId ?? null,
      grid: Number(row.grid ?? 0),
      position: Number(row.position ?? 0),
      positionText: row.positionText ?? String(row.position ?? ""),
      points: Number(row.points ?? 0),
      laps: Number(row.laps ?? 0),
      status: row.status ?? "",
      finished: row.status === "Finished",
      fastestLapRank: row.FastestLap ? Number(row.FastestLap.rank) : null,
    }))
    .filter((entry) => entry.code && entry.teamId);
  if (!entries.length) continue;
  results.push({
    round,
    circuitId: race.Circuit?.circuitId ?? "",
    results: entries.sort(byPosition),
  });
}
for (const [round, { race, rows }] of [...quali].sort((a, b) => a[0] - b[0])) {
  const entries = rows
    .map((row) => ({
      code: codeFor(row.Driver),
      position: Number(row.position ?? 0),
      q1: parseTime(row.Q1),
      q2: parseTime(row.Q2),
      q3: parseTime(row.Q3),
    }))
    .filter((entry) => entry.code);
  if (!entries.length) continue;
  qualifying.push({
    round,
    circuitId: race.Circuit?.circuitId ?? "",
    results: entries.sort(byPosition),
  });
}

if (!results.length) throw new Error("a API não devolveu nenhuma corrida de 2026");

const throughRound = Math.max(season.throughRound, ...results.map((race) => race.round));

console.log("A ler classificações…");
const standingsPage = await getJson(`${BASE}/${year}/driverstandings.json?limit=${PAGE}`);
const driverStandings = standingsPage.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? [];
const teamsPage = await getJson(`${BASE}/${year}/constructorstandings.json?limit=${PAGE}`);
const teamStandings = teamsPage.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? [];

const standingByCode = new Map();
for (const entry of driverStandings) {
  const code = codeFor(entry.Driver);
  if (code) standingByCode.set(code, entry);
}

/** Contagens que a classificação oficial não expõe, derivadas das corridas. */
const stats = new Map();
for (const driver of season.drivers) {
  let starts = 0;
  let podiums = 0;
  let dnfs = 0;
  let fastestLaps = 0;
  for (const race of results) {
    const row = race.results.find((entry) => entry.code === driver.code);
    if (!row) continue;
    starts += 1;
    if (row.position >= 1 && row.position <= 3 && row.finished) podiums += 1;
    if (!row.finished) dnfs += 1;
    if (row.fastestLapRank === 1) fastestLaps += 1;
  }
  const poles = qualifying.reduce(
    (total, race) =>
      total + (race.results.some((entry) => entry.code === driver.code && entry.position === 1) ? 1 : 0),
    0,
  );
  stats.set(driver.code, { starts, podiums, dnfs, fastestLaps, poles });
}

const drivers = season.drivers.map((driver) => {
  const standing = standingByCode.get(driver.code);
  const extra = stats.get(driver.code);
  return {
    ...driver,
    points: standing ? Number(standing.points ?? driver.points) : driver.points,
    position: standing ? Number(standing.position ?? driver.position) : driver.position,
    wins: standing ? Number(standing.wins ?? driver.wins) : driver.wins,
    starts: extra?.starts ?? driver.starts,
    podiums: extra?.podiums ?? driver.podiums,
    dnfs: extra?.dnfs ?? driver.dnfs,
    fastestLaps: extra?.fastestLaps ?? driver.fastestLaps,
    poles: extra?.poles ?? driver.poles,
  };
});

const standingByTeam = new Map(
  teamStandings
    .filter((entry) => entry.Constructor?.constructorId)
    .map((entry) => [entry.Constructor.constructorId, entry]),
);
const teams = season.teams.map((team) => {
  const standing = standingByTeam.get(team.id);
  return standing
    ? {
        ...team,
        points: Number(standing.points ?? team.points),
        wins: Number(standing.wins ?? team.wins),
        position: Number(standing.position ?? team.position),
      }
    : team;
});

/** Histórico por ronda: reaproveita o que já existe e vai buscar só o novo. */
const history = new Map(season.standingsHistory.map((entry) => [entry.round, entry]));
const missing = results
  .map((race) => race.round)
  .filter((round) => round >= 1 && !history.has(round));

for (const round of missing) {
  try {
    const [driversRound, teamsRound] = await Promise.all([
      getJson(`${BASE}/${year}/${round}/driverstandings.json?limit=${PAGE}`),
      getJson(`${BASE}/${year}/${round}/constructorstandings.json?limit=${PAGE}`),
    ]);
    const list = driversRound.MRData.StandingsTable.StandingsLists[0];
    const teamList = teamsRound.MRData.StandingsTable.StandingsLists[0];
    if (!list?.DriverStandings?.length) continue;
    history.set(round, {
      round,
      drivers: list.DriverStandings.map((entry) => ({
        code: codeFor(entry.Driver),
        points: Number(entry.points ?? 0),
        position: Number(entry.position ?? 0),
      })).filter((entry) => entry.code),
      teams: (teamList?.ConstructorStandings ?? []).map((entry) => ({
        teamId: entry.Constructor?.constructorId,
        points: Number(entry.points ?? 0),
        position: Number(entry.position ?? 0),
      })).filter((entry) => entry.teamId),
    });
  } catch (error) {
    console.warn(`classificação da ronda ${round} indisponível: ${error.message}`);
  }
}

const output = {
  ...season,
  throughRound,
  updatedAt: new Date().toISOString(),
  source: "Jolpica-F1 (Ergast) + OpenF1",
  drivers,
  teams,
  results,
  qualifying,
  standingsHistory: [...history.values()].sort((a, b) => a.round - b.round),
};

// Sem dados novos não reescreve o ficheiro: o refresh automático não deve
// criar um commit a cada 30 minutos só por causa do timestamp.
const sameAsExisting =
  JSON.stringify({ ...output, updatedAt: null }) === JSON.stringify({ ...season, updatedAt: null });
if (sameAsExisting) {
  console.log("Sem resultados novos; o ficheiro mantém-se.");
} else {
  await writeFile(OUT, JSON.stringify(output));
  console.log(`Escrito ${OUT}`);
}

const last = results[results.length - 1];
const leader = drivers.reduce((best, driver) => (driver.position < best.position ? driver : best), drivers[0]);
const before = results.length - 1;
console.log(
  `${results.length} corridas (antes ${before}) · até à ronda ${throughRound} · ` +
    `última: R${last.round} ${last.circuitId}, vencedor ${last.results.find((entry) => entry.position === 1)?.code ?? "—"}`,
);
console.log(`Líder do campeonato: ${leader.code} (${leader.points} pts, P${leader.position})`);
console.log(`Qualificação: ${qualifying.length} rondas.`);
