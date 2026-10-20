import {
  CABECALHO_DOMINIO_DA_IGREJA,
  SEPARADOR_REDE,
  enderecoPublicoDaRotaInterna,
  resolverNoDominioDaRede,
  rotaInternaDaIgreja,
} from "@/lib/churchPaths";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getClientEnv } from "@/config/env";
import { createRestChurchDomainLookup } from "@/repositories/rest/churchDomainLookupRepository";
import { createHostTenantService, type HostTenantService } from "@/services/hostTenantService";

/**
 * Proxy (o "middleware" do Next 16). Duas responsabilidades, nesta ordem:
 *
 * 1. RESOLVER O TENANT PELO HOST. Se a request chegou por um domínio próprio de
 *    igreja (igrejax.com.br), ela é reescrita para a página pública daquela
 *    igreja. Endereço padrão (tagigreja.com.br/igreja/{public_code}) segue
 *    funcionando sempre — é o caminho que não depende de DNS de terceiro.
 *
 * 2. Manter a sessão Supabase renovada nos cookies e fazer a checagem OTIMISTA
 *    de auth. A autorização real (membership, papel, empresa ativa) acontece
 *    nos layouts de servidor e services — proxy nunca é a única barreira.
 */

/** Rotas que exigem usuário logado. */
const PROTECTED_PREFIXES = ["/dashboard", "/vinculo", "/nova-igreja", "/onboarding", "/invites", "/reset-password", "/accept-terms"];
/** Rotas de auth que usuário logado não deve rever. */
const AUTH_ONLY_ANONYMOUS = ["/login", "/signup", "/forgot-password"];

/**
 * Área do patrocinador: mesmo Supabase Auth, porta de entrada própria. Quem
 * não está logado vai para o login DELA — o /login da igreja levaria a
 * pessoa ao onboarding de criar empresa, que não é o caso de um patrocinador.
 */
const SPONSOR_PREFIX = "/patrocinador";
/** Telas de entrada: quem já está logado não deve revê-las. */
const SPONSOR_ANONYMOUS = ["/patrocinador/login", "/patrocinador/criar-conta"];
/**
 * Convite de patrocínio: aberto para QUALQUER UM, logado ou não. É o link que
 * o pastor divulga — exigir login aqui é perder a pessoa no impulso de ajudar.
 * A própria página decide o que mostrar conforme haja sessão.
 */
const SPONSOR_PUBLIC = ["/patrocinador/patrocinar"];

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * APP_URL lido direto do process.env: no runtime do proxy o acesso precisa ser
 * estático, então não passa pelo schema Zod de `getServerEnv()`.
 */
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Singleton preguiçoso: reaproveita o cache enquanto a instância viver, sem
 * rodar nada na carga do módulo. A doc do proxy avisa para não CONTAR com
 * estado compartilhado — e aqui não contamos: cache vazio custa uma consulta.
 */
let hostTenant: HostTenantService | undefined;

