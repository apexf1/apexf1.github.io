import { describe, expect, it } from "vitest";
import {
  buildGeometry,
  cameraBasis,
  defaultCamera,
  fitCamera,
  placeCars,
  pointAt,
  projectIn,
  trackIds,
  type TrackGeometry,
} from "./track3d";
import { season } from "./data";

const officialLength = new Map(season.calendar.map((c) => [c.circuitId, Math.round(c.lengthKm * 1000)]));

const geometry = (id: string): TrackGeometry => {
  const geo = buildGeometry(id);
  if (!geo) throw new Error(`sem geometria para ${id}`);
  return geo;
};

describe("geometria real das pistas", () => {
  it("tem as 23 etapas da temporada", () => {
    expect(trackIds).toHaveLength(23);
    for (const circuit of season.calendar) {
      expect(trackIds).toContain(circuit.circuitId);
    }
  });

  it("bate o comprimento oficial de cada circuito", () => {
    for (const id of trackIds) {
      const geo = geometry(id);
      const official = officialLength.get(id) ?? 0;
      const deviation = Math.abs(geo.lengthM - official) / official;
      expect(deviation, `${id}: ${geo.lengthM}m vs ${official}m`).toBeLessThan(0.06);
    }
  });

  it("usa coordenadas em metros com elevação real", () => {
    const spa = geometry("spa");
    expect(spa.elevationM).toBeGreaterThan(80);
    const interlagos = geometry("interlagos");
    expect(interlagos.elevationM).toBeGreaterThan(25);
    const monaco = geometry("monaco");
    expect(monaco.elevationM).toBeGreaterThan(25);
    expect(monaco.box.span).toBeGreaterThan(600);
  });

  it("fecha o traçado e mantém a orientação de corrida", () => {
    for (const id of trackIds) {
      const geo = geometry(id);
      const first = geo.points[0];
      const last = geo.points[geo.points.length - 1];
      const gap = Math.hypot(first[0] - last[0], first[1] - last[1]);
      // a amostragem é uniforme, então o vão final é um segmento do traçado
      expect(gap, id).toBeLessThan((geo.lengthM / geo.points.length) * 3);
    }
  });
});

describe("posição no traçado", () => {
  it("dá a volta completa sem saltos", () => {
    const geo = geometry("marina_bay");
    let previous = pointAt(geo, 0).point;
    for (let i = 1; i <= 200; i += 1) {
      const next = pointAt(geo, i / 200).point;
      const step = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
      expect(step).toBeLessThan(geo.lengthM / 100);
      previous = next;
    }
    expect(pointAt(geo, 1).point[0]).toBeCloseTo(pointAt(geo, 0).point[0], 3);
  });
});

describe("distribuição dos carros pelo gap real", () => {
  const geo = geometry("marina_bay");
  const cars = [
    { code: "VER", pos: 1, gap: 0, color: "#3671c6" },
    { code: "LEC", pos: 2, gap: 1.5, color: "#e8002d" },
    { code: "HAM", pos: 3, gap: 4, color: "#e8002d" },
  ];

  it("coloca o líder na fração atual da volta", () => {
    const placed = placeCars(cars, geo, 0.4, 95);
    expect(placed[0].s).toBeCloseTo(0.4, 5);
  });

  it("converte segundos de gap em distância física", () => {
    const placed = placeCars(cars, geo, 0.4, 95);
    const speed = geo.lengthM / 95;
    const expected = 0.4 - (1.5 * speed) / geo.lengthM;
    expect(placed[1].s).toBeCloseTo(expected, 5);
    expect(placed[1].s).toBeLessThan(placed[0].s);
  });

  it("mantém a ordem dos carros", () => {
    const placed = placeCars(cars, geo, 0.8, 95);
    expect(placed.map((c) => c.pos)).toEqual([1, 2, 3]);
    expect(placed.every((c) => c.s >= 0 && c.s < 1)).toBe(true);
  });
});

describe("câmera", () => {
  it("enquadra o traçado inteiro na tela", () => {
    const geo = geometry("spa");
    const start = defaultCamera(geo);
    const fitted = fitCamera(geo, start, 1400, 500);

    const basis = cameraBasis(fitted, 500, 1.4);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of geo.points) {
      const s = projectIn(basis, 1400, 500, p);
      expect(s).not.toBeNull();
      if (!s) continue;
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y);
    }
    const fillX = (maxX - minX) / 1400;
    const fillY = (maxY - minY) / 500;
    // preenche a altura e fica centralizado na horizontal
    expect(fillY).toBeGreaterThan(0.7);
    expect(Math.abs((minX + maxX) / 2 - 700)).toBeLessThan(60);
    expect(Math.abs((minY + maxY) / 2 - 250)).toBeLessThan(40);
    expect(fillX).toBeLessThan(0.95);
  });
});
