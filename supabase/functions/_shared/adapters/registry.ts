/**
 * Registry de providers.
 *
 * Ponto unico de resolucao. Adicionar um quarto provider e: um arquivo, uma
 * entrada aqui, um teste de contrato — nada mais muda (ADR-002).
 *
 * O provider vem de coluna `enum NOT NULL` no banco, nunca de heuristica em
 * runtime. O formato do identificador ate revela o provider, mas depender disso
 * seria trocar um discriminador fragil por outro.
 *
 * Implementa: 03-spec.md §Registry
 * Atende: FR-11
 */

import type { ProviderAdapter, ProviderId } from "./types.ts";
import { AppError } from "../errors.ts";
import { zapi } from "./zapi.ts";
import { evolution } from "./evolution.ts";
import { uazapi } from "./uazapi.ts";

const ADAPTERS: Record<ProviderId, ProviderAdapter> = { zapi, evolution, uazapi };

/**
 * Devolve o adapter do provider.
 *
 * Provider desconhecido estoura `config_error` — erro de configuracao, nao de
 * usuario. Tentar as cegas ou cair num padrao produziria uma falha obscura mais
 * adiante, longe da causa.
 */
export function getAdapter(id: string): ProviderAdapter {
  const adapter = ADAPTERS[id as ProviderId];
  if (!adapter) {
    throw new AppError("config_error", `provider desconhecido: ${id}`);
  }
  return adapter;
}

export const supportedProviders = (): ProviderId[] => Object.keys(ADAPTERS) as ProviderId[];
