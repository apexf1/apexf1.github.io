import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowDown,
  CircleDot,
  Gauge,
  RefreshCw,
  Satellite,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { formatLapTime, formatTime } from "../lib/format";
import { useI18n } from "../lib/i18n";
import {
  DEMO_DRIVERS,
  POLL_MS,
  demoDuel,
  fetchDriverState,
  fetchGapBoard,
  fetchSessionDrivers,
  orderPair,
  predictOvertake,
  pressureOf,
  probeLiveSession,
  type DriverState,
  type LiveProbe,
  type OvertakePrediction,
  type SessionDriver,
} from "../lib/overtake";

type Pair = [number, number];

const FALLBACK_DRIVERS: SessionDriver[] =
  DEMO_DRIVERS.length >= 2
    ? DEMO_DRIVERS
    : [
        { number: 1, code: "VER", name: "Max Verstappen", team: "Red Bull", color: "#4781D7" },
        { number: 4, code: "NOR", name: "Lando Norris", team: "McLaren", color: "#F47600" },
      ];

const initialPair = (): Pair => [FALLBACK_DRIVERS[0].number, FALLBACK_DRIVERS[1].number];

/** 0 = sem pressão; 1 = ultrapassagem iminente. */
const pressureLabel = (value: number) =>
  value >= 0.75 ? "iminente" : value >= 0.45 ? "a aproximar-se" : value > 0 ? "a construir" : "sem pressão";

