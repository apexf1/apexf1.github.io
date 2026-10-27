import { describe, expect, it } from "vitest";
import { predictRace, runBacktest, getTitlePicture } from "./model";
import { activeDrivers, calendar, season } from "./data";
import { replay } from "./replay";

describe("dados da temporada", () => {
  it("carrega o grid completo e o calendário", () => {
    expect(season.teams).toHaveLength(11);
    expect(activeDrivers).toHaveLength(22);
    expect(calendar).toHaveLength(23);
    // os dados são regenerados a cada ronda: o arquivo tem de chegar à última
    expect(season.results.at(-1)?.round).toBe(season.throughRound);
    expect(season.results.length).toBeGreaterThanOrEqual(17);
  });

  it("tem um replay completo de Singapura", () => {
    expect(replay.totalLaps).toBe(62);
    expect(replay.snaps).toHaveLength(62);
    expect(replay.snaps[0].order).toHaveLength(22);
    expect(replay.snaps.at(-1)?.order[0].code).toBe("VER");
  });
});

describe("modelo de previsão", () => {
  const prediction = predictRace({ round: 18, sims: 4000 });

  it("distribui probabilidades de vitória que somam 1", () => {
    const total = prediction.drivers.reduce((sum, d) => sum + d.win, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(prediction.drivers[0].win).toBeGreaterThan(0.15);
    expect(prediction.drivers[0].win).toBeLessThan(0.8);
  });

  it("é determinístico com a mesma seed", () => {
    const again = predictRace({ round: 18, sims: 4000 });
    expect(again.favorite.code).toBe(prediction.favorite.code);
    expect(again.favorite.win).toBeCloseTo(prediction.favorite.win, 8);
  });

  it("mantém o favorito no topo em cenário seco", () => {
    const ranked = prediction.drivers;
    expect(ranked[0].podium).toBeGreaterThanOrEqual(ranked[1].podium);
    expect(ranked[0].points).toBeGreaterThan(0);
    console.log(
      "COTA top 8:",
      ranked
        .slice(0, 8)
        .map((d) => `${d.code} ${(d.win * 100).toFixed(1)}% / pódio ${(d.podium * 100).toFixed(0)}%`)
        .join(" | "),
    );
  });

  it("aumenta a incerteza com caos alto", () => {
    const calm = predictRace({ round: 18, sims: 2500, chaos: 0, seed: 7 });
    const chaos = predictRace({ round: 18, sims: 2500, chaos: 100, seed: 7 });
    expect(chaos.favorite.win).toBeLessThan(calm.favorite.win);
    expect(chaos.unpredictability).toBeGreaterThan(calm.unpredictability);
  });

  it("roda o backtest em todas as etapas disponíveis", () => {
    const backtest = runBacktest(300);
    console.log(
      "Backtest:",
      backtest.hits,
      "/",
      backtest.races,
      "| top3:",
      backtest.top3Hits,
      "| baseline:",
      backtest.baselineHits,
      "| brier:",
      backtest.brier.toFixed(4),
    );
    expect(backtest.races).toBeGreaterThanOrEqual(15);
    expect(backtest.hits).toBeGreaterThanOrEqual(0);
    expect(backtest.top3Hits).toBeGreaterThanOrEqual(backtest.hits);
  });

  it("calcula os cenários de título", () => {
    const title = getTitlePicture();
    expect(title.remainingRaces).toBe(calendar.length - season.throughRound);
    expect(title.leader.code).toBe("ANT");
    expect(title.aliveCount).toBeGreaterThanOrEqual(2);
    console.log(
      "Título:",
      title.contenders.slice(0, 8).map((c) => `${c.code}:${c.points}${c.alive ? "" : " (fora)"}`).join(" "),
    );
  });
});
