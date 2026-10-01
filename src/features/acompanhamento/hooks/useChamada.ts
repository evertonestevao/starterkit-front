"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { contarEstados, estadosIniciais, justificativaDoDia } from "@/lib/acompanhamento";
import { normalizeSearch } from "@/lib/search";
import { salvarChamadaAction } from "@/server/actions/acompanhamento";
import type {
  ChamadaParaPreencher,
  EstadoPresenca,
  MotivoJustificativa,
  Visitante,
} from "@/types/acompanhamento";

/**
 * Estado da tela de chamada. Tudo fica em memória e vai num envio só no
 * "Salvar" — 40 toques não viram 40 idas ao servidor.
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
  const [salvando, startSalvar] = useTransition();

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

  function salvar(depois?: () => void) {
    startSalvar(async () => {
      try {
        const result = await salvarChamadaAction({
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
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(result.success ?? "Chamada salva.");
        setAlterado(false);
        depois?.();
      } catch {
        toast.error("Não foi possível salvar. Verifique a internet e tente de novo.");
      }
    });
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
    salvando,
    marcar,
    todosPresentes,
    definirMotivo,
    adicionarVisitante,
    removerVisitante,
    salvar,
  };
}
