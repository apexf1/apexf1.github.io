import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  Flag,
  Info,
  MapPin,
  Mountain,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import type { Picks, SimSettings } from "../lib/storage";
import { useNow } from "../lib/storage";
import type { BacktestResult, RacePrediction } from "../lib/model";
import { getTitlePicture, predictRace, runBacktest } from "../lib/model";
import { usePrefs } from "../lib/prefs";
import { useI18n } from "../lib/i18n";
import {
  calendar,
  driverByCode,
  getUpcomingRace,
  resultsByRound,
  season,
  teamById,
  winnerOfRound,
} from "../lib/data";
import {
  countdownParts,
  formatDate,
  formatDateLong,
  formatTime,
  num,
  pct,
  raceLabel,
  weatherLabel,
} from "../lib/format";
import { downloadPredictionCard } from "../lib/shareCard";
import { getTrack } from "../lib/track3d";
import type { Driver } from "../types";
import { Avatar, SectionHead } from "./ui";
import { CircuitDNA } from "./charts";
import TrackMap3D from "./TrackMap3D";

interface Props {
  round: number;
  onSelectRound: (round: number) => void;
  settings: SimSettings;
  onSettings: (next: SimSettings) => void;
  picks: Picks;
  onPick: (round: number, code: string) => void;
  onGoLive: () => void;
}

const SIMS = 6000;

