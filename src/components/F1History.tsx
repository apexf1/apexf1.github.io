import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  Gauge,
  Trophy,
  UserRound,
} from "lucide-react";
import type { HistoryRace, HistoryRow } from "../lib/history";
import {
  historyDecades,
  historyManifest,
  historyStats,
  loadPeople,
  loadSeason,
  positionLabel,
  seasonInProgress,
  seasonsByYear,
} from "../lib/history";
import { formatDate } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { teamById } from "../lib/data";
import DriverDossier from "./DriverDossier";

const teamColor = (id: string): string => {
  const known = teamById.get(id)?.color;
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${hash} 58% 56%)`;
};

const dateLabel = (iso: string) => formatDate(`${iso}T12:00:00Z`);

export default function F1History() {
  const { t } = useI18n();
  const years = historyManifest.years;
  const last = years[years.length - 1]?.year ?? 2026;
  const [year, setYear] = useState(last);
  const [races, setRaces] = useState<HistoryRace[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [people, setPeople] = useState<Awaited<ReturnType<typeof loadPeople>> | null>(null);
  const [dossier, setDossier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeYear = useRef<HTMLButtonElement | null>(null);
  const railScroll = useRef<HTMLDivElement | null>(null);

  const summary = seasonsByYear.get(year);
  const champion = summary?.champion ?? null;
  const live = seasonInProgress(year);
  const championYears = useMemo(() => {
    if (!champion) return [];
    return years.filter((season) => season.champion?.id === champion.id).map((season) => season.year);
  }, [champion, years]);

  useEffect(() => {
    void loadPeople().then(setPeople).catch(() => setPeople(null));
  }, []);

  useEffect(() => {
    // centra o ano ativo dentro da barra, sem mexer no scroll da página
    const rail = railScroll.current;
    const button = activeYear.current;
    if (!rail || !button) return;
    const box = button.getBoundingClientRect();
    const frame = rail.getBoundingClientRect();
    if (rail.scrollWidth > rail.clientWidth) {
      rail.scrollLeft += box.left - frame.left - (frame.width - box.width) / 2;
    }
    if (rail.scrollHeight > rail.clientHeight) {
      rail.scrollTop += box.top - frame.top - (frame.height - box.height) / 2;
    }
  }, [year]);

  useEffect(() => {
    let alive = true;
    setRaces(null);
    setOpen(null);
    setError(null);    void loadSeason(year)
      .then((data) => {
        if (alive) setRaces(data);
      })
      .catch(() => {
        if (alive) setError(t("Não foi possível carregar esta temporada."));
      });
    return () => {
      alive = false;
    };
  }, [year]);

  const driverName = (id: string) => people?.drivers[id]?.[0] ?? id;
  const constructorName = (id: string) => people?.constructors[id]?.[0] ?? id;
  const canOpenDossier = (id: string) => Boolean(people?.drivers[id]);

  const step = (delta: number) => {
    const index = years.findIndex((season) => season.year === year);
    const next = years[Math.min(years.length - 1, Math.max(0, index + delta))];
    if (next) setYear(next.year);
  };

  const hasBio = (id: string) => canOpenDossier(id);

  return (
    <div className="history">
      <div className="standings-head">
        <div>
          <div className="micro micro-red">{t("Arquivo")}</div>
          <h1>
            F1
            <br />
            <span style={{ color: "var(--muted-2)" }}>History</span>
          </h1>
          <p>
            {t(
              "Todos os campeonatos mundiais desde {year}: classificação completa de cada corrida, campeões, equipes e voltas rápidas.",
              { year: historyStats.firstYear },
            )}
          </p>
        </div>
        <div className="history-head-tags">
          <span className="tag">
            <Flag size={11} /> {t("{n} temporadas", { n: historyStats.seasons })}
          </span>
          <span className="tag">
            <Gauge size={11} /> {t("{n} corridas", { n: historyStats.races })}
          </span>
          <span className="tag">
            <Trophy size={11} /> {t("{n} campeões", { n: historyStats.champions })}
          </span>
        </div>
      </div>

      <div className="history-layout">
        <aside className="panel history-rail" aria-label={t("Escolher temporada")}>
          <div className="history-rail-head">
            <span className="micro">{t("Temporadas")}</span>
            <div className="history-arrows">
              <button
                onClick={() => step(-1)}
                disabled={year === years[0]?.year}
                aria-label={t("Temporada anterior")}
              >
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => step(1)} disabled={year === last} aria-label={t("Temporada seguinte")}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="history-rail-scroll" ref={railScroll}>
            {historyDecades.map((decade) => (
              <div className="history-decade" key={decade}>
                <div className="history-decade-label">{decade}s</div>
                <div className="history-year-grid">
                  {years
                    .filter((season) => Math.floor(season.year / 10) * 10 === decade)
                    .map((season) => (
                      <button
                        key={season.year}
                        ref={season.year === year ? activeYear : undefined}
                        className={`history-year${season.year === year ? " is-active" : ""}${
                          season.year === last ? " is-current" : ""
                        }`}
                        onClick={() => setYear(season.year)}
                        aria-current={season.year === year ? "true" : undefined}
                        title={t("{year} · {status}", {
                          year: season.year,
                          status: season.champion
                            ? t(seasonInProgress(season.year) ? "líder {name}" : "campeão {name}", {
                                name: season.champion.name,
                              })
                            : t("sem campeão"),
                        })}
                      >
                        {String(season.year).slice(2)}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="history-main">
          <article className="panel season-hero" style={{ ["--team" as string]: champion ? teamColor(champion.team) : "#ff2d12" }}>
            <div className="season-hero-glow" aria-hidden="true" />
            <div className="season-hero-top">
              <div>
                <div className="micro micro-red">
                  {t(live ? "Líder do campeonato" : "Campeão mundial")} · {year}
                </div>
                {champion ? (
                  <button
                    className="season-champion"
                    onClick={() => hasBio(champion.id) && setDossier(champion.id)}
                    title={t("Ver ficha e histórico do piloto")}
                  >
                    {champion.name}
                  </button>
                ) : (
                  <h2 className="season-champion">—</h2>
                )}
                <div className="season-hero-meta">
                  {champion?.team && <span>{champion.team}</span>}
                  {champion && <span>{champion.points} pts</span>}
                  {champion && <span>{t("{n} vitórias", { n: champion.wins })}</span>}
                  {!live && championYears.length > 1 && (
                    <span className="tag tag-yellow">
                      {t("{n} títulos", { n: championYears.length })}
                    </span>
                  )}
                </div>
              </div>
              <div className="season-hero-actions">
                {champion && hasBio(champion.id) && (
                  <button className="btn" onClick={() => setDossier(champion.id)}>
                    {t("Ver carreira")}
                  </button>
                )}
              </div>
            </div>

            <div className="season-facts">
              <Fact
                icon={<CalendarDays size={13} />}
                label={t("Corridas")}
                value={summary?.races ?? 0}
              />
              <Fact
                icon={<UserRound size={13} />}
                label={t("Pilotos")}
                value={summary?.drivers ?? 0}
              />
              <Fact
                icon={<Trophy size={13} />}
                label={t(live ? "Equipe líder" : "Equipe campeã")}
                value={summary?.teamChampion?.name ?? "—"}
              />
              <Fact
                icon={<Flag size={13} />}
                label={t("Primeira corrida")}
                value={summary?.firstRace ? dateLabel(summary.firstRace) : "—"}
              />
              <Fact
                icon={<Flag size={13} />}
                label={t("Última corrida")}
                value={summary?.lastRace ? dateLabel(summary.lastRace) : "—"}
              />
            </div>
          </article>

          <div className="race-list-head">
            <h3>{t("Classificações de {year}", { year })}</h3>
            <span className="tag">{races?.length ?? summary?.races ?? 0} GPs</span>
          </div>

          {error && <div className="panel panel-pad note">{error}</div>}

          {!races && !error && (
            <div className="race-list">
              {[0, 1, 2].map((key) => (
                <div className="panel race-card" key={key}>
                  <div className="race-summary">
                    <div className="skeleton" style={{ height: 16, width: 160 }} />
                    <div className="skeleton" style={{ height: 12, width: 90, marginTop: 8 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="race-list">
            {races?.map((race) => {
              const winnerId = race.res.find((row) => row[0] === "1")?.[1];
              const winner = winnerId
                ? race.res.find((row) => row[0] === "1")
                : undefined;
              const expanded = open === race.r;
              return (
                <article className={`panel race-card${expanded ? " is-open" : ""}`} key={race.r}>
                  <button
                    className="race-summary"
                    onClick={() => setOpen(expanded ? null : race.r)}
                    aria-expanded={expanded}
                  >
                    <span className="race-round">R{race.r}</span>
                    <span className="race-name">
                      <strong>{race.n}</strong>
                      <span className="race-meta">
                        {race.c} · {race.l} · {dateLabel(race.d)}
                      </span>
                    </span>
                    <span className="race-podium">
                      {race.res
                        .filter((row) => ["1", "2", "3"].includes(row[0]))
                        .map((row) => (
                          <span
                            className="race-podium-item"
                            key={row[1]}
                            style={{ ["--team" as string]: teamColor(row[2]) }}
                          >
                            <i />
                            {driverName(row[1])}
                          </span>
                        ))}
                      {!winner && <span className="muted">{t("sem resultados")}</span>}
                    </span>
                    {race.fl?.time && (
                      <span className="race-fl" title={t("Volta mais rápida")}>
                        FL {race.fl.time}
                      </span>
                    )}
                    <ChevronDown size={16} className={`race-caret${expanded ? " is-open" : ""}`} />
                  </button>

                  {expanded && (
                    <div className="race-classification">
                      <div className="table-wrap">
                        <table className="standings-table history-table">
                          <thead>
                            <tr>
                              <th className="num">Pos.</th>
                              <th>{t("Piloto")}</th>
                              <th>{t("Equipe")}</th>
                              <th className="num">Grid</th>
                              <th className="num">{t("Voltas")}</th>
                              <th>{t("Tempo / estado")}</th>
                              <th className="num fl-col">{t("Volta mais rápida")}</th>
                              <th className="num">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {race.res.map((row: HistoryRow, index) => {
                              const podium = ["1", "2", "3"].includes(row[0]);
                              return (
                                <tr key={`${row[1]}-${index}`} className={row[0] === "1" ? "is-winner" : ""}>
                                  <td className="num" style={{ fontWeight: 800 }}>
                                    {positionLabel(row[0])}
                                  </td>
                                  <td>
                                    <button
                                      className="history-driver"
                                      onClick={() => hasBio(row[1]) && setDossier(row[1])}
                                      disabled={!hasBio(row[1])}
                                      style={{ ["--team" as string]: teamColor(row[2]) }}
                                    >
                                      <i />
                                      {driverName(row[1])}
                                      {race.fl?.driver === row[1] && <span className="fl-badge">FL</span>}
                                    </button>
                                  </td>
                                  <td className="muted">{constructorName(row[2])}</td>
                                  <td className="num muted">{row[3] || "—"}</td>
                                  <td className="num muted">{row[4]}</td>
                                  <td className={podium ? "" : "muted"}>{row[6]}</td>
                                  <td className="num muted fl-col">{row[7] ?? "—"}</td>
                                  <td className="num" style={{ fontWeight: row[5] ? 800 : 400 }}>
                                    {row[5] || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <p className="note history-source">
            {t(
              "Resultados oficiais do campeonato mundial (Jolpica-F1, sucessora da Ergast), de {first} a {last}. A classificação é a da corrida; a volta rápida aparece assinalada na linha do piloto que a fez.",
              { first: historyStats.firstYear, last: historyStats.lastYear },
            )}
          </p>
        </section>
      </div>

      {dossier && <DriverDossier driverId={dossier} onClose={() => setDossier(null)} />}
    </div>
  );
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="season-fact">
      <span className="season-fact-icon">{icon}</span>
      <div>
        <span className="micro">{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
