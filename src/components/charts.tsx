import type { CircuitProfile } from "../types";
import { calendar } from "../lib/data";
import { useI18n } from "../lib/i18n";

export function RadarChart({
  labels,
  series,
  size = 300,
}: {
  labels: string[];
  series: { label: string; color: string; values: number[]; dashed?: boolean }[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.31;
  const n = labels.length;
  const point = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const radius = (Math.max(0, Math.min(100, value)) / 100) * r;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  };
  const polygon = (value: number) =>
    Array.from({ length: n }, (_, i) => point(i, value).join(",")).join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: "100%", maxWidth: size, overflow: "visible" }}
      role="img"
      aria-label={`Radar: ${series.map((s) => s.label).join(" vs ")}`}
    >
      {[25, 50, 75, 100].map((level) => (
        <polygon
          key={level}
          points={polygon(level)}
          fill="none"
          stroke="rgb(var(--ink) / 0.12)"
          strokeWidth={1}
        />
      ))}
      {labels.map((label, i) => {
        const [x, y] = point(i, 100);
        const [tx, ty] = point(i, 124);
        const anchor = Math.abs(tx - cx) < 8 ? "middle" : tx > cx ? "start" : "end";
        return (
          <g key={label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgb(var(--ink) / 0.1)" />
            <text
              x={tx}
              y={ty + 3}
              textAnchor={anchor}
              fill="#8b95a7"
              fontSize={size * 0.031}
              fontWeight={700}
              letterSpacing="0.04em"
            >
              {label.toUpperCase()}
            </text>
          </g>
        );
      })}
      {series.map((s) => (
        <g key={s.label}>
          <polygon
            points={s.values.map((v, i) => point(i, v).join(",")).join(" ")}
            fill={s.color}
            fillOpacity={s.dashed ? 0.035 : 0.14}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "4 4" : undefined}
            strokeLinejoin="round"
          />
          {s.values.map((v, i) => {
            const [x, y] = point(i, v);
            return <circle key={i} cx={x} cy={y} r={2.6} fill={s.color} />;
          })}
        </g>
      ))}
    </svg>
  );
}

const PROFILE_KEYS: (keyof CircuitProfile)[] = [
  "power",
  "downforce",
  "tyre",
  "overtaking",
  "street",
  "chaos",
];

export function CircuitDNA({ profile }: { profile: CircuitProfile }) {
  const { t } = useI18n();
  const average = PROFILE_KEYS.map(
    (key) => (calendar.reduce((a, race) => a + race.profile[key], 0) / calendar.length) * 100,
  );
  return (
    <RadarChart
      labels={["Potência", "Carga aero", "Pneus", "Ultrapassagem", "Rua", "Caos"].map((label) =>
        t(label),
      )}
      series={[
        {
          label: t("Esta pista"),
          color: "#ff3a20",
          values: PROFILE_KEYS.map((key) => profile[key] * 100),
        },
        { label: t("Média do calendário"), color: "#6b7688", values: average, dashed: true },
      ]}
      size={280}
    />
  );
}

export function ChampionshipChart({
  points,
  rounds,
  series,
  visible,
  height = 260,
}: {
  points: Record<string, number[]>;
  rounds: number;
  series: { code: string; color: string }[];
  visible: Set<string>;
  height?: number;
}) {
  const { t } = useI18n();
  const width = 900;
  const pad = { left: 36, right: 46, top: 14, bottom: 26 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(50, ...series.flatMap((s) => points[s.code] ?? []));
  const yMax = Math.ceil(max / 50) * 50;
  const x = (round: number) =>
    pad.left + ((round - 1) / Math.max(rounds - 1, 1)) * innerW;
  const y = (value: number) => pad.top + innerH - (value / yMax) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * yMax));

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        role="img"
        aria-label={t("Evolução de pontos no campeonato")}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              className="chart-grid"
            />
            <text x={pad.left - 8} y={y(tick) + 3} textAnchor="end" className="chart-axis">
              {tick}
            </text>
          </g>
        ))}
        {[1, 5, 10, 15, rounds]
          .filter((r, i, arr) => r <= rounds && arr.indexOf(r) === i)
          .map((round) => (
            <text key={round} x={x(round)} y={height - 6} textAnchor="middle" className="chart-axis">
              {round}
            </text>
          ))}
        {series
          .filter((s) => visible.has(s.code))
          .map((s) => {
            const values = points[s.code] ?? [];
            const path = values
              .map((value, index) => `${index === 0 ? "M" : "L"}${x(index + 1)},${y(value)}`)
              .join(" ");
            const last = values[values.length - 1] ?? 0;
            return (
              <g key={s.code}>
                <path d={path} className="chart-line" stroke={s.color} />
                <circle
                  cx={x(values.length)}
                  cy={y(last)}
                  r={3}
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
      </svg>
    </div>
  );
}
