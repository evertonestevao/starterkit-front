import "server-only";
import { resumoDosPedidos, trimestreDosPedidos } from "@/lib/ebdRevistas";
import type { RevistasPendentes } from "@/lib/paraHoje";
import { getEbdRevistasActor, getEbdRevistasService, getIgrejaDosPedidos } from "./ebdRevistas";

/**
 * Pendências de revista da EBD para o "Para hoje" do Painel: o mesmo
 * trimestre que a tela de Revistas abre sem escolha. Só para quem gere a EBD;
 * os outros recebem null (o item não aparece).
 */
export async function revistasPendentes(hoje: string): Promise<RevistasPendentes | null> {
  const actor = await getEbdRevistasActor();
  const igreja = await getIgrejaDosPedidos();
  if (!actor || !igreja) return null;
  const service = await getEbdRevistasService();
  const lista = await service.listaDaIgreja(actor, igreja.id);
  const trimestre = trimestreDosPedidos(lista.trimestres, hoje);
  if (!trimestre) return null;
  const dados = await service.doTrimestre(actor, trimestre.id, igreja.id);
  const resumo = resumoDosPedidos(dados.pedidos);
  return {
    trimestreId: trimestre.id,
    trimestreNome: trimestre.nome,
    comecou: trimestre.inicio <= hoje,
    devendo: resumo.devendo,
    aReceberCentavos: resumo.aReceberCentavos,
    aEntregar: resumo.aEntregar,
  };
}
