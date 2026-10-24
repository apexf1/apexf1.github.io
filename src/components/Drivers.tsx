import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Flag, Timer, Trophy } from "lucide-react";
import {
  calendar,
  driverByCode,
  drivers,
  getMetrics,
  season,
  teamById,
} from "../lib/data";
import { formatDate, num, ordinal, raceLabel } from "../lib/format";
import { usePrefs } from "../lib/prefs";
import { useI18n } from "../lib/i18n";
import { RadarChart } from "./charts";
import { SectionHead } from "./ui";
import DriverBioBlock from "./DriverBioBlock";
import DriverDossier from "./DriverDossier";

const ATTRIBUTES = [
  ["quali", "Qualificação"],
  ["race", "Corrida"],
  ["consistency", "Consistência"],
  ["tyre", "Pneus"],
  ["wet", "Chuva"],
  ["reliability", "Confiabilidade"],
] as const;

export default function Drivers({ focusCode }: { focusCode?: string }) {
  const { prefs } = usePrefs();
  const { t } = useI18n();
  const [a, setA] = useState(() => {
    if (focusCode && driverByCode.has(focusCode)) return focusCode;
    if (prefs.driver && driverByCode.has(prefs.driver)) return prefs.driver;
    return "ANT";
  });
  const [b, setB] = useState(() => (prefs.driver === "RUS" ? "VER" : "RUS"));
  const [dossier, setDossier] = useState<string | null>(null);

  useEffect(() => {
    if (focusCode && driverByCode.has(focusCode)) {
      setA(focusCode);
      if (focusCode === b) {
        setB(b === "RUS" ? "VER" : "RUS");
      }
    }
  }, [focusCode, b]);

  const metrics = useMemo(() => getMetrics(), []);
  const driverA = driverByCode.get(a);
  const driverB = driverByCode.get(b);
  const teamA = driverA ? teamById.get(driverA.teamId) : undefined;
  const teamB = driverB ? teamById.get(driverB.teamId) : undefined;
  const mA = metrics.get(a);
  const mB = metrics.get(b);

  const recent = useMemo(() => {
    const map = new Map<
      string,
      { round: number; race: string; position: number; grid: number; points: number; finished: boolean }[]
    >();
    for (const round of season.results) {
      const race = calendar.find((r) => r.round === round.round);
      for (const result of round.results) {
        if (!map.has(result.code)) map.set(result.code, []);
        map.get(result.code)?.push({
          round: round.round,
          race: race ? raceLabel(race) : "",
          position: result.position,
          grid: result.grid,
          points: result.points,
          finished: result.finished,
        });
      }
    }
    return map;
  }, []);

  if (!driverA || !driverB || !teamA || !teamB || !mA || !mB) {
    return null;
  }

  const swapped = () => {
    setA(b);
    setB(a);
  };

  const colorB =
    teamA.color.toLowerCase() === teamB.color.toLowerCase() ? "#ffd23f" : teamB.color;

  const stats: {
    label: string;
    a: number;
    b: number;
    format?: (value: number) => string;
    invert?: boolean;
  }[] = [
    { label: "Pontos", a: driverA.points, b: driverB.points, format: (v) => num(v) },
    { label: "Vitórias", a: driverA.wins, b: driverB.wins },
    { label: "Pódios", a: driverA.podiums, b: driverB.podiums },
    { label: "Poles", a: driverA.poles, b: driverB.poles },
    {
      label: "Abandonos",
      a: driverA.dnfs,
      b: driverB.dnfs,
      invert: true,
    },
    {
      label: "Média de chegada",
      a: mA.avgFinish,
      b: mB.avgFinish,
      format: (v) => v.toFixed(1),
      invert: true,
    },
    {
      label: "Posições ganhas / GP",
      a: mA.positionsGained,
      b: mB.positionsGained,
      format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
    },
    {
      label: "Delta na classificação",
      a: mA.qualiMedianDelta,
      b: mB.qualiMedianDelta,
      format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(3)}s`,
      invert: true,
    },
  ];

  const advantage = ATTRIBUTES.reduce(
    (sum, [key]) => sum + (mA.attributes[key] > mB.attributes[key] ? 1 : -1),
    0,
  );

  const recentA = (recent.get(a) ?? []).slice(-5).reverse();
  const recentB = (recent.get(b) ?? []).slice(-5).reverse();

  return (
    <div>
      <div className="standings-head">
        <div>
          <div className="micro micro-red">Head-to-head</div>
          <h1>
            {t("Piloto")}
            <br />
            <span style={{ color: "var(--muted-2)" }}>{t("contra piloto")}</span>
          </h1>
          <p>
            {t(
              "Atributos derivados de {rounds} etapas: delta contra o companheiro de equipe, consistência, gestão de pneus e confiabilidade.",
              { rounds: season.throughRound },
            )}
          </p>
        </div>
        <span className="tag">
          <Trophy size={11} /> {t("{rounds} etapas analisadas", { rounds: season.throughRound })}
        </span>
      </div>

      <article className="panel compare-head">
        <DriverPicker
          code={a}
          other={b}
          color={teamA.color}
          onChange={setA}
        />
        <button className="compare-vs" onClick={swapped} aria-label={t("Trocar pilotos")}>
          <ArrowLeftRight size={16} />
        </button>
        <DriverPicker
          code={b}
          other={a}
          color={colorB}
          onChange={setB}
        />
      </article>

      <div className="compare-grid" style={{ marginTop: 16 }}>
        <article className="panel radar-card">
          <div className="micro" style={{ alignSelf: "flex-start" }}>
            {t("Perfil de pilotagem")}
          </div>
          <RadarChart
            labels={ATTRIBUTES.map(([, label]) => t(label))}
            series={[
              {
                label: driverA.code,
                color: teamA.color,
                values: ATTRIBUTES.map(([key]) => mA.attributes[key]),
              },
              {
                label: driverB.code,
                color: colorB,
                values: ATTRIBUTES.map(([key]) => mB.attributes[key]),
                dashed: true,
              },
            ]}
            size={330}
          />
          <div className="chart-legend" style={{ justifyContent: "center" }}>
            <span className="legend-btn is-on">
              <i style={{ ["--team" as string]: teamA.color }} /> {driverA.code} {driverA.lastName}
            </span>
            <span className="legend-btn is-on">
              <i style={{ ["--team" as string]: colorB }} /> {driverB.code} {driverB.lastName}
            </span>
          </div>
          <p className="note" style={{ textAlign: "center", marginTop: 10 }}>
            {advantage === 0
              ? t("Empate técnico nos atributos.")
              : t("{code} leva vantagem em {n} de {total} atributos.", {
                  code: advantage > 0 ? driverA.code : driverB.code,
                  n: Math.abs(advantage),
                  total: ATTRIBUTES.length,
                })}
          </p>
        </article>

        <article className="panel panel-pad">
          <div className="micro">{t("Duelo direto")}</div>
          <h3 style={{ margin: "5px 0 16px", fontSize: 21, fontWeight: 900 }}>
            {driverA.lastName} vs {driverB.lastName}
          </h3>
          <div className="h2h">
            {stats.map((row) => {
              const total = Math.max(Math.abs(row.a) + Math.abs(row.b), 0.0001);
              const aWidth = row.invert
                ? (1 - Math.abs(row.a) / total) * 100
                : (Math.abs(row.a) / total) * 100;
              const bWidth = row.invert
                ? (1 - Math.abs(row.b) / total) * 100
                : (Math.abs(row.b) / total) * 100;
              return (
                <div className="h2h-row" key={row.label}>
                  <span className="h2h-num" style={{ color: teamA.color }}>
                    {row.format ? row.format(row.a) : row.a}
                  </span>
                  <div className="h2h-values">
                    <span className="h2h-label">{t(row.label)}</span>
                    <div
                      className="h2h-bar"
                      style={{
                        ["--a" as string]: teamA.color,
                        ["--b" as string]: colorB,
                      }}
                    >
                      <span style={{ width: `${aWidth}%` }} />
                      <span style={{ width: `${bWidth}%` }} />
                    </div>
                  </div>
                  <span className="h2h-num" style={{ color: colorB }}>
                    {row.format ? row.format(row.b) : row.b}
                  </span>
                </div>
              );
            })}
          </div>
          {mA.teammate === b || mB.teammate === a ? (
            <>
              <div className="divider" />
              <div className="micro" style={{ marginBottom: 8 }}>
                {t("Duelo de companheiros de equipe")}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="tag">
                  <Timer size={11} />{" "}
                  {t("Classificação {wins}–{losses}", {
                    wins: mA.qualiWins,
                    losses: mA.qualiLosses,
                  })}
                </span>
                <span className="tag">
                  <Flag size={11} />{" "}
                  {t("Corridas {wins}–{losses}", { wins: mA.raceWins, losses: mA.raceLosses })}
                </span>
                <span className="tag">
                  {t("Delta quali {value}s", { value: mA.qualiMedianDelta.toFixed(3) })}
                </span>
              </div>
            </>
          ) : (
            <p className="note" style={{ marginTop: 16 }}>
              {t(
                "Duelo entre equipes diferentes: a comparação usa o perfil absoluto, não o delta de companheiro de equipe.",
              )}
            </p>
          )}
        </article>
      </div>

      <div className="driver-cards">
        {[
          { driver: driverA, team: teamA, metric: mA, recent: recentA },
          { driver: driverB, team: teamB, metric: mB, recent: recentB },
        ].map(({ driver, team, metric, recent }) => (
          <article
            className="panel driver-profile"
            key={driver.code}
            style={{ ["--team" as string]: team.color }}
          >
            <div className="profile-head">
              <span className="avatar avatar--lg" style={{ ["--team" as string]: team.color }}>
                {driver.code}
              </span>
              <div>
                <div className="profile-name">{driver.name}</div>
                <div className="profile-meta">
                  <span className="team-dot" style={{ ["--team" as string]: team.color }} />
                  {team.name} · #{driver.number} · P{driver.position}
                </div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{num(driver.points)}</div>
                <div className="micro">{t("pontos")}</div>
              </div>
            </div>

            <div className="profile-stats">
              <ProfileStat label={t("Vitórias")} value={driver.wins} />
              <ProfileStat label={t("Pódios")} value={driver.podiums} />
              <ProfileStat label="Poles" value={driver.poles} />
              <ProfileStat label="DNFs" value={driver.dnfs} />
              <ProfileStat label={t("Voltas rápidas")} value={driver.fastestLaps} />
              <ProfileStat
                label={t("Chegadas")}
                value={`${Math.round((1 - metric.dnfRate) * 100)}%`}
              />
            </div>

            <div className="recent-results">
              <div className="micro" style={{ marginBottom: 4 }}>
                {t("Últimas 5 etapas")}
              </div>
              {recent.map((result) => (
                <div className="recent-row" key={result.round}>
                  <span>{formatDate(calendar.find((r) => r.round === result.round)?.startUTC ?? "")}</span>
                  <b>{result.race}</b>
                  <span className="pos">
                    {result.finished ? ordinal(result.position) : "DNF"}
                  </span>
                  <span>{result.points} pts</span>
                </div>
              ))}
            </div>

            <DriverBioBlock driver={driver} onOpen={() => setDossier(driver.driverId)} />
          </article>
        ))}
      </div>

      {dossier && <DriverDossier driverId={dossier} onClose={() => setDossier(null)} />}

      <section className="section">
        <SectionHead
          eyebrow={t("Método")}
          title={t("De onde vêm os atributos")}
          description={t("Nada de números mágicos: cada eixo do radar tem uma origem rastreável.")}
        />
        <div className="two-col">
          <article className="panel panel-pad">
            <ul className="method" style={{ margin: 0 }}>
              <li>
                <b>{t("Classificação:")}</b>
                {t(" mediana do delta de tempo contra o companheiro de equipe, ajustada pela posição média no grid.")}
              </li>
              <li>
                <b>{t("Corrida:")}</b>
                {t(" delta de posição contra o companheiro e posições ganhas por GP.")}
              </li>
              <li>
                <b>{t("Consistência:")}</b>
                {t(" desvio-padrão das posições de chegada (DNF conta como 21º).")}
              </li>
              <li>
                <b>{t("Pneus:")}</b>
                {t(" posições ganhas em circuitos com degradação alta.")}
              </li>
            </ul>
          </article>
          <article className="panel panel-pad">
            <ul className="method" style={{ margin: 0 }}>
              <li>
                <b>{t("Chuva:")}</b>
                {t(" prior editorial de experiência em pista molhada — o único eixo que não sai dos resultados de 2026.")}
              </li>
              <li>
                <b>{t("Confiabilidade:")}</b>
                {t(" taxa de abandonos na temporada.")}
              </li>
              <li>
                <b>{t("Normalização:")}</b>
                {t(" cada atributo é escalado de 35 a 99 entre os 22 pilotos titulares.")}
              </li>
              <li>
                <b>{t("Limite:")}</b>
                {t(" com uma equipe dominante, o carro explica mais que o piloto. O radar é contexto, não veredito.")}
              </li>
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}

function DriverPicker({
  code,
  other,
  color,
  onChange,
}: {
  code: string;
  other: string;
  color: string;
  onChange: (code: string) => void;
}) {
  const { t } = useI18n();
  const driver = driverByCode.get(code);
  if (!driver) return null;
  return (
    <div className="driver-pick" style={{ ["--team" as string]: color }}>
      <span className="avatar avatar--lg" style={{ ["--team" as string]: color }}>
        {driver.code}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="micro">{t("Piloto")}</div>
        <select
          value={code}
          onChange={(event) => onChange(event.target.value)}
          aria-label={t("Escolher piloto")}
        >
          {drivers
            .filter((candidate) => candidate.code !== other)
            .sort((x, y) => x.position - y.position)
            .map((candidate) => (
              <option value={candidate.code} key={candidate.code}>
                {candidate.name}
              </option>
            ))}
        </select>
      </div>
      <span className="select-caret" aria-hidden="true">
        ▾
      </span>
      <span className="team-dot" style={{ ["--team" as string]: color }} />
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="profile-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

