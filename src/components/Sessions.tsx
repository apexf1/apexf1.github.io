import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  MapPin,
  Timer,
  Trophy,
} from "lucide-react";
import {
  calendar,
  driverByCode,
  getUpcomingRace,
  raceByRound,
  resultsByRound,
  season,
  teamById,
} from "../lib/data";
import {
  classificationFor,
  defaultSessionId,
  sessionShortLabel,
  sessionState,
  sessionsGenerated,
  weekendByRound,
  type SessionId,
  type WeekendSession,
} from "../lib/sessions";
import {
  countdownParts,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatLapTime,
  formatTime,
  formatZone,
  raceLabel,
} from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useLiveWeekend } from "../lib/live";
import { useNow } from "../lib/storage";
import { Avatar } from "./ui";

const stateTone = (state: ReturnType<typeof sessionState>) =>
  state === "done"
    ? "tag-green"
    : state === "live"
      ? "tag-accent"
      : state === "upcoming"
        ? "tag-accent"
        : "";

export default function Sessions() {
  const { t } = useI18n();
  const now = useNow(30_000);
  const upcoming = getUpcomingRace(now);
  const [round, setRound] = useState(upcoming.round);
  const [picked, setPicked] = useState<SessionId | null>(null);
  const activeRoundRef = useRef<HTMLButtonElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  const weekend = weekendByRound.get(round);
  // resultados em directo da OpenF1; o JSON da build fica como fallback offline
  const live = useLiveWeekend(round, weekend?.meetingKey ?? null, round === upcoming.round);
  const sessions = useMemo(() => {
    const bundled = weekend?.sessions ?? [];
    if (!live.sessions) return bundled;
    // se a fonte falhar a meio, não se perdem os tempos que já estavam na build
    return live.sessions.map((session) => {
      const previous = bundled.find((item) => item.id === session.id);
      return {
        ...session,
        results: session.results ?? previous?.results,
        quali: session.quali ?? previous?.quali,
      };
    });
  }, [live.sessions, weekend]);
  const race = raceByRound.get(round) ?? calendar[0];
  const raceDone = resultsByRound.has(round);

  useEffect(() => {
    setPicked(null);
  }, [round]);

  useEffect(() => {
    const rail = railRef.current;
    const button = activeRoundRef.current;
    if (!rail || !button) return;
    const box = button.getBoundingClientRect();
    const frame = rail.getBoundingClientRect();
    if (rail.scrollHeight > rail.clientHeight) {
      rail.scrollTop += box.top - frame.top - (frame.height - box.height) / 2;
    }
  }, [round]);

  const fallback = defaultSessionId(sessions, round, now);
  const active =
    sessions.find((session) => session.id === picked) ??
    sessions.find((session) => session.id === fallback) ??
    sessions[0] ??
    null;
  const state = active ? sessionState(active, round, now) : null;
  const rows = useMemo(
    () => (active ? classificationFor(round, active) : []),
    [active, round],
  );
  const leader = rows.find((row) => row.time !== null) ?? rows[0];
  const leaderTeam = leader ? teamById.get(driverByCode.get(leader.code)?.teamId ?? "") : undefined;
  const partial = active !== null && active.id !== "quali" && rows.length > 0 && rows.length < 20;
  const countdown = active ? countdownParts(active.start, now) : null;

  const labelFor = (session: WeekendSession): string => {
    if (session.id === "quali") return t("Qualificação");
    if (session.id === "sprint_quali") return t("Classificação sprint");
    return t("Treino livre {n}", { n: session.id.slice(-1) });
  };

  const stateLabel = (value: ReturnType<typeof sessionState>): string =>
    value === "done"
      ? t("Concluída")
      : value === "live"
        ? t("Em curso")
        : value === "upcoming"
          ? t("Por realizar")
          : value === "cancelled"
            ? t("Cancelada")
            : t("Sem dados");

  const step = (delta: number) => {
    const index = calendar.findIndex((item) => item.round === round);
    const next = calendar[Math.min(calendar.length - 1, Math.max(0, index + delta))];
    if (next) setRound(next.round);
  };

  return (
    <div className="sessions-page">
      <div className="standings-head">
        <div>
          <div className="micro micro-red">{t("Fim de semana")}</div>
          <h1>
            {t("Treinos livres")}
            <br />
            <span style={{ color: "var(--muted-2)" }}>{t("e classificação")}</span>
          </h1>
          <p>
            {t(
              "Todos os treinos livres e a classificação de cada Grande Prêmio de {year}, com tempos, voltas e diferenças reais. Escolha a etapa e a sessão.",
              { year: season.season },
            )}
          </p>
        </div>
        <div className="history-head-tags">
          <span className="tag">
            <Flag size={11} /> {t("{n} etapas", { n: calendar.length })}
          </span>
          <span className="tag">
            <Timer size={11} /> {t("FP1 · FP2 · FP3 · Qualificação")}
          </span>
          <span className="tag">
            {live.updatedAt
              ? t("atualizado às {time}", {
                  time: formatTime(new Date(live.updatedAt).toISOString()),
                })
              : t("dados {date}", { date: formatDate(sessionsGenerated) })}
          </span>
        </div>
      </div>

      <div className="weekend-layout">
        <aside className="panel weekend-rail" aria-label={t("Escolher etapa")}>
          <div className="weekend-rail-head">
            <span className="micro">{t("Etapas")}</span>
            <div className="history-arrows">
              <button onClick={() => step(-1)} disabled={round === calendar[0].round} aria-label={t("Etapa anterior")}>
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => step(1)}
                disabled={round === calendar[calendar.length - 1].round}
                aria-label={t("Etapa seguinte")}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="weekend-rail-scroll" ref={railRef}>
            {calendar.map((item) => {
              const done = resultsByRound.has(item.round);
              const isActive = item.round === round;
              return (
                <button
                  key={item.round}
                  ref={isActive ? activeRoundRef : undefined}
                  className={`weekend-round${isActive ? " is-active" : ""}${done ? " is-done" : ""}`}
                  onClick={() => setRound(item.round)}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className="weekend-round-num">R{item.round}</span>
                  <span className="weekend-round-flag">{item.flag}</span>
                  <span className="weekend-round-name">
                    <strong>{raceLabel(item)}</strong>
                    <span>{formatDate(item.startUTC)}</span>
                  </span>
                  <span className="weekend-round-state">
                    {done ? t("Concluída") : item.round === upcoming.round ? t("A seguir") : t("Por realizar")}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="weekend-main">
          <article className="panel weekend-hero">
            <div>
              <div className="hero-top">
                <span className="hero-round">
                  Round {round} / {calendar.length}
                </span>
                <span className="tag">
                  {race.flag} {race.country}
                </span>
                {raceDone ? (
                  <span className="tag tag-green">
                    <Check size={11} /> {t("Concluída")}
                  </span>
                ) : (
                  <span className="tag tag-accent">{t("A seguir")}</span>
                )}
              </div>
              <h2 className="weekend-title">
                {raceLabel(race)} <span>GP</span>
              </h2>
              <div className="hero-sub">
                <MapPin className="icon" size={15} />
                <span>
                  {race.circuitName} · {race.locality}
                </span>
                <span style={{ color: "var(--muted-2)" }}>|</span>
                <span>{formatDateLong(race.startUTC)}</span>
              </div>
            </div>
            <div className="weekend-hero-side">
              <div className="weekend-count">
                <strong>{sessions.length}</strong>
                <span>{t("sessões")}</span>
              </div>
              <a className="btn btn-ghost" href="#corrida">
                {t("Abrir corrida")} <ArrowUpRight size={13} />
              </a>
            </div>
          </article>

          {sessions.length > 0 && (
            <div className="session-tabs" role="tablist" aria-label={t("Sessões do fim de semana")}>
              {sessions.map((session) => {
                const sessionPhase = sessionState(session, round, now);
                return (
                  <button
                    key={session.id}
                    role="tab"
                    aria-selected={active?.id === session.id}
                    className={`session-tab${active?.id === session.id ? " is-active" : ""} is-${sessionPhase}`}
                    onClick={() => setPicked(session.id)}
                  >
                    <span className="session-tab-top">
                      <b>{sessionShortLabel(session)}</b>
                      <span className={`session-dot is-${sessionPhase}`} aria-hidden="true" />
                    </span>
                    <span className="session-tab-name">{labelFor(session)}</span>
                    <span className="session-tab-time">
                      {formatDate(session.start)} · {formatTime(session.start)}
                    </span>
                    <span className="session-tab-state">{stateLabel(sessionPhase)}</span>
                  </button>
                );
              })}
            </div>
          )}

          <article className="panel session-panel">
            {!active ? (
              <div className="session-empty">
                <Timer size={26} />
                <strong>{t("Sem sessões publicadas para esta etapa.")}</strong>
              </div>
            ) : (
              <>
                <div className="session-head">
                  <div>
                    <div className="micro micro-red">
                      {state === "done" ? t("Classificação final") : t("Sessão")} · R{round}
                    </div>
                    <h2>{labelFor(active)}</h2>
                    <div className="session-meta">
                      <CalendarDays size={13} />
                      {formatDateTime(active.start)} ({formatZone()})
                      {countdown && countdown.diff > 0 && (
                        <span className="session-countdown">
                          {t("Faltam {days}d {hours}h {minutes}m", {
                            days: countdown.days,
                            hours: countdown.hours,
                            minutes: countdown.minutes,
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="session-head-side">
                    {state && <span className={`tag ${stateTone(state)}`}>{stateLabel(state)}</span>}
                    {leader && leader.time !== null && state === "done" && (
                      <span className="tag tag-yellow">
                        <Trophy size={11} />{" "}
                        {active.id === "quali"
                          ? t("Pole: {code} · {time}", {
                              code: leader.code,
                              time: formatLapTime(leader.time),
                            })
                          : t("Mais rápido: {code} · {time}", {
                              code: leader.code,
                              time: formatLapTime(leader.time),
                            })}
                      </span>
                    )}
                  </div>
                </div>

                {(state === "upcoming" || state === "live" || state === "cancelled") && (
                  <div className="session-empty">
                    <Timer size={26} />
                    <strong>
                      {state === "cancelled"
                        ? t("Sessão cancelada.")
                        : state === "live"
                          ? t("Sessão em curso.")
                          : t("Sessão por realizar.")}
                    </strong>
                    <p>
                      {state === "live"
                        ? t("Os tempos aparecem aqui assim que a fonte os publicar.")
                        : t("Começa a {date} ({zone}).", {
                            date: formatDateTime(active.start),
                            zone: formatZone(),
                          })}
                    </p>
                  </div>
                )}

                {state === "missed" && (
                  <div className="session-empty">
                    <Timer size={26} />
                    <strong>{t("Sem dados publicados para esta sessão.")}</strong>
                    <p>{t("A fonte não publicou a classificação desta sessão.")}</p>
                  </div>
                )}

                {state === "done" && rows.length > 0 && (
                  <>
                    {leader && (
                      <div className="session-summary">
                        <div className="session-summary-leader">
                          {(() => {
                            const driverInfo = driverByCode.get(leader.code);
                            return driverInfo ? (
                              <Avatar
                                driver={driverInfo}
                                color={leaderTeam?.color}
                                size="sm"
                              />
                            ) : null;
                          })()}
                          <div>
                            <span className="micro">
                              {active.id === "quali" ? t("Pole position") : t("Mais rápido")}
                            </span>
                            <strong>{driverByCode.get(leader.code)?.name ?? leader.code}</strong>
                          </div>
                          <b className="num">{formatLapTime(leader.time)}</b>
                        </div>
                        <div className="session-summary-stat">
                          <span>{t("Equipe")}</span>
                          <strong>{leaderTeam?.name ?? "—"}</strong>
                        </div>
                        <div className="session-summary-stat">
                          <span>{active.id === "quali" ? "Q3" : t("Voltas do líder")}</span>
                          <strong>
                            {active.id === "quali"
                              ? `${rows.filter((row) => row.q3 !== null).length} ${t("pilotos")}`
                              : `${leader.laps ?? 0}`}
                          </strong>
                        </div>
                        <div className="session-summary-stat">
                          <span>{t("Pilotos classificados")}</span>
                          <strong>{rows.length}</strong>
                        </div>
                      </div>
                    )}

                    <div className="table-scroll">
                      <table className="standings-table session-table">
                        <thead>
                          {active.id === "quali" ? (
                            <tr>
                              <th>Pos</th>
                              <th>{t("Piloto")}</th>
                              <th>Q1</th>
                              <th>Q2</th>
                              <th>Q3</th>
                              <th>Gap</th>
                            </tr>
                          ) : (
                            <tr>
                              <th>Pos</th>
                              <th>{t("Piloto")}</th>
                              <th>{t("Voltas")}</th>
                              <th>{t("Melhor volta")}</th>
                              <th>Gap</th>
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const driver = driverByCode.get(row.code);
                            const team = driver ? teamById.get(driver.teamId) : undefined;
                            const bestTime =
                              active.id === "quali" ? leader?.time ?? null : null;
                            return (
                              <tr
                                key={row.code}
                                className={row.position === 1 ? "is-leader" : ""}
                              >
                                <td>
                                  <span className="stand-pos">{row.position}</span>
                                </td>
                                <td>
                                  <div className="table-driver">
                                    <span
                                      className="team-bar"
                                      style={{ ["--team" as string]: team?.color ?? "#777" }}
                                    />
                                    {driver ? (
                                      <Avatar
                                        driver={driver}
                                        color={team?.color}
                                        size="sm"
                                      />
                                    ) : null}
                                    <div className="table-driver-name">
                                      <strong>{driver?.name ?? row.code}</strong>
                                      <span>
                                        {team?.name ?? "—"}
                                        {row.note ? ` · ${row.note}` : ""}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                {active.id === "quali" ? (
                                  <>
                                    {[row.q1, row.q2, row.q3].map((time, index) => (
                                      <td
                                        key={index}
                                        className={
                                          time !== null && time === bestTime ? "session-best" : ""
                                        }
                                      >
                                        {formatLapTime(time ?? null)}
                                      </td>
                                    ))}
                                    <td className="muted">
                                      {row.gap === null || row.gap === 0
                                        ? "—"
                                        : `+${row.gap.toFixed(3)}`}
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="muted">{row.laps ?? "—"}</td>
                                    <td className={row.position === 1 ? "session-best" : ""}>
                                      {formatLapTime(row.time)}
                                    </td>
                                    <td className="muted">
                                      {row.gap === null || row.gap === 0
                                        ? "—"
                                        : `+${row.gap.toFixed(3)}`}
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="session-source">
                      <span>
                        {active.id === "quali"
                          ? t("Tempos Q1/Q2/Q3 · {source}", {
                              source: active.quali?.length ? "OpenF1" : "Jolpica-F1",
                            })
                          : t("Melhor volta de cada piloto · OpenF1")}
                      </span>
                      {partial && (
                        <span className="session-partial">
                          {t("A fonte publicou apenas {n} pilotos nesta sessão.", {
                            n: rows.length,
                          })}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
