import replayJson from "../data/replay-singapore.json";
import type { Replay } from "../types";

export const replay = replayJson as unknown as Replay;
