import { lazy, Suspense, useEffect, useState } from "react";
import { Gauge, History, Radio, Trophy, Users } from "lucide-react";
import RaceHub from "./components/RaceHub";
import ProfileMenu from "./components/ProfileMenu";

const LiveReplay = lazy(() => import("./components/LiveReplay"));
const Standings = lazy(() => import("./components/Standings"));
const Drivers = lazy(() => import("./components/Drivers"));
const F1History = lazy(() => import("./components/F1History"));
import { getUpcomingRace, season } from "./lib/data";
import { formatDate, raceLabel } from "./lib/format";
import { useI18n } from "./lib/i18n";
import { usePicks, useSettings } from "./lib/storage";

type Tab = "corrida" | "ao-vivo" | "classificacao" | "pilotos" | "historia";

const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: "corrida", label: "Corrida", icon: Gauge },
  { id: "ao-vivo", label: "Ao vivo", icon: Radio },
  { id: "classificacao", label: "Classificação", icon: Trophy },
  { id: "pilotos", label: "Pilotos", icon: Users },
  { id: "historia", label: "F1 History", icon: History },
];

const tabFromHash = (): Tab => {
  const hash = window.location.hash.replace("#", "").split(/[&?]/)[0];
  return TABS.some((tab) => tab.id === hash) ? (hash as Tab) : "corrida";
};

export default function App() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(() => tabFromHash());
  const [round, setRound] = useState(() => {
    const match = window.location.hash.match(/round=(\d+)/);
    return match ? Number(match[1]) : getUpcomingRace().round;
  });
  const [settings, setSettings] = useSettings();
  const [picks, pick] = usePicks();
  const [focusDriver, setFocusDriver] = useState<string | undefined>(undefined);
  const upcoming = getUpcomingRace();

  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = (next: Tab) => {
    setTab(next);
    if (window.location.hash !== `#${next}`) {
      window.history.replaceState(null, "", `#${next}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="#corrida"
          onClick={(event) => {
            event.preventDefault();
            navigate("corrida");
          }}
          aria-label={t("APEX — página inicial")}
        >
          <span className="brand-mark" aria-hidden="true">
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
              <path d="M2.6 21 10.2 3h3.6L21.4 21h-4.6L12 9.4 7.2 21H2.6Z" fill="#fff" />
              <path d="M8.2 13.6h7.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            <span className="brand-word">APEX</span>
            <span className="brand-sub">RACE INTELLIGENCE</span>
          </span>
        </a>

        <nav className="tabs" aria-label={t("Navegação principal")}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`tab${tab === id ? " is-active" : ""}`}
              onClick={() => navigate(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon className="icon" size={14} />
              {t(label)}
            </button>
          ))}
        </nav>

        <div className="topbar-meta">
          <span className="round-chip">
            R{upcoming.round} · {raceLabel(upcoming)}
          </span>
          <span className="data-chip">
            <span className="live-dot" /> {t("dados {date}", { date: formatDate(season.updatedAt) })}
          </span>
        </div>
        <ProfileMenu />
      </header>

      <main className="page">
        <Suspense fallback={<TabFallback />}>
        {tab === "corrida" && (
          <RaceHub
            round={round}
            onSelectRound={setRound}
            settings={settings}
            onSettings={setSettings}
            picks={picks}
            onPick={pick}
            onGoLive={() => navigate("ao-vivo")}
          />
        )}
        {tab === "ao-vivo" && <LiveReplay />}
        {tab === "classificacao" && (
          <Standings
            onCompareDriver={(code) => {
              setFocusDriver(code);
              navigate("pilotos");
            }}
          />
        )}
        {tab === "pilotos" && <Drivers focusCode={focusDriver} />}
        {tab === "historia" && <F1History />}
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}

function TabFallback() {
  return (
    <div className="panel panel-pad" style={{ marginTop: 8 }}>
      <div className="skeleton" style={{ height: 18, width: 160, marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 180 }} />
    </div>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <div>
        <strong>{t("APEX · hub de corrida")}</strong>
        <br />
        {t(
          "Dados de resultados e classificação: Jolpica-F1 (sucessora da Ergast). Replay: OpenF1. Previsões são simulações estatísticas, não recomendações de aposta.",
        )}
      </div>
      <div className="footer-links">
        <a href="https://api.jolpi.ca/ergast/f1/2026/" target="_blank" rel="noreferrer">
          {t("Fonte Jolpica")}
        </a>
        <a href="https://openf1.org" target="_blank" rel="noreferrer">
          OpenF1
        </a>
        <a href="https://www.formula1.com/en/racing/2026" target="_blank" rel="noreferrer">
          {t("Calendário oficial")}
        </a>
      </div>
    </footer>
  );
}
