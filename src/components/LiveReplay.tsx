import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CircleDot,
  CloudRain,
  Flag,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Signal,
  Timer,
  Wind,
} from "lucide-react";
import { replay } from "../lib/replay";
import { season } from "../lib/data";
import { compoundName, formatDate, formatGap, formatInterval } from "../lib/format";
import { getTrack, type CarInput } from "../lib/track3d";
import { usePrefs } from "../lib/prefs";
import { useI18n } from "../lib/i18n";
import TrackMap3D from "./TrackMap3D";
import { TyreBadge } from "./ui";

type Speed = 1 | 2 | 4;

/** duração de uma volta do replay em 1x (replay acelerado) */
const LAP_MS = 3600;

const initialLap = () => {
  const match = window.location.hash.match(/volta=(\d+)/);
  if (!match) return 0;
  return Math.min(replay.snaps.length - 1, Math.max(0, Number(match[1]) - 1));
};

export default function LiveReplay() {
  const last = replay.snaps.length - 1;
  const [index, setIndex] = useState(initialLap);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(2);
  const { prefs } = usePrefs();
  const { t } = useI18n();
  const [focusCar, setFocusCar] = useState<string | null>(prefs.driver ?? null);
  const lapMs = LAP_MS / speed;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setIndex((current) => {
        if (current >= last) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, lapMs);
    return () => window.clearInterval(id);
  }, [playing, lapMs, last]);

  const snap = replay.snaps[index];
  const prev = index > 0 ? replay.snaps[index - 1] : null;
  const driverMap = useMemo(
    () => new Map(replay.drivers.map((d) => [d.code, d])),
    [],
  );
  const prevPositions = prev
    ? new Map(prev.order.map((entry) => [entry.code, entry.pos]))
    : null;
  const leader = snap.order[0];
  const leaderInfo = leader ? driverMap.get(leader.code) : undefined;
  const fastest = snap.fastestLap;

  const battles = useMemo(
    () =>
      snap.order
        .filter((entry, i) => i > 0 && entry.interval !== null && entry.interval < 1 && !entry.lapped)
        .slice(0, 4),
    [snap],
  );

  const events = useMemo(() => {
    const list: { lap: number; text: string; alert?: boolean }[] = [];
    for (const snapshot of replay.snaps.slice(0, index + 1)) {
      for (const message of snapshot.messages) {
        const text = message.text;
        if (/BLUE FLAG|CLEAR IN TRACK|GREEN LIGHT|TRACK CLEAR|CHEQUERED/i.test(text)) continue;
        if (/WAVED|TIMED AT/i.test(text)) continue;
        list.push({ lap: snapshot.lap, text, alert: /VSC|SAFETY CAR|RED FLAG|PENALTY|INVESTIG/i.test(text) });
      }
      for (const code of snapshot.retired) {
        list.push({ lap: snapshot.lap, text: t("{code} abandonou", { code }), alert: true });
      }
      for (const pit of replay.pitStops.filter((p) => p.lap === snapshot.lap)) {
        list.push({
          lap: snapshot.lap,
          text: pit.duration
            ? t("Pit stop de {code} · {time}s", { code: pit.code, time: pit.duration.toFixed(1) })
            : t("Pit stop de {code}", { code: pit.code }),
        });
      }
      if (snapshot.retired.length === 0 && snapshot.messages.length === 0 && snapshot.lap > 1) {
        const previous = replay.snaps[snapshot.lap - 2];
        if (previous) {
          for (const entry of snapshot.order) {
            const before = previous.order.find((x) => x.code === entry.code);
            if (before && before.pos - entry.pos >= 2) {
              list.push({
                lap: snapshot.lap,
                text: t("{code} ganhou {n} posições", {
                  code: entry.code,
                  n: before.pos - entry.pos,
                }),
              });
            }
          }
        }
      }
    }
    return list.slice(-9).reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, t]);

  const podiumFight = snap.order[3];
  const podiumGap = podiumFight?.interval;
  const topGain = useMemo(() => {
    if (!prevPositions) return null;
    const first = replay.snaps[0].order;
    return snap.order
      .map((entry) => {
        const start = first.find((x) => x.code === entry.code)?.pos ?? entry.pos;
        return { code: entry.code, gained: start - entry.pos, pos: entry.pos };
      })
      .sort((a, b) => b.gained - a.gained)[0];
  }, [snap, prevPositions]);

  const leaderPits = snap.order[0]?.stops ?? 0;
  const leaderTyre = snap.order[0];
  const rain = (snap.weather?.rain ?? 0) > 0;

  const circuit = season.calendar.find((c) => c.circuitName === replay.circuitName);
  const geo = getTrack(circuit?.circuitId ?? "marina_bay");
  const mapCars = useMemo<CarInput[]>(() => {
    const retired = new Set(snap.retired);
    return snap.order
      .filter((entry) => !retired.has(entry.code))
      .map((entry) => ({
        code: entry.code,
        pos: entry.pos,
        gap: entry.gap,
        lapped: entry.lapped,
        color: driverMap.get(entry.code)?.teamColor ?? "#9aa3b2",
        compound: entry.compound,
      }));
  }, [snap, driverMap]);

  const startReplay = () => {
    if (index >= last) setIndex(0);
    setPlaying(true);
  };

  return (
    <div>
      <div className="live-head">
        <div className="live-title">
          <span className="live-pulse" />
          <div>
            <div className="micro micro-red">{t("Race hub · replay real")}</div>
            <h1>
              {replay.locality} <span style={{ color: "var(--muted-2)" }}>2026</span>
            </h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="tag">
            {replay.circuitName}
          </span>
          <span className="tag">{t("{n} voltas", { n: replay.totalLaps })}</span>
          <span className="tag tag-purple">
            <Timer size={11} /> {t("Dados OpenF1")}
          </span>
          <button className="btn btn-primary" onClick={index === 0 ? startReplay : () => setPlaying((p) => !p)}>
            {playing ? <Pause className="icon" /> : <Play className="icon" />}
            {t(playing ? "Pausar" : index === 0 ? "Iniciar replay" : "Continuar")}
          </button>
        </div>
      </div>

      {geo && (
        <article className="panel map-panel">
          <div className="map-panel-head">
            <div className="map-panel-title">
              <span className="micro micro-red">{t("Mapa 3D · traçado real")}</span>
              <h2>{replay.circuitName}</h2>
            </div>
            <div className="map-panel-meta">
              <span className="tag">{(geo.lengthM / 1000).toFixed(3)} km</span>
              <span className="tag">{t("relevo {n} m", { n: Math.round(geo.elevationM) })}</span>
              <span className="tag tag-purple">{t("geometria OpenF1")}</span>
              <span className="tag">
                {t("volta {lap}/{total}", { lap: snap.lap, total: replay.totalLaps })}
              </span>
            </div>
          </div>
          <TrackMap3D
            geo={geo}
            cars={mapCars}
            lapSeconds={snap.order[0]?.lastLapSec ?? 95}
            lapKey={index}
            playing={playing}
            lapMs={lapMs}
            focus={focusCar}
            onFocus={setFocusCar}
            theme={prefs.theme}
          />
        </article>
      )}

      <div className="live-grid">
        <article className="panel timing-card">
          <div className="timing-head">
            <div className="lap-block">
              <strong>{snap.lap}</strong>
              <span>{t("/ {total} voltas", { total: replay.totalLaps })}</span>
            </div>
            <span
              className={`status-pill ${
                snap.status === "GREEN"
                  ? "status-green"
                  : snap.status === "RED"
                    ? "status-red"
                    : snap.status === "SC"
                      ? "status-sc"
                      : "status-vsc"
              }`}
            >
              <CircleDot size={10} />
              {snap.status === "GREEN" ? t("Pista verde") : snap.status}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              {leaderInfo && (
                <span className="tag" style={{ color: leaderInfo.teamColor }}>
                  <span className="team-dot" style={{ ["--team" as string]: leaderInfo.teamColor }} />
                  {t("Líder {code}", { code: leaderInfo.code })}
                </span>
              )}
              {fastest && (
                <span className="tag tag-purple">
                  <Gauge size={11} /> {fastest.code} {fastest.time}
                </span>
              )}
            </div>
          </div>

          <div className="timing-scroll">
            <table className="timing-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>P</th>
                  <th>{t("Piloto")}</th>
                  <th>Gap</th>
                  <th>{t("Intervalo")}</th>
                  <th>{t("Pneu")}</th>
                  <th>{t("Paradas")}</th>
                  <th>{t("Última volta")}</th>
                  <th>{t("Melhor")}</th>
                </tr>
              </thead>
              <tbody>
                {snap.order.map((entry, i) => {
                  const info = driverMap.get(entry.code);
                  if (!info) return null;
                  const before = prevPositions?.get(entry.code);
                  const delta = before === undefined ? 0 : before - entry.pos;
                  const isBattle = battles.some((b) => b.code === entry.code);
                  const isFastest = fastest?.code === entry.code;
                  return (
                    <tr
                      key={entry.code}
                      onClick={() => setFocusCar(focusCar === entry.code ? null : entry.code)}
                      className={`${isBattle ? "is-battle" : ""}${isFastest ? " is-fastest" : ""}${
                        i < 3 ? " is-podium" : ""
                      }${focusCar === entry.code ? " is-focus" : ""}`}
                    >
                      <td>
                        <strong className="num">{i + 1}</strong>
                      </td>
                      <td>
                        <div className="timing-driver">
                          <span
                            className="team-bar"
                            style={{ ["--team" as string]: info.teamColor }}
                          />
                          <b>{entry.code}</b>
                          <span>{info.team.replace(" F1 Team", "").replace(" Racing", "")}</span>
                          {delta !== 0 && (
                            <span className={`pos-change ${delta > 0 ? "up" : "down"}`}>
                              {delta > 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                              {Math.abs(delta)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num" style={{ fontWeight: i === 0 ? 900 : 500 }}>
                        {formatGap(entry.gap, entry.lapped)}
                      </td>
                      <td className="num muted">{formatInterval(entry.interval)}</td>
                      <td>
                        <TyreBadge compound={entry.compound} age={entry.age} />
                      </td>
                      <td className="muted num">{entry.stops}</td>
                      <td className="num">{entry.lastLap ?? "—"}</td>
                      <td className="num muted">{entry.bestLap ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="player">
            <div className="player-controls">
              <button
                className="play-btn"
                onClick={() => setPlaying((p) => !p)}
                aria-label={t(playing ? "Pausar replay" : "Reproduzir replay")}
              >
                {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPlaying(false);
                  setIndex(0);
                }}
                aria-label={t("Voltar ao início")}
              >
                <RotateCcw className="icon" />
              </button>
              <div className="segmented speed-group">
                {([1, 2, 4] as Speed[]).map((value) => (
                  <button
                    key={value}
                    className={speed === value ? "is-active" : ""}
                    onClick={() => setSpeed(value)}
                  >
                    {value}×
                  </button>
                ))}
              </div>
              <span className="tag">
                <Signal size={11} /> {index + 1}/{replay.totalLaps}
              </span>
            </div>
            <input
              className="player-range"
              type="range"
              min={0}
              max={last}
              value={index}
              onChange={(event) => setIndex(Number(event.target.value))}
              style={{ ["--progress" as string]: `${(index / last) * 100}%` }}
              aria-label={t("Volta do replay")}
            />
            <div className="lap-marks">
              <span>L1</span>
              <span>L{Math.round(last * 0.25)}</span>
              <span>L{Math.round(last * 0.5)}</span>
              <span>L{Math.round(last * 0.75)}</span>
              <span>L{replay.totalLaps}</span>
            </div>
          </div>
        </article>

        <aside className="live-side">
          <article className="panel side-card">
            <div className="side-card-head">
              <h3>Race control</h3>
              <span className="tag">
                <Flag size={10} /> Replay
              </span>
            </div>
            <div className="feed">
              {events.length === 0 && (
                <div className="feed-item">
                  <span className="feed-lap">—</span>
                  <span>{t("Corrida sob controle. Dê play para acompanhar.")}</span>
                </div>
              )}
              {events.map((event, i) => (
                <div key={`${event.lap}-${i}`} className={`feed-item${event.alert ? " is-alert" : ""}`}>
                  <span className="feed-lap">L{event.lap}</span>
                  <span>{event.text}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel side-card">
            <div className="side-card-head">
              <h3>{t("Leitura da corrida")}</h3>
              <span className="tag">{t("{n} na pista", { n: snap.order.length })}</span>
            </div>
            <div className="insight" style={{ marginBottom: 8 }}>
              <span>{t("Duelo pelo pódio")}</span>
              <strong>
                {snap.lap <= 1
                  ? t("Largada — pódio indefinido")
                  : podiumFight && podiumGap !== null
                    ? t("{code} a {gap} do pódio", {
                        code: snap.order[3]?.code ?? "",
                        gap: formatInterval(podiumGap).replace("+", ""),
                      })
                    : t("Corrida encerrada")}
              </strong>
            </div>
            <div className="insight" style={{ marginBottom: 8 }}>
              <span>{t("Maior ganhador")}</span>
              <strong>
                {topGain && topGain.gained > 0
                  ? t("{code} +{n} posições", { code: topGain.code, n: topGain.gained })
                  : t("Grid mantido")}
              </strong>
            </div>
            <div className="insight">
              <span>{t("Estratégia do líder")}</span>
              <strong>
                {leaderTyre
                  ? t(
                      leaderPits === 1
                        ? "{stops} parada · {compound} com {age} voltas"
                        : "{stops} paradas · {compound} com {age} voltas",
                      {
                        stops: leaderPits,
                        compound: compoundName(leaderTyre.compound).toLowerCase(),
                        age: leaderTyre.age,
                      },
                    )
                  : "—"}
              </strong>
            </div>
            {battles.length > 0 && (
              <>
                <div className="divider" />
                <div className="micro" style={{ marginBottom: 4 }}>
                  {t("Batalhas < 1s")}
                </div>
                {battles.map((entry) => {
                  const ahead = snap.order[entry.pos - 2];
                  return (
                    <div className="battle-row" key={entry.code}>
                      <span className="team-dot" style={{ ["--team" as string]: driverMap.get(entry.code)?.teamColor ?? "#777" }} />
                      <span>
                        <b>{entry.code}</b> vs {ahead?.code}
                      </span>
                      <span className="gap-tight">
                        {entry.interval !== null ? `${entry.interval.toFixed(3)}s` : "—"}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </article>

          <article className="panel side-card">
            <div className="side-card-head">
              <h3>{t("Clima na pista")}</h3>
              <span className="tag">{t(rain ? "Chuva" : "Seco")}</span>
            </div>
            <div className="weather-row">
              <div className="weather-stat">
                <span>{t("Ar")}</span>
                <strong>{snap.weather ? `${snap.weather.air.toFixed(0)}°` : "—"}</strong>
              </div>
              <div className="weather-stat">
                <span>{t("Pista")}</span>
                <strong>{snap.weather ? `${snap.weather.track.toFixed(0)}°` : "—"}</strong>
              </div>
              <div className="weather-stat">
                <span>{t("Umidade")}</span>
                <strong>{snap.weather ? `${snap.weather.humidity.toFixed(0)}%` : "—"}</strong>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <span className="tag">
                <Wind size={11} /> {snap.status === "GREEN" ? t("Pista verde") : snap.status}
              </span>
              <span className="tag">
                <CloudRain size={11} /> {snap.weather ? `${snap.weather.rain.toFixed(1)} mm` : "0 mm"}
              </span>
            </div>
          </article>

          <article className="panel side-card live-setup">
            <div className="side-card-head">
              <h3>{t("Ao vivo na transmissão")}</h3>
              <span className="tag tag-accent">OpenF1</span>
            </div>
            <p className="note" style={{ margin: 0 }}>
              {t(
                "Este replay usa dados reais de timing da etapa de Singapura. Para timing ao vivo em tempo real, o OpenF1 exige assinatura de apoiador e token OAuth2.",
              )}
            </p>
            <a
              className="btn btn-block"
              href="https://openf1.org/auth.html"
              target="_blank"
              rel="noreferrer"
            >
              {t("Ver como conectar")} <ArrowUpRightIcon />
            </a>
            <div className="note" style={{ color: "var(--muted-2)" }}>
              {t(
                "O app não pede sua senha. Você pode colar um token de acesso no arquivo de ambiente para habilitar o modo ao vivo.",
              )}
            </div>
          </article>
        </aside>
      </div>

      <section className="section">
        <div className="two-col">
          <article className="panel panel-pad">
            <div className="micro">{t("Como usar durante a corrida")}</div>
            <h3 style={{ margin: "5px 0 10px", fontSize: 21, fontWeight: 900 }}>
              {t("Um segundo monitor, não um spoiler")}
            </h3>
            <p className="note" style={{ margin: 0 }}>
              {t(
                "Use o replay para entender janelas de pit, degradação e o efeito do Safety Car. No domingo, a mesma leitura vale para a transmissão: compare o gap real com o modelo e antecipe quem tem ritmo para atacar.",
              )}
            </p>
          </article>
          <article className="panel panel-pad">
            <div className="micro">{t("Dados da etapa")}</div>
            <h3 style={{ margin: "5px 0 10px", fontSize: 21, fontWeight: 900 }}>
              {t("GP de Singapura")}
            </h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="tag">{replay.circuitName}</span>
              <span className="tag">{formatDate(`${replay.date}T12:00:00Z`)}</span>
              <span className="tag">{t("{n} voltas", { n: replay.totalLaps })}</span>
              <span className="tag">{t("{n} abandonos", { n: replay.dnf.length })}</span>
              <span className="tag">{replay.pitStops.length} pit stops</span>
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              {t(
                "Dados: OpenF1 · location (traçado 3D), positions, intervals, laps, stints, pit, weather e race control.",
              )}
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}

