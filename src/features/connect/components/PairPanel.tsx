/**
 * Painel de codigo de pareamento.
 *
 * Alternativa ao QR, para quem nao consegue escanear — tipicamente porque o
 * WhatsApp esta no mesmo celular que abriu o link.
 *
 * Regra que a versao anterior quebrava: **erro nao limpa o campo**. Fazer a
 * pessoa redigitar o proprio numero depois de uma falha do servidor e punir o
 * usuario por um problema que nao e dele.
 *
 * Atende: FR-05, FR-07, FR-10
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { checkPhone, motivoEmPortugues } from "@/lib/phone";
import { InstructionList, PASSOS_PAREAMENTO } from "./InstructionList";
import { ErrorNotice } from "./ErrorNotice";

interface Props {
  paircode: string | null;
  carregando: boolean;
  erro: string | null;
  onGerar: (telefone: string) => void;
  onVoltar: () => void;
}

export function PairPanel({ paircode, carregando, erro, onGerar, onVoltar }: Props) {
  const [telefone, setTelefone] = useState("");
  const [erroCampo, setErroCampo] = useState<string | null>(null);

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    const check = checkPhone(telefone);
    if (!check.ok) {
      // Valida antes de gastar uma chamada. A funcao revalida do lado de la —
      // validacao de cliente nao e validacao.
      setErroCampo(motivoEmPortugues[check.reason] ?? "Numero invalido.");
      return;
    }
    setErroCampo(null);
    onGerar(check.value);
  };

  const voltar = (
    <button
      type="button"
      onClick={onVoltar}
      className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar para o QR Code
    </button>
  );

  if (paircode) {
    return (
      <div className="space-y-4">
        {voltar}
        <p className="text-sm text-foreground">Digite este codigo no WhatsApp:</p>
        <div className="rounded-xl border-2 border-primary bg-muted px-4 py-5 text-center">
          <span
            className="font-mono text-3xl font-bold tracking-[0.15em] text-foreground"
            // Leitor de tela le caractere a caractere: "D4F2" viraria "defe".
            aria-label={`Codigo: ${paircode.split("").join(" ")}`}
          >
            {paircode}
          </span>
        </div>
        <InstructionList titulo="Onde digitar:" passos={PASSOS_PAREAMENTO} />
      </div>
    );
  }

  return (
    <form onSubmit={submeter} className="space-y-4" noValidate>
      {voltar}

      {erro && <ErrorNotice codigo={erro} />}

      <div className="space-y-1.5 text-left">
        <Label htmlFor="telefone">Numero do WhatsApp</Label>
        <Input
          id="telefone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="55 11 99999-9999"
          value={telefone}
          onChange={(e) => {
            setTelefone(e.target.value);
            if (erroCampo) setErroCampo(null);
          }}
          aria-invalid={erroCampo ? true : undefined}
          aria-describedby={erroCampo ? "telefone-erro" : "telefone-ajuda"}
          className="h-12 text-base"
        />
        {erroCampo ? (
          <p id="telefone-erro" role="alert" className="text-sm text-destructive">
            {erroCampo}
          </p>
        ) : (
          <p id="telefone-ajuda" className="text-sm text-muted-foreground">
            Com o codigo do pais e o DDD.
          </p>
        )}
      </div>

      <Button type="submit" className="h-12 w-full" disabled={carregando}>
        {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {carregando ? "Gerando…" : "Gerar codigo"}
      </Button>
    </form>
  );
}
