"use client";

import { createContext, useContext } from "react";
import type { CompanyWithRole } from "@/types/tenant";

/**
 * Contexto da empresa ativa (plano §5): carregado no servidor pelo layout do
 * dashboard e exposto aos client components. Fonte de verdade de autorização
 * continua no backend — aqui é só estado de UI.
 */

export interface TenantContextValue {
  companies: CompanyWithRole[];
  active: CompanyWithRole;
  /** Chaves dos menus que a pessoa vê na igreja ativa (Configurações → Acessos). */
  menus: string[];
  /** Pedidos de visita em que ninguém fez contato ainda (aviso no menu). */
  visitasSemContato: number;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  value,
  children,
}: {
  value: TenantContextValue;
  children: React.ReactNode;
}) {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant deve ser usado dentro de TenantProvider");
  }
  return ctx;
}
