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
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
