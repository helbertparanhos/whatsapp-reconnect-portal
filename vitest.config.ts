import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Valores de teste: a suite nao pode depender de um `.env` configurado.
    // Sem isto, `npm test` quebra em clone limpo — e foi assim que o
    // acoplamento entre teste e configuracao apareceu.
    env: {
      VITE_SUPABASE_URL: "https://teste.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "chave-publicavel-de-teste",
    },
    // `tests/` segue docs/estrutura.md; `src/` cobre teste colocado junto do alvo
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Mede o que o RNF-12 exige: os adapters e a validacao de token. Nao mede
      // componente de UI nem `index.ts` de Edge Function — o primeiro se prova
      // por revisao visual, e o segundo nao roda fora da plataforma.
      include: [
        "supabase/functions/_shared/**/*.ts",
        "src/lib/**/*.ts",
        "src/features/**/*.ts",
      ],
      exclude: [
        "supabase/functions/_shared/db.ts", // import remoto: nao roda no vitest
        "supabase/functions/_shared/guard.ts", // idem — depende de db.ts
        "supabase/functions/_shared/audit.ts", // idem
        "**/*.d.ts",
      ],
      thresholds: {
        // RNF-12: >=80% nos adapters e na validacao de token.
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