export default function SecondScreen() {
  const { t } = useI18n();
  const [probe, setProbe] = useState<LiveProbe | null>(null);
  const [drivers, setDrivers] = useState<SessionDriver[]>(FALLBACK_DRIVERS);
  const [pair, setPair] = useState<Pair>(initialPair);
  const [liveRows, setLiveRows] = useState<{ ahead: DriverState; behind: DriverState } | null>(null);
  const [demoTick, setDemoTick] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [retry, setRetry] = useState(0);
  const [refresh, setRefresh] = useState(0);

  const probeRef = useRef<LiveProbe | null>(null);
  const hasLiveRows = useRef(false);

  // 1. Sessão em directo (ou demo). Volta a tentar enquanto não houver corrida.
  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const run = async () => {
      const result = await probeLiveSession();
      if (!active) return;
      const previous = probeRef.current;
      probeRef.current = result;

      if (result.status === "demo") {
        setProbe(result);
        if (previous?.status !== "demo") {
          setDrivers(FALLBACK_DRIVERS);
          setPair(initialPair());
          setLiveRows(null);
          setUpdatedAt(null);
        }
        timer = window.setTimeout(() => void run(), 3 * 60_000);
        return;
      }

      if (previous?.status !== "live" || previous.session.key !== result.session.key) {
        setLiveRows(null);
        setUpdatedAt(null);
        try {
          const list = await fetchSessionDrivers(result.session.key);
          if (!active) return;
          if (list.length) {
            const board = await fetchGapBoard(result.session.key);
            if (!active) return;
            const ranked = list
              .map((driver) => ({ driver, gap: board.get(driver.number)?.gap ?? null }))
              .filter((entry): entry is { driver: SessionDriver; gap: number } => entry.gap !== null)
              .sort((a, b) => a.gap - b.gap);
            const first = ranked[0]?.driver ?? list[0];
            const second = ranked[1]?.driver ?? list[1];
            // pilotos e par definidos antes de ligar o modo live, para o
            // primeiro pedido de ritmo já ser aos dois da frente
            setDrivers(list);
            if (second) setPair([first.number, second.number]);
          }
        } catch {
          /* o polling de 10 s volta a tentar os dados dos pilotos */
        }
      }
      if (!active) return;
      setProbe(result);
    };

    void run();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [retry]);

  // 2. Modo demonstração: uma volta simulada a cada ciclo de 10 s.
  useEffect(() => {
    if (probe?.status !== "demo") return;
    setDemoTick(0);
    const id = window.setInterval(() => setDemoTick((tick) => tick + 1), POLL_MS);
    return () => window.clearInterval(id);
  }, [probe?.status, pair]);

  // 3. Dados reais do par escolhido, a cada 10 s.
  useEffect(() => {
    if (probe?.status !== "live") return;
    const session = probe.session;
    const [aheadNumber, behindNumber] = pair;
    const aheadMeta = drivers.find((driver) => driver.number === aheadNumber);
    const behindMeta = drivers.find((driver) => driver.number === behindNumber);
    if (!aheadMeta || !behindMeta) return;

    let active = true;
    let timer: number | undefined;
    let failures = 0;
    hasLiveRows.current = false;
    setLiveRows(null);

    const load = async () => {
      try {
        // em série: 4 pedidos por ciclo ficam abaixo do limite da API
        const ahead = await fetchDriverState(session.key, aheadMeta);
        await new Promise((resolve) => setTimeout(resolve, 120));
        const behind = await fetchDriverState(session.key, behindMeta);
        if (!active) return;
        failures = 0;
        hasLiveRows.current = true;
        setLiveRows({ ahead, behind });
        setUpdatedAt(Date.now());
        setStale(false);
      } catch {
        if (!active) return;
        failures += 1;
        if (!hasLiveRows.current && failures >= 2) {
          probeRef.current = { status: "demo", reason: "offline" };
          setProbe({ status: "demo", reason: "offline" });
          setDrivers(FALLBACK_DRIVERS);
          setPair(initialPair());
          return;
        }
        setStale(true);
      }
      timer = window.setTimeout(load, POLL_MS);
    };

    void load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [probe, pair, drivers, refresh]);

  const demo = useMemo(() => {
    if (probe?.status !== "demo") return null;
    const ahead = drivers.find((driver) => driver.number === pair[0]) ?? drivers[0];
    const behind = drivers.find((driver) => driver.number === pair[1]) ?? drivers[1] ?? drivers[0];
    if (!ahead || !behind || ahead.number === behind.number) return null;
    return demoDuel(demoTick * POLL_MS, ahead, behind);
  }, [probe?.status, drivers, pair, demoTick]);

  const session = probe?.status === "live" ? probe.session : null;
  const rows = probe?.status === "live" ? liveRows : demo;
  const ordered = rows ? orderPair(rows.ahead, rows.behind) : null;
  const prediction = ordered
    ? predictOvertake(ordered[0], ordered[1], session?.totalLaps ?? null)
    : null;
  const pressure = prediction ? pressureOf(prediction) : 0;

  const changeDriver = (slot: 0 | 1, number: number) => {
    setPair((current) => {
      const next: Pair = [current[0], current[1]];
      next[slot] = number;
      if (next[0] === next[1]) {
        const other = drivers.find((driver) => driver.number !== number);
        if (other) next[1 - slot] = other.number;
      }
      return next;
    });
  };

  const onRefresh = () => {
    if (probe?.status === "demo") {
      setDemoTick(0);
      setRetry((value) => value + 1);
    } else {
      setRefresh((value) => value + 1);
    }
  };

  const leader = ordered?.[0];
  const chaser = ordered?.[1];

  return (
    <div className="duel-page">
      <header className="duel-head">
        <div>
          <div className="micro micro-red">{t("Segundo ecrã · OpenF1")}</div>
          <h1>
            {t("Previsão de")} <span style={{ color: "var(--muted-2)" }}>{t("ultrapassagem")}</span>
          </h1>
          <p>
            {t(
              "O painel compara o ritmo das últimas 3 voltas e calcula quando o piloto de trás deve chegar ao da frente. Sem introduzir dados à mão.",
            )}
          </p>
        </div>
        <div className="history-head-tags">
          <span className={`tag${probe?.status === "live" ? " tag-green" : ""}`}>
            <Satellite size={11} /> {probe?.status === "live" ? t("em direto") : t("demonstração")}
          </span>
          {session && <span className="tag">{session.circuit || session.name}</span>}
          {session && <span className="tag">{session.name}</span>}
          {session?.totalLaps ? (
            <span className="tag">{t("{n} voltas", { n: session.totalLaps })}</span>
          ) : null}
          <button className="btn btn-ghost btn-sm" onClick={onRefresh} aria-label={t("Atualizar dados")}>
            <RefreshCw size={13} className="icon" /> {t("Atualizar")}
          </button>
        </div>
      </header>

      {probe?.status === "demo" && (
        <div className="duel-banner" role="status">
          <WifiOff size={18} />
          <div>
            <strong>{t("Modo demonstração · dados simulados")}</strong>
            <span>{demoReason(t, probe.reason)}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setRetry((value) => value + 1)}>
            {t("Ligar à OpenF1")}
          </button>
        </div>
      )}

      {probe?.status === "live" && stale && (
        <div className="duel-banner is-warn" role="status">
          <TriangleAlert size={18} />
          <div>
            <strong>{t("Sem leitura nova da OpenF1")}</strong>
            <span>{t("A mostrar o último valor recebido. A tentar de novo a cada 10 s.")}</span>
          </div>
        </div>
      )}

      {probe === null ? (
        <article className="panel panel-pad">
          <div className="skeleton" style={{ height: 18, width: 200, marginBottom: 14 }} />
          <div className="skeleton" style={{ height: 190 }} />
        </article>
      ) : (
        <article className="panel duel-panel">
          <div className="duel-selects">
            <label className="duel-select">
              <span className="micro">{t("Piloto 1")}</span>
              <select
                value={pair[0]}
                onChange={(event) => changeDriver(0, Number(event.target.value))}
              >
                {drivers.map((driver) => (
                  <option key={driver.number} value={driver.number}>
                    {driver.code} · {driver.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="duel-select">
              <span className="micro">{t("Piloto 2")}</span>
              <select
                value={pair[1]}
                onChange={(event) => changeDriver(1, Number(event.target.value))}
              >
                {drivers.map((driver) => (
                  <option key={driver.number} value={driver.number}>
                    {driver.code} · {driver.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!prediction || !leader || !chaser ? (
            <div className="duel-empty">
              <Gauge size={22} />
              <span>{t("À espera de dados da sessão. A primeira leitura pode demorar alguns segundos.")}</span>
            </div>
          ) : (
            <>
              <div className="duel-stage">
                <DriverSide driver={leader} role={t("Na frente")} />
                <div className="duel-gap">
                  <div className="duel-gap-value">
                    {prediction.gap === null ? "—" : prediction.gap.toFixed(3)}
                    <small>s</small>
                  </div>
                  <div className="micro">{t("intervalo")}</div>
                  <div className="duel-arrow">
                    <ArrowDown size={14} /> {t("pressão")}
                  </div>
                </div>
                <DriverSide driver={chaser} role={t("Atrás")} behind />
              </div>

              <div className={`duel-verdict is-${prediction.verdict}`}>
                <CircleDot size={17} />
                <p>{verdictText(t, prediction)}</p>
              </div>

              <div className="duel-meter">
                <div className="duel-meter-labels">
                  <span>{t("Pressão de ultrapassagem · {state}", { state: t(pressureLabel(pressure)) })}</span>
                  <span>{Math.round(pressure * 100)}%</span>
                </div>
                <div
                  className="duel-meter-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pressure * 100)}
                  aria-label={t("Pressão de ultrapassagem")}
                >
                  <span
                    className="duel-meter-fill"
                    style={{ width: `${Math.round(pressure * 100)}%` }}
                  />
                </div>
              </div>

              <div className="duel-stats">
                <div className="duel-stat">
                  <span className="micro">{t("Δ ritmo por volta")}</span>
                  <strong
                    className={
                      prediction.gain === null
                        ? ""
                        : prediction.gain > 0
                          ? "is-green"
                          : "is-red"
                    }
                  >
                    {prediction.gain === null
                      ? "—"
                      : `${prediction.gain > 0 ? "+" : ""}${prediction.gain.toFixed(3)}s`}
                  </strong>
                  <span>{t("a favor de {code}", { code: prediction.gain !== null && prediction.gain > 0 ? prediction.behind.code : prediction.ahead.code })}</span>
                </div>
                <div className="duel-stat">
                  <span className="micro">{t("Voltas para a ultrapassagem")}</span>
                  <strong>
                    {prediction.lapsToPass === null ? "—" : prediction.lapsToPass.toFixed(1)}
                  </strong>
                  <span>{t("gap ÷ ganho por volta")}</span>
                </div>
                <div className="duel-stat">
                  <span className="micro">{t("Volta prevista")}</span>
                  <strong>{prediction.targetLap ?? "—"}</strong>
                  <span>
                    {prediction.verdict === "late" && prediction.remainingLaps !== null
                      ? t("faltam {n} voltas", { n: prediction.remainingLaps })
                      : prediction.currentLap === null
                        ? t("volta atual desconhecida")
                        : t("volta atual {lap}", { lap: prediction.currentLap })}
                  </span>
                </div>
              </div>

              <footer className="duel-foot">
                <span>
                  {session
                    ? updatedAt
                      ? t("atualizado às {time} · novo pedido a cada 10 s", {
                          time: formatTime(new Date(updatedAt).toISOString()),
                        })
                      : t("à espera da primeira leitura")
                    : t("simulação · atualiza a cada 10 s")}
                </span>
                <span>
                  {t(
                    "Média das últimas 3 voltas limpas (sem out-laps nem safety car). Assume pista livre entre os dois.",
                  )}
                </span>
              </footer>
            </>
          )}
        </article>
      )}
    </div>
  );
}

function demoReason(t: (text: string) => string, reason: "offline" | "no-session" | "not-race") {
  if (reason === "offline") {
    return t("A OpenF1 não respondeu. Enquanto isso, vês uma corrida simulada com a mesma lógica do painel.");
  }
  if (reason === "not-race") {
    return t("A sessão em direto não é uma corrida. Os números abaixo são simulados.");
  }
  return t("Não há corrida em direto neste momento. Os números abaixo são simulados.");
}

function verdictText(t: (text: string, vars?: Record<string, string | number>) => string, prediction: OvertakePrediction) {
  const delta = Math.abs(prediction.gain ?? 0).toFixed(3);
  switch (prediction.verdict) {
    case "attack":
      return t(
        "{behind} está a tirar {delta}s por volta a {ahead}. Ultrapassagem estimada na volta {lap}.",
        {
          behind: prediction.behind.code,
          ahead: prediction.ahead.code,
          delta,
          lap: prediction.targetLap ?? "—",
        },
      );
    case "stable":
      return t(
        "{behind} está {delta}s por volta mais lento que {ahead}. O intervalo de {gap}s mantém-se.",
        {
          behind: prediction.behind.code,
          ahead: prediction.ahead.code,
          delta,
          gap: (prediction.gap ?? 0).toFixed(3),
        },
      );
    case "side-by-side":
      return t("{ahead} e {behind} estão lado a lado — a ultrapassagem pode acontecer nesta volta.", {
        ahead: prediction.ahead.code,
        behind: prediction.behind.code,
      });
    case "late":
      return t(
        "{behind} está a tirar {delta}s por volta a {ahead}, mas faltam {remaining} voltas — a ultrapassagem deve ficar para depois da bandeira.",
        {
          behind: prediction.behind.code,
          ahead: prediction.ahead.code,
          delta,
          remaining: prediction.remainingLaps ?? 0,
        },
      );
    case "lapped":
      return t("{behind} está uma volta atrás de {ahead}; não há previsão de ultrapassagem.", {
        behind: prediction.behind.code,
        ahead: prediction.ahead.code,
      });
    default:
      return t("Ainda não há voltas limpas suficientes para calcular o ritmo. A previsão aparece após 3 voltas.");
  }
}

function DriverSide({
  driver,
  role,
  behind = false,
}: {
  driver: DriverState;
  role: string;
  behind?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`duel-driver${behind ? " is-behind" : ""}`}
      style={{ "--team": driver.color } as CSSProperties}
    >
      <div className="duel-role">{role}</div>
      <div className="duel-driver-head">
        <span className="duel-number">{driver.number}</span>
        <span className="duel-code">{driver.code}</span>
      </div>
      <div className="duel-name">{driver.name}</div>
      <div className="duel-team">{driver.team}</div>
      <div className="duel-laps">
        {driver.laps.length ? (
          driver.laps.map((lap, index) => (
            <span className="duel-chip" key={`${driver.code}-${index}`}>
              {formatLapTime(lap)}
            </span>
          ))
        ) : (
          <span className="duel-chip">—</span>
        )}
      </div>
      <div className="duel-pace">
        <strong>{formatLapTime(driver.pace)}</strong>
        <span>{t("ritmo médio")}</span>
      </div>
    </div>
  );
}
