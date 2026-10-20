"use client";

import { useMemo, useRef, useState } from "react";
import { useEnvioComRascunho } from "@/hooks/useEnvioComRascunho";
import { contarEstados } from "@/lib/acompanhamento";
import { manterSoConhecidos } from "@/lib/rascunhoChamada";
import { formatarReais } from "@/lib/ebd";
import { normalizeSearch } from "@/lib/search";
import { salvarAulaEbdAction } from "@/server/actions/ebd";
import type { EstadoPresenca } from "@/types/acompanhamento";
import type { EbdAulaParaPreencher, EbdVisitante } from "@/types/ebd";

/** O que da tela vai para o rascunho guardado no aparelho. */
interface RascunhoAula {
  estados: Record<string, EstadoPresenca>;
  visitantes: EbdVisitante[];
  licao: string;
  biblias: number;
  revistas: number;
  oferta: string;
}

/**
 * Estado da chamada de uma classe da EBD. Tudo em memória, um envio só no
 * "Salvar". Aula nova começa com todos presentes (toque só em quem faltou);
 * reaberta, mostra o que foi salvo (quem entrou depois vem como ausente).
 * O que é marcado também fica guardado no aparelho: se a internet cair ao
 * salvar, nada se perde (ver useEnvioComRascunho).
 */
export function useAulaEbd(aula: EbdAulaParaPreencher) {
  const [estados, setEstados] = useState<Record<string, EstadoPresenca>>(() => {
    const inicial: Record<string, EstadoPresenca> = {};
    for (const a of aula.alunos) {
      inicial[a.membroId] = aula.presencas[a.membroId] ?? (aula.aulaId ? "ausente" : "presente");
    }
    return inicial;
  });
  const [visitantes, setVisitantesBruto] = useState<EbdVisitante[]>(aula.visitantes);
  const [licao, setLicaoBruto] = useState(aula.licao ?? "");
  const [biblias, setBibliasBruto] = useState(aula.biblias);
  const [revistas, setRevistasBruto] = useState(aula.revistas);
  const [oferta, setOfertaBruto] = useState(
    aula.ofertaCentavos ? formatarReais(aula.ofertaCentavos).replace(/[R$\s]/g, "") : "",
  );
  const [busca, setBusca] = useState("");
  // A pessoa mexeu em algo: a partir daí o rascunho é guardado no aparelho.
  const [alterado, setAlterado] = useState(false);
  const depoisRef = useRef<(() => void) | undefined>(undefined);
  /** Envolve um setter para também marcar a tela como alterada. */
  const mexendo =
    <V,>(setter: (v: V) => void) =>
    (v: V) => {
      setter(v);
      setAlterado(true);
    };
  const setLicao = mexendo(setLicaoBruto);
  const setBiblias = mexendo(setBibliasBruto);
  const setRevistas = mexendo(setRevistasBruto);
  const setOferta = mexendo(setOfertaBruto);

  const visiveis = useMemo(() => {
    const termo = normalizeSearch(busca);
    return termo ? aula.alunos.filter((a) => normalizeSearch(a.nome).includes(termo)) : aula.alunos;
  }, [busca, aula.alunos]);
  const contadores = useMemo(() => contarEstados(estados), [estados]);

  function marcar(membroId: string, estado: EstadoPresenca) {
    setEstados((atual) => ({ ...atual, [membroId]: estado }));
    setAlterado(true);
  }

  function todosPresentes() {
    setEstados(Object.fromEntries(aula.alunos.map((a) => [a.membroId, "presente" as const])));
    setAlterado(true);
  }

  const rascunho = useMemo<RascunhoAula>(
    () => ({ estados, visitantes, licao, biblias, revistas, oferta }),
    [estados, visitantes, licao, biblias, revistas, oferta],
  );

  const envio = useEnvioComRascunho<RascunhoAula>({
    chave: `ebd:${aula.classe.id}:${aula.data}`,
    rascunho,
    alterado,
    mensagemSucesso: "Chamada salva.",
    // Recuperado do aparelho: só vale para quem ainda está matriculado.
    aplicar: (r) => {
      const ids = aula.alunos.map((a) => a.membroId);
      setEstados((atual) => ({ ...atual, ...manterSoConhecidos(r.estados ?? {}, ids) }));
      setVisitantesBruto(Array.isArray(r.visitantes) ? r.visitantes : []);
      setLicaoBruto(typeof r.licao === "string" ? r.licao : "");
      setBibliasBruto(Number(r.biblias) || 0);
      setRevistasBruto(Number(r.revistas) || 0);
      setOfertaBruto(typeof r.oferta === "string" ? r.oferta : "");
      setAlterado(true);
    },
    enviar: () =>
      salvarAulaEbdAction({
        classeId: aula.classe.id,
        data: aula.data,
        licao,
        biblias,
        revistas,
        oferta,
        presencas: aula.alunos.map((a) => ({ membroId: a.membroId, estado: estados[a.membroId] })),
        visitantes: visitantes.map((v) => ({ nome: v.nome, telefone: v.telefone, membroId: v.membroId })),
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
    visiveis,
    contadores,
    busca,
    setBusca,
    marcar,
    todosPresentes,
    visitantes,
    adicionarVisitante: (v: EbdVisitante) => {
      setVisitantesBruto((atual) => [...atual, v]);
      setAlterado(true);
    },
    removerVisitante: (i: number) => {
      setVisitantesBruto((atual) => atual.filter((_, j) => j !== i));
      setAlterado(true);
    },
    editarVisitante: (i: number, dados: EbdVisitante) => {
      setVisitantesBruto((atual) => atual.map((v, j) => (j === i ? dados : v)));
      setAlterado(true);
    },
    licao,
    setLicao,
    biblias,
    setBiblias,
    revistas,
    setRevistas,
    oferta,
    setOferta,
    salvando: envio.enviando,
    /** Sem conexão: a chamada está guardada no aparelho, aguardando envio. */
    pendente: envio.pendente,
    /** Chamada não enviada de uma visita anterior a esta tela. */
    rascunhoEncontrado: envio.encontrado,
    recuperarRascunho: envio.recuperar,
    descartarRascunho: envio.descartar,
    salvar,
  };
}
