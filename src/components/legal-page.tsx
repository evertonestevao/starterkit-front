import Link from "next/link";
import { brand } from "@/config/brand";

export type LegalSection = { title: string; body: string };

type LegalPageProps = {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
};

/** Layout das páginas legais públicas (privacidade, reembolso). Só visual. */
export function LegalPage({ title, updatedAt, sections }: LegalPageProps) {
  return (
    <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 outline-none">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← {brand.name}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Última atualização: {updatedAt}</p>

      <p
        role="note"
        className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      >
        <strong>Texto de exemplo.</strong> Este conteúdo é um esqueleto sem valor jurídico e
        deve ser substituído por texto revisado por profissional jurídico antes do uso com
        clientes reais.
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-base font-semibold">{section.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{section.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
