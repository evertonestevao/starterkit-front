import Link from "next/link";

/**
 * Renderiza o texto dos Termos.
 *
 * É um subconjunto pequeno e fechado de Markdown — títulos, parágrafos,
 * listas, tabela, negrito, link e linha divisória — que é exatamente o que os
 * documentos em `supabase/terms/*.md` usam. Um renderizador próprio, aqui,
 * evita uma dependência nova só para exibir dois documentos que nós mesmos
 * escrevemos.
 *
 * Nada de `dangerouslySetInnerHTML`: o texto vira elementos React, então nem
 * um conteúdo mal publicado consegue injetar HTML na página.
 */

type Inline = { texto: string; forte?: boolean; href?: string };

/** Quebra uma linha em pedaços de **negrito** e [link](destino). */
function parseInline(linha: string): Inline[] {
  const pedacos: Inline[] = [];
  const padrao = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)/g;
  let ultimo = 0;
  let achado: RegExpExecArray | null;

  while ((achado = padrao.exec(linha)) !== null) {
    if (achado.index > ultimo) {
      pedacos.push({ texto: linha.slice(ultimo, achado.index) });
    }
    if (achado[1] !== undefined) {
      pedacos.push({ texto: achado[1], forte: true });
    } else {
      pedacos.push({ texto: achado[2], href: achado[3] });
    }
    ultimo = achado.index + achado[0].length;
  }
  if (ultimo < linha.length) pedacos.push({ texto: linha.slice(ultimo) });
  return pedacos;
}

function Texto({ linha }: { linha: string }) {
  return (
    <>
      {parseInline(linha).map((pedaco, i) => {
        if (pedaco.href) {
          return (
            <Link
              key={i}
              href={pedaco.href}
              className="text-foreground underline underline-offset-4"
            >
              {pedaco.texto}
            </Link>
          );
        }
        if (pedaco.forte) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {pedaco.texto}
            </strong>
          );
        }
        return <span key={i}>{pedaco.texto}</span>;
      })}
    </>
  );
}

function celulas(linha: string): string[] {
  return linha
    .split("|")
    .slice(1, -1)
    .map((celula) => celula.trim());
}

export function TermsDocument({ content }: { content: string }) {
  const linhas = content.replace(/\r\n/g, "\n").split("\n");
  const blocos: React.ReactNode[] = [];
  let paragrafo: string[] = [];
  let lista: string[] = [];
  let tabela: string[] = [];

  function fechaParagrafo() {
    if (paragrafo.length === 0) return;
    blocos.push(
      <p key={blocos.length} className="mt-4 text-sm leading-6 text-muted-foreground">
        <Texto linha={paragrafo.join(" ")} />
      </p>,
    );
    paragrafo = [];
  }

  function fechaLista() {
    if (lista.length === 0) return;
    blocos.push(
      <ul
        key={blocos.length}
        className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-6 text-muted-foreground"
      >
        {lista.map((item, i) => (
          <li key={i}>
            <Texto linha={item} />
          </li>
        ))}
      </ul>,
    );
    lista = [];
  }

  function fechaTabela() {
    if (tabela.length === 0) return;
    const [cabecalho, , ...corpo] = tabela;
    blocos.push(
      <div key={blocos.length} className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {celulas(cabecalho).map((celula, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium">
                  {celula}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {corpo.map((linha, i) => (
              <tr key={i} className="border-t">
                {celulas(linha).map((celula, j) => (
                  <td key={j} className="px-3 py-2 text-muted-foreground">
                    <Texto linha={celula} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tabela = [];
  }

  function fechaTudo() {
    fechaParagrafo();
    fechaLista();
    fechaTabela();
  }

  for (const linha of linhas) {
    const limpa = linha.trim();

    if (limpa === "") {
      fechaTudo();
      continue;
    }
    if (limpa.startsWith("|")) {
      fechaParagrafo();
      fechaLista();
      tabela.push(limpa);
      continue;
    }
    if (limpa === "---") {
      fechaTudo();
      blocos.push(<hr key={blocos.length} className="mt-8 border-t" />);
      continue;
    }
    if (limpa.startsWith("## ")) {
      fechaTudo();
      blocos.push(
        <h2 key={blocos.length} className="mt-8 text-lg font-semibold tracking-tight">
          {limpa.slice(3)}
        </h2>,
      );
      continue;
    }
    if (limpa.startsWith("# ")) {
      fechaTudo();
      blocos.push(
        <h1 key={blocos.length} className="text-2xl font-semibold tracking-tight">
          {limpa.slice(2)}
        </h1>,
      );
      continue;
    }
    if (limpa.startsWith("- ")) {
      fechaParagrafo();
      fechaTabela();
      lista.push(limpa.slice(2));
      continue;
    }
    fechaLista();
    fechaTabela();
    paragrafo.push(limpa);
  }
  fechaTudo();

  return <article className="mt-6">{blocos}</article>;
}
