import { Building2, User } from "lucide-react";
import type { SponsorKind } from "@/types/sponsorship";

/**
 * Opções de "quem vai patrocinar", compartilhadas entre o cadastro público e
 * o de quem já está logado.
 *
 * Empresa vem primeiro e marcada por padrão: é o caso mais comum. CNPJ.
 */
export const DEFAULT_SPONSOR_KIND: SponsorKind = "business";

export const SPONSOR_KIND_OPTIONS: Array<{
  value: SponsorKind;
  label: string;
  hint: string;
  icon: typeof User;
}> = [
  { value: "business", label: "Empresa", hint: "Apoio de um negócio, com CNPJ", icon: Building2 },
  { value: "person", label: "Pessoa", hint: "Apoio em seu nome, com CPF", icon: User },
];
