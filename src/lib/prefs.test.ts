import { describe, expect, it } from "vitest";
import { sanitizePrefs } from "./prefs";
import {
  CURRENT_SEASON,
  isPodium,
  loadCareers,
  loadSeason,
  positionLabel,
  seasonInProgress,
  winnerOfRace,
  type HistoryRace,
} from "./history";

const base = { theme: "dark", driver: null, team: null, lang: "pt" } as const;

describe("sanitizePrefs", () => {
  it("aceita um perfil completo", () => {
    expect(
      sanitizePrefs({ theme: "light", driver: "VER", team: "red_bull", lang: "en" }),
    ).toEqual({
      theme: "light",
      driver: "VER",
      team: "red_bull",
      lang: "en",
    });
  });

  it("ignora valores inválidos e mantém o fallback", () => {
    expect(sanitizePrefs({ theme: "neon", driver: 7, team: "", lang: "de" }, base)).toEqual(
      base,
    );
  });

  it("remove preferências nulas e herda o idioma do fallback", () => {
    expect(sanitizePrefs({ theme: "dark", driver: null, team: null }, base)).toEqual({
      theme: "dark",
      driver: null,
      team: null,
      lang: "pt",
    });
  });

  it("aceita apenas os idiomas suportados", () => {
    expect(sanitizePrefs({ lang: "en" }, base).lang).toBe("en");
    expect(sanitizePrefs({ lang: "fr" }, base).lang).toBe("pt");
  });
});

const race: HistoryRace = {
  r: 3,
  n: "Interlagos",
  c: "Autódromo José Carlos Pace",
  l: "São Paulo",
  co: "Brazil",
  d: "2024-11-03",
  fl: { driver: "verstappen", time: "1:20.472" },
  res: [
    ["1", "verstappen", "red_bull", 17, 71, 25, "2:06:54.430"],
    ["2", "ocon", "alpine", 4, 71, 18, "+19.477"],
    ["3", "gasly", "alpine", 15, 71, 15, "+22.826"],
    ["R", "norris", "mclaren", 1, 51, 0, "Out of fuel"],
  ],
};

describe("histórico", () => {
  it("lê o vencedor da classificação", () => {
    expect(winnerOfRace(race)).toBe("verstappen");
  });

  it("traduz posições especiais", () => {
    expect(positionLabel("1")).toBe("1");
    expect(positionLabel("R")).toBe("DNF");
    expect(positionLabel("D")).toBe("DSQ");
  });

  it("identifica pódios", () => {
    expect(isPodium("3")).toBe(true);
    expect(isPodium("4")).toBe(false);
    expect(isPodium("R")).toBe(false);
  });

  it("marca a temporada em curso como inacabada", () => {
    expect(seasonInProgress(CURRENT_SEASON)).toBe(true);
    expect(seasonInProgress(CURRENT_SEASON - 1)).toBe(false);
  });

  it("carrega a temporada de 2024 a partir do arquivo por década", async () => {
    const races = await loadSeason(2024);
    expect(races).toHaveLength(24);
    expect(winnerOfRace(races[0])).toBeTruthy();
    expect(races[0].res.length).toBeGreaterThanOrEqual(20);
  });

  it("soma títulos oficiais no histórico de carreira", async () => {
    const careers = await loadCareers();
    expect(careers.michael_schumacher.championships).toBe(7);
    expect(careers.hamilton.championships).toBe(7);
    expect(careers.max_verstappen.championships).toBe(4);
  });
});
