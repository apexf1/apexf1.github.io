import { useEffect, useState } from "react";
import type { Weather } from "../types";

const KEY_PICKS = "apex.picks.v1";
const KEY_SETTINGS = "apex.settings.v1";
const KEY_TOKEN = "apex.openf1.token";

export type Picks = Record<number, string>;

export function loadPicks(): Picks {
  try {
    const raw = localStorage.getItem(KEY_PICKS);
    return raw ? (JSON.parse(raw) as Picks) : {};
  } catch {
    return {};
  }
}

export function savePick(round: number, code: string): Picks {
  const picks = loadPicks();
  picks[round] = code;
  try {
    localStorage.setItem(KEY_PICKS, JSON.stringify(picks));
  } catch {
    /* armazenamento indisponível */
  }
  return picks;
}

export interface SimSettings {
  weather: Weather;
  chaos: number;
}

export const defaultSettings: SimSettings = { weather: "dry", chaos: 35 };

export function loadSettings(): SimSettings {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<SimSettings>;
    return {
      weather: parsed.weather ?? defaultSettings.weather,
      chaos: typeof parsed.chaos === "number" ? parsed.chaos : defaultSettings.chaos,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: SimSettings) {
  try {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
  } catch {
    /* armazenamento indisponível */
  }
}

export function loadToken(): string {
  try {
    return localStorage.getItem(KEY_TOKEN) ?? "";
  } catch {
    return "";
  }
}

export function saveToken(token: string) {
  try {
    if (token) localStorage.setItem(KEY_TOKEN, token);
    else localStorage.removeItem(KEY_TOKEN);
  } catch {
    /* armazenamento indisponível */
  }
}

export function usePicks(): [Picks, (round: number, code: string) => void] {
  const [picks, setPicks] = useState<Picks>(() => loadPicks());
  const choose = (round: number, code: string) => setPicks(savePick(round, code));
  return [picks, choose];
}

export function useSettings(): [SimSettings, (next: SimSettings) => void] {
  const [settings, setSettings] = useState<SimSettings>(() => loadSettings());
  const update = (next: SimSettings) => {
    setSettings(next);
    saveSettings(next);
  };
  return [settings, update];
}

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
