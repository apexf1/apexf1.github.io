import { useMemo, useState } from "react";
import { Crown, Medal, Trophy, Zap } from "lucide-react";
import {
  activeDrivers,
  calendar,
  driverByCode,
  drivers,
  season,
  teamById,
  teams,
} from "../lib/data";
import { formatDate, num } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { ChampionshipChart } from "./charts";
import { FormChips, SectionHead } from "./ui";

type Mode = "drivers" | "teams";

export default function Standings({ onCompareDriver }: { onCompareDriver: (code: string) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("drivers");
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(season.drivers.slice(0, 6).map((d) => d.code)),
  );

  const latestHistory = season.standingsHistory.at(-1);
  const previousHistory = season.standingsHistory.at(-2);

  const pointsByCode = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const history of season.standingsHistory) {
      for (const entry of history.drivers) {
        if (!map[entry.code]) map[entry.code] = [];
        map[entry.code].push(entry.points);
      }
    }
    return map;
  }, []);

  const series = useMemo(() => {
    const used = new Set<string>();
    const extras = ["#ffd23f", "#b06bff", "#8ad1ff", "#9be15d", "#ff9e80"];
    return [...season.drivers]
      .sort((a, b) => b.points - a.points)
      .slice(0, 6)
      .map((d) => {
        const teamColor = teamById.get(d.teamId)?.color ?? "#777";
        let color = teamColor;
        if (used.has(color)) {
          color = extras.find((c) => !used.has(c)) ?? "#f5f7fa";
        }
        used.add(color);
        return { code: d.code, color };
      });
  }, []);

  const recent = useMemo(() => {
    const map = new Map<
      string,
      { position: number; points: number; finished: boolean; round: number; race: string }[]
    >();
    for (const round of season.results) {
      const race = calendar.find((r) => r.round === round.round);
      for (const result of round.results) {
        if (!map.has(result.code)) map.set(result.code, []);
        map.get(result.code)?.push({
          position: result.position,
          points: result.points,
          finished: result.finished,
          round: round.round,
          race: race?.shortName ?? "",
        });
      }
    }
    return map;
  }, []);

  const sortedDrivers = [...drivers].sort((a, b) => a.position - b.position);
  const leader = sortedDrivers[0];
  const sortedTeams = [...teams].sort((a, b) => a.position - b.position);
  const teamLeader = sortedTeams[0];

  const positionDelta = (code: string) => {
    const now = latestHistory?.drivers.find((d) => d.code === code)?.position;
    const before = previousHistory?.drivers.find((d) => d.code === code)?.position;
    if (!now || !before) return 0;
    return before - now;
  };

  const seasonStats = useMemo(() => {
    const mostWins = [...drivers].sort((a, b) => b.wins - a.wins)[0];
    const mostPodiums = [...drivers].sort((a, b) => b.podiums - a.podiums)[0];
    const mostPoles = [...drivers].sort((a, b) => b.poles - a.poles)[0];
    const reliable = [...activeDrivers]
      .filter((d) => d.starts >= 10)
      .sort((a, b) => a.dnfs / a.starts - b.dnfs / b.starts)[0];
    return { mostWins, mostPodiums, mostPoles, reliable };
  }, []);

  return (
    <div>
      <div className="standings-head">
        <div>
          <div className="micro micro-red">{t("Temporada {season}", { season: season.season })}</div>
          <h1>
            {t("Classificação")}
            <br />
            <span style={{ color: "var(--muted-2)" }}>{t("do campeonato")}</span>
          </h1>
          <p>
            {t(
              "{through} de {total} etapas · atualizado em {date} · pontos oficiais com sprints",
              {
                through: season.throughRound,
                total: calendar.length,
                date: formatDate(season.updatedAt),
              },
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="tag tag-accent">
            <Crown size={11} />{" "}
            {t("Líder: {code} · {points} pts", {
              code: leader?.code ?? "—",
              points: num(leader?.points ?? 0),
            })}
          </span>
          <div className="segmented">
            <button className={mode === "drivers" ? "is-active" : ""} onClick={() => setMode("drivers")}>
              {t("Pilotos")}
            </button>
            <button className={mode === "teams" ? "is-active" : ""} onClick={() => setMode("teams")}>
              {t("Equipes")}
            </button>
          </div>
        </div>
      </div>

      <div className="insight-row" style={{ marginBottom: 16 }}>
        <div className="insight">
          <span>
            <Trophy size={9} /> {t("Mais vitórias")}
          </span>
          <strong>
            {seasonStats.mostWins?.code} · {seasonStats.mostWins?.wins}
          </strong>
        </div>
        <div className="insight">
          <span>
            <Medal size={9} /> {t("Mais pódios")}
          </span>
          <strong>
            {seasonStats.mostPodiums?.code} · {seasonStats.mostPodiums?.podiums}
          </strong>
        </div>
        <div className="insight">
          <span>
            <Zap size={9} /> {t("Confiabilidade")}
          </span>
          <strong>
            {t("{code} · {value} de chegada", {
              code: seasonStats.reliable?.code ?? "—",
              value: pctReliability(seasonStats.reliable),
            })}
          </strong>
        </div>
      </div>

      <div className="panel table-card">
        {mode === "drivers" ? (
          <div className="table-scroll">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>{t("Piloto")}</th>
                  <th>{t("Vitórias")}</th>
                  <th>{t("Pódios")}</th>
                  <th>DNFs</th>
                  <th>{t("Forma (últimas 5)")}</th>
                  <th>{t("Pontos")}</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {sortedDrivers.map((driver) => {
                  const team = teamById.get(driver.teamId);
                  const delta = positionDelta(driver.code);
                  return (
                    <tr
                      key={driver.code}
                      className={driver.code === leader?.code ? "is-leader" : ""}
                      onClick={() => onCompareDriver(driver.code)}
                      style={{ cursor: "pointer" }}
                      title={t("Comparar {name}", { name: driver.name })}
                    >
                      <td>
                        <span className="stand-pos">
                          {driver.position}
                          {delta !== 0 && (
                            <span className={`stand-delta ${delta > 0 ? "up" : "down"}`}>
                              {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="table-driver">
                          <span
                            className="team-bar"
                            style={{ ["--team" as string]: team?.color ?? "#777" }}
                          />
                          <span
                            className="avatar"
                            style={{ ["--team" as string]: team?.color ?? "#777" }}
                          >
                            {driver.code}
                          </span>
                          <div className="table-driver-name">
                            <strong>{driver.name}</strong>
                            <span>{team?.name}</span>
                          </div>
                        </div>
                      </td>
                      <td>{driver.wins}</td>
                      <td>{driver.podiums}</td>
                      <td className="muted">{driver.dnfs}</td>
                      <td>
                        <FormChips results={recent.get(driver.code) ?? []} />
                      </td>
                      <td>
                        <div className="points-bar">
                          <div className="points-bar-track">
                            <span
                              style={{
                                width: `${((driver.points ?? 0) / Math.max(leader?.points ?? 1, 1)) * 100}%`,
                                ["--team" as string]: team?.color ?? "#777",
                              }}
                            />
                          </div>
                          <strong>{num(driver.points)}</strong>
                        </div>
                      </td>
                      <td className="muted">
                        {driver.position === 1 ? "—" : `−${num((leader?.points ?? 0) - driver.points)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>{t("Equipe")}</th>
                  <th>{t("Pilotos")}</th>
                  <th>{t("Vitórias")}</th>
                  <th>{t("Pontos")}</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {[...teams]
                  .sort((a, b) => a.position - b.position)
                  .map((team) => {
                    const lineup = activeDrivers
                      .filter((d) => d.teamId === team.id)
                      .sort((a, b) => b.points - a.points);
                    return (
                      <tr key={team.id} className={team.id === teamLeader?.id ? "is-leader" : ""}>
                        <td>
                          <span className="stand-pos">{team.position}</span>
                        </td>
                        <td>
                          <div className="table-driver">
                            <span
                              className="team-bar"
                              style={{ ["--team" as string]: team.color, height: 28 }}
                            />
                            <div className="table-driver-name">
                              <strong>{team.name}</strong>
                              <span>{team.short}</span>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: "left" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {lineup.map((d) => (
                              <span className="tag" key={d.code}>
                                {d.code}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>{team.wins}</td>
                        <td>
                          <div className="points-bar">
                            <div className="points-bar-track">
                              <span
                                style={{
                                  width: `${(team.points / Math.max(teamLeader?.points ?? 1, 1)) * 100}%`,
                                  ["--team" as string]: team.color,
                                }}
                              />
                            </div>
                            <strong>{num(team.points)}</strong>
                          </div>
                        </td>
                        <td className="muted">
                          {team.position === 1 ? "—" : `−${num((teamLeader?.points ?? 0) - team.points)}`}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <section className="section">
        <SectionHead
          eyebrow={t("Evolução")}
          title={t("A temporada, volta a volta")}
          description={t(
            "Pontos acumulados dos líderes ao fim de cada etapa. Clique na legenda para comparar.",
          )}
        />
        <article className="panel chart-card">
          <ChampionshipChart
            points={pointsByCode}
            rounds={season.standingsHistory.length}
            series={series}
            visible={visible}
          />
          <div className="chart-legend">
            {series.map((s) => {
              const driver = driverByCode.get(s.code);
              return (
                <button
                  key={s.code}
                  className={`legend-btn${visible.has(s.code) ? " is-on" : ""}`}
                  onClick={() =>
                    setVisible((current) => {
                      const next = new Set(current);
                      if (next.has(s.code)) next.delete(s.code);
                      else next.add(s.code);
                      return next;
                    })
                  }
                >
                  <i style={{ ["--team" as string]: s.color }} />
                  {s.code} · {driver?.lastName}
                </button>
              );
            })}
          </div>
        </article>
      </section>

      <section className="section">
        <div className="two-col">
          <article className="panel panel-pad">
            <div className="micro">{t("Balanço")}</div>
            <h3 style={{ margin: "5px 0 10px", fontSize: 21, fontWeight: 900 }}>
              {t("O que a tabela diz")}
            </h3>
            <p className="note" style={{ margin: 0 }}>
              {t(
                "{name} lidera com {wins} vitórias em {rounds} etapas. {team} soma {points} pontos e abre {gap} de vantagem no Mundial de Construtores.",
                {
                  name: seasonStats.mostWins?.name ?? "",
                  wins: seasonStats.mostWins?.wins ?? 0,
                  rounds: season.throughRound,
                  team: teamLeader?.name ?? "",
                  points: num(teamLeader?.points ?? 0),
                  gap: num((teamLeader?.points ?? 0) - (sortedTeams[1]?.points ?? 0)),
                },
              )}
            </p>
          </article>
          <article className="panel panel-pad">
            <div className="micro">{t("Confiabilidade 2026")}</div>
            <h3 style={{ margin: "5px 0 10px", fontSize: 21, fontWeight: 900 }}>
              {t("A temporada dos abandonos")}
            </h3>
            <p className="note" style={{ margin: 0 }}>
              {t(
                "O regulamento novo trouxe um grid mais imprevisível: há pilotos com mais de 10 abandonos em 17 etapas. Isso explica por que o modelo pesa confiabilidade tanto quanto ritmo — e por que nenhuma previsão deve ser tratada como certeza.",
              )}
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}

const pctReliability = (driver?: { starts: number; dnfs: number }) =>
  driver ? `${Math.round(((driver.starts - driver.dnfs) / Math.max(driver.starts, 1)) * 100)}%` : "—";
