export interface CircuitProfile {
  power: number;
  downforce: number;
  tyre: number;
  overtaking: number;
  street: number;
  chaos: number;
  laps: number;
  length: number;
  drs: number;
}

export interface RaceBrief {
  headline: string;
  sectors: string;
  overtake: string;
  strategy: string;
  watch: string;
}

export interface Race {
  round: number;
  name: string;
  shortName: string;
  circuitId: string;
  circuitName: string;
  locality: string;
  country: string;
  flag: string;
  date: string;
  startUTC: string;
  laps: number;
  lengthKm: number;
  drsZones: number;
  profile: CircuitProfile;
  brief: RaceBrief | null;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
  points: number;
  wins: number;
  position: number;
  base2025: number;
}

export interface Driver {
  code: string;
  driverId: string;
  number: number;
  firstName: string;
  lastName: string;
  name: string;
  nationality: string;
  flag: string;
  teamId: string;
  points: number;
  position: number;
  wins: number;
  starts: number;
  podiums: number;
  dnfs: number;
  fastestLaps: number;
  poles: number;
}

export interface RaceResult {
  code: string;
  teamId: string;
  grid: number;
  position: number;
  positionText: string;
  points: number;
  laps: number;
  status: string;
  finished: boolean;
  fastestLapRank: number | null;
}

export interface RoundResults {
  round: number;
  circuitId: string;
  results: RaceResult[];
}

export interface QualifyingEntry {
  code: string;
  position: number;
  q1: number | null;
  q2: number | null;
  q3: number | null;
}

export interface RoundQualifying {
  round: number;
  circuitId: string;
  results: QualifyingEntry[];
}

export interface StandingsHistoryEntry {
  round: number;
  drivers: { code: string; points: number; position: number }[];
  teams: { teamId: string; points: number; position: number }[];
}

export interface Season {
  season: number;
  throughRound: number;
  updatedAt: string;
  source: string;
  drivers: Driver[];
  teams: Team[];
  calendar: Race[];
  results: RoundResults[];
  qualifying: RoundQualifying[];
  standingsHistory: StandingsHistoryEntry[];
}

export type Weather = "dry" | "mixed" | "wet";

export interface ReplayDriverInfo {
  code: string;
  number: number;
  name: string;
  team: string;
  teamColor: string;
}

export interface ReplayEntry {
  code: string;
  pos: number;
  gap: number | null;
  interval: number | null;
  compound: string;
  age: number;
  stops: number;
  lastLap: string | null;
  lastLapSec: number | null;
  bestLap: string | null;
  lapped: boolean;
}

export interface ReplayMessage {
  text: string;
  category: string;
  lap: number;
}

export interface ReplaySnapshot {
  lap: number;
  t: number;
  status: "GREEN" | "VSC" | "SC" | "RED";
  weather: { air: number; track: number; humidity: number; rain: number } | null;
  order: ReplayEntry[];
  messages: ReplayMessage[];
  fastestLap: { code: string; time: string } | null;
  retired: string[];
}

export interface Replay {
  sessionKey: number;
  raceName: string;
  circuitName: string;
  locality: string;
  country: string;
  date: string;
  totalLaps: number;
  dnf: { code: string; lap: number }[];
  drivers: ReplayDriverInfo[];
  pitStops: { lap: number; code: string | null; duration: number | null }[];
  snaps: ReplaySnapshot[];
}

export interface DriverMetrics {
  code: string;
  teamId: string;
  starts: number;
  points: number;
  wins: number;
  podiums: number;
  dnfRate: number;
  avgFinish: number;
  avgGrid: number;
  positionsGained: number;
  form: number[];
  consistency: number;
  qualiWins: number;
  qualiLosses: number;
  qualiMedianDelta: number;
  raceWins: number;
  raceLosses: number;
  raceMedianDelta: number;
  tyreGain: number;
  teammate: string | null;
  attributes: {
    quali: number;
    race: number;
    consistency: number;
    tyre: number;
    wet: number;
    reliability: number;
  };
}

export interface TeamMetrics {
  teamId: string;
  gpPointsPerRace: number;
  recentPointsPerRace: number;
  dnfRate: number;
  pace: number;
}

export interface FactorBreakdown {
  car: number;
  quali: number;
  race: number;
  track: number;
  reliability: number;
  tyres: number;
  wet: number;
}
