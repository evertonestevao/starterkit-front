"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, IdCard, MessageCircle, Printer } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarData, linkWhatsapp } from "@/lib/acompanhamento";
import { ESTADO_CARTEIRINHA_LABEL } from "@/lib/carteirinha";
import { saudar } from "@/lib/saudacao";
import { cn } from "@/lib/utils";
import { useTenant } from "@/providers/tenant-provider";
import { cancelarCarteirinhaAction, emitirCarteirinhaAction } from "@/server/actions/carteirinha";
import type { CarteirinhaDoMembro } from "@/types/carteirinha";

/**
 * Carteirinha do membro: emitir (ou renovar), mandar o link pessoal e
 * imprimir. O link aparece UMA vez, logo depois de emitir — o sistema guarda
 * só a "impressão digital" dele. Precisando de novo, gera-se outro (o QR Code
 * da carteirinha já impressa continua valendo).
 */
export function CarteirinhaCard({
  membroId,
  nome,
  whatsapp,
  carteirinha,
  autorizada,
  ativo,
  validadePadrao,
  amanha,
}: {
  membroId: string;
  nome: string;
  whatsapp: string | null;
  carteirinha: CarteirinhaDoMembro | null;
  /** O termo assinado inclui a carteirinha. */
  autorizada: boolean;
  ativo: boolean;
  /** AAAA-MM-DD sugerido para a validade (um ano). */
  validadePadrao: string;
  /** AAAA-MM-DD: primeira validade aceita. */
  amanha: string;
}) {
  const { active, saudacao } = useTenant();
  const [validade, setValidade] = useState(validadePadrao);
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const emVigor = carteirinha !== null && carteirinha.estado !== "cancelada";

  function emitir() {
    start(async () => {
      const r = await emitirCarteirinhaAction(membroId, validade);
      if (r.error || !r.link) {
        toast.error(r.error ?? "Não foi possível emitir a carteirinha.");
        return;
      }
      setLink(r.link);
      toast.success(emVigor ? "Link novo gerado. O anterior deixou de abrir." : "Carteirinha emitida.");
    });
  }

  async function novoLink() {
    if (emVigor && carteirinha?.temLink) {
      const sim = await confirmar({
        titulo: "Gerar um link novo?",
        descricao:
          "O link que o membro tem hoje deixa de abrir. O QR Code da carteirinha impressa continua valendo. Use quando o link foi perdido ou caiu em mãos erradas, ou para renovar a validade.",
        botao: "Gerar link novo",
      });
      if (!sim) return;
    }
    emitir();
  }

  async function cancelar() {
    const sim = await confirmar({
      titulo: `Cancelar a carteirinha de ${nome}?`,
      descricao: "O link deixa de abrir e o QR Code passa a mostrar “carteirinha cancelada”.",
      botao: "Cancelar carteirinha",
      perigo: true,
    });
    if (!sim) return;
    start(async () => {
      const r = await cancelarCarteirinhaAction(membroId);
      if (r.error) toast.error(r.error);
      else {
        setLink(null);
        toast.success(r.success ?? "Carteirinha cancelada.");
      }
    });
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.message("Copie o link:", { description: link, duration: Infinity, closeButton: true });
    }
  }

  const wa = link
    ? linkWhatsapp(
        whatsapp,
        `${saudar(saudacao, nome)} Esta é a sua carteirinha de membro da ${active.name}. O endereço é só seu, não repasse: ${link}`,
      )
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IdCard className="size-4 text-primary" /> Carteirinha
          {emVigor && carteirinha ? (
            <Badge variant={carteirinha.estado === "valida" ? "secondary" : "outline"}>
              {ESTADO_CARTEIRINHA_LABEL[carteirinha.estado]}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Digital, por um link pessoal, e em PDF para imprimir. O QR Code leva a uma página que confirma se ela está
          válida.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {!autorizada ? (
          <p className="text-muted-foreground">
            O termo de consentimento do membro não inclui a carteirinha. Registre o termo assinado com essa opção
            marcada para poder emitir.
          </p>
        ) : !ativo ? (
          <p className="text-muted-foreground">Só membro com situação “Ativo” recebe carteirinha.</p>
        ) : (
          <>
            {emVigor && carteirinha ? (
              <p>
                Válida até <strong>{formatarData(carteirinha.validade)}</strong>.{" "}
                {carteirinha.temFoto ? "" : "Está sem foto. "}
                {carteirinha.temLink ? "O membro tem um link em vigor." : "Não há link em vigor."}
              </p>
            ) : (
              <p className="text-muted-foreground">Ainda não emitida.</p>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cart-validade">Validade</Label>
                <Input
                  id="cart-validade"
                  type="date"
                  min={amanha}
                  value={validade}
                  onChange={(e) => setValidade(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button type="button" disabled={pending || !validade} onClick={emVigor ? novoLink : emitir}>
                {pending ? "Aguarde..." : emVigor ? "Renovar e gerar link novo" : "Emitir carteirinha"}
              </Button>
            </div>

            {link ? (
              <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="font-medium">Link pessoal do membro</p>
                <p className="font-mono text-xs break-all">{link}</p>
                <p className="text-xs text-muted-foreground">
                  Envie agora: por segurança, este link não fica guardado e não aparece de novo. Se precisar, gere
                  outro.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={copiar}>
                    <Copy className="size-3.5" /> Copiar link
                  </Button>
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                    >
                      <MessageCircle className="size-3.5" /> Enviar por WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {emVigor ? (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <a
                  href={`/dashboard/membros/${membroId}/carteirinha`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                >
                  <Printer className="size-3.5" /> Imprimir (PDF)
                </a>
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={cancelar}>
                  Cancelar carteirinha
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
