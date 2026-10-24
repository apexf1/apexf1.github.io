import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Cloud,
  HardDrive,
  LogOut,
  Moon,
  Star,
  Sun,
  UserRound,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { usePrefs } from "../lib/prefs";
import { useI18n } from "../lib/i18n";
import { LANGS } from "../lib/language";
import { driverByCode, drivers, teamById, teams } from "../lib/data";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7c2-1.9 3.9-4.7 3.9-8.5Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2a7.1 7.1 0 0 1-6.7-4.9H1.4A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.5a7.4 7.4 0 0 1 0-4.7L1.4 6.7a12 12 0 0 0 0 10.9l3.9-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c2.3 0 3.9 1 4.8 1.9l3.4-3.3A11.6 11.6 0 0 0 12 0 12 12 0 0 0 1.4 6.7l3.9 3.1A7.1 7.1 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

export default function ProfileMenu() {
  const auth = useAuth();
  const { prefs, setTheme, setDriver, setTeam } = usePrefs();
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const favDriver = prefs.driver ? driverByCode.get(prefs.driver) : undefined;
  const favTeam = prefs.team ? teamById.get(prefs.team) : favDriver ? teamById.get(favDriver.teamId) : undefined;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (auth.user?.name ?? "AP")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="profile" ref={box}>
      {favDriver && (
        <span
          className="fav-chip"
          style={{ ["--team" as string]: teamById.get(favDriver.teamId)?.color ?? "#777" }}
          title={t("Piloto favorito: {name}", { name: favDriver.name })}
        >
          <Star size={11} fill="currentColor" /> {favDriver.code}
        </span>
      )}

      <button
        className="theme-toggle"
        onClick={() => setTheme(prefs.theme === "dark" ? "light" : "dark")}
        aria-label={t(prefs.theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro")}
        title={t(prefs.theme === "dark" ? "Tema claro" : "Tema escuro")}
      >
        {prefs.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      <button
        className={`profile-btn${open ? " is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {auth.user ? (
          auth.user.image ? (
            <img className="profile-avatar" src={auth.user.image} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="profile-avatar profile-avatar--initials">{initials}</span>
          )
        ) : (
          <span className="profile-avatar profile-avatar--guest">
            <UserRound size={15} />
          </span>
        )}
        <span className="profile-btn-name">{auth.user ? auth.user.name.split(" ")[0] : t("Entrar")}</span>
        <ChevronDown size={13} className={`profile-caret${open ? " is-open" : ""}`} />
      </button>

      {open && (
        <div className="profile-panel panel" role="dialog" aria-label={t("Perfil e preferências")}>
          {auth.user ? (
            <div className="profile-id">
              {auth.user.image ? (
                <img className="profile-avatar profile-avatar--lg" src={auth.user.image} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="profile-avatar profile-avatar--lg profile-avatar--initials">{initials}</span>
              )}
              <div style={{ minWidth: 0 }}>
                <strong>{auth.user.name}</strong>
                <span className="profile-email">{auth.user.email}</span>
              </div>
              <span className="tag tag-green" title={t("Sessão Google ativa")}>
                <Cloud size={10} /> Google
              </span>
            </div>
          ) : (
            <div className="profile-signin">
              <div>
                <div className="micro micro-red">{t("Conta")}</div>
                <strong>
                  {t(auth.configured ? "Guarda o teu perfil na conta" : "Perfil neste navegador")}
                </strong>
                <p className="note">
                  {t(
                    auth.configured
                      ? "Entra com o Google para levar o tema, o piloto e a equipe favoritos para qualquer dispositivo."
                      : "O login Google ainda não está ligado nesta build. As preferências ficam guardadas neste navegador.",
                  )}
                </p>
              </div>
              <button
                className="btn btn-google btn-block"
                onClick={() => auth.signIn()}
                disabled={!auth.configured}
                title={t(auth.configured ? "Entrar com o Google" : "Define VITE_CLERK_PUBLISHABLE_KEY para ativar")}
              >
                <GoogleIcon /> {t("Entrar com o Google")}
              </button>
              {!auth.configured && (
                <div className="setup-note">
                  <span className="tag tag-yellow">
                    <HardDrive size={10} /> {t("modo local")}
                  </span>
                  {t("Define")} <code>VITE_CLERK_PUBLISHABLE_KEY</code>
                  {t(" em ")} <code>.env.local</code>
                  {t(" ativa a conta Google.")}
                </div>
              )}
              {auth.error && <p className="form-error">{auth.error}</p>}
            </div>
          )}

          <div className="profile-section">
            <div className="profile-label">{t("Tema")}</div>
            <div className="segmented theme-seg">
              <button
                className={prefs.theme === "light" ? "is-active" : ""}
                onClick={() => setTheme("light")}
              >
                <Sun size={13} /> {t("Claro")}
              </button>
              <button
                className={prefs.theme === "dark" ? "is-active" : ""}
                onClick={() => setTheme("dark")}
              >
                <Moon size={13} /> {t("Escuro")}
              </button>
            </div>
          </div>

          <div className="profile-section">
            <div className="profile-label">{t("Idioma")}</div>
            <div className="segmented lang-seg">
              {LANGS.map((item) => (
                <button
                  key={item.id}
                  className={lang === item.id ? "is-active" : ""}
                  onClick={() => setLang(item.id)}
                  lang={item.id}
                >
                  {item.short} · {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="profile-section">
            <label className="profile-label" htmlFor="fav-driver">
              {t("Piloto favorito")}
            </label>
            <div className="select-wrap">
              <span
                className="team-dot"
                style={{ ["--team" as string]: favDriver ? teamById.get(favDriver.teamId)?.color : "var(--muted-2)" }}
              />
              <select
                id="fav-driver"
                value={prefs.driver ?? ""}
                onChange={(event) => setDriver(event.target.value || null)}
              >
                <option value="">{t("Sem preferência")}</option>
                {[...drivers]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((driver) => (
                    <option key={driver.code} value={driver.code}>
                      {driver.code} · {driver.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="profile-section">
            <label className="profile-label" htmlFor="fav-team">
              {t("Equipe favorita")}
            </label>
            <div className="select-wrap">
              <span
                className="team-dot"
                style={{ ["--team" as string]: favTeam?.color ?? "var(--muted-2)" }}
              />
              <select
                id="fav-team"
                value={prefs.team ?? ""}
                onChange={(event) => setTeam(event.target.value || null)}
              >
                <option value="">{t("Sem preferência")}</option>
                {[...teams]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {(favDriver || favTeam) && (
            <div className="profile-fav">
              <Check size={13} />
              <span>
                {favDriver ? `${favDriver.name} · ${favDriver.points} pts` : t("Sem piloto")}
                {favTeam ? ` · ${favTeam.name}` : ""}
              </span>
            </div>
          )}

          {auth.user && (
            <button className="btn btn-ghost btn-block profile-signout" onClick={auth.signOut}>
              <LogOut size={14} /> {t("Terminar sessão")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