function getHostTenant(): HostTenantService {
  if (!hostTenant) {
    const env = getClientEnv();
    hostTenant = createHostTenantService({
      primaryHost: APP_URL,
      lookup: createRestChurchDomainLookup({
        supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
        anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      }),
    });
  }
  return hostTenant;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // `host` é o header que o Vercel preenche com o host realmente pedido.
  // x-forwarded-host é ignorado de propósito: vem do cliente em muitos setups.
  const host = request.headers.get("host");
  const tenantByHost = getHostTenant();

  if (!tenantByHost.isPlatformHost(host ?? "")) {
    const match = await tenantByHost.resolve(host);

    if (match) {
      // Painel, login e fluxos de auth ficam no domínio da plataforma. A igreja
      // controla o DNS do domínio dela; cookie de sessão nosso não vai para lá.
      if (isAppPath(pathname)) {
        return NextResponse.redirect(new URL(pathname + request.nextUrl.search, APP_URL), 307);
      }

      // Domínio de uma igreja do topo (sede): vale para a rede inteira. A raiz
      // é a sede, /igreja/{codigo} é uma igreja DESTA rede, e nenhuma outra
      // rede aparece aqui (regra em src/lib/churchPaths.ts).
      if (!match.publicCode.includes(SEPARADOR_REDE)) {
        const destino = resolverNoDominioDaRede(match.publicCode, pathname);
        if (destino?.acao === "redirecionar") {
          // Montado com o host PEDIDO: o redirecionamento tem que ficar no
          // domínio da rede, mesmo atrás de um proxy que troque o host interno.
          const protocolo = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
          return NextResponse.redirect(
            new URL(destino.caminho + request.nextUrl.search, `${protocolo}://${host}`),
            308,
          );
        }
        if (destino) {
          const url = request.nextUrl.clone();
          url.pathname = destino.caminho;
          return NextResponse.rewrite(url, { request: { headers: marcaDominioDaIgreja(request) } });
        }
      } else if (pathname === "/") {
        // Domínio de uma igreja que está abaixo de outra: só a página dela.
        const url = request.nextUrl.clone();
        url.pathname = `/igreja/${match.publicCode}`;
        return NextResponse.rewrite(url, { request: { headers: marcaDominioDaIgreja(request) } });
      }
    }

    // Host desconhecido, domínio ainda não ativo ou lookup indisponível: segue
    // o fluxo normal. Nunca respondemos erro por causa do domínio próprio.
  }

  // Página de igreja que está numa rede: o endereço é /igreja/{rede}/{codigo},
  // e a rota do App Router é uma pasta só, com a chave "rede~codigo". Quem
  // abre a rota interna direto volta para o endereço público.
  const enderecoPublico = enderecoPublicoDaRotaInterna(pathname);
  if (enderecoPublico) {
    const url = request.nextUrl.clone();
    url.pathname = enderecoPublico;
    return NextResponse.redirect(url, 308);
  }
  const rotaInterna = rotaInternaDaIgreja(pathname);
  if (rotaInterna) {
    const url = request.nextUrl.clone();
    url.pathname = rotaInterna;
    return NextResponse.rewrite(url);
  }

  let response = NextResponse.next({ request });

  const env = getClientEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims valida o JWT localmente (rápido) e renova a sessão se preciso.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  const isSponsorArea = matchesRoute(pathname, SPONSOR_PREFIX);
  const isSponsorAnonymous = SPONSOR_ANONYMOUS.some((route) => matchesRoute(pathname, route));
  const isSponsorPublic = SPONSOR_PUBLIC.some((route) => matchesRoute(pathname, route));

  if (isSponsorArea) {
    if (isSponsorPublic) {
      return response;
    }
    if (!isAuthenticated && !isSponsorAnonymous) {
      const url = request.nextUrl.clone();
      url.pathname = `${SPONSOR_PREFIX}/login`;
      url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
    if (isAuthenticated && isSponsorAnonymous) {
      const url = request.nextUrl.clone();
      url.pathname = SPONSOR_PREFIX;
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (!isAuthenticated && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && AUTH_ONLY_ANONYMOUS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

/** Rotas de aplicação (autenticadas ou de auth), que só existem no host padrão. */
/**
 * Avisa a página que ela está sendo servida no domínio PRÓPRIO de uma igreja
 * (o endereço que a pessoa vê não é a rota interna). A página usa isso só para
 * saber onde o app instalado da igreja deve abrir. Quem forjar o cabeçalho no
 * endereço da plataforma só muda o próprio app — não há o que explorar.
 */
function marcaDominioDaIgreja(request: NextRequest): Headers {
  const h = new Headers(request.headers);
  h.set(CABECALHO_DOMINIO_DA_IGREJA, "1");
  return h;
}

function isAppPath(pathname: string): boolean {
  return [...PROTECTED_PREFIXES, ...AUTH_ONLY_ANONYMOUS, "/auth", "/admin", SPONSOR_PREFIX].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const config = {
  // Tudo, exceto estáticos, o webhook de pagamento (autenticado por assinatura)
  // e o cron de domínios (autenticado por CRON_SECRET).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline.html|api/igreja-app|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
