/**
 * Rota inexistente (TELA-90).
 *
 * Sem link para a raiz: nao ha para onde ir, e oferecer navegacao daria a
 * impressao de que existe algo a explorar.
 *
 * Atende: FR-20
 */

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-foreground">Pagina nao encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verifique se o link foi copiado por inteiro, incluindo tudo depois do sinal de interrogacao.
        </p>
      </div>
    </main>
  );
}
