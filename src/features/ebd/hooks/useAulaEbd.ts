"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { contarEstados } from "@/lib/acompanhamento";
import { formatarReais } from "@/lib/ebd";
import { normalizeSearch } from "@/lib/search";
import { salvarAulaEbdAction } from "@/server/actions/ebd";
import type { EstadoPresenca } from "@/types/acompanhamento";
import type { EbdAulaParaPreencher, EbdVisitante } from "@/types/ebd";

/**
 * Estado da chamada de uma classe da EBD. Tudo em memória, um envio só no
 * "Salvar". Aula nova começa com todos presentes (toque só em quem faltou);
 * reaberta, mostra o que foi salvo (quem entrou depois vem como ausente).
 */
export function useAulaEbd(aula: EbdAulaParaPreencher) {
  const [estados, setEstados] = useState<Record<string, EstadoPresenca>>(() => {
    const inicial: Record<string, EstadoPresenca> = {};
    for (const a of aula.alunos) {
      inicial[a.membroId] = aula.presencas[a.membroId] ?? (aula.aulaId ? "ausente" : "presente");
    }
    return inicial;
  });
  const [visitantes, setVisitantes] = useState<EbdVisitante[]>(aula.visitantes);
  const [licao, setLicao] = useState(aula.licao ?? "");
  const [biblias, setBiblias] = useState(aula.biblias);
  const [revistas, setRevistas] = useState(aula.revistas);
  const [oferta, setOferta] = useState(
    aula.ofertaCentavos ? formatarReais(aula.ofertaCentavos).replace(/[R$\s]/g, "") : "",
  );
  const [busca, setBusca] = useState("");
  const [salvando, startSalvar] = useTransition();

  const visiveis = useMemo(() => {
    const termo = normalizeSearch(busca);
    return termo ? aula.alunos.filter((a) => normalizeSearch(a.nome).includes(termo)) : aula.alunos;
  }, [busca, aula.alunos]);
  const contadores = useMemo(() => contarEstados(estados), [estados]);

  function marcar(membroId: string, estado: EstadoPresenca) {
    setEstados((atual) => ({ ...atual, [membroId]: estado }));
  }

  function todosPresentes() {
    setEstados(Object.fromEntries(aula.alunos.map((a) => [a.membroId, "presente" as const])));
  }

  function salvar(depois?: () => void) {
    startSalvar(async () => {
      try {
        const r = await salvarAulaEbdAction({
          classeId: aula.classe.id,
          data: aula.data,
          licao,
          biblias,
          revistas,
          oferta,
          presencas: aula.alunos.map((a) => ({ membroId: a.membroId, estado: estados[a.membroId] })),
          visitantes: visitantes.map((v) => ({ nome: v.nome, telefone: v.telefone, membroId: v.membroId })),
        });
        if (r.error) {
          toast.error(r.error);
          return;
        }
        toast.success(r.success ?? "Chamada salva.");
        depois?.();
      } catch {
        toast.error("Não foi possível salvar. Verifique a internet e tente de novo.");
      }
    });
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
    adicionarVisitante: (v: EbdVisitante) => setVisitantes((atual) => [...atual, v]),
    removerVisitante: (i: number) => setVisitantes((atual) => atual.filter((_, j) => j !== i)),
    licao,
    setLicao,
    biblias,
    setBiblias,
    revistas,
    setRevistas,
    oferta,
    setOferta,
    salvando,
    salvar,
  };
}
