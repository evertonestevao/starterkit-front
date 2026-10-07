"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmação do sistema, no lugar de `window.confirm`/`alert`/`prompt` —
 * as caixas do navegador não entram em nenhuma tela.
 *
 *   if (!(await confirmar({ titulo: "Remover o trimestre?" }))) return;
 *
 * Funciona como o toast: `<ConfirmarHost />` fica montado uma vez no layout
 * raiz e qualquer componente client chama `confirmar()`.
 */
export interface Pergunta {
  titulo: string;
  /** Explica a consequência, em uma ou duas frases. */
  descricao?: string;
  /** Texto do botão que confirma. Padrão: "Confirmar". */
  botao?: string;
  /** Ação que tira ou encerra algo: o botão fica vermelho. */
  perigo?: boolean;
}

type Pendente = Pergunta & { responder: (sim: boolean) => void };

let abrir: ((p: Pendente) => void) | null = null;

export function confirmar(pergunta: Pergunta): Promise<boolean> {
  return new Promise((resolve) => {
    // Sem o host montado não há como perguntar: não confirma nada.
    if (!abrir) return resolve(false);
    abrir({ ...pergunta, responder: resolve });
  });
}

export function ConfirmarHost() {
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    abrir = (p) => {
      setPendente(p);
      setAberto(true);
    };
    return () => {
      abrir = null;
    };
  }, []);

  // O texto fica até a animação de fechar acabar; só `aberto` muda na hora.
  function responder(sim: boolean) {
    pendente?.responder(sim);
    setAberto(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => (o ? setAberto(true) : responder(false))}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{pendente?.titulo}</DialogTitle>
          {pendente?.descricao ? <DialogDescription>{pendente.descricao}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => responder(false)}>
            Cancelar
          </Button>
          <Button type="button" variant={pendente?.perigo ? "destructive" : "default"} onClick={() => responder(true)}>
            {pendente?.botao ?? "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
