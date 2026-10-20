import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Sem isso, `npm run dev` responde 403 a qualquer JS pedido de uma origem
   * que não seja localhost — inclusive um celular acessando pelo IP da rede
   * (ex.: http://192.168.x.x:3000). A página SSR chega normal (por isso a
   * tela parece certa), mas o bundle de JS é bloqueado, o React nunca
   * hidrata e NENHUM botão da página responde a toque — sintoma exato de
   * "os menus não abrem no mobile" ao testar pelo IP local.
   *
   * Cobre as faixas privadas de RFC 1918 (rede doméstica/escritório). O
   * matcher do Next só reconhece "*" como segmento INTEIRO — "172.2*.*.*"
   * não funciona, por isso "172.*.*.*" aqui é levemente mais amplo que o
   * bloco 172.16.0.0/12 exato (também libera 172.0-15 e 172.32-255, que não
   * são roteáveis na prática). Só vale em dev — produção (Vercel) não usa.
   */
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    // Túnel usado para testar em dev pelo domínio público (webhooks,
    // celular fora da rede local). Sem isso, o WebSocket do HMR é bloqueado
    // e o cliente de dev do Next recarrega a página inteira ao tentar
    // reconectar — o sintoma era a tela reiniciar sozinha ao digitar.
    "igrejalocal.everapps.com.br",
  ],

  /**
   * A página pública da igreja saiu de /t/<código> para /igreja/<código>: o
   * link é mais compartilhado (WhatsApp) do que digitado, e "igreja" se
   * explica sozinho. O endereço antigo segue funcionando com redirect
   * PERMANENTE — qualquer link já enviado ou QR impresso com /t/ continua
   * chegando. Este redirect não pode ser removido depois que houver material
   * impresso com o endereço antigo.
   */
  /**
   * Cabeçalhos de segurança em todas as respostas.
   *
   * A CSP aqui é de propósito a parte que NÃO depende de nonce: impede o site
   * de ser aberto dentro de outro (clickjacking), a troca do endereço-base e
   * plugins. Restringir `script-src` exige nonce por pedido (o Next injeta
   * scripts inline) e fica para quando houver necessidade — não afrouxar o
   * que está aqui para "consertar" uma tela.
   */
  async headers() {
    const cabecalhos = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      },
    ];
    // HSTS só em produção: em dev o acesso é por http (localhost e IP da rede).
    if (process.env.NODE_ENV === "production") {
      cabecalhos.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [
      { source: "/(.*)", headers: cabecalhos },
      // App instalado (PWA): o service worker é sempre conferido na rede, para
      // uma versão nova chegar no próximo acesso.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      { source: "/manifest.webmanifest", headers: [{ key: "Content-Type", value: "application/manifest+json" }] },
    ];
  },

  async redirects() {
    return [
      {
        source: "/t/:publicCode",
        destination: "/igreja/:publicCode",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
