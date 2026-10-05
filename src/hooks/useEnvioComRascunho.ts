"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { apagarRascunho, gravarRascunho, lerRascunho, type Rascunho } from "@/lib/rascunhoChamada";
import type { ActionState } from "@/server/actions/action-state";

/** De quanto em quanto tempo tenta reenviar sozinho enquanto está pendente. */
const REENVIO_MS = 20_000;

/**
 * Envio de uma chamada que aguenta internet ruim:
 *
 *  - enquanto a pessoa marca, o que foi marcado fica guardado no aparelho;
 *  - se o envio falhar por falta de conexão, nada se perde: a tela avisa,
 *    tenta de novo sozinha quando a internet volta (e a cada 20s) e oferece
 *    "Tentar de novo";
 *  - se a tela fechar antes de salvar, ao voltar ela oferece recuperar.
 *
 * Reenviar é seguro: as duas chamadas (culto e EBD) gravam por culto/classe
 * + data, então mandar duas vezes não duplica.
 *
 * `rascunho` é o estado da tela a guardar; `aplicar` devolve um rascunho
 * recuperado ao estado; `enviar` chama a server action.
 */
export function useEnvioComRascunho<R>({
  chave,
  rascunho,
  alterado,
  aplicar,
  enviar,
  mensagemSucesso,
  aoSalvar,
}: {
  /** Identifica a chamada (ex.: "culto:<id>:<data>"). */
  chave: string;
  rascunho: R;
  /** A pessoa mexeu em algo desde que a tela abriu. */
  alterado: boolean;
  aplicar: (dados: R) => void;
  enviar: () => Promise<ActionState>;
  mensagemSucesso: string;
  aoSalvar?: () => void;
}) {
  // Rascunho de uma visita anterior a esta tela, esperando a pessoa decidir.
  const [encontrado, setEncontrado] = useState<Rascunho<R> | null>(null);
  // Tentou enviar e não conseguiu: os dados estão no aparelho, aguardando conexão.
  const [pendente, setPendente] = useState(false);
  const [enviando, startEnvio] = useTransition();

  // Sempre a versão mais recente do envio e do rascunho, para o reenvio automático.
  const enviarRef = useRef(enviar);
  const aoSalvarRef = useRef(aoSalvar);
  const rascunhoRef = useRef(rascunho);
  useEffect(() => {
    enviarRef.current = enviar;
    aoSalvarRef.current = aoSalvar;
    rascunhoRef.current = rascunho;
  });

  // Ao abrir: há algo guardado deste aparelho para esta chamada?
  useEffect(() => {
    const guardado = lerRascunho<R>(window.localStorage, chave, Date.now());
    // Lido do aparelho, que só existe no navegador: não dá para saber na renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (guardado) setEncontrado(guardado);
  }, [chave]);

  // Enquanto marca: guarda no aparelho. (Com um rascunho antigo esperando
  // decisão, não escreve por cima dele.)
  useEffect(() => {
    if (!alterado || encontrado) return;
    gravarRascunho(window.localStorage, chave, rascunho, Date.now(), pendente);
  }, [chave, rascunho, alterado, encontrado, pendente]);

  const tentar = useCallback(
    (silencioso: boolean) => {
      startEnvio(async () => {
        try {
          const result = await enviarRef.current();
          if (result.error) {
            // Recusa do servidor (regra de negócio): não é falta de conexão, reenviar não resolve.
            setPendente(false);
            toast.error(result.error);
            return;
          }
          apagarRascunho(window.localStorage, chave);
          setPendente(false);
          setEncontrado(null);
          toast.success(result.success ?? mensagemSucesso);
          aoSalvarRef.current?.();
        } catch {
          // A chamada ao servidor nem completou: sem conexão (ou servidor fora).
          gravarRascunho(window.localStorage, chave, rascunhoRef.current, Date.now(), true);
          setPendente(true);
          if (!silencioso) {
            toast.error("Sem conexão. A chamada ficou guardada neste aparelho e será enviada quando a internet voltar.");
          }
        }
      });
    },
    [chave, mensagemSucesso],
  );

  // Pendente: tenta de novo quando a conexão volta e, por garantia, de tempos em tempos.
  useEffect(() => {
    if (!pendente) return;
    const reenviar = () => {
      if (navigator.onLine) tentar(true);
    };
    window.addEventListener("online", reenviar);
    const relogio = window.setInterval(reenviar, REENVIO_MS);
    return () => {
      window.removeEventListener("online", reenviar);
      window.clearInterval(relogio);
    };
  }, [pendente, tentar]);

  // Sair com algo não enviado: o navegador pergunta antes.
  useEffect(() => {
    if (!alterado && !pendente) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alterado, pendente]);

  return {
    /** Rascunho antigo aguardando decisão (recuperar ou descartar). */
    encontrado,
    pendente,
    enviando,
    salvar: () => tentar(false),
    recuperar: () => {
      if (!encontrado) return;
      aplicar(encontrado.dados);
      setPendente(encontrado.pendente);
      setEncontrado(null);
    },
    descartar: () => {
      apagarRascunho(window.localStorage, chave);
      setEncontrado(null);
    },
  };
}
