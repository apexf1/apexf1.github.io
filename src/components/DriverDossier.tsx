import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Star, Trophy, X } from "lucide-react";
import type { Career } from "../lib/history";
import { CURRENT_SEASON, loadCareers, loadPeople } from "../lib/history";
import type { HistoryDriver } from "../lib/history";
import { driverBios } from "../data/bios";
import { drivers, teamById } from "../lib/data";
import { usePrefs } from "../lib/prefs";
import { useI18n } from "../lib/i18n";
import { ordinal } from "../lib/format";

interface Props {
  driverId: string;
  onClose: () => void;
}

export default function DriverDossier({ driverId, onClose }: Props) {
  const [career, setCareer] = useState<Career | null>(null);
  const [person, setPerson] = useState<HistoryDriver | null>(null);
  const [loading, setLoading] = useState(true);
  const { prefs, setDriver } = usePrefs();
  const { t } = useI18n();
  const currentDriver = drivers.find((driver) => driver.driverId === driverId);
  const teamColor = currentDriver
    ? teamById.get(currentDriver.teamId)?.color ?? "#ff2d12"
    : "#ff2d12";
  const bio = driverBios[driverId];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([loadCareers(), loadPeople()])
      .then(([careers, people]) => {
        if (!alive) return;
        setCareer(careers[driverId] ?? null);
        setPerson(people.drivers[driverId] ?? null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [driverId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const name = person?.[0] ?? currentDriver?.name ?? driverId;
  const championships = career?.seasons.filter((season) => season.p === 1 && season.y < CURRENT_SEASON).map((season) => season.y) ?? [];
  const isFav = currentDriver ? prefs.driver === currentDriver.code : false;

  return createPortal(
    <div className="dossier-backdrop" onMouseDown={onClose}>
      <div
        className="dossier panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("Ficha de {name}", { name })}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dossier-head" style={{ ["--team" as string]: teamColor }}>
          <div className="dossier-id">
            <span className="dossier-code">
              {currentDriver?.code ?? person?.[3] ?? name.slice(0, 3).toUpperCase()}
            </span>
            <div>
              <div className="micro micro-red">{t("Ficha do piloto")}</div>
              <h2>{name}</h2>
              <div className="dossier-meta">
                {person?.[1] && <span>{person[1]}</span>}
                {person?.[2] && <span>n. {person[2]}</span>}
                {career?.first && (
                  <span>
                    F1 {career.first}–{career.last}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="dossier-actions">
            {currentDriver && (
              <button
                className={`btn${isFav ? " btn-primary" : ""}`}
                onClick={() => setDriver(isFav ? null : currentDriver.code)}
              >
                <Star size={13} fill={isFav ? "currentColor" : "none"} />
                {t(isFav ? "Favorito" : "Tornar favorito")}
              </button>
            )}
            <button className="dossier-close" onClick={onClose} aria-label={t("Fechar ficha")}>
              <X size={16} />
            </button>
          </div>
        </header>

        {championships.length > 0 && (
          <div className="dossier-titles">
            <Trophy size={14} />
            <strong>
              {championships.length === 1
                ? t("Campeão mundial")
                : t("{n}× campeão mundial", { n: championships.length })}
            </strong>
            <span>{championships.join(" · ")}</span>
          </div>
        )}

        {loading ? (
          <div className="dossier-body">
            <div className="skeleton" style={{ height: 60, marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 150 }} />
          </div>
        ) : (
          <div className="dossier-body">
            {bio && (
              <div className="dossier-bio">
                {bio.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            )}

            {career && (
              <>
                <div className="dossier-stats">
                  <Stat label={t("Corridas")} value={career.starts} />
                  <Stat label={t("Vitórias")} value={career.wins} />
                  <Stat label={t("Pódios")} value={career.podiums} />
                  <Stat label={t("Títulos")} value={championships.length} />
                  <Stat label={t("Pontos")} value={Math.round(career.points)} />
                  <Stat label={t("Temporadas")} value={career.seasons.length} />
                </div>

                <div className="dossier-seasons">
                  <div className="micro" style={{ marginBottom: 6 }}>
                    {t("Histórico na F1")}
                  </div>
                  <div className="table-wrap">
                    <table className="standings-table dossier-table">
                      <thead>
                        <tr>
                          <th>{t("Ano")}</th>
                          <th>{t("Equipe")}</th>
                          <th className="num">Pos.</th>
                          <th className="num">{t("Pontos")}</th>
                          <th className="num">{t("Vitórias")}</th>
                          <th className="num">{t("Corridas")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...career.seasons].reverse().map((season) => (
                          <tr key={season.y}>
                            <td className="num" style={{ fontWeight: 800 }}>
                              {season.y}
                            </td>
                            <td>{season.t || "—"}</td>
                            <td className="num">{season.p > 0 ? ordinal(season.p) : "—"}</td>
                            <td className="num">{season.pts}</td>
                            <td className="num">{season.w}</td>
                            <td className="num muted">{season.r || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {!career && !bio && (
              <p className="note">{t("Sem dados históricos para este piloto.")}</p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="profile-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
