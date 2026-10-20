/*
 * Service worker do AssembleiaApp (app instalado no celular/computador).
 *
 * De propósito, ele guarda MUITO pouco:
 *   - os arquivos estáticos do Next (/_next/static/...), que têm o conteúdo
 *     no nome e nunca mudam — o app abre mais rápido;
 *   - os ícones e a página "sem conexão".
 *
 * NUNCA guarda páginas do painel nem respostas de API: ali há dados de
 * membros, e cada pessoa vê coisas diferentes. Um celular emprestado ou uma
 * conta trocada não pode mostrar a tela de outra pessoa a partir do cache.
 * Sem internet, quem abre o app vê a página "sem conexão", e só.
 *
 * Mudou este arquivo? Troque a VERSAO: o navegador instala o novo e apaga o
 * cache antigo.
 */
const VERSAO = "v1";
const CACHE = `assembleiaapp-${VERSAO}`;
const OFFLINE = "/offline.html";
const PRECARREGAR = [OFFLINE, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECARREGAR))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(nomes.filter((n) => n.startsWith("assembleiaapp-") && n !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegação (abrir uma tela): sempre da rede. Só sem internet cai na página offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Arquivos estáticos com hash no nome e os ícones: do cache, buscando na rede só na primeira vez.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (achado) =>
          achado ||
          fetch(req).then((resp) => {
            if (resp.ok) {
              const copia = resp.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copia));
            }
            return resp;
          }),
      ),
    );
  }
  // Todo o resto (páginas de dados, API, imagens de membros) passa direto, sem cache.
});
