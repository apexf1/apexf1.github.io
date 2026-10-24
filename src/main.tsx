import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { AuthProvider } from "./lib/auth";
import { PrefsProvider } from "./lib/prefs";
import { ProfileProvider } from "./lib/profile";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <PrefsProvider>
        <ProfileProvider>
          <App />
        </ProfileProvider>
      </PrefsProvider>
    </AuthProvider>
  </StrictMode>,
);
