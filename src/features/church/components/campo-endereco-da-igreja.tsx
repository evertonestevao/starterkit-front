"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBuscaCep } from "@/hooks/useBuscaCep";
import { enderecoPeloCep } from "@/lib/enderecoDaIgreja";
import { mascaraCep } from "@/lib/fichaMembro";

/**
 * Endereço da igreja com busca por CEP. O CEP só ajuda a preencher: o que
 * vai para o banco continua sendo o endereço em uma linha (campo "address").
 */
export function CampoEnderecoDaIgreja({ inicial }: { inicial: string }) {
  const [endereco, setEndereco] = useState(inicial);
  const campo = useRef<HTMLInputElement>(null);
  const cep = useBuscaCep((achado) => {
    const { texto, posicaoDoNumero } = enderecoPeloCep(achado);
    setEndereco(texto);
    // Leva o cursor para onde vai o número.
    requestAnimationFrame(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(posicaoDoNumero, posicaoDoNumero);
    });
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 sm:max-w-48">
        <Label htmlFor="cep-da-igreja">CEP</Label>
        <Input
          id="cep-da-igreja"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          maxLength={9}
          onChange={(e) => {
            e.target.value = mascaraCep(e.target.value);
            void cep.conferir(e.target.value);
          }}
          aria-describedby="cep-da-igreja-aviso"
        />
        <span id="cep-da-igreja-aviso" role="status" className="min-h-4 text-xs text-muted-foreground">
          {cep.buscando ? "Buscando o endereço..." : (cep.aviso ?? "Digite o CEP para preencher o endereço.")}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Endereço</Label>
        <Input
          ref={campo}
          id="address"
          name="address"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          placeholder="Rua das Flores, 540 - Centro, Lins/SP"
        />
        <p className="text-xs text-muted-foreground">
          Confira o número. É com ele que a página monta o “Como chegar”.
        </p>
      </div>
    </div>
  );
}
