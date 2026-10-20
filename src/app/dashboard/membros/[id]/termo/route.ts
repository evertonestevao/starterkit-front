import { NextResponse } from "next/server";
import { hojeISO } from "@/lib/acompanhamento";
import { ehMenor, textoDoTermo } from "@/lib/carteirinha";
import { formatChurchName } from "@/lib/churchName";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { getMenusVisiveis } from "@/server/menuPermissoes";
import { getSecretariaActorAutorizado, getSecretariaService } from "@/server/secretaria";
import { gerarTermoPdf } from "@/server/termoConsentimentoPdf";

/**
 * Termo de consentimento (LGPD) do membro, em PDF, para imprimir e assinar.
 * Mesma guarda dos outros documentos da ficha: sem o menu Membros, 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, leitor] = await Promise.all([getSecretariaActorAutorizado(), getAcompanhamentoActorAutorizado()]);
  if (!actor || !leitor || !(await getMenusVisiveis()).includes("membros")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  try {
    const [{ membro }, { igreja }] = await Promise.all([
      (await getAcompanhamentoService()).getMembro(leitor, id),
      (await getSecretariaService()).paraEmitir(actor),
    ]);
    const nomeIgreja = formatChurchName(igreja.nome, igreja.sobrenome);
    const menor = ehMenor(membro.nascimento, hojeISO());
    const pdf = await gerarTermoPdf({
      termo: textoDoTermo({ nome: membro.nome, igreja: nomeIgreja, menor }),
      igreja: nomeIgreja,
      enderecoIgreja: igreja.endereco,
      membro: membro.nome,
      menor,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="termo-de-consentimento.pdf"',
      },
    });
  } catch (err) {
    console.error("[termo] falha ao gerar o termo", err);
    return new NextResponse("Não encontrado", { status: 404 });
  }
}
