import { Compass, MapPin, Navigation, Search } from "lucide-react";

/**
 * Seção "sua igreja, visível no mapa" da landing.
 *
 * O público desta seção é quem CONTRATA a plataforma (a liderança da igreja),
 * não quem procura uma comunidade — a home vende para quem decide adquirir,
 * então o mockup mostra a própria igreja aparecendo numa busca de terceiros,
 * como benefício futuro, não uma ferramenta de busca para o visitante usar
 * agora. Duas decisões deliberadas seguem valendo:
 *
 * 1. O mapa é um SVG desenhado aqui, não Leaflet/Mapbox. Evita dependência
 *    nova (regra do CLAUDE.md), request externo e chave de API numa tela que
 *    ainda não consulta igreja nenhuma. Quando o diretório existir de verdade,
 *    troca-se este bloco por um mapa real sem mexer no resto da seção.
 * 2. Nada aqui é clicável nem focável. Campo de busca que não busca e pino que
 *    não abre nada seriam beco sem saída — o rótulo "em breve" diz o que é.
 *
 * Segue a paleta CHAPADA da landing (que é light-only), não os tokens de tema.
 */

/**
 * Exemplos ilustrativos de vizinhança — quando o diretório existir, vêm do
 * banco. A primeira é a igreja do visitante da landing (destacada no mapa e
 * na lista); as outras só dão contexto de "bairro cheio de igrejas".
 */
const nearbyChurches = [
  { name: "Comunidade Esperança", area: "Centro", distance: "1,2 km", isYou: true },
  { name: "Igreja Vida Nova", area: "Jardim das Flores", distance: "2,8 km", isYou: false },
  { name: "Betel Bairro Industrial", area: "Zona Norte", distance: "4,1 km", isYou: false },
];

/** Pino de mapa. `highlight` marca a igreja em destaque no centro. */
function MapPinShape({
  x,
  y,
  highlight = false,
}: {
  x: number;
  y: number;
  highlight?: boolean;
}) {
  return (
    <g>
      <ellipse cx={x} cy={y + 2} rx={7} ry={2.5} fill="#243128" opacity={0.12} />
      <path
        d={`M ${x} ${y} L ${x - 8} ${y - 16} A 10 10 0 1 1 ${x + 8} ${y - 16} Z`}
        fill={highlight ? "#c39a3a" : "#41694b"}
      />
      <circle cx={x} cy={y - 21} r={4} fill={highlight ? "#f8f1dd" : "#eef2e8"} />
    </g>
  );
}

