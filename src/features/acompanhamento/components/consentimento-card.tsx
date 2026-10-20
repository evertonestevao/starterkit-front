"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, FileSignature, Printer, Trash2 } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { formatarData } from "@/lib/acompanhamento";
import { FINALIDADES, FOTO_LADO_MAX, MAX_FOTO_BYTES } from "@/lib/carteirinha";
import { cn } from "@/lib/utils";
import {
  enviarFotoMembroAction,
  registrarConsentimentoAction,
  removerFotoMembroAction,
} from "@/server/actions/carteirinha";
import type { Consentimento } from "@/types/carteirinha";

/**
 * Reduz a foto no navegador antes de enviar: foto de celular tem vários MB e
 * a carteirinha não precisa disso. Sai sempre JPEG, com o lado maior limitado.
 */
async function reduzirFoto(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, FOTO_LADO_MAX / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  // Fundo branco: PNG com transparência viraria preto no JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha ao converter a foto"))), "image/jpeg", 0.85),
  );
}

/**
 * Consentimento (LGPD) e foto do membro. O termo é impresso, assinado e
 * arquivado pela igreja; aqui a secretaria registra O QUE o membro marcou. Sem
 * a opção da foto no termo, a foto não entra.
 */
export function ConsentimentoCard({
  membroId,
  nome,
  consentimento,
  menor,
  hoje,
}: {
  membroId: string;
  nome: string;
  consentimento: Consentimento | null;
  /** Menor de idade: o termo é assinado pelo responsável. */
  menor: boolean;
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);
  const temTermo = Boolean(consentimento?.cadastro);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="size-4 text-primary" /> Consentimento e foto
              {!temTermo ? <Badge variant="outline">Sem termo</Badge> : null}
            </CardTitle>
            <CardDescription>
              Pela LGPD, o membro autoriza por escrito o uso dos dados dele. Imprima o termo, colha a assinatura,
              arquive o papel e registre aqui o que ele marcou.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {temTermo && consentimento ? (
          <div>
            <p>
              Termo assinado em <strong>{formatarData(consentimento.assinadoEm)}</strong>
              {consentimento.responsavelNome ? `, pelo responsável ${consentimento.responsavelNome}` : ""}.
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {FINALIDADES.map((f) => (
                <li key={f.chave}>
                  <Badge variant={consentimento[f.chave] ? "secondary" : "outline"}>
                    {f.titulo}: {consentimento[f.chave] ? "sim" : "não"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Nenhum termo registrado. Sem ele não é possível guardar foto nem emitir carteirinha.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <a
            href={`/dashboard/membros/${membroId}/termo`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <Printer className="size-3.5" /> Imprimir termo
          </a>
          <Button type="button" variant={temTermo ? "outline" : "default"} size="sm" onClick={() => setAberto(true)}>
            {temTermo ? "Alterar o que foi autorizado" : "Registrar termo assinado"}
          </Button>
        </div>

        {consentimento?.foto ? (
          <Foto membroId={membroId} nome={nome} temFoto={consentimento.temFoto} />
        ) : temTermo ? (
          <p className="text-xs text-muted-foreground">O membro não autorizou o uso da foto.</p>
        ) : null}
      </CardContent>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Termo de consentimento de {nome}</DialogTitle>
            <DialogDescription>
              Marque exatamente o que está marcado no papel assinado. Desmarcar a foto apaga a foto; desmarcar a
              carteirinha cancela a carteirinha.
            </DialogDescription>
          </DialogHeader>
          {aberto ? (
            <TermoForm
              membroId={membroId}
              consentimento={consentimento}
              menor={menor}
              hoje={hoje}
              onFeito={() => setAberto(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TermoForm({
  membroId,
  consentimento,
  menor,
  hoje,
  onFeito,
}: {
  membroId: string;
  consentimento: Consentimento | null;
  menor: boolean;
  hoje: string;
  onFeito: () => void;
}) {
  const [state, action, pending] = useActionState(registrarConsentimentoAction, undefined);
  useActionToast(state);
  const [cadastro, setCadastro] = useState(consentimento?.cadastro ?? true);
  // Fechar a janela é efeito do resultado da action (o diálogo é do pai).
  useEffect(() => {
    if (state?.success) onFeito();
  }, [state, onFeito]);

  return (
    <Formulario action={action} estado={state} className="flex flex-col gap-4">
      <input type="hidden" name="membroId" value={membroId} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">O que o membro autorizou</legend>
        {FINALIDADES.map((f) => {
          const principal = f.chave === "cadastro";
          return (
            <label
              key={f.chave}
              className={cn("flex gap-3 rounded-lg border p-3", !principal && !cadastro && "opacity-50")}
            >
              <input
                type="checkbox"
                name={f.chave}
                className="mt-1 size-4 shrink-0"
                defaultChecked={principal ? cadastro : (consentimento?.[f.chave] ?? false)}
                disabled={!principal && !cadastro}
                onChange={principal ? (e) => setCadastro(e.target.checked) : undefined}
              />
              <span>
                <span className="block text-sm font-medium">{f.titulo}</span>
                <span className="text-xs text-muted-foreground">{f.texto}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {cadastro ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="termo-data">Assinado em</Label>
            <Input
              id="termo-data"
              name="assinadoEm"
              type="date"
              required
              max={hoje}
              defaultValue={consentimento?.assinadoEm ?? hoje}
            />
          </div>
          {menor || consentimento?.responsavelNome ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="termo-resp">Responsável que assinou</Label>
              <Input
                id="termo-resp"
                name="responsavelNome"
                required={menor}
                maxLength={120}
                defaultValue={consentimento?.responsavelNome ?? ""}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Sem a primeira opção, o consentimento é retirado: a foto é apagada e a carteirinha é cancelada.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFeito} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Registrar"}
        </Button>
      </div>
    </Formulario>
  );
}

function Foto({ membroId, nome, temFoto }: { membroId: string; nome: string; temFoto: boolean }) {
  const [pending, start] = useTransition();
  // Muda a cada envio para o navegador buscar a foto nova no mesmo endereço.
  const [versao, setVersao] = useState(0);
  const arquivo = useRef<HTMLInputElement>(null);

  function enviar(file: File | undefined) {
    if (!file) return;
    start(async () => {
      try {
        const reduzida = await reduzirFoto(file);
        if (reduzida.size > MAX_FOTO_BYTES) {
          toast.error("A foto ficou grande demais. Tente outra.");
          return;
        }
        const fd = new FormData();
        fd.set("membroId", membroId);
        fd.set("foto", new File([reduzida], "foto.jpg", { type: "image/jpeg" }));
        const r = await enviarFotoMembroAction(undefined, fd);
        if (r.error) toast.error(r.error);
        else {
          toast.success(r.success ?? "Foto salva.");
          setVersao((v) => v + 1);
        }
      } catch {
        toast.error("Não foi possível ler esta imagem. Use uma foto em JPG ou PNG.");
      } finally {
        if (arquivo.current) arquivo.current.value = "";
      }
    });
  }

  async function remover() {
    const sim = await confirmar({
      titulo: `Remover a foto de ${nome}?`,
      descricao: "A foto é apagada do sistema. A carteirinha continua valendo, sem foto.",
      botao: "Remover foto",
      perigo: true,
    });
    if (!sim) return;
    start(async () => {
      const r = await removerFotoMembroAction(membroId);
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Foto removida.");
    });
  }

  return (
    <div className="flex items-center gap-4 border-t pt-4">
      <div className="flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-xs text-muted-foreground">
        {temFoto ? (
          // Imagem servida por um handler nosso, com checagem de acesso: o otimizador do Next não se aplica.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/dashboard/membros/${membroId}/foto?v=${versao}`}
            alt={`Foto de ${nome}`}
            className="size-full object-cover"
          />
        ) : (
          "sem foto"
        )}
      </div>
      <div className="flex flex-col gap-2">
        <input
          ref={arquivo}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          aria-label="Escolher foto"
          onChange={(e) => enviar(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => arquivo.current?.click()}>
            <Camera className="size-3.5" /> {pending ? "Enviando..." : temFoto ? "Trocar foto" : "Enviar foto"}
          </Button>
          {temFoto ? (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={remover}>
              <Trash2 className="size-3.5" /> Remover
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Foto de rosto, de frente, em JPG ou PNG. Ela é reduzida antes de ser enviada.
        </p>
      </div>
    </div>
  );
}
