/* ===================================================================
   SERVICE WORKER — funcionamento offline
   Guarda a página e os ícones no aparelho. Depois da primeira visita
   com internet, o formulário abre e funciona sem sinal nenhum.

   Ao publicar uma versão nova, troque o número em VERSAO. Isso apaga
   o cache antigo e força o aparelho a buscar tudo de novo.
   =================================================================== */
const VERSAO = "v25";
const CACHE_APP    = `registro-focalizacao-${VERSAO}`;
const CACHE_FONTES = `registro-focalizacao-fontes-${VERSAO}`;
/* Manuais (MIP) marcados como "Disponibilizar offline" na própria
   página. Quem põe e tira daqui é a página; este arquivo só serve e
   atualiza. */
const CACHE_MIP    = "mip-offline";

/* Páginas do app: endereço pedido -> chave em que a cópia fica guardada.
   Todas entram já na instalação, para abrirem sem sinal mesmo que a
   pessoa nunca as tenha visitado com internet. */
const PAGINAS = {
  "/":                "/index.html",
  "/index.html":      "/index.html",
  "/painel.html":     "/painel.html",
  "/painel":          "/painel.html",
  "/acoes.html":      "/acoes.html",
  "/acoes":           "/acoes.html",
  "/produtores.html": "/produtores.html",
  "/produtores":      "/produtores.html",
  "/gestao.html":     "/gestao.html",
  "/gestao":          "/gestao.html"
};

/* Arquivos guardados já na instalação. */
const ESSENCIAIS = [
  "/index.html",
  "/painel.html",
  "/acoes.html",
  "/produtores.html",
  "/gestao.html",
  "/sessao.js",
  "/avaliador.js",
  "/carteira.js",
  "/barra.js",
  "/barra.css",
  "/vendor-jspdf.js",
  "/relatorio.js",
  "/manifest.json",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png"
];

/* Busca e guarda um arquivo. Se o servidor redirecionou, guarda uma
   cópia sem a marca de redirecionamento: o Safari se recusa a abrir uma
   página servida assim pelo service worker. */
async function guardaLimpo(cache, u) {
  const r = await fetch(u, { cache: "reload" });
  if (!r.ok) throw new Error(u + ": " + r.status);
  const limpo = r.redirected
    ? new Response(await r.blob(), { status: 200, headers: r.headers })
    : r;
  await cache.put(u, limpo);
}

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_APP)
      /* addAll é tudo-ou-nada: um arquivo que falhe derruba a instalação
         inteira, então cada um vai por conta própria. */
      .then(c => Promise.allSettled(ESSENCIAIS.map(u => guardaLimpo(c, u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes
          /* "mip-offline" é dos manuais que o usuário escolheu guardar:
             não depende da VERSAO e não pode sumir numa atualização. */
          .filter(n => n !== CACHE_APP && n !== CACHE_FONTES && n !== CACHE_MIP)
          .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/* Serve o que está guardado na hora e busca a versão nova por trás.
   type "opaque" são as respostas sem CORS: dá para guardar, só não dá
   para inspecionar. */
function cacheEDepoisRede(nomeCache, req) {
  return caches.open(nomeCache).then(async cache => {
    const guardado = await cache.match(req);
    const rede = fetch(req).then(resp => {
      if (resp.ok || resp.type === "opaque") cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);
    return guardado || rede || Response.error();
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  /* Os envios ao Supabase são POST: passam direto, e quem cuida deles
     sem sinal é a fila do próprio formulário. */
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* Fontes do Google: serve do cache na hora e atualiza por trás.
     Sem isso o Poppins some quando não há sinal. */
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheEDepoisRede(CACHE_FONTES, req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* A página em si: tenta a rede primeiro, para que um deploy novo
     apareça assim que houver sinal. Sem sinal, cai na cópia guardada.

     Cada página do app é guardada com o próprio endereço (PAGINAS), para
     que, sem sinal, o aparelho abra a página pedida — e não o formulário
     no lugar dela. Sem internet o painel, as ações e os produtores abrem
     normalmente; só os dados do banco esperam o sinal voltar. */
  if (req.mode === "navigate") {
    const pagina = PAGINAS[url.pathname];
    /* Os manuais só ficam guardados se o usuário marcou "Disponibilizar
       offline"; nesse caso a cópia é renovada a cada abertura com sinal. */
    const ehManual = url.pathname.startsWith("/mip-");
    e.respondWith(
      fetch(req)
        .then(resp => {
          /* Resposta que veio de redirecionamento não pode ser servida de
             volta numa navegação (o Safari recusa), então não é guardada. */
          if (pagina && resp.ok && !resp.redirected) {
            const copia = resp.clone();
            caches.open(CACHE_APP).then(c => c.put(pagina, copia));
          }
          if (ehManual && resp.ok && !resp.redirected) {
            const copia = resp.clone();
            caches.open(CACHE_MIP).then(async c => {
              if (await c.match(url.pathname)) c.put(url.pathname, copia);
            });
          }
          return resp;
        })
        .catch(async () => {
          if (pagina) {
            const guardado = await (await caches.open(CACHE_APP)).match(pagina);
            if (guardado) return guardado;
          }
          if (ehManual) {
            const guardado = await (await caches.open(CACHE_MIP)).match(url.pathname);
            if (guardado) return guardado;
          }
          return new Response(
            "<meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>" +
            "<p style=\"font:16px system-ui;padding:24px\">" +
            (ehManual
              ? "Sem conexão. Este manual não foi marcado como “Disponibilizar " +
                "offline” neste aparelho. Abra com internet e ligue a opção."
              : "Sem conexão e esta página ainda não foi guardada neste aparelho. " +
                "Abra o app uma vez com internet.") +
            "</p><p style=\"font:16px system-ui;padding:0 24px\"><a href='/'>Voltar ao registro</a></p>" +
            "</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
    return;
  }

  /* Os arquivos do relatório (jsPDF e o desenho do PDF): servem do
     cache na hora e atualizam por trás. Sem isso, uma mudança no layout
     do relatório só chegaria ao aparelho quando VERSAO mudasse. */
  if (url.pathname.endsWith(".js")) {
    e.respondWith(cacheEDepoisRede(CACHE_APP, req));
    return;
  }

  /* Ícones e demais arquivos: cache primeiro, que não mudam quase nunca. */
  e.respondWith(
    caches.match(req).then(guardado =>
      guardado ||
      fetch(req).then(resp => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE_APP).then(c => c.put(req, copia));
        }
        return resp;
      })
    )
  );
});
