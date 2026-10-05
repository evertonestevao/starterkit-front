"use client";

import { useMemo, useRef, useState } from "react";
import { useEnvioComRascunho } from "@/hooks/useEnvioComRascunho";
import { contarEstados, estadosIniciais, justificativaDoDia } from "@/lib/acompanhamento";
import { manterSoConhecidos } from "@/lib/rascunhoChamada";
import { normalizeSearch } from "@/lib/search";
import { salvarChamadaAction } from "@/server/actions/acompanhamento";
import type {
  ChamadaParaPreencher,
  EstadoPresenca,
  MotivoJustificativa,
  Visitante,
} from "@/types/acompanhamento";

/** O que da tela vai para o rascunho guardado no aparelho. */
interface RascunhoChamada {
  estados: Record<string, EstadoPresenca>;
  motivos: Record<string, MotivoJustificativa>;
  visitantes: Visitante[];
}

/**
 * Estado da tela de chamada. Tudo fica em memória e vai num envio só no
 * "Salvar" — 40 toques não viram 40 idas ao servidor. O que é marcado também
 * fica guardado no aparelho: se a internet cair ao salvar, nada se perde
 * (ver useEnvioComRascunho).
 */
export function useChamada(chamada: ChamadaParaPreencher) {
  const [estados, setEstados] = useState<Record<string, EstadoPresenca>>(() =>
    estadosIniciais({
      membroIds: chamada.membros.map((m) => m.id),
      data: chamada.data,
      presencas: chamada.presencas,
      justificativas: chamada.justificativas,
      chamadaExiste: chamada.chamadaId !== null,
    }),
  );
  // Motivo para quem foi marcado Justificado agora, sem justificativa registrada.
  const [motivos, setMotivos] = useState<Record<string, MotivoJustificativa>>({});
  const [visitantes, setVisitantes] = useState<Visitante[]>(chamada.visitantes);
  const [busca, setBusca] = useState("");
  const [alterado, setAlterado] = useState(false);
  const depoisRef = useRef<(() => void) | undefined>(undefined);

  const registrada = useMemo(() => {
    const porMembro: Record<string, ReturnType<typeof justificativaDoDia>> = {};
    for (const m of chamada.membros) porMembro[m.id] = justificativaDoDia(chamada.justificativas, m.id, chamada.data);
    return porMembro;
  }, [chamada]);

  const visiveis = useMemo(() => {
    const termo = normalizeSearch(busca);
    if (!termo) return chamada.membros;
    return chamada.membros.filter((m) => normalizeSearch(m.nome).includes(termo));
  }, [busca, chamada.membros]);

  const contadores = useMemo(() => contarEstados(estados), [estados]);

  function marcar(membroId: string, estado: EstadoPresenca) {
    setEstados((atual) => ({ ...atual, [membroId]: estado }));
    setAlterado(true);
  }

  /** Todos presentes, menos quem tem justificativa registrada para a data. */
  function todosPresentes() {
    setEstados((atual) => {
      const novo = { ...atual };
      for (const m of chamada.membros) if (!registrada[m.id]) novo[m.id] = "presente";
      return novo;
    });
    setAlterado(true);
  }

  function definirMotivo(membroId: string, motivo: MotivoJustificativa) {
    setMotivos((atual) => ({ ...atual, [membroId]: motivo }));
    setAlterado(true);
  }

  function adicionarVisitante(v: Visitante) {
    setVisitantes((atual) => [...atual, v]);
    setAlterado(true);
  }

  function removerVisitante(indice: number) {
    setVisitantes((atual) => atual.filter((_, i) => i !== indice));
    setAlterado(true);
  }

  const rascunho = useMemo<RascunhoChamada>(() => ({ estados, motivos, visitantes }), [estados, motivos, visitantes]);

  const envio = useEnvioComRascunho<RascunhoChamada>({
    chave: `culto:${chamada.culto.id}:${chamada.data}`,
    rascunho,
    alterado,
    mensagemSucesso: "Chamada salva.",
    // Recuperado do aparelho: só vale para quem ainda está na lista de hoje.
    aplicar: (r) => {
      const ids = chamada.membros.map((m) => m.id);
      setEstados((atual) => ({ ...atual, ...manterSoConhecidos(r.estados ?? {}, ids) }));
      setMotivos(manterSoConhecidos(r.motivos ?? {}, ids));
      setVisitantes(Array.isArray(r.visitantes) ? r.visitantes : []);
      setAlterado(true);
    },
    enviar: () =>
      salvarChamadaAction({
        cultoId: chamada.culto.id,
        data: chamada.data,
        presencas: chamada.membros.map((m) => ({
          membroId: m.id,
          estado: estados[m.id],
          justificativaId: estados[m.id] === "justificado" ? (registrada[m.id]?.id ?? null) : null,
          motivo: estados[m.id] === "justificado" && !registrada[m.id] ? (motivos[m.id] ?? "outro") : null,
          motivoTexto: null,
        })),
        visitantes,
      }),
    aoSalvar: () => {
      setAlterado(false);
      depoisRef.current?.();
    },
  });

  function salvar(depois?: () => void) {
    depoisRef.current = depois;
    envio.salvar();
  }

  return {
    estados,
    motivos,
    visitantes,
    busca,
    setBusca,
    visiveis,
    contadores,
    registrada,
    alterado,
    salvando: envio.enviando,
    /** Sem conexão: a chamada está guardada no aparelho, aguardando envio. */
    pendente: envio.pendente,
    /** Chamada não enviada de uma visita anterior a esta tela. */
    rascunhoEncontrado: envio.encontrado,
    recuperarRascunho: envio.recuperar,
    descartarRascunho: envio.descartar,
    marcar,
    todosPresentes,
    definirMotivo,
    adicionarVisitante,
    removerVisitante,
    salvar,
  };
}
