"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBuscaCep } from "@/hooks/useBuscaCep";
import type { PartesDoEndereco } from "@/lib/enderecoDaIgreja";
import { UFS, mascaraCep } from "@/lib/fichaMembro";
import { selectClasses } from "./church-link-controls";

/**
 * Endereço da igreja em partes. O CEP preenche rua, bairro, cidade e UF e
 * leva o cursor para o número; número e complemento são sempre à mão.
 * O serviço monta, com as partes, a linha que a página pública mostra.
 */
export function CampoEnderecoDaIgreja({
  endereco,
  enderecoAntigo,
}: {
  endereco: PartesDoEndereco;
  /** A linha salva antes de o endereço ter partes: aparece só como referência. */
  enderecoAntigo: string | null;
}) {
  // O que o CEP preenche fica em estado; número e complemento ficam no campo.
  const [achado, setAchado] = useState({
    logradouro: endereco.logradouro ?? "",
    bairro: endereco.bairro ?? "",
    cidade: endereco.cidade ?? "",
    uf: endereco.uf ?? "",
  });
  const numero = useRef<HTMLInputElement>(null);
  const cep = useBuscaCep((e) => {
    // CEP geral de cidade pequena vem sem rua nem bairro: mantém o que já estava digitado.
    setAchado((a) => ({
      logradouro: e.logradouro || a.logradouro,
      bairro: e.bairro || a.bairro,
      cidade: e.cidade,
      uf: e.uf,
    }));
    numero.current?.focus();
  });
  const semPartes = Object.values(endereco).every((v) => v === null);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-medium">Endereço</legend>
      {semPartes && enderecoAntigo ? (
        <p className="text-xs text-muted-foreground">
          Endereço salvo hoje: <span className="text-foreground">{enderecoAntigo}</span>. Preencha pelo CEP para
          completar.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cep">CEP</Label>
          <Input
            id="cep"
            name="cep"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            maxLength={9}
            defaultValue={mascaraCep(endereco.cep)}
            onChange={(e) => {
              e.target.value = mascaraCep(e.target.value);
              void cep.conferir(e.target.value);
            }}
            aria-describedby="cep-aviso"
          />
        </div>
        <span id="cep-aviso" role="status" className="self-end pb-2 text-xs text-muted-foreground">
          {cep.buscando ? "Buscando o endereço..." : (cep.aviso ?? "O CEP preenche o resto do endereço.")}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logradouro">Rua / avenida</Label>
          <Input
            id="logradouro"
            name="logradouro"
            autoComplete="address-line1"
            maxLength={150}
            value={achado.logradouro}
            onChange={(e) => setAchado((a) => ({ ...a, logradouro: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="numero">Número</Label>
          <Input ref={numero} id="numero" name="numero" maxLength={20} defaultValue={endereco.numero ?? ""} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="complemento">Complemento</Label>
          <Input
            id="complemento"
            name="complemento"
            maxLength={80}
            placeholder="Sala, bloco, fundos..."
            defaultValue={endereco.complemento ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bairro">Bairro</Label>
          <Input
            id="bairro"
            name="bairro"
            maxLength={80}
            value={achado.bairro}
            onChange={(e) => setAchado((a) => ({ ...a, bairro: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_5.5rem] gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cidade">Cidade</Label>
          <Input
            id="cidade"
            name="cidade"
            maxLength={80}
            value={achado.cidade}
            onChange={(e) => setAchado((a) => ({ ...a, cidade: e.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="uf">UF</Label>
          <select
            id="uf"
            name="uf"
            className={selectClasses}
            value={achado.uf}
            onChange={(e) => setAchado((a) => ({ ...a, uf: e.target.value }))}
          >
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">É com ele que a página monta o “Como chegar”.</p>
    </fieldset>
  );
}
