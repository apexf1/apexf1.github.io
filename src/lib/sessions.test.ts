import { describe, expect, it } from "vitest";
import { driverByCode, qualifyingByRound } from "./data";
import {
  classificationFor,
  defaultSessionId,
  sessionState,
  weekendByRound,
} from "./sessions";

const raceDay = new Date("2026-10-24T12:00:00Z");

describe("sessões do fim de semana", () => {
  it("tem sessões para todas as etapas do calendário", () => {
    for (let round = 1; round <= 23; round += 1) {
      const weekend = weekendByRound.get(round);
      expect(weekend, `ronda ${round}`).toBeTruthy();
      expect(weekend?.sessions.length, `ronda ${round}`).toBeGreaterThanOrEqual(3);
      for (const session of weekend?.sessions ?? []) {
        expect(new Date(session.start).getTime()).toBeLessThan(
          new Date(session.end).getTime(),
        );
      }
    }
  });

  it("distingue fins de semana sprint", () => {
    const china = weekendByRound.get(2);
    expect(china?.sessions.map((session) => session.id)).toEqual([
      "fp1",
      "sprint_quali",
      "quali",
    ]);
    const monaco = weekendByRound.get(6);
    expect(monaco?.sessions.map((session) => session.id)).toEqual([
      "fp1",
      "fp2",
      "fp3",
      "quali",
    ]);
  });

  it("ordena os treinos por posição e coloca o líder a zero", () => {
    const session = weekendByRound.get(18)?.sessions.find((item) => item.id === "fp1");
    expect(session).toBeTruthy();
    const rows = classificationFor(18, session!);
    expect(rows.length).toBeGreaterThan(15);
    expect(rows[0].position).toBe(1);
    expect(rows[0].gap).toBe(0);
    expect(rows[0].time).toBeGreaterThan(60);
    expect([...rows].map((row) => row.position)).toEqual(
      [...rows].map((row) => row.position).sort((a, b) => a - b),
    );
    for (const row of rows) expect(driverByCode.has(row.code)).toBe(true);
  });

  it("constrói a grelha de qualificação a partir dos tempos oficiais", () => {
    const session = weekendByRound.get(1)?.sessions.find((item) => item.id === "quali");
    const rows = classificationFor(1, session!);
    const official = qualifyingByRound.get(1)?.results ?? [];
    expect(rows).toHaveLength(official.length);
    expect(rows[0].position).toBe(1);
    expect(rows[0].gap).toBe(0);
    expect(rows[0].time).toBe(official[0].q3);
    expect(rows.every((row) => row.gap === null || row.gap >= 0)).toBe(true);
  });

  it("abre na última sessão concluída do fim de semana atual", () => {
    const sessions = weekendByRound.get(18)?.sessions ?? [];
    expect(defaultSessionId(sessions, 18, raceDay)).toBe("fp2");
    const fp3 = sessions.find((session) => session.id === "fp3");
    expect(sessionState(fp3!, 18, raceDay)).toBe("upcoming");
  });

  it("marca etapas futuras como por realizar", () => {
    const sessions = weekendByRound.get(20)?.sessions ?? [];
    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) {
      expect(sessionState(session, 20, raceDay)).toBe("upcoming");
    }
  });
});
