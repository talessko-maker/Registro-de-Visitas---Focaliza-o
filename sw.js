/* ===================================================================
   SERVICE WORKER — funcionamento offline
   Guarda a página e os ícones no aparelho. Depois da primeira visita
   com internet, o formulário abre e funciona sem sinal nenhum.

   Ao publicar uma versão nova, troque o número em VERSAO. Isso apaga
   o cache antigo e força o aparelho a buscar tudo de novo.
   =================================================================== */
const VERSAO = "v7";
const CACHE_APP    = `registro-focalizacao-${VERSAO}`;
const CACHE_FONTES = `registro-focalizacao-fontes-${VERSAO}`;

/* Arquivos guardados já na instalação. */
const ESSENCIAIS = [
  "/",
  "/index.html",
  "/carteira.js",
  "/vendor-jspdf.js",
  "/relatorio.js",
  "/manifest.json",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_APP)
      /* addAll é tudo-ou-nada: um arquivo que falhe derruba a instalação
         inteira, então cada um vai por conta própria. */
      .then(c => Promise.allSettled(ESSENCIAIS.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes
          .filter(n => n !== CACHE_APP && n !== CACHE_FONTES)
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
     apareça assim que houver sinal. Sem sinal, cai no cache.

     Só o formulário é guardado. O painel e a página dos produtores
     precisam de rede para ler o banco, e guardá-los aqui sobrescreveria
     o formulário — o aparelho abriria um deles no lugar dele quando
     ficasse sem sinal. */
  if (req.mode === "navigate") {
    const ehFormulario = url.pathname === "/" || url.pathname === "/index.html";
    e.respondWith(
      fetch(req)
        .then(resp => {
          if (ehFormulario) {
            const copia = resp.clone();
            caches.open(CACHE_APP).then(c => c.put("/index.html", copia));
          }
          return resp;
        })
        .catch(async () => {
          if (ehFormulario) {
            const guardado = (await caches.match("/index.html")) ||
                             (await caches.match("/"));
            if (guardado) return guardado;
          }
          return new Response(
            "<meta charset='utf-8'><p style=\"font:16px system-ui;padding:24px\">" +
            (ehFormulario
              ? "Sem conexão e a página ainda não foi guardada neste aparelho. " +
                "Abra o site uma vez com internet."
              : "Esta página precisa de internet para ler os registros.") +
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
