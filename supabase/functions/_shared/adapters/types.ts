/**
 * Contratos do adapter de provider.
 *
 * Os tres providers divergem em tudo que importa: onde vive a credencial
 * (path x header), quantas credenciais existem (1, 2 ou 3), o verbo HTTP, a
 * forma do codigo de pareamento (path x query x body) e o nome de cada campo de
 * resposta. Nao ha atalho — o adapter e real, com uma implementacao por provider
 * e normalizacao na saida (ADR-002).
 *
 * Quem chama nao conhece provider: fala so o vocabulario daqui.
 *
 * Implementa: 03-spec.md §O adapter de provider
 * Atende: FR-11, FR-12
 */

export type ProviderId = "zapi" | "evolution" | "uazapi";

/** Vocabulario unico de status. Cada provider fala o seu; `normalize` traduz. */
export type ConnStatus = "connected" | "connecting" | "disconnected";

export interface InstanceContext {
  /** Identificador da instancia no provider. */
  externalId: string;
  /** Host do provider. Null para providers de host fixo. */
  baseUrl: string | null;
  credentials: Record<string, string>;
}

export interface ConnectResult {
  /** Sempre data URI pronta para <img src>. O front nunca adivinha formato. */
  qrcode: string | null;
  paircode: string | null;
  status: ConnStatus;
}

export interface StatusResult {
  status: ConnStatus;
}

export interface ConnectOptions {
  /** Somente digitos, com DDI. Presente apenas no fluxo de pareamento. */
  phone?: string;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  /** Nem todo provider oferece pareamento. Quando false, o front nao mostra a opcao. */
  readonly supportsPairing: boolean;
  connect(ctx: InstanceContext, opts: ConnectOptions): Promise<ConnectResult>;
  status(ctx: InstanceContext): Promise<StatusResult>;
}
