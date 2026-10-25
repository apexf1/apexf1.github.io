import { describe, expect, it } from "vitest";
import {
  DEMO_DRIVERS,
  demoDuel,
  orderPair,
  paceOf,
  parseGap,
  predictOvertake,
  pressureOf,
  type DriverState,
} from "./overtake";

const driver = (overrides: Partial<DriverState> = {}): DriverState => ({
  number: 1,
  code: "AAA",
  name: "A Driver",
  team: "Team",
  color: "#fff",
  gapToLeader: 0,
  lapped: false,
  pace: 91,
  laps: [91, 91, 91],
  lastLap: 91,
  currentLap: 20,
  ...overrides,
});

describe("parseGap", () => {
  it("aceita números e strings numéricas, com ou sem +", () => {
    expect(parseGap(3.421)).toBeCloseTo(3.421);
    expect(parseGap("+1.204")).toBeCloseTo(1.204);
    expect(parseGap("0")).toBe(0);
  });

  it("recusa voltas perdidas e lixo", () => {
    expect(parseGap("+1 LAP")).toBeNull();
    expect(parseGap("1 LAP")).toBeNull();
    expect(parseGap(null)).toBeNull();
    expect(parseGap(-2)).toBeNull();
    expect(parseGap("abc")).toBeNull();
  });
});

describe("paceOf", () => {
  const laps = (times: (number | null)[]) =>
    times.map((lap_duration, index) => ({
      lap_number: index + 1,
      lap_duration,
      is_pit_out_lap: false,
    }));

  it("faz a média das últimas 3 voltas", () => {
    const stats = paceOf(laps([92, 91.5, 91.2, 91.1, 91]));
    expect(stats.pace).toBeCloseTo(91.1, 3);
    expect(stats.laps).toEqual([91.2, 91.1, 91]);
    expect(stats.currentLap).toBe(5);
    expect(stats.lastLap).toBe(91);
  });

  it("ignora out-laps, voltas nulas e voltas muito lentas", () => {
    const stats = paceOf([
      ...laps([91.2, 91.1, 91.15]),
      { lap_number: 4, lap_duration: 118.4, is_pit_out_lap: true },
      { lap_number: 5, lap_duration: null },
      // in-lap / safety car: 20s acima da mediana
      { lap_number: 6, lap_duration: 112.5, is_pit_out_lap: false },
      { lap_number: 7, lap_duration: 91.15, is_pit_out_lap: false },
    ]);
    expect(stats.laps).toEqual([91.1, 91.15, 91.15]);
    expect(stats.pace).toBeCloseTo((91.1 + 91.15 + 91.15) / 3, 3);
    expect(stats.currentLap).toBe(7);
  });

  it("devolve null sem voltas válidas", () => {
    const stats = paceOf([{ lap_number: 1, lap_duration: null }]);
    expect(stats.pace).toBeNull();
    expect(stats.laps).toEqual([]);
  });
});

describe("predictOvertake", () => {
  it("calcula as voltas até à ultrapassagem e a volta prevista", () => {
    const prediction = predictOvertake(
      driver({ code: "AHEAD", gapToLeader: 0, pace: 91.0 }),
      driver({ code: "BEHIND", gapToLeader: 3.0, pace: 90.7, currentLap: 20 }),
    );
    expect(prediction.verdict).toBe("attack");
    expect(prediction.gap).toBeCloseTo(3.0);
    expect(prediction.gain).toBeCloseTo(0.3);
    expect(prediction.lapsToPass).toBeCloseTo(10);
    expect(prediction.targetLap).toBe(30);
    expect(prediction.currentLap).toBe(20);
  });

  it("não promete uma ultrapassagem depois da bandeira", () => {
    const prediction = predictOvertake(
      driver({ gapToLeader: 0, pace: 91.0, currentLap: 55 }),
      driver({ gapToLeader: 3.0, pace: 90.7, currentLap: 55 }),
      56,
    );
    expect(prediction.verdict).toBe("late");
    expect(prediction.remainingLaps).toBe(1);
    expect(prediction.lapsToPass).toBeCloseTo(10);
    expect(prediction.targetLap).toBeNull();
    expect(pressureOf(prediction)).toBe(0);
  });

  it("não prevê ultrapassagem se o de trás for mais lento", () => {
    const prediction = predictOvertake(
      driver({ gapToLeader: 0, pace: 90.5 }),
      driver({ gapToLeader: 1.2, pace: 91.1 }),
    );
    expect(prediction.verdict).toBe("stable");
    expect(prediction.gain).toBeLessThan(0);
    expect(prediction.lapsToPass).toBeNull();
    expect(prediction.targetLap).toBeNull();
  });

  it("assinala pilotos lado a lado", () => {
    const prediction = predictOvertake(
      driver({ gapToLeader: 10.0 }),
      driver({ gapToLeader: 10.05, pace: 90.2 }),
    );
    expect(prediction.verdict).toBe("side-by-side");
    expect(pressureOf(prediction)).toBe(1);
  });

  it("não calcula nada com um piloto dobrado", () => {
    const prediction = predictOvertake(
      driver({ gapToLeader: 0 }),
      driver({ gapToLeader: null, lapped: true }),
    );
    expect(prediction.verdict).toBe("lapped");
    expect(prediction.targetLap).toBeNull();
  });

  it("devolve unknown sem ritmo suficiente", () => {
    const prediction = predictOvertake(
      driver({ gapToLeader: 0, pace: null, laps: [] }),
      driver({ gapToLeader: 2, pace: 90.8 }),
    );
    expect(prediction.verdict).toBe("unknown");
    expect(pressureOf(prediction)).toBe(0);
  });
});

describe("orderPair", () => {
  it("põe à frente quem tem menor gap ao líder", () => {
    const leader = driver({ code: "LEAD", gapToLeader: 0 });
    const chaser = driver({ code: "CHASE", gapToLeader: 2.4 });
    expect(orderPair(chaser, leader).map((entry) => entry.code)).toEqual(["LEAD", "CHASE"]);
  });
});

describe("modo demonstração", () => {
  it("tem pilotos para os dropdowns", () => {
    expect(DEMO_DRIVERS.length).toBeGreaterThanOrEqual(2);
  });

  it("vai fechando o gap ao longo do tempo e gera previsão", () => {
    const [ahead, behind] = DEMO_DRIVERS;
    const start = demoDuel(0, ahead, behind);
    const later = demoDuel(50_000, ahead, behind);
    expect(later.behind.gapToLeader!).toBeLessThan(start.behind.gapToLeader!);
    const prediction = predictOvertake(later.ahead, later.behind);
    expect(prediction.verdict).toBe("attack");
    expect(prediction.targetLap).not.toBeNull();
    expect(prediction.lapsToPass!).toBeGreaterThan(0);
  });
});
