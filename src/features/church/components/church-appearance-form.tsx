"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/hooks/useActionToast";
import {
  ACCENT_PRESETS,
  buildPageStyle,
  CHURCH_THEMES,
  parseAccentColor,
  THEME_PALETTES,
  type ChurchTheme,
} from "@/lib/pageAppearance";
import { cn } from "@/lib/utils";
import { saveChurchAppearanceAction } from "@/server/actions/churchProfile";
import type { AppearanceMode, ChurchProfile } from "@/services/churchProfileService";

/**
 * Miniatura da página com o tema e a cor escolhidos. Usa as MESMAS variáveis
 * (buildPageStyle) da página pública, inclusive o ajuste de contraste — o que
 * se vê aqui é o que a comunidade vai ver.
 */
function PagePreview({ theme, accent, nome }: { theme: ChurchTheme; accent: string | null; nome: string }) {
  return (
    <div
      style={buildPageStyle(theme, accent) as CSSProperties}
      className="overflow-hidden rounded-xl border border-[var(--pg-border)] bg-[var(--pg-bg)] text-[var(--pg-text)]"
      aria-hidden
    >
      <div className="bg-[var(--pg-hero)] px-4 py-4 text-center">
        <p className="text-sm font-semibold text-[var(--pg-hero-text)]">{nome}</p>
        <p className="mt-0.5 text-xs text-[var(--pg-hero-muted)]">
          Nossa <span className="font-semibold text-[var(--pg-hero-accent)]">programação</span>
        </p>
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        <div className="rounded-lg border border-[var(--pg-border)] bg-[var(--pg-surface)] p-3">
          <p className="text-xs font-medium">Chave PIX</p>
          <p className="mt-0.5 text-[0.7rem] text-[var(--pg-muted)]">A doação vai direto para a igreja.</p>
          <div className="mt-2.5 flex h-8 items-center justify-center rounded-lg bg-[var(--pg-accent)] text-xs font-semibold text-[var(--pg-accent-fg)]">
            Copiar chave
          </div>
        </div>
        <p className="text-xs">
          Quer conhecer a igreja?{" "}
          <span className="font-semibold text-[var(--pg-accent)]">Quero visitar</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Escolha do tema e da cor de destaque da página pública. A cor é sugerida em
 * poucas opções ou livre; se ficar difícil de ler no fundo do tema, a página
 * ajusta o brilho sozinha (ver lib/pageAppearance).
 */
export function ChurchAppearanceForm({ igreja }: { igreja: ChurchProfile }) {
  const [state, formAction, pending] = useActionState(saveChurchAppearanceAction, undefined);
  useActionToast(state);

  const [modo, setModo] = useState<AppearanceMode>(
    igreja.hasParent ? igreja.appearanceMode : "custom",
  );
  const [tema, setTema] = useState<ChurchTheme>(igreja.own.theme);
  const [cor, setCor] = useState<string>(igreja.own.accent ?? "");

  const herdando = modo === "inherit" && igreja.inherited !== null;
  const temaEmUso = herdando ? igreja.inherited!.theme : tema;
  const corEmUso = herdando ? igreja.inherited!.accent : cor === "" ? null : cor;
  // <input type="color"> exige #rrggbb: sem cor escolhida, mostra o destaque do tema.
  const corDoSeletor = parseAccentColor(cor).ok && cor !== "" ? cor : THEME_PALETTES[tema]["--pg-accent"];

  return (
    <form action={formAction} className="flex flex-col gap-5 border-t pt-6">
      <input type="hidden" name="churchId" value={igreja.id} />
      <input type="hidden" name="publicCode" value={igreja.publicCode} />
      <input type="hidden" name="mode" value={modo} />
      <input type="hidden" name="theme" value={tema} />
      <input type="hidden" name="accentColor" value={cor} />

      <div>
        <h3 className="text-sm font-medium">Aparência da página</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          O tema e a cor de destaque que sua comunidade vê no link, no QR Code e na tag.
        </p>
      </div>

      {igreja.hasParent ? (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Como a página vai ficar</legend>
          {(
            [
              ["inherit", "Igual à igreja-mãe", "Acompanha o tema e a cor dela."],
              ["custom", "Personalizar", "Escolha o tema e a cor desta igreja."],
            ] as const
          ).map(([valor, titulo, descricao]) => (
            <label
              key={valor}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                modo === valor ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="modo-visual"
                checked={modo === valor}
                onChange={() => setModo(valor)}
                className="sr-only"
              />
              <span className="font-medium">{titulo}</span>
              <span className="text-xs text-muted-foreground">{descricao}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="grid gap-5 md:grid-cols-[1fr_15rem]">
        <div className={cn("flex flex-col gap-5", herdando && "pointer-events-none opacity-50")}>
          <fieldset className="flex flex-col gap-2" disabled={herdando}>
            <legend className="mb-1 text-sm font-medium">Tema</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {CHURCH_THEMES.map((t) => {
                const p = THEME_PALETTES[t.slug];
                const selecionado = tema === t.slug;
                return (
                  <label
                    key={t.slug}
                    className={cn(
                      "flex cursor-pointer flex-col gap-2 rounded-lg border p-2.5 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      selecionado ? "border-primary bg-primary/5" : "hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="tema-visual"
                      checked={selecionado}
                      onChange={() => setTema(t.slug)}
                      className="sr-only"
                    />
                    <span
                      className="flex h-10 items-end gap-1 rounded-md border p-1"
                      style={{ background: p["--pg-bg"] }}
                      aria-hidden
                    >
                      <span className="h-full w-1/3 rounded-sm" style={{ background: p["--pg-hero"] }} />
                      <span className="h-1/2 flex-1 rounded-sm" style={{ background: p["--pg-surface"] }} />
                      <span className="h-1/3 w-1/4 rounded-sm" style={{ background: p["--pg-accent"] }} />
                    </span>
                    <span className="flex items-center justify-between gap-1 font-medium">
                      {t.label}
                      {selecionado ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                    </span>
                    <span className="-mt-1.5 text-xs text-muted-foreground">{t.hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2" disabled={herdando}>
            <legend className="mb-1 text-sm font-medium">Cor de destaque</legend>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCor("")}
                aria-pressed={cor === ""}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                  cor === "" ? "border-primary bg-primary/10" : "hover:bg-muted",
                )}
              >
                Cor do tema
              </button>
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setCor(preset.hex)}
                  aria-label={preset.label}
                  aria-pressed={cor === preset.hex}
                  title={preset.label}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2 border-background ring-1 ring-border transition-transform hover:scale-105",
                    cor === preset.hex && "ring-2 ring-primary",
                  )}
                  style={{ background: preset.hex }}
                >
                  {cor === preset.hex ? <Check className="size-4 text-white drop-shadow" aria-hidden /> : null}
                </button>
              ))}
              <label className="flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-medium hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                Outra cor
                <input
                  type="color"
                  value={corDoSeletor}
                  onChange={(e) => setCor(e.target.value.toLowerCase())}
                  className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label="Escolher outra cor de destaque"
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Se a cor ficar difícil de ler no fundo do tema, a página ajusta o brilho sozinha.
            </p>
          </fieldset>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {herdando ? "Como está (igual à igreja-mãe)" : "Como vai ficar"}
          </span>
          <PagePreview theme={temaEmUso} accent={corEmUso} nome={igreja.name} />
        </div>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar aparência"}
        </Button>
      </div>
    </form>
  );
}
