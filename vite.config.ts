import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// No GitHub Pages o site vive em /<repo>/; no Freebuff Sites vive na raiz.
// O workflow de Pages define VITE_BASE com o nome do repositório (sem barras,
// para o Git Bash do Windows não transformar o valor num caminho absoluto).
const normalizeBase = (raw?: string) => {
  const cleaned = (raw ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned ? `/${cleaned}/` : "/";
};

const base = normalizeBase(process.env.VITE_BASE);

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5177 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
