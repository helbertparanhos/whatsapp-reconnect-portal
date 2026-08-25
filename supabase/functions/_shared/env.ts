/**
 * Leitura de configuracao.
 *
 * Este e o UNICO lugar de `_shared/` que toca o ambiente de execucao. Todo o
 * resto recebe a configuracao pronta, por parametro.
 *
 * O motivo e testabilidade: modulo que le `Deno.env` direto so roda em Deno, e
 * a regra do projeto exige cobertura >= 80% na validacao de token e nos adapters
 * (RNF-12). Mantendo a logica agnostica de runtime, o vitest testa tudo sem
 * emular a plataforma.
 *
 * Implementa: 03-spec.md §Variaveis de ambiente
 */

// A plataforma injeta `Deno`. Declarado aqui para o typecheck rodar fora do Deno.
declare const Deno: { env: { get(key: string): string | undefined } } | undefined;

export interface PortalEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  issueSecret: string;
  allowedOrigins: string[];
  publicUrl: string;
  ipSalt: string;
}

const read = (key: string): string | undefined =>
  typeof Deno !== "undefined" ? Deno.env.get(key) : undefined;

function require_(key: string): string {
  const v = read(key);
  if (!v) {
    // Falta de configuracao e erro de operacao, nao de usuario. Estourar na
    // partida e melhor que responder errado silenciosamente.
    throw new Error(`variavel de ambiente obrigatoria ausente: ${key}`);
  }
  return v;
}

export function loadEnv(): PortalEnv {
  return {
    supabaseUrl: require_("SUPABASE_URL"),
    serviceRoleKey: require_("SUPABASE_SERVICE_ROLE_KEY"),
    issueSecret: require_("PORTAL_ISSUE_SECRET"),
    // Sem origens configuradas a lista fica vazia e o CORS nega tudo.
    // Falhar fechado: esquecer de configurar nao vira liberacao geral.
    allowedOrigins: (read("PORTAL_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    publicUrl: (read("PORTAL_PUBLIC_URL") ?? "").replace(/\/+$/, ""),
    ipSalt: read("PORTAL_IP_SALT") ?? "",
  };
}
