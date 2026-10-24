/**
 * Constrói o arquivo histórico da F1 (1950 → hoje) a partir da API Jolpica
 * (sucessora da Ergast). O resultado vai para src/data/history/.
 *
 *   node scripts/build-history.mjs
 *
 * As respostas ficam em .cache/history para que o script possa ser reexecutado
 * sem voltar a bater na API. A API pública limita a ~4 pedidos/s e 100
 * resultados por página, daí a paginação e o ritmo lento.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = process.env.RAW_DIR
  ? path.resolve(process.env.RAW_DIR)
  : path.join(root, ".cache", "history");
const outDir = path.join(root, "src", "data", "history");
const BASE = "https://api.jolpi.ca/ergast/f1";
const UA = "apex-f1-history/1.0 (local app build)";
const FIRST_YEAR = 1950;
const LAST_YEAR = new Date().getFullYear();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, tries = 10) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429 || res.status >= 500) {
        const retry = Number(res.headers.get("retry-after") ?? 0);
        await wait(retry > 0 ? retry * 1000 : Math.min(45000, 2500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      await wait(700);
      return await res.json();
    } catch (error) {
      if (attempt === tries - 1) throw error;
      await wait(1500 * (attempt + 1));
    }
  }
  throw new Error(`desisti de ${url}`);
}

async function cached(name, loader) {
  const file = path.join(cacheDir, `${name}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    const data = await loader();
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(data));
    return data;
  }
}

/**
 * A paginação da API corta a meio de uma corrida e repete a corrida inteira na
 * página seguinte. Guarda a versão com a classificação completa de cada ronda.
 */
function dedupeRaces(races) {
  const byRound = new Map();
  for (const race of races) {
    const previous = byRound.get(race.round);
    if (!previous) {
      byRound.set(race.round, { ...race, Results: [...(race.Results ?? [])] });
      continue;
    }
    // a mesma corrida pode chegar partida em duas páginas: junta por piloto
    const seen = new Set(previous.Results.map((entry) => entry.Driver.driverId));
    for (const entry of race.Results ?? []) {
      if (!seen.has(entry.Driver.driverId)) {
        previous.Results.push(entry);
        seen.add(entry.Driver.driverId);
      }
    }
  }
  const pos = (entry) => {
    const value = Number(entry.positionText);
    return Number.isFinite(value) && value > 0 ? value : 999;
  };
  for (const race of byRound.values()) race.Results.sort((a, b) => pos(a) - pos(b));
  return [...byRound.values()].sort((a, b) => Number(a.round) - Number(b.round));
}

const fetchSeason = (year) =>
  cached(`results-${year}`, async () => {
    const races = [];
    let offset = 0;
    for (;;) {
      const page = await getJson(`${BASE}/${year}/results.json?limit=100&offset=${offset}`);
      const list = page.MRData.RaceTable.Races ?? [];
      races.push(...list);
      offset += 100;
      if (offset >= Number(page.MRData.total) || list.length === 0) break;
    }
    return races;
  }).then(dedupeRaces);

const fetchStandings = (year) =>
  cached(`standings-${year}`, async () => {
    const data = await getJson(`${BASE}/${year}/driverstandings.json?limit=100`);
    return data.MRData.StandingsTable.StandingsLists[0] ?? {
      season: String(year),
      round: "0",
      DriverStandings: [],
    };
  });

const fetchConstructors = (year) =>
  cached(`constructors-${year}`, async () => {
    const data = await getJson(`${BASE}/${year}/constructorstandings.json?limit=100`);
    const list = data.MRData.StandingsTable.StandingsLists[0];
    return list?.ConstructorStandings ?? [];
  });

/**
 * Sem o endpoint de construtores (rate limit), soma os pontos finais dos
 * pilotos por equipe. A ordem costuma coincidir com a oficial; a diferença
 * fica nos anos em que só os melhores resultados contavam.
 */
