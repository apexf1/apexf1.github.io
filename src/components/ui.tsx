import type { ReactNode } from "react";
import type { Driver } from "../types";
import { compoundLabel } from "../lib/format";
import { useI18n } from "../lib/i18n";

export function Avatar({
  driver,
  size = "md",
  color,
}: {
  driver: Driver;
  size?: "sm" | "md" | "lg";
  color?: string;
}) {
  return (
    <span
      className={`avatar${size === "lg" ? " avatar--lg" : ""}`}
      style={{ ["--team" as string]: color ?? "#777" }}
      title={`${driver.name} · ${driver.flag}`}
    >
      {driver.code}
    </span>
  );
}

export function TyreBadge({ compound, age }: { compound: string; age?: number }) {
  const { t } = useI18n();
  const key =
    compound === "SOFT"
      ? "soft"
      : compound === "MEDIUM"
        ? "medium"
        : compound === "HARD"
          ? "hard"
          : compound === "INTERMEDIATE"
            ? "inter"
            : compound === "WET"
              ? "wet"
              : "unknown";
  return (
    <span className="tyre-cell">
      <span className={`tyre tyre-${key}`} title={compound}>
        {compoundLabel(compound)}
      </span>
      {age !== undefined && <span className="tyre-age num">{t("{age}v", { age })}</span>}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <div className="micro micro-red">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
}) {
  return (
    <div className="profile-stat" style={accent ? { borderColor: accent } : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function FormChips({
  results,
  points,
}: {
  results: { position: number; points: number; finished: boolean }[];
  points?: number;
}) {
  const { t } = useI18n();
  return (
    <span className="form-chips">
      {results.slice(-5).map((r, i) => {
        const isWin = r.finished && r.position === 1;
        const bg = !r.finished
          ? undefined
          : r.position === 1
            ? "#ffd23f"
            : r.position <= 3
              ? "#2ee6a8"
              : r.position <= 10
                ? "#9fb0c8"
                : "#3a4150";
        return (
          <span
            key={i}
            className={`form-chip${!r.finished ? " dnf" : ""}${isWin ? " win" : ""}`}
            style={bg ? { background: bg } : undefined}
            title={
              r.finished
                ? t("{position}º lugar · {points} pts", { position: r.position, points: r.points })
                : t("Abandonou")
            }
          >
            {r.finished ? r.position : "D"}
          </span>
        );
      })}
      {points !== undefined && <span className="form-chip dnf">{points}</span>}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "28px 0", textAlign: "center" }}>
      <div className="micro">{title}</div>
      <p className="note" style={{ maxWidth: 440, margin: "8px auto 0" }}>
        {body}
      </p>
    </div>
  );
}
