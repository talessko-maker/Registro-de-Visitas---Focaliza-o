/* ===================================================================
   BARRA DE NAVEGAÇÃO — monta as abas (PC), a barra de baixo e a folha
   do "Mais" (celular) a partir do <header class="tb" data-pagina="...">.
   O visual está em /barra.css.

   Para incluir ou tirar uma página, edite só PAGINAS. Carregue este
   arquivo logo depois do </header>.
   =================================================================== */
(function () {
  const CALCULADORA = "https://calculadora-acessa-agro.vercel.app/";

  const ICONE = {
    registro: '<path d="M3 14.8V12l8.2-8.2a1.6 1.6 0 012.3 0l.6.6a1.6 1.6 0 010 2.3L5.9 15H3.2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 5l3 3" stroke="currentColor" stroke-width="1.5"/>',
    produtores: '<circle cx="9" cy="6" r="2.8" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 15.5c.6-2.9 2.8-4.6 5.5-4.6s4.9 1.7 5.5 4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    acoes: '<rect x="2.5" y="2.5" width="13" height="13" rx="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.8 9.2l2.2 2.2 4.3-4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    painel: '<rect x="2.5" y="2.5" width="5.5" height="7" rx="1.3" stroke="currentColor" stroke-width="1.5"/><rect x="10" y="2.5" width="5.5" height="4" rx="1.3" stroke="currentColor" stroke-width="1.5"/><rect x="2.5" y="11.5" width="5.5" height="4" rx="1.3" stroke="currentColor" stroke-width="1.5"/><rect x="10" y="8.5" width="5.5" height="7" rx="1.3" stroke="currentColor" stroke-width="1.5"/>',
    gestao: '<path d="M3 15.5V9M7 15.5V5M11 15.5v-4M15 15.5V3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    calculadora: '<rect x="3.5" y="2" width="11" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M6 5.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6.5 9h.01M9 9h.01M11.5 9h.01M6.5 12.5h.01M9 12.5h.01M11.5 12.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    sair: '<path d="M7 2.5H4A1.5 1.5 0 002.5 4v10A1.5 1.5 0 004 15.5h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M11 12.5L14.5 9 11 5.5M14.5 9H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    mais: '<circle cx="3.5" cy="9" r="1.5" fill="currentColor"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="14.5" cy="9" r="1.5" fill="currentColor"/>'
  };
  const svg = (nome, tam = 18) =>
    `<svg width="${tam}" height="${tam}" viewBox="0 0 18 18" fill="none" aria-hidden="true">${ICONE[nome]}</svg>`;
  const externo =
    '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M8 2h4v4M12 2L6.5 7.5M10.5 8.5V12H2V3.5h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* id, endereço, nome na aba, nome curto na barra de baixo, e se
     aparece na barra de baixo (as outras vão para o "Mais"). */
  const PAGINAS = [
    ["registro",   "/",                "Registro",   "Registrar",  true],
    ["produtores", "/produtores.html", "Produtores", "Produtores", true],
    ["acoes",      "/acoes.html",      "Ações",      "Ações",      true],
    ["painel",     "/painel.html",     "Painel",     "Painel",     true],
    ["gestao",     "/gestao.html",     "Gestão",     "Gestão",     false]
  ];

  const header = document.querySelector("header.tb");
  if (!header) return;
  const atual = header.dataset.pagina;
  const marca = id => id === atual ? ' aria-current="page"' : "";

  /* --- PC: abas --- */
  const abas = header.querySelector(".tb-abas");
  if (abas) {
    abas.innerHTML = PAGINAS.map(([id, href, nome]) =>
      `<a href="${href}"${marca(id)}>${svg(id)}${nome}</a>`).join("");
  }

  /* --- celular: barra de baixo --- */
  const foraDaBarra = PAGINAS.filter(p => !p[4]);
  const maisAtivo = foraDaBarra.some(p => p[0] === atual);
  const baixo = document.createElement("nav");
  baixo.className = "tb-baixo";
  baixo.setAttribute("aria-label", "Páginas");
  baixo.innerHTML = PAGINAS.filter(p => p[4]).map(([id, href, , curto]) =>
      `<a href="${href}"${marca(id)}${id === "registro" ? ' class="registrar"' : ""}>
        <span class="ic">${svg(id)}</span>${curto}</a>`).join("")
    + `<button type="button" id="tb-mais" aria-expanded="false" aria-controls="tb-folha"
        ${maisAtivo ? 'aria-current="page"' : ""}>
        <span class="ic">${svg("mais", 20)}</span>Mais</button>`;

  /* --- celular: folha do "Mais" --- */
  const veu = document.createElement("div");
  veu.className = "tb-veu";
  const folha = document.createElement("div");
  folha.className = "tb-folha";
  folha.id = "tb-folha";
  folha.setAttribute("role", "dialog");
  folha.setAttribute("aria-label", "Mais opções");
  folha.innerHTML = `<div class="puxa" aria-hidden="true"></div>
    ${foraDaBarra.map(([id, href, nome]) =>
      `<a href="${href}"${marca(id)}>${svg(id)}${nome}</a>`).join("")}
    <a href="${CALCULADORA}" target="_blank" rel="noopener">${svg("calculadora")}Calculadora AcessaAgro ${externo}</a>
    <div class="tb-sair" hidden><hr>
      <button type="button" class="sai">${svg("sair")}Sair <small></small></button></div>`;

  header.after(baixo, veu, folha);

  const btnMais = baixo.querySelector("#tb-mais");
  function abre(sim) {
    document.body.classList.toggle("tb-aberto", sim);
    btnMais.setAttribute("aria-expanded", String(sim));
    if (sim) {
      /* O "Sair" só aparece quando a página tem alguém logado. */
      const sessao = document.getElementById("sessao");
      const logado = !!sessao && !sessao.hidden;
      folha.querySelector(".tb-sair").hidden = !logado;
      if (logado) {
        folha.querySelector(".sai small").textContent =
          (document.getElementById("quem-entrou") || {}).textContent || "";
      }
    }
  }
  btnMais.addEventListener("click", () =>
    abre(!document.body.classList.contains("tb-aberto")));
  veu.addEventListener("click", () => abre(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") abre(false); });
  folha.querySelector(".sai").addEventListener("click", () => {
    abre(false);
    const sair = document.getElementById("btn-sair");
    if (sair) sair.click();
  });
})();
