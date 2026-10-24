import { useEffect, useState } from "react";
import { ArrowUpRight, Trophy } from "lucide-react";
import type { Driver } from "../types";
import type { Career } from "../lib/history";
import { CURRENT_SEASON, loadCareers } from "../lib/history";
import { driverBios } from "../data/bios";
import { useI18n } from "../lib/i18n";
import { ordinal } from "../lib/format";

export default function DriverBioBlock({
  driver,
  onOpen,
}: {
  driver: Driver;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const [career, setCareer] = useState<Career | null>(null);
  const bio = driverBios[driver.driverId];
  const titles = career?.seasons.filter((season) => season.p === 1 && season.y < CURRENT_SEASON).map((season) => season.y) ?? [];

  useEffect(() => {
    let alive = true;
    void loadCareers().then((careers) => {
      if (alive) setCareer(careers[driver.driverId] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [driver.driverId]);

  const seasons = career ? [...career.seasons].slice(-5).reverse() : [];

  return (
    <div className="driver-bio">
      <div className="driver-bio-head">
        <span className="micro">{t("Biografia")}</span>
        {titles.length > 0 && (
          <span className="tag tag-yellow">
            <Trophy size={10} /> {t("{n}× campeão", { n: titles.length })}
          </span>
        )}
      </div>

      {bio ? (
        bio.slice(0, 2).map((paragraph, index) => <p key={index}>{paragraph}</p>)
      ) : (
        <p className="note">{t("Biografia ainda não disponível para este piloto.")}</p>
      )}

      {career && (
        <>
          <div className="bio-facts">
            <span className="tag">{t("F1 desde {year}", { year: career.first })}</span>
            <span className="tag">{career.starts} GPs</span>
            <span className="tag">{t("{n} vitórias", { n: career.wins })}</span>
            <span className="tag">{t("{n} pódios", { n: career.podiums })}</span>
            {titles.length > 0 && <span className="tag">{titles.join(" · ")}</span>}
          </div>

          {seasons.length > 0 && (
            <div className="bio-seasons">
              <div className="micro">{t("Histórico recente")}</div>
              {seasons.map((season) => (
                <div className="bio-season-row" key={season.y}>
                  <b>{season.y}</b>
                  <span className="bio-season-team">{season.t || "—"}</span>
                  <span className="bio-season-pos">{season.p > 0 ? ordinal(season.p) : "—"}</span>
                  <span className="muted">{season.pts} pts</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <button className="btn btn-ghost btn-block" onClick={onOpen} style={{ marginTop: 12 }}>
        {t("Ficha e histórico completos")} <ArrowUpRight size={13} />
      </button>
    </div>
  );
}
