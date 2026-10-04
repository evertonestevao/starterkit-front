"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { RouteTab } from "@/components/route-tabs";

/**
 * No painel da igreja, as abas de uma seção (EBD, Presença nos cultos,
 * Configurações) aparecem como subitens do menu lateral, não como abas
 * horizontais no topo da página: um lugar só para navegar. O layout da seção
 * continua montando a lista (com permissões e contadores) e a entrega aqui
 * pelo RouteTabs.
 */

interface SectionSubnav {
  tabs: RouteTab[] | null;
  setTabs: React.Dispatch<React.SetStateAction<RouteTab[] | null>>;
}

const SectionSubnavContext = createContext<SectionSubnav | null>(null);

/** Dentro do AppShell: guarda as abas da seção aberta para a sidebar mostrar. */
export function SectionSubnavProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<RouteTab[] | null>(null);
  const value = useMemo(() => ({ tabs, setTabs }), [tabs]);
  return <SectionSubnavContext.Provider value={value}>{children}</SectionSubnavContext.Provider>;
}

/** Abas da seção aberta (null fora de uma seção com abas). */
export function useSectionSubnav(): RouteTab[] | null {
  return useContext(SectionSubnavContext)?.tabs ?? null;
}

/**
 * Entrega as abas à sidebar. Devolve true quando a sidebar assumiu (o
 * RouteTabs então não desenha nada). Fora do AppShell (painel do
 * patrocinador, plataforma) não há provider e as abas continuam no topo.
 */
export function usePublicarSubnav(tabs: RouteTab[]): boolean {
  const ctx = useContext(SectionSubnavContext);
  const setTabs = ctx?.setTabs;
  const ativo = !!setTabs;
  // Chave estável: o layout server manda um array novo a cada render.
  const chave = JSON.stringify(tabs);

  useEffect(() => {
    if (!ativo || !setTabs) return;
    const minhas = JSON.parse(chave) as RouteTab[];
    setTabs(minhas);
    // Ao sair da seção, limpa só se as abas ainda forem as desta seção.
    return () => setTabs((atual) => (atual === minhas ? null : atual));
  }, [ativo, setTabs, chave]);

  return ativo;
}

/** O subitem atual: o de href mais longo que casa com o caminho. */
export function subitemAtivo(tabs: RouteTab[], pathname: string): string | null {
  const casa = tabs
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return casa?.href ?? null;
}
