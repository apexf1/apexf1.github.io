import { afterEach, describe, expect, it } from "vitest";
import { formatTime } from "./format";
import { setActiveLang } from "./language";
import {
  activeTimeZone,
  isValidTimeZone,
  setActiveTimeZone,
  zoneCity,
  zoneLabel,
} from "./timezone";

afterEach(() => {
  setActiveTimeZone(null);
  setActiveLang("pt");
});

describe("fuso horário", () => {
  it("rejeita zonas que não existem", () => {
    expect(isValidTimeZone("Europe/Lisbon")).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(7)).toBe(false);
  });

  it("lê a cidade de uma zona IANA", () => {
    expect(zoneCity("America/Sao_Paulo")).toBe("Sao Paulo");
    expect(zoneCity("Europe/Lisbon")).toBe("Lisbon");
    expect(zoneCity("UTC")).toBe("UTC");
  });

  it("formata as horas no fuso escolhido", () => {
    setActiveLang("en");
    setActiveTimeZone("Europe/Lisbon");
    expect(formatTime("2026-07-01T20:00:00Z")).toBe("21:00");
    expect(zoneLabel()).toBe("Lisbon");

    setActiveTimeZone("America/Sao_Paulo");
    expect(formatTime("2026-07-01T20:00:00Z")).toBe("17:00");
    expect(zoneLabel()).toBe("Sao Paulo");
  });

  it("traduz o nome da cidade no idioma português", () => {
    setActiveLang("pt");
    setActiveTimeZone("Europe/Lisbon");
    expect(zoneLabel()).toBe("Lisboa");
    setActiveTimeZone("America/Sao_Paulo");
    expect(zoneLabel()).toBe("São Paulo");
  });

  it("volta ao fuso do dispositivo sem escolha do utilizador", () => {
    setActiveTimeZone("Europe/Lisbon");
    setActiveTimeZone(null);
    expect(activeTimeZone()).toBeTruthy();
    expect(() => formatTime("2026-07-01T20:00:00Z")).not.toThrow();
  });
});
