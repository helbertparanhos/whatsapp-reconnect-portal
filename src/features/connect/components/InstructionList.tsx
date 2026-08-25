/**
 * Passo a passo dentro do WhatsApp.
 *
 * O caminho e literal — "Dispositivos conectados", nao "vá nas configuracoes".
 * A Sandra nao vai traduzir instrucao vaga com o negocio parado.
 *
 * Lista ordenada de verdade (`<ol>`), nao divs numeradas: leitor de tela anuncia
 * "item 2 de 4" e a pessoa se localiza.
 *
 * Atende: FR-02, FR-05, FR-10
 */

export function InstructionList({ passos, titulo }: { passos: string[]; titulo: string }) {
  return (
    <div className="text-left">
      <p className="mb-2 text-sm font-medium text-foreground">{titulo}</p>
      <ol className="space-y-1.5 text-sm text-muted-foreground">
        {passos.map((passo, i) => (
          <li key={passo} className="flex gap-2">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span>{passo}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const PASSOS_QRCODE = [
  "Abra o WhatsApp no celular",
  "Toque em Configuracoes e depois em Dispositivos conectados",
  "Toque em Conectar dispositivo",
  "Aponte a camera para o codigo acima",
];

export const PASSOS_PAREAMENTO = [
  "Abra o WhatsApp no celular",
  "Toque em Configuracoes e depois em Dispositivos conectados",
  "Toque em Conectar dispositivo",
  "Toque em Conectar com numero de telefone",
  "Digite o codigo mostrado acima",
];