function derivedTeamChampion(standings) {
  const totals = new Map();
  for (const entry of standings.DriverStandings ?? []) {
    const team = entry.Constructors?.at(-1);
    if (!team) continue;
    const current = totals.get(team.constructorId) ?? {
      id: team.constructorId,
      name: team.name,
      points: 0,
      wins: 0,
    };
    current.points += Number(entry.points ?? 0);
    current.wins += Number(entry.wins ?? 0);
    totals.set(team.constructorId, current);
  }
  const ranked = [...totals.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
  return ranked[0] ?? null;
}

const drivers = {};
const constructors = {};
const careers = {};
const manifestYears = [];
const decades = new Map();

const driverId = (driver) => driver.driverId;
const isPodium = (posText) => ["1", "2", "3"].includes(posText);

function rememberDriver(driver) {
  if (!drivers[driverId(driver)]) {
    drivers[driverId(driver)] = [
      `${driver.givenName} ${driver.familyName}`.trim(),
      driver.nationality ?? "",
      driver.dateOfBirth ?? "",
      driver.code ?? "",
      driver.permanentNumber ? Number(driver.permanentNumber) : null,
    ];
  }
}

function rememberConstructor(constructor) {
  if (!constructors[constructor.constructorId]) {
    constructors[constructor.constructorId] = [constructor.name, constructor.nationality ?? ""];
  }
}

function careerFor(id) {
  if (!careers[id]) {
    careers[id] = {
      seasons: [],
      starts: 0,
      wins: 0,
      podiums: 0,
      points: 0,
      fastestLaps: 0,
      championships: 0,
      first: null,
      last: null,
    };
  }
  return careers[id];
}

for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
  const [races, standings] = await Promise.all([
    fetchSeason(year),
    fetchStandings(year),
  ]);
  let teamStandings = [];
  if (!process.env.SKIP_CONSTRUCTORS) {
    try {
      teamStandings = await fetchConstructors(year);
    } catch {
      console.warn(`${year}: sem classificação de construtores, a somar pilotos`);
    }
  }

  if (!races.length) continue;

  const rounds = [];

  for (const race of races) {
    const results = race.Results ?? [];
    if (!results.length) continue;

    let fastest = null;
    for (const entry of results) {
      rememberDriver(entry.Driver);
      rememberConstructor(entry.Constructor);
      const id = driverId(entry.Driver);
      const career = careerFor(id);
      career.starts += 1;
      if (Number(entry.position) > 0 && Number(entry.position) <= 3) career.podiums += 1;
      if (entry.FastestLap?.rank === "1") {
        career.fastestLaps += 1;
        fastest = {
          driver: id,
          time: entry.FastestLap.Time?.time ?? null,
        };
      }
    }

    rounds.push({
      r: Number(race.round),
      n: race.raceName,
      c: race.Circuit?.circuitName ?? "",
      l: race.Circuit?.Location?.locality ?? "",
      co: race.Circuit?.Location?.country ?? "",
      d: race.date,
      fl: fastest,
      res: results.map((entry) => {
        const id = driverId(entry.Driver);
        const value = [entry.positionText, id, entry.Constructor.constructorId, Number(entry.grid ?? 0), Number(entry.laps ?? 0), Number(entry.points ?? 0), entry.Time?.time ?? entry.status ?? ""];
        if (entry.FastestLap) value.push(entry.FastestLap.Time?.time ?? null);
        return value;
      }),
    });

  }

  for (const standing of standings.DriverStandings ?? []) {
    rememberDriver(standing.Driver);
    const career = careerFor(standing.Driver.driverId);
    const points = Number(standing.points ?? 0);
    const position = Number(standing.position ?? 0);
    career.seasons.push({
      y: year,
      t: standing.Constructors?.map((team) => team.name).join(" / ") ?? "",
      p: position,
      pts: points,
      w: Number(standing.wins ?? 0),
      r: 0,
    });
    if (position === 1) career.championships += 1;
    if (career.first === null) career.first = year;
    career.last = year;
  }

  const champion = standings.DriverStandings?.[0];
  const teamChampion = teamStandings[0];
  const derivedTeam = teamChampion
    ? null
    : derivedTeamChampion(standings);

  const decade = Math.floor(year / 10) * 10;
  if (!decades.has(decade)) decades.set(decade, {});
  decades.get(decade)[year] = rounds;

  manifestYears.push({
    year,
    races: rounds.length,
    drivers: new Set(
      races.flatMap((race) => (race.Results ?? []).map((entry) => entry.Driver.driverId)),
    ).size,
    champion: champion
      ? {
          id: champion.Driver.driverId,
          name: `${champion.Driver.givenName} ${champion.Driver.familyName}`.trim(),
          team: champion.Constructors?.map((team) => team.name).join(" / ") ?? "",
          points: Number(champion.points ?? 0),
          wins: Number(champion.wins ?? 0),
          position: Number(champion.position ?? 1),
        }
      : null,
    teamChampion: teamChampion
      ? {
          id: teamChampion.Constructor.constructorId,
          name: teamChampion.Constructor.name,
          points: Number(teamChampion.points ?? 0),
          wins: Number(teamChampion.wins ?? 0),
        }
      : derivedTeam,
    winner: rounds.length ? winnerOf(rounds[rounds.length - 1]) : null,
    firstRace: rounds[0]?.d ?? null,
    lastRace: rounds[rounds.length - 1]?.d ?? null,
  });

  console.log(
    `${year}: ${rounds.length} corridas · campeão ${manifestYears.at(-1).champion?.name ?? "—"}`,
  );
}

function winnerOf(round) {
  const first = round.res.find((entry) => entry[0] === "1");
  return first ? first[1] : null;
}

// cada temporada tem o número de corridas em que o piloto esteve inscrito
for (const [id, career] of Object.entries(careers)) {
  // pontos e vitórias oficiais vêm da classificação (inclui sprints e scores ajustados)
  career.points = career.seasons.reduce((total, season) => total + season.pts, 0);
  career.wins = career.seasons.reduce((total, season) => total + season.w, 0);
  for (const season of career.seasons) {
    const rounds = decades.get(Math.floor(season.y / 10) * 10)?.[season.y] ?? [];
    season.r = rounds.filter((round) =>
      round.res.some((entry) => entry[1] === id),
    ).length;
  }
  career.seasons.sort((a, b) => a.y - b.y);
}

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(
  path.join(outDir, "manifest.json"),
  JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    source: "Jolpica-F1",
    firstYear: FIRST_YEAR,
    lastYear: LAST_YEAR,
    years: manifestYears,
  }),
);

for (const [decade, years] of decades) {
  await fs.writeFile(
    path.join(outDir, `decade-${decade}.json`),
    JSON.stringify({ decade, years }),
  );
}

await fs.writeFile(path.join(outDir, "drivers.json"), JSON.stringify(drivers));
await fs.writeFile(path.join(outDir, "constructors.json"), JSON.stringify(constructors));
await fs.writeFile(path.join(outDir, "careers.json"), JSON.stringify(careers));

const sizes = await fs.readdir(outDir);
for (const file of sizes) {
  const stat = await fs.stat(path.join(outDir, file));
  console.log(file, `${(stat.size / 1024).toFixed(0)} KB`);
}