export function ChurchFinderPreview() {
  return (
    <section
      id="sua-igreja-no-mapa"
      className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-24"
    >
      <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[#a48432] uppercase">
            Visibilidade para sua igreja
          </p>
          <h2 className="mt-4 max-w-md text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#243128] sm:text-4xl">
            Sua igreja, no mapa de quem está procurando uma comunidade.
          </h2>
          <p className="mt-5 max-w-sm leading-7 text-[#718075]">
            Quem muda de cidade, quem está voltando a frequentar ou quem nunca
            entrou em uma igreja costuma começar a busca no mapa. Em breve, sua
            igreja vai aparecer ali — com endereço, horário de culto e um
            caminho claro até a porta.
          </p>

          <ul className="mt-7 flex flex-col gap-3 text-sm text-[#4c6653]">
            {[
              [MapPin, "Sua igreja visível para quem está por perto"],
              [Compass, "Horários de culto sempre à mão, sem ninguém precisar ligar"],
              [Navigation, "Rota direta até a porta, sem confusão para quem chega"],
            ].map(([Icon, label]) => (
              <li key={label as string} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#edf3e9] text-[#41694b]">
                  <Icon className="size-3.5" />
                </span>
                {label as string}
              </li>
            ))}
          </ul>

          <p className="mt-7 max-w-sm text-xs leading-5 text-[#89938a]">
            O diretório está em construção. Por enquanto, é a página pública da
            sua igreja que já reúne tudo isso — e será ela a alimentar o mapa
            quando estiver no ar.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-[#d8e1d3] bg-white p-5 shadow-[0_20px_50px_rgba(43,67,47,0.08)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-[#89938a]">
              Assim é que alguém encontraria a sua igreja
            </p>
            <span className="shrink-0 rounded-full bg-[#f3ebd5] px-3 py-1 text-xs font-semibold text-[#79632c]">
              Em breve
            </span>
          </div>

          {/* Visual de busca, não um campo de verdade: sem input, sem foco. É a
              busca de UM VISITANTE — quem olha este mockup é a igreja, vendo
              como apareceria para quem procura. */}
          <div
            aria-hidden
            className="mt-4 flex min-w-0 items-center gap-2.5 rounded-xl border border-[#e5ebe1] bg-[#f7f8f5] px-3.5 py-2.5 text-sm text-[#9aa39c]"
          >
            <Search className="size-4 shrink-0 text-[#b3bbb4]" />
            <span className="truncate">Igrejas perto de você</span>
          </div>

          <div className="relative mt-5 overflow-hidden rounded-2xl border border-[#e5ebe1]">
            <svg
              viewBox="0 0 400 250"
              role="img"
              aria-label="Ilustração de um mapa mostrando sua igreja em destaque entre outras igrejas próximas"
              className="block h-auto w-full"
            >
              <rect width="400" height="250" fill="#eef2e8" />

              {/* Quarteirões: dão textura de cidade sem virar ruído. */}
              <g fill="#e4ebdb">
                <rect x="14" y="14" width="120" height="76" rx="8" />
                <rect x="152" y="14" width="96" height="76" rx="8" />
                <rect x="266" y="14" width="120" height="50" rx="8" />
                <rect x="14" y="108" width="120" height="60" rx="8" />
                <rect x="152" y="108" width="96" height="60" rx="8" />
                <rect x="266" y="108" width="120" height="60" rx="8" />
                <rect x="14" y="186" width="120" height="50" rx="8" />
                <rect x="152" y="186" width="234" height="50" rx="8" />
              </g>

              {/* Praça e lago: pontos de referência que o olho reconhece. */}
              <circle cx="74" cy="211" r="22" fill="#d5e3c8" />
              <path
                d="M266 14 q40 18 62 6 q34 -18 58 4 l0 40 q-30 14 -60 2 q-32 -12 -60 8 z"
                fill="#dbe7e6"
              />

              {/* Vias */}
              <g stroke="#fbfcf9" strokeLinecap="round">
                <path d="M0 99 H400" strokeWidth="11" />
                <path d="M0 177 H400" strokeWidth="11" />
                <path d="M143 0 V250" strokeWidth="11" />
                <path d="M257 0 V250" strokeWidth="11" />
                <path d="M0 40 L400 128" strokeWidth="7" opacity="0.85" />
              </g>

              {/* Raio de busca a partir da igreja em destaque. */}
              <circle
                cx="200"
                cy="138"
                r="78"
                fill="#41694b"
                fillOpacity="0.05"
                stroke="#41694b"
                strokeOpacity="0.28"
                strokeWidth="1.5"
                strokeDasharray="5 6"
              />

              <MapPinShape x={200} y={138} highlight />
              <MapPinShape x={92} y={72} />
              <MapPinShape x={318} y={196} />
              <MapPinShape x={300} y={86} />
            </svg>

            {/* Cartão flutuante: o pino em destaque É a igreja do visitante da
                landing — quem compra vê a própria igreja no papel de quem é
                encontrada. Some no mobile: lá o mapa tem ~190px de altura, o
                cartão cobria quase metade dele e os pinos, e a lista abaixo já
                traz a mesma igreja. */}
            <div className="absolute bottom-3 left-3 hidden w-[min(21rem,calc(100%-1.5rem))] items-center gap-3 rounded-xl border border-[#e5ebe1] bg-white/95 px-3.5 py-3 shadow-[0_10px_28px_rgba(40,63,45,0.12)] backdrop-blur-sm sm:flex">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f3ebd5] text-[#a48432]">
                <MapPin className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#35463a]">
                    Comunidade Esperança
                  </p>
                  <span className="shrink-0 rounded-full bg-[#edf3e9] px-2 py-0.5 text-[10px] font-semibold text-[#41694b]">
                    Sua igreja
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[#89938a]">
                  Domingo, 09h e 18h · 1,2 km de quem buscou
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 text-xs font-medium text-[#89938a]">
            Resultado da busca
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-[#edf0ea] border-t border-[#edf0ea]">
            {nearbyChurches.map(({ name, area, distance, isYou }) => (
              <li
                key={name}
                className={`flex items-center justify-between gap-3 py-3 ${isYou ? "-mx-2 rounded-lg bg-[#f7f8f5] px-2" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-[#35463a]">
                      {name}
                    </p>
                    {isYou ? (
                      <span className="shrink-0 rounded-full bg-[#edf3e9] px-2 py-0.5 text-[10px] font-semibold text-[#41694b]">
                        Sua igreja
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#89938a]">
                    {area}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-[#41694b]">
                  {distance}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
