import { describe, expect, it } from "vitest";
import { en } from "./locales/en";
import { LANGS, LOCALES, translate } from "./language";

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("dicionário", () => {
  it("tem os dois idiomas e as respetivas locales", () => {
    expect(LANGS.map((lang) => lang.id)).toEqual(["pt", "en"]);
    expect(LOCALES.en).toBe("en-GB");
    expect(LOCALES.pt).toBe("pt-PT");
  });

  it("mantém os marcadores de substituição iguais aos da chave", () => {
    const broken = Object.entries(en)
      .filter(([key, value]) => placeholders(key).join() !== placeholders(value).join())
      .map(([key, value]) => `${key} → ${value}`);
    expect(broken).toEqual([]);
  });

  it("não deixa traduções vazias", () => {
    const empty = Object.entries(en)
      .filter(([, value]) => !value.trim())
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});

describe("translate", () => {
  it("traduz do português para inglês", () => {
    expect(translate("en", "Corrida")).toBe("Race");
    expect(translate("en", "Classificação")).toBe("Standings");
  });

  it("devolve o português quando o idioma é português", () => {
    expect(translate("pt", "Corrida")).toBe("Corrida");
    expect(translate("pt", "texto novo")).toBe("texto novo");
  });

  it("usa o original quando falta tradução", () => {
    expect(translate("en", "texto que ainda não foi traduzido")).toBe(
      "texto que ainda não foi traduzido",
    );
  });

  it("substitui marcadores e preserva os que faltam", () => {
    expect(translate("en", "dados {date}", { date: "24 out" })).toBe("data 24 out");
    expect(translate("en", "{n} voltas", { n: 56 })).toBe("56 laps");
    expect(translate("en", "{n} voltas", {})).toBe("{n} laps");
    expect(translate("en", "{n} voltas", { n: 0 })).toBe("0 laps");
  });
});
