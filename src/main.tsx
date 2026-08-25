import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { configuracaoValida } from "./lib/config";
import "./index.css";

const raiz = document.getElementById("root");

if (!raiz) {
  throw new Error("Elemento #root nao encontrado no HTML.");
}

/**
 * Configuracao ausente vira tela com mensagem, nunca pagina em branco.
 *
 * Sem esta checagem, uma variavel de ambiente faltando derruba a cadeia de
 * import antes do React montar, e quem abre o link ve um retangulo branco sem
 * nenhuma explicacao — o oposto do FR-07. A mensagem e generica para o usuario
 * e especifica no console, para quem opera.
 */
if (!configuracaoValida()) {
  console.error(
    "Configuracao ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Copie .env.example para .env e preencha antes de construir o bundle.",
  );
  raiz.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;
                 font-family:ui-sans-serif,system-ui,sans-serif;background:#fff;color:#232b36">
      <div style="max-width:24rem;text-align:center">
        <h1 style="font-size:1.125rem;font-weight:600;margin:0 0 .5rem">Pagina indisponivel</h1>
        <p style="font-size:.9375rem;color:#5a6472;margin:0">
          Esta pagina nao esta configurada corretamente. Avise quem cuida do seu WhatsApp.
        </p>
      </div>
    </main>`;
} else {
  createRoot(raiz).render(<App />);
}
