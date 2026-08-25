/**
 * Raiz do dominio (TELA-91).
 *
 * Sem identificador nao ha o que mostrar. Esta pagina **nao explica como o
 * servico funciona, nao lista nada e nao tem formulario** — decisao de
 * seguranca registrada em 04-ui.md: uma pagina explicando o funcionamento seria
 * mapa para quem quer sondar o servico.
 *
 * Substitui o placeholder "Welcome to Your Blank App" (P-14).
 *
 * Atende: FR-20
 */

export default function Root() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-foreground">Acesso por link direto</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Se voce precisa reconectar um WhatsApp, peca o link a quem cuida da sua conta.
        </p>
      </div>
    </main>
  );
}
