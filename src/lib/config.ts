/**
 * Configuracao do front.
 *
 * UNICO lugar que le `import.meta.env`. Componente que le variavel de ambiente
 * direto espalha configuracao pelo codigo e torna impossivel saber, de um
 * relance, o que o bundle carrega.
 *
 * Tudo com prefixo `VITE_` e embutido no bundle e e PUBLICO. Nenhum segredo
 * pode usar esse prefixo — a verificacao do CI falha o build se algo escapar
 * (FR-13, ADR-006).
 *
 * A leitura e PREGUICOSA de proposito. A primeira versao validava no topo do
 * modulo, e isso tinha duas consequencias ruins:
 *   1. em producao, uma variavel ausente derrubava a cadeia de import inteira
 *      antes do React montar — tela branca sem mensagem nenhuma, que e
 *      justamente o que o FR-07 proibe;
 *   2. nos testes, importar `api.ts` exigia um `.env` configurado, e a suite
 *      quebrava em clone limpo.
 *
 * Agora o erro aparece quando a configuracao e realmente usada, e vira estado
 * de erro visivel na tela.
 *
 * Atende: FR-07, FR-13, FR-20
 */

function ler(nome: "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY"): string {
  const valor = import.meta.env[nome];
  if (!valor) {
    throw new Error(
      `Variavel de ambiente ausente: ${nome}. Copie .env.example para .env e preencha.`,
    );
  }
  return valor;
}

export const config = {
  get supabaseUrl(): string {
    return ler("VITE_SUPABASE_URL").replace(/\/+$/, "");
  },
  get publishableKey(): string {
    return ler("VITE_SUPABASE_PUBLISHABLE_KEY");
  },
} as const;

export const functionUrl = (nome: string): string =>
  `${config.supabaseUrl}/functions/v1/${nome}`;

/** Verifica a configuracao sem estourar. Usado na partida para transformar erro
 *  de configuracao em tela de erro, em vez de pagina em branco. */
export function configuracaoValida(): boolean {
  try {
    void config.supabaseUrl;
    void config.publishableKey;
    return true;
  } catch {
    return false;
  }
}