export default function RaceHub({
  round,
  onSelectRound,
  settings,
  onSettings,
  picks,
  onPick,
  onGoLive,
}: Props) {
  const { prefs } = usePrefs();
  const { t } = useI18n();
  const now = useNow(1000);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const chaos = useDeferredValue(settings.chaos);

  useEffect(() => {
    const id = window.setTimeout(() => setBacktest(runBacktest(400)), 450);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  const prediction = useMemo(
    () => predictRace({ round, weather: settings.weather, chaos, sims: SIMS }),
    [round, settings.weather, chaos],
  );
  const race = prediction.race;
  const track = useMemo(() => getTrack(race.circuitId), [race.circuitId]);
  const pick = picks[round];
  const pickDriver = pick ? driverByCode.get(pick) : undefined;
  const title = useMemo(() => getTitlePicture(), []);
  const upcoming = useMemo(() => getUpcomingRace(now), [now]);
  const countdown = countdownParts(race.startUTC, now);
  const nextRace = race.round === upcoming.round;
  const favorite = prediction.favorite;
  const label = raceLabel(race);
  const labelWords = label.split(" ");
  const labelFirst = labelWords.length > 1 ? labelWords.slice(0, -1).join(" ") : label;
  const labelLast = labelWords.length > 1 ? labelWords[labelWords.length - 1] : "";
  const projected = prediction.drivers
    .map((driver) => {
      const current = title.contenders.find((c) => c.code === driver.code)?.points ?? 0;
      return { ...driver, current, projected: current + driver.points };
    })
    .sort((a, b) => b.projected - a.projected)
    .slice(0, 6);
  const projectedLeader = projected[0]?.projected ?? 0;
  const podium = prediction.drivers.slice(0, 3);
  const tableDrivers = showAll ? prediction.drivers : prediction.drivers.slice(0, 10);
  const podiumCodes = prediction.podiumCombo.codes
    .map((code) => prediction.drivers.find((d) => d.code === code))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .sort((a, b) => b.win - a.win);

  const copyPick = async () => {
    const text = [
      t("🏁 Meu palpite para o GP {race}: {pick}", { race: label, pick: pick ?? favorite.code }),
      t("Pódio provável: {codes}", { codes: podium.map((d) => d.code).join(" · ") }),
      t("Modelo APEX · {n} simulações · {value} de chance de Safety Car", {
        n: num(SIMS),
        value: pct(prediction.safetyCar),
      }),
      t("Dados: Jolpica-F1 + OpenF1"),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setToast(t("Palpite copiado para a área de transferência"));
    } catch {
      setToast(t("Não foi possível copiar neste navegador"));
    }
  };

  const share = async () => {
    await downloadPredictionCard(prediction, pick);
    setToast(t("Card da previsão gerado"));
  };

  return (
    <div>
      <section className="hero">
        <article className="hero-race panel">
          <div>
            <div className="hero-top">
              <span className="hero-round">
                Round {race.round} / {calendar.length}
              </span>
              <span className="tag">
                {race.flag} {race.country}
              </span>
              {nextRace ? (
                <span className="tag tag-accent">{t("Próxima etapa")}</span>
              ) : (
                <span className="tag">{t("Etapa futura")}</span>
              )}
              <span className="tag">{weatherLabel(settings.weather)}</span>
            </div>
            <h1 className="hero-title">
              {labelFirst}{" "}
              {labelLast && <span>{labelLast}</span>}
            </h1>
            <div className="hero-sub">
              <MapPin className="icon" size={15} />
              <span>
                {race.circuitName} · {race.locality}
              </span>
              <span style={{ color: "var(--muted-2)" }}>|</span>
              <span>
                {formatDateLong(race.startUTC)} · {formatTime(race.startUTC)} {t("(Brasília)")}
              </span>
            </div>
          </div>

          <div className="hero-bottom">
            <div>
              <div className="micro" style={{ marginBottom: 8 }}>
                {t(countdown.diff > 0 ? "Largada em" : "Corrida iniciada")}
              </div>
              <div className="countdown" aria-label={t("Contagem regressiva para a largada")}>
                {[
                  { value: countdown.days, label: t("dias") },
                  { value: countdown.hours, label: t("horas") },
                  { value: countdown.minutes, label: t("min") },
                  { value: countdown.seconds, label: t("seg") },
                ].map((item) => (
                  <div className="cd-box" key={item.label}>
                    <div className="cd-value">{String(item.value).padStart(2, "0")}</div>
                    <div className="cd-label">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <strong>{race.laps}</strong>
                <span>{t("voltas")}</span>
              </div>
              <div className="hero-stat">
                <strong>{race.lengthKm.toFixed(3)}</strong>
                <span>{t("km por volta")}</span>
              </div>
              <div className="hero-stat">
                <strong>{race.drsZones}</strong>
                <span>{t("zonas de DRS")}</span>
              </div>
              <div className="hero-stat">
                <strong>{formatTime(race.startUTC)}</strong>
                <span>{t("largada BRT")}</span>
              </div>
            </div>
          </div>
        </article>

        <article
          className="prediction-hero panel"
          style={{ ["--fav" as string]: favorite.teamColor }}
        >
          <div className="ph-head">
            <span className="micro micro-red">{t("Projeção de vitória")}</span>
            <span className="tag tag-green">
              <Sparkles size={11} /> {t("{n} sims", { n: num(SIMS) })}
            </span>
          </div>

          <div className="ph-favorite">
            <Avatar
              driver={driverByCode.get(favorite.code) as Driver}
              size="lg"
              color={favorite.teamColor}
            />
            <div>
              <div className="ph-name">{favorite.name}</div>
              <div className="ph-team">
                <span className="team-dot" style={{ ["--team" as string]: favorite.teamColor }} />{" "}
                {favorite.teamName}
              </div>
            </div>
            <div className="ph-prob">
              <strong>{pct(favorite.win)}</strong>
              <span>{t("chance de vitória")}</span>
            </div>
          </div>

          <div className="mini-head">
            <span>Top 3</span>
            <span>{t("chance de pódio")}</span>
          </div>
          <div className="podium-mini">
            {podium.map((driver, i) => (
              <div className="podium-mini-row" key={driver.code}>
                <span className="podium-mini-pos">{i + 1}</span>
                <div className="podium-mini-driver">
                  <span
                    className="team-dot"
                    style={{ ["--team" as string]: driver.teamColor }}
                  />
                  <strong>{driver.code}</strong>
                  <span>{driver.teamName}</span>
                </div>
                <span className="podium-mini-prob">{pct(driver.podium)}</span>
              </div>
            ))}
          </div>

          <div className="ph-stats">
            <div>
              <span>{t("Risco de DNF")}</span>
              <strong>{pct(favorite.dnf)}</strong>
            </div>
            <div>
              <span>{t("Grid médio")}</span>
              <strong>{favorite.avgGrid.toFixed(1)}</strong>
            </div>
            <div>
              <span>{t("Pts esperados")}</span>
              <strong>{favorite.points.toFixed(1)}</strong>
            </div>
          </div>

          <div className="ph-footer">
            <div className="ph-note">
              {t("Pódio mais provável:")}{" "}
              <b>{podiumCodes.map((d) => d.code).join(" · ")}</b>
              <br />
              {backtest
                ? t("Backtest: acertou {hits}/{races} vencedores", {
                    hits: backtest.hits,
                    races: backtest.races,
                  })
                : t("Rodando backtest do modelo…")}
            </div>
            <a className="btn btn-primary" href="#simulador">
              {t("Simular")} <ChevronRight className="icon" />
            </a>
          </div>
        </article>
      </section>

      <div className="ticker">
        <div className="ticker-item">
          <Activity size={14} className="icon" style={{ color: "var(--accent-2)" }} />
          {t("Líder do campeonato")} <b>{title.leader.name}</b>
        </div>
        <div className="ticker-item">
          <Timer size={14} className="icon" />{" "}
          <b>
            {t("Restam {races} etapas · {points} pts", {
              races: title.remainingRaces,
              points: title.maxRemainingPerDriver,
            })}
          </b>
        </div>
        <div className="ticker-item">
          <Zap size={14} className="icon" /> {t("Imprevisibilidade")}{" "}
          <b>{prediction.unpredictability}/100</b>
        </div>
        <div className="ticker-item">
          <Flag size={14} className="icon" /> Safety Car <b>{pct(prediction.safetyCar)}</b>
        </div>
        <div className="ticker-item">
          <Info size={14} className="icon" /> {t("Dados")} <b>{formatDate(season.updatedAt)}</b>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <div className="micro">{t("Calendário 2026")}</div>
            <h2>{t("Escolha a etapa")}</h2>
          </div>
          <span className="tag">
            {t("{through} de {total} concluídas", {
              through: season.throughRound,
              total: calendar.length,
            })}
          </span>
        </div>
        <div className="calendar-strip">
          {calendar.map((item) => {
            const done = resultsByRound.has(item.round);
            const winner = winnerOfRound(item.round);
            const winnerDriver = winner ? driverByCode.get(winner) : undefined;
            const winnerTeam = winnerDriver ? teamById.get(winnerDriver.teamId) : undefined;
            return (
              <button
                key={item.round}
                className={`cal-card${resultActive(item.round, round) ? " is-selected" : ""}${
                  item.round === upcoming.round && !done ? " is-next" : ""
                }${done ? " is-past" : ""}`}
                onClick={() => !done && onSelectRound(item.round)}
                disabled={done}
                title={t(done ? "Etapa concluída" : "Prever {race}", { race: item.shortName })}
              >
                <div className="cal-round">
                  <span>R{item.round}</span>
                  <span>{item.flag}</span>
                </div>
                <div className="cal-name">{raceLabel(item)}</div>
                <div className="cal-meta">
                  {done ? t("Concluída") : formatDate(item.startUTC)} ·{" "}
                  {t(done ? "resultado final" : "previsão")}
                </div>
                {winnerTeam ? (
                  <div className="cal-winner">
                    <span
                      className="team-dot"
                      style={{ ["--team" as string]: winnerTeam.color }}
                    />
                    {t("{code} venceu", { code: winner })}
                  </div>
                ) : (
                  <div className="cal-winner" style={{ color: "var(--muted)" }}>
                    {t(item.round === upcoming.round ? "Próxima largada" : "A simular")}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="section">
        <SectionHead
          eyebrow={t("Pista real · 3D")}
          title={t("O traçado, sem simplificação")}
          description={t(
            "Geometria e relevo extraídos da telemetria oficial da OpenF1, com a linha de chegada no lugar certo. Gire, incline e aproxime para reconhecer cada curva antes da largada.",
          )}
          action={
            <span className="tag tag-purple">
              <Mountain size={11} /> {t("telemetria {year}", { year: track?.year ?? 2026 })}
            </span>
          }
        />
        <div className="track-preview">
          <article className="panel">
            {track ? (
              <TrackMap3D geo={track} compact theme={prefs.theme} />
            ) : (
              <div className="map-missing">{t("Traçado 3D indisponível para esta etapa.")}</div>
            )}
          </article>
          <aside className="track-facts">
            <div className="track-fact">
              <span>{t("Comprimento real")}</span>
              <strong>{track ? `${(track.lengthM / 1000).toFixed(3)} km` : "—"}</strong>
            </div>
            <div className="track-fact">
              <span>{t("Relevo")}</span>
              <strong>{track ? `${Math.round(track.elevationM)} m` : "—"}</strong>
            </div>
            <div className="track-fact">
              <span>{t("Voltas")}</span>
              <strong>{race.laps}</strong>
            </div>
            <div className="track-fact">
              <span>{t("Zonas de DRS")}</span>
              <strong>{race.drsZones}</strong>
            </div>
            <div className="track-fact">
              <span>{t("Geometria")}</span>
              <strong>{track ? `${track.points.length} pts` : "—"}</strong>
            </div>
            <p className="note" style={{ margin: "4px 0 0" }}>
              {t(
                "A malha vem de uma volta real gravada no circuito, com posição e altitude do carro. Nada de desenho à mão.",
              )}
            </p>
            <button className="btn btn-block" onClick={onGoLive}>
              {t("Ver os carros no mapa")} <ArrowUpRight className="icon" />
            </button>
          </aside>
        </div>
      </section>

      <section className="section" id="simulador">
        <SectionHead
          eyebrow={t("Monte Carlo · modelo transparente")}
          title={t("Simulador de corrida")}
          description={t(
            "Ajuste o clima e o nível de caos. O modelo recalcula a classificação e a corrida milhares de vezes, considerando ritmo do carro, forma, pista, pneus e confiabilidade.",
          )}
          action={
            <span className="tag tag-accent">
              <Activity size={11} /> {t("{n} simulações", { n: num(SIMS) })}
            </span>
          }
        />

        <div className="controls">
          <div className="control-group">
            <span className="control-label">{t("Clima")}</span>
            <div className="segmented" role="group" aria-label={t("Condição climática")}>
              {(["dry", "mixed", "wet"] as const).map((w) => (
                <button
                  key={w}
                  className={settings.weather === w ? "is-active" : ""}
                  onClick={() => onSettings({ ...settings, weather: w })}
                >
                  {weatherLabel(w)}
                </button>
              ))}
            </div>
          </div>
          <div className="control-group">
            <span className="control-label">{t("Caos da corrida")}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.chaos}
              onChange={(event) =>
                onSettings({ ...settings, chaos: Number(event.target.value) })
              }
              className="range"
              style={{ ["--fill" as string]: `${settings.chaos}%` }}
              aria-label={t("Nível de caos")}
            />
            <span className="chaos-value">{settings.chaos}</span>
          </div>
          <div className="control-group">
            <span className="control-label">Grid</span>
            <span className="tag">{t("Automático")}</span>
          </div>
          <div className="control-group">
            <span className="control-label">{t("Modelo")}</span>
            <span className="tag">{t("v1.4 · calibrado")}</span>
          </div>
        </div>

        <div className="sim-grid">
          <div className="sim-side">
            <article className="panel podium-card">
              <div className="micro">{t("Pódio mais provável")}</div>
              <div className="podium-stage">
                {[1, 0, 2].map((index) => {
                  const driver = podium[index];
                  const driverInfo = driverByCode.get(driver.code);
                  if (!driverInfo) return null;
                  return (
                    <div
                      key={driver.code}
                      className={`podium-step p${index + 1}`}
                      style={{ ["--team" as string]: driver.teamColor }}
                    >
                      <div className="podium-driver">
                        <Avatar
                          driver={driverInfo}
                          color={driver.teamColor}
                          size={index === 0 ? "lg" : "md"}
                        />
                        <span className="podium-code">{driver.code}</span>
                        <span className="podium-name">{driver.name}</span>
                        <span className="podium-pct">{pct(driver.win, 1)}</span>
                      </div>
                      <div className="podium-block">{index + 1}</div>
                    </div>
                  );
                })}
              </div>                <div className="podium-meta">
                  <span>
                    {t("Pódio combinado: {value}", {
                      value: pct(prediction.podiumCombo.probability, 1),
                    })}
                  </span>
                  <span className="tag">
                    {t("Margem +{value} p.p.", {
                      value: Math.round((favorite.win - prediction.second.win) * 100),
                    })}
                  </span>
                </div>
              <div className="divider" />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-block" onClick={share}>
                  <Download className="icon" /> {t("Baixar card")}
                </button>
                <button className="btn btn-ghost" onClick={copyPick} title={t("Copiar palpite")}>
                  <Copy className="icon" />
                </button>
              </div>
            </article>

            <article className="panel panel-pad">
              <div className="micro">{t("Como o modelo pensa")}</div>
              <h3 style={{ margin: "6px 0 0", fontSize: 19, fontWeight: 900 }}>
                {t("Por que {code}?", { code: favorite.code })}
              </h3>
              <p className="note" style={{ marginTop: 6 }}>
                {t("Força relativa de {name} em cada dimensão do grid (0–100).", {
                  name: favorite.name,
                })}
              </p>
              <Factors prediction={prediction} code={favorite.code} />
              <ul className="method">
                <li>
                  <b>{t("Ritmo do carro:")}</b>
                  {t(" pontos por etapa da equipe, forma recente e prior de 2025.")}
                </li>
                <li>
                  <b>{t("Piloto:")}</b>
                  {t(" delta de classificação e corrida contra o companheiro de equipe.")}
                </li>
                <li>
                  <b>{t("Pista:")}</b>
                  {t(" afinidade com circuitos de perfil parecido no calendário.")}
                </li>
                <li>
                  <b>{t("Caos:")}</b>
                  {t(" abandonos, Safety Car e ruído crescem com o controle acima.")}
                </li>
              </ul>
              <p className="note" style={{ marginTop: 10 }}>
                {t(
                  "Projeção estatística, não certeza. O modelo não usa ordens de equipe, clima real ou informação privilegiada.",
                )}
              </p>
            </article>
          </div>

          <div>
            <article className="panel">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--line)",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div className="micro">{t("Probabilidades por piloto")}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>
                    {t("{race} · largada simulada", { race: label })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {pickDriver && (
                    <span className="tag tag-yellow">
                      <Check size={11} /> {t("Seu palpite: {code}", { code: pickDriver.code })}
                    </span>
                  )}
                  <button className="btn btn-ghost" onClick={() => setShowAll((v) => !v)}>
                    {t(showAll ? "Ver top 10" : "Ver os 22")}
                  </button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="prob-table">
                  <thead>
                    <tr>
                      <th style={{ width: 26 }}>#</th>
                      <th>{t("Piloto")}</th>
                      <th>{t("Vitória")}</th>
                      <th>{t("Pódio")}</th>
                      <th>Grid</th>
                      <th>{t("Pts esp.")}</th>
                      <th>DNF</th>
                      <th aria-label={t("Palpite")} />
                    </tr>
                  </thead>
                  <tbody>
                    {tableDrivers.map((driver, index) => {
                      const info = driverByCode.get(driver.code);
                      if (!info) return null;
                      const isPicked = pick === driver.code;
                      return (
                        <tr
                          key={driver.code}
                          className={`${isPicked ? "is-picked" : ""}${
                            driver.code === favorite.code ? " is-favorite" : ""
                          }`}
                        >
                          <td>
                            <span className="table-pos">{index + 1}</span>
                          </td>
                          <td>
                            <div className="table-driver">
                              <span
                                className="team-bar"
                                style={{ ["--team" as string]: driver.teamColor }}
                              />
                              <Avatar
                                driver={info}
                                color={driver.teamColor}
                                size="sm"
                              />
                              <div className="table-driver-name">
                                <strong>{driver.name}</strong>
                                <span>
                                  {driver.teamName} · #{driver.number}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="win-cell">
                              <div className="win-bar">
                                <span
                                  style={{
                                    width: `${Math.min(100, driver.win * 160)}%`,
                                    ["--team" as string]: driver.teamColor,
                                  }}
                                />
                              </div>
                              <span className="win-value">{pct(driver.win, 1)}</span>
                            </div>
                          </td>
                          <td>{pct(driver.podium, 0)}</td>
                          <td className="muted">{driver.avgGrid.toFixed(1)}</td>
                          <td>{driver.points.toFixed(1)}</td>
                          <td className="muted">{pct(driver.dnf)}</td>
                          <td>
                            <button
                              className={`pick-btn${isPicked ? " is-picked" : ""}`}
                              onClick={() => onPick(round, driver.code)}
                              aria-label={t("Escolher {name} como meu palpite", { name: driver.name })}
                            >
                              {t(isPicked ? "Meu" : "Palpite")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>

            <div className="insight-row">
              <div className="insight">
                <span>{t("Pódio mais provável")}</span>
                <strong>{podiumCodes.map((d) => d.code).join(" · ")}</strong>
              </div>
              <div className="insight">
                <span>Safety Car</span>
                <strong>{pct(prediction.safetyCar)}</strong>
              </div>
              <div className="insight">
                <span>{t("Zebra do modelo")}</span>
                <strong>
                  {prediction.drivers
                    .slice(3, 12)
                    .sort((a, b) => b.podium - a.podium)
                    .filter((d) => d.podium > 0.1)
                    .slice(0, 1)
                    .map((d) => t("{code} no pódio ({value})", { code: d.code, value: pct(d.podium) }))[0] ??
                  t("Nenhuma óbvia")}
                </strong>
              </div>
            </div>

            {pickDriver && (
              <div
                className="panel"
                style={{
                  marginTop: 12,
                  padding: "13px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  borderColor: "rgba(255,210,63,0.28)",
                }}
              >
                <span className="tag tag-yellow">
                  <Check size={11} /> {t("Seu palpite")}
                </span>
                <strong style={{ fontSize: 14 }}>{pickDriver.name}</strong>
                <span className="note">
                  {pick === favorite.code
                    ? t("Você está com o favorito do modelo.")
                    : t("O modelo dá {value} para {code}. Zebra?", {
                        code: pickDriver.code,
                        value: pct(
                          prediction.drivers.find((d) => d.code === pick)?.win ?? 0,
                          1,
                        ),
                      })}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ marginLeft: "auto" }}
                  onClick={onGoLive}
                >
                  {t("Ver corrida")} <ArrowUpRight className="icon" />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="two-col">
          <article className="panel panel-pad">
            <div className="micro">{t("Matemática do título")}</div>
            <h3 style={{ margin: "5px 0 0", fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              {t("{n} pilotos ainda vivos", { n: title.aliveCount })}
            </h3>
            <p className="note" style={{ marginTop: 7 }}>
              {t(
                "{races} etapas restantes · até {points} pontos em jogo. Quem não alcança os {leader} pts do líder está fora.",
                {
                  races: title.remainingRaces,
                  points: title.maxRemainingPerDriver,
                  leader: title.leader.points,
                },
              )}
            </p>
            <div className="title-list">
              {title.contenders.slice(0, 7).map((contender) => {
                const info = driverByCode.get(contender.code);
                return (
                  <div
                    key={contender.code}
                    className={`title-row${contender.alive ? "" : " is-out"}`}
                  >
                    <span
                      className="team-bar"
                      style={{ ["--team" as string]: contender.color }}
                    />
                    <div>
                      <strong>{info?.code}</strong>{" "}
                      <span className="muted" style={{ fontSize: 11 }}>
                        {info?.lastName}
                      </span>
                    </div>
                    <span className="gap">
                      {contender.gap === 0 ? t("LÍDER") : `−${contender.gap} pts`}
                    </span>
                    <span className="prob">{num(contender.points)}</span>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel panel-pad">
            <div className="micro">{t("Projeção pós-corrida")}</div>
            <h3 style={{ margin: "5px 0 0", fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              {t("Como fica a tabela após {race}?", { race: label })}
            </h3>
            <p className="note" style={{ marginTop: 7 }}>
              {t(
                "Pontos atuais + pontos esperados na etapa simulada. O modelo aponta o cenário mais provável, não o resultado garantido.",
              )}
            </p>
            <div className="title-list">
              {projected.map((entry) => {
                return (
                  <div className="title-row" key={entry.code}>
                    <span
                      className="team-bar"
                      style={{ ["--team" as string]: entry.teamColor }}
                    />
                    <div>
                      <strong>{entry.code}</strong>{" "}
                      <span className="muted" style={{ fontSize: 11 }}>
                        +{entry.points.toFixed(1)} pts
                      </span>
                    </div>
                    <span className="gap">
                      {entry.projected === projectedLeader
                        ? t("LÍDER")
                        : `−${(projectedLeader - entry.projected).toFixed(0)}`}
                    </span>
                    <span className="prob">{num(entry.projected, 0)}</span>
                  </div>
                );
              })}
            </div>
            <div className="divider" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {backtest && (
                <>
                  <span className="tag tag-green">
                    Backtest {backtest.hits}/{backtest.races}
                  </span>
                  <span className="tag">
                    {t("Top 3 em {hits}/{races}", {
                      hits: backtest.top3Hits,
                      races: backtest.races,
                    })}
                  </span>
                  <span className="tag">
                    {t("Baseline {hits}/{races}", {
                      hits: backtest.baselineHits,
                      races: backtest.races,
                    })}
                  </span>
                </>
              )}
            </div>
          </article>
        </div>
      </section>

      {race.brief && (
        <section className="section">
          <SectionHead
            eyebrow={t("Guia de transmissão")}
            title={t("O que assistir")}
            description={t(
              "Contexto para acompanhar cada setor, a estratégia e as histórias que a transmissão pode não contar.",
            )}
          />
          <div className="brief-grid">
            <article className="panel brief-card">
              <div className="micro micro-red">{t("DNA da pista")}</div>
              <h3 className="brief-headline">{race.brief.headline}</h3>
              <div className="brief-items">
                <div className="brief-item">
                  <h4>
                    <MapPin size={12} /> {t("Setores")}
                  </h4>
                  <p>{race.brief.sectors}</p>
                </div>
                <div className="brief-item">
                  <h4>
                    <ArrowUpRight size={12} /> {t("Ultrapassagem")}
                  </h4>
                  <p>{race.brief.overtake}</p>
                </div>
                <div className="brief-item">
                  <h4>
                    <Timer size={12} /> {t("Estratégia")}
                  </h4>
                  <p>{race.brief.strategy}</p>
                </div>
                <div className="brief-item">
                  <h4>
                    <Sparkles size={12} /> {t("Histórias")}
                  </h4>
                  <p>{race.brief.watch}</p>
                </div>
              </div>
              <div className="divider" />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="tag">{t("{n} voltas", { n: race.laps })}</span>
                <span className="tag">{race.lengthKm.toFixed(3)} km</span>
                <span className="tag">{race.drsZones} DRS</span>
                <span className="tag">
                  {t("Início {time}", { time: formatTime(race.startUTC) })}
                </span>
              </div>
            </article>
            <article className="panel dna-card">
              <div className="micro" style={{ alignSelf: "flex-start" }}>
                {t("Perfil do circuito")}
              </div>
              <h3>{t("DNA de {race}", { race: label })}</h3>
              <CircuitDNA profile={race.profile} />
              <div className="dna-legend">
                <span>
                  {t("Potência")} <b>{Math.round(race.profile.power * 100)}</b>
                </span>
                <span>
                  {t("Carga aero")} <b>{Math.round(race.profile.downforce * 100)}</b>
                </span>
                <span>
                  {t("Pneus")} <b>{Math.round(race.profile.tyre * 100)}</b>
                </span>
                <span>
                  {t("Ultrapassagem")} <b>{Math.round(race.profile.overtaking * 100)}</b>
                </span>
                <span>
                  {t("Rua")} <b>{Math.round(race.profile.street * 100)}</b>
                </span>
                <span>
                  {t("Caos")} <b>{Math.round(race.profile.chaos * 100)}</b>
                </span>
              </div>
            </article>
          </div>
        </section>
      )}

      <section className="section">
        <div className="panel panel-pad" style={{ display: "grid", gap: 10 }}>
          <div className="micro">{t("Transparência")}</div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>
            {t("Backtest etapa por etapa")}
          </h3>
          <p className="note" style={{ maxWidth: 760, margin: 0 }}>
            {t(
              "Para cada GP já disputado, o modelo roda apenas com os dados disponíveis antes da largada. O favorito do modelo acertou {hits} de {races} vencedores; o líder do campeonato acertaria {baseline}. O objetivo é bater a intuição, não prever o futuro com certeza.",
              {
                hits: backtest?.hits ?? "–",
                races: backtest?.races ?? "–",
                baseline: backtest?.baselineHits ?? "–",
              },
            )}
          </p>
          {backtest && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {backtest.rows.slice(-8).map((row) => (
                <span
                  key={row.round}
                  className={`tag ${row.hit ? "tag-green" : ""}`}
                  title={t("{name}: modelo {model}, vencedor {winner}", {
                    name: row.name,
                    model: row.favorite,
                    winner: row.actualWinner,
                  })}
                >
                  R{row.round} {row.hit ? "✓" : "×"} {row.actualWinner}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const resultActive = (round: number, selected: number) => round === selected;

function Factors({ prediction, code }: { prediction: RacePrediction; code: string }) {
  const { t } = useI18n();
  const driver = prediction.drivers.find((d) => d.code === code);
  if (!driver) return null;
  const keys = [
    { key: "car", label: "Carro" },
    { key: "quali", label: "Qualificação" },
    { key: "race", label: "Ritmo de corrida" },
    { key: "track", label: "Afinidade com a pista" },
    { key: "reliability", label: "Confiabilidade" },
    { key: "tyres", label: "Gestão de pneus" },
  ] as const;

  return (
    <div className="factors">
      {keys.map(({ key, label }) => {
        const values = prediction.drivers.map((d) => d.factors[key]);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const score = max - min < 1e-9 ? 50 : ((driver.factors[key] - min) / (max - min)) * 100;
        return (
          <div className="factor" key={key}>
            <span>{t(label)}</span>
            <div className="factor-bar">
              <span style={{ width: `${Math.max(3, score)}%` }} />
            </div>
            <b>{Math.round(score)}</b>
          </div>
        );
      })}
    </div>
  );
}
