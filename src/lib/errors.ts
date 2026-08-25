/**
 * Traducao de codigo de erro para mensagem em portugues.
 *
 * A Sandra nao e tecnica, esta no celular, com pressa, porque o WhatsApp do
 * negocio dela parou. Toda mensagem daqui precisa dizer **o que aconteceu** e
 * **o que fazer agora** — nunca "erro", nunca codigo, nunca jargao.
 *
 * Nenhuma mensagem expoe URL, credencial, nome de tabela ou stack trace
 * (SEC-10). O detalhe tecnico fica no log do servidor.
 *
 * Atende: FR-07
 */

export interface MensagemErro {
  titulo: string;
  descricao: string;
  /** Falso quando nao adianta insistir — o botao de tentar de novo some. */
  podeTentarDeNovo: boolean;
}

const MENSAGENS: Record<string, MensagemErro> = {
  provider_error: {
    titulo: "Nao conseguimos gerar o codigo agora",
    descricao:
      "O servico de WhatsApp nao respondeu. Isso costuma ser temporario — tente de novo em alguns instantes.",
    podeTentarDeNovo: true,
  },
  rate_limited: {
    titulo: "Muitas tentativas",
    descricao:
      "Voce tentou varias vezes seguidas. Aguarde alguns minutos e tente novamente.",
    podeTentarDeNovo: false,
  },
  config_error: {
    titulo: "Esta conexao precisa de um ajuste",
    descricao:
      "Avise quem cuida do seu WhatsApp: ha algo a corrigir no cadastro antes de conectar.",
    podeTentarDeNovo: false,
  },
  invalid_phone: {
    titulo: "Numero invalido",
    descricao:
      "Digite o numero com o codigo do pais e o DDD. Exemplo: 55 11 99999-9999.",
    podeTentarDeNovo: true,
  },
  pairing_unsupported: {
    titulo: "Codigo indisponivel",
    descricao: "Esta conexao aceita apenas QR Code. Use a leitura pela camera.",
    podeTentarDeNovo: false,
  },
  network: {
    titulo: "Sem conexao",
    descricao:
      "Nao conseguimos falar com o servidor. Verifique sua internet e tente de novo.",
    podeTentarDeNovo: true,
  },
};

/**
 * Mensagem generica para codigo desconhecido.
 *
 * Sempre com acao. Codigo que nao conhecemos ainda e bug nosso, e a Sandra nao
 * pode ficar numa tela sem saida por causa disso.
 */
const GENERICA: MensagemErro = {
  titulo: "Algo deu errado",
  descricao:
    "Nao conseguimos completar a operacao. Tente de novo — se continuar, avise quem cuida do seu WhatsApp.",
  podeTentarDeNovo: true,
};

export function mensagemDeErro(codigo: string | null | undefined): MensagemErro {
  if (!codigo) return GENERICA;
  return MENSAGENS[codigo] ?? GENERICA;
}

/** Codigos que levam a tela de link expirado, nao a de erro (FR-08). */
export const CODIGOS_DE_LINK_INVALIDO = ["invalid_token", "unauthorized", "not_found", "inactive"];

export const ehLinkInvalido = (codigo: string | null | undefined): boolean =>
  typeof codigo === "string" && CODIGOS_DE_LINK_INVALIDO.includes(codigo);
