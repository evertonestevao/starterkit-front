"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { brand } from "@/config/brand";
import { useInstalarApp } from "@/hooks/useInstalarApp";
import { avisoLiberado } from "@/lib/instalarApp";

const CHAVE_DISPENSA = "aviso-instalar-app-dispensado-em";

/**
 * Registra o service worker (só em produção: em dev ele atrapalharia o
 * recarregar automático). O que ele faz — e principalmente o que NÃO faz —
 * está explicado em public/sw.js.
 */
export function RegistraServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err: unknown) => {
      console.warn("[pwa] não foi possível registrar o service worker", err);
    });
  }, []);
  return null;
}

/** Passo a passo do iPhone, onde o navegador não oferece um botão de instalar. */
export function InstrucoesIos({
  aberto,
  aoFechar,
  foraDoSafari,
  titulo = `Instalar o ${brand.name} no iPhone`,
}: {
  aberto: boolean;
  aoFechar: () => void;
  foraDoSafari: boolean;
  /** O da página da igreja diz o nome dela. */
  titulo?: string;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Fica com um ícone na tela inicial e abre em tela cheia, como um aplicativo.
          </DialogDescription>
        </DialogHeader>
        {foraDoSafari ? (
          <p className="text-sm">
            No iPhone, só o <strong>Safari</strong> instala. Abra este mesmo endereço no Safari e siga os passos que
            aparecem lá.
          </p>
        ) : (
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-2">
              <span className="font-semibold">1.</span>
              <span>
                Toque em <Share className="inline size-4 align-text-bottom" aria-label="Compartilhar" />{" "}
                <strong>Compartilhar</strong>, na barra de baixo do Safari.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold">2.</span>
              <span>
                Role a lista e toque em{" "}
                <SquarePlus className="inline size-4 align-text-bottom" aria-label="Adicionar" />{" "}
                <strong>Adicionar à Tela de Início</strong>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold">3.</span>
              <span>
                Toque em <strong>Adicionar</strong>. O ícone aparece junto dos outros aplicativos.
              </span>
            </li>
          </ol>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" />}>Entendi</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Aviso discreto no topo do painel, só no celular e só onde dá para instalar.
 * Quem dispensa não vê de novo por 30 dias (lembrança guardada neste aparelho).
 */
export function AvisoInstalarApp() {
  const { modo, abrirJanela } = useInstalarApp();
  const [liberado, setLiberado] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    let dispensadoEm: number | null = null;
    try {
      const v = window.localStorage.getItem(CHAVE_DISPENSA);
      dispensadoEm = v ? Number(v) : null;
    } catch {
      // Sem acesso ao armazenamento (aba anônima, por exemplo): o aviso aparece normalmente.
    }
    // Só no celular: no computador o item "Instalar o app" do menu do perfil basta.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o aparelho (localStorage e tela) depois de montar.
    setLiberado(avisoLiberado(dispensadoEm, Date.now()) && window.matchMedia("(max-width: 767px)").matches);
  }, []);

  if (!liberado || (modo !== "botao" && modo !== "instrucoes_ios" && modo !== "abrir_no_safari")) return null;

  function dispensar() {
    try {
      window.localStorage.setItem(CHAVE_DISPENSA, String(Date.now()));
    } catch {
      // Sem armazenamento, o aviso só some até recarregar.
    }
    setLiberado(false);
  }

  return (
    <>
      <div
        role="status"
        className="mb-4 flex items-center gap-3 rounded-lg border bg-card p-3 text-sm shadow-xs print:hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático e pequeno */}
        <img src="/icons/icon-192.png" alt="" className="size-9 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Use como aplicativo</p>
          <p className="text-xs text-muted-foreground">Ícone na tela inicial e abertura em tela cheia.</p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={async () => {
            if (modo === "botao") {
              if (await abrirJanela()) dispensar();
            } else setIos(true);
          }}
        >
          <Download className="size-4" aria-hidden />
          Instalar
        </Button>
        <button
          type="button"
          onClick={dispensar}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="Agora não"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <InstrucoesIos aberto={ios} aoFechar={() => setIos(false)} foraDoSafari={modo === "abrir_no_safari"} />
    </>
  );
}
