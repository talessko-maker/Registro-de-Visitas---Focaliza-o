/* ===================================================================
   AVALIADOR — qualidade dos relatórios de visita (5W2H)

   Lê cada relatório gravado no banco — Focalização e Terra Forte, que
   gravam os mesmos campos — e devolve nota de 0 a 100, classe (A, B, C
   ou D), nota por dimensão, o que faltou (pendências, em linguagem para
   o consultor) e os alertas para a auditoria do gestor técnico.

   Pontua informação útil e verificável, nunca o tamanho do texto.

   Adaptado do avaliador-relatorio.js ao que os formulários gravam hoje.
   Os campos que o 5W2H pede e o formulário não tem são lidos do texto:
     cultura e estádio ......... da descrição
     problema e nível .......... da descrição
     produto, dose e momento ... da descrição + ação combinada
     próximo passo ............. ação combinada + prazo da ação
     evidência ................. quantidade de fotos (o formulário não
                                 grava GPS nem data da foto)
     pontualidade .............. DESLIGADA por enquanto (USAR_PONTUALIDADE);
                                 quando ligada: data da visita x hora em que
                                 o celular fechou o registro (registrado_em)
   Área (ha) não é pedida no formulário; no lugar dela a completude
   conta a cultura mencionada no texto.

   Para ajustar a régua, mexa em PESOS, CLASSES, CONFIG e nos
   dicionários. A página de Gestão mostra onde os relatórios perdem
   ponto, para servir de base a esse ajuste.
   =================================================================== */
(function (raiz) {
  /* Pontualidade desligada por enquanto (pedido de 14/11/2026). Para
     religar, troque para true: ela volta a valer 5 pontos, a aparecer na
     Gestão e a gerar a pendência de registrar até o dia seguinte. */
  const USAR_PONTUALIDADE = false;

  const PESOS = {
    completude: 20,     // produtor, município, talhão, data, cultura (3 cada) + estádio (5)
    diagnostico: 25,    // problema identificado (10) + nível quantificado (15)
    recomendacao: 25,   // produto (8) + dose (9) + momento (8), ou "sem ação" justificada (25)
    evidencia: 15,      // 1 foto (12), 2 ou mais (15)
    encaminhamento: 10, // ação combinada com prazo
    ...(USAR_PONTUALIDADE ? { pontualidade: 5 } : {})  // registro fechado até 24 h depois do dia da visita
  };
  /* A nota final é sempre de 0 a 100: a soma das partes ligadas é
     convertida para essa escala (sem a pontualidade, o máximo é 95). */
  const MAXIMO = Object.values(PESOS).reduce((a, b) => a + b, 0);

  const NOMES = {
    completude: "Completude", diagnostico: "Diagnóstico", recomendacao: "Recomendação",
    evidencia: "Evidência", encaminhamento: "Encaminhamento", pontualidade: "Pontualidade"
  };

  const CLASSES = [
    { min: 85, classe: "A", rotulo: "Excelente" },
    { min: 70, classe: "B", rotulo: "Bom" },
    { min: 50, classe: "C", rotulo: "Regular" },
    { min: 0,  classe: "D", rotulo: "Insuficiente" }
  ];

  const CONFIG = {
    prazoProximoPassoDias: 45,  // prazo da ação até 45 dias depois da visita
    limiteTextoCopiado: 0.8     // similaridade com relatório anterior da mesma pessoa
  };

  /* ---------- dicionários (sem acento, minúsculos) ----------
     Ampliar com a realidade da região. Cada termo é procurado como
     palavra inteira (ou começo de palavra, quando termina em *). */
  const ALVOS = {
    praga: ["lagarta*", "percevejo*", "pulgao", "pulgoes", "cigarrinha*", "mosca-branca", "mosca branca",
      "tripes", "acaro*", "helicoverpa", "spodoptera", "diabrotica", "vaquinha*", "broca*", "lesma*",
      "coro", "coros", "tamandua", "elasmo", "caramujo*", "cascudinho*", "bicudo", "gorgulho*",
      "falsa-medideira", "falsa medideira", "anticarsia", "chrysodeixis", "praga*", "inseto*"],
    doenca: ["ferrugem", "mancha*", "oidio", "antracnose", "mofo", "giberela", "brusone", "cercospor*",
      "septoria", "podridao", "mildio", "nematoide*", "enfezamento", "helmintospor*", "fusari*",
      "rhizoctonia", "tombamento", "phytophthora", "bacteriose", "virose", "cancro", "esclerotinia",
      "sclerotinia", "ramularia", "turcicum", "doenca*", "fungo*", "lesao", "lesoes"],
    daninha: ["buva", "amargoso", "azevem", "caruru", "picao", "corda-de-viola", "corda de viola", "leiteiro",
      "trapoeraba", "daninha*", "tiguera", "papua", "nabo", "capim*", "pe-de-galinha", "pe de galinha",
      "guanxuma", "invasora*", "mato", "matocompeticao"],
    nutricional: ["deficiencia*", "clorose", "potassio", "nitrogenio", "enxofre", "boro", "manganes", "zinco",
      "fosforo", "magnesio", "calcio", "cobre", "molibdenio", "acidez", "saturacao", "calagem",
      "analise de solo", "amarelecimento", "fertilidade"],
    estresse: ["deficit hidrico", "seca", "estiagem", "geada", "granizo", "encharcamento", "fitotox*",
      "compactacao", "acamamento", "veranico", "alagamento", "enxurrada", "erosao", "deriva", "estresse"],
    estande: ["estande", "germinacao", "emergencia", "falha*", "plantabilidade", "populacao", "replantio"]
  };

  /* Produtos e princípios ativos mais citados na região. Basta um para
     contar como produto indicado. Classe sozinha ("fungicida") vale meio. */
  const PRODUTOS = ["virestina", "invencis", "plinazolin", "victrato", "tymirium", "alade", "verdavis",
    "adepidyn", "mitrion", "seeker", "elatus", "priori*", "engeo*", "ampligo", "fortenza", "cruiser",
    "maxim", "vertimec", "actara", "karate", "polo", "score", "amistar", "cypress", "miravis", "orondis",
    "revus", "ridomil", "kaiso", "boral", "primoleo", "primestra", "dual", "gesaprim", "callisto",
    "fusilade", "gramoxone", "reglone", "touchdown", "zapp", "tilt", "bravonil", "cercobin", "moddus",
    "avicta", "clariva", "apron", "vibrance", "chess", "fox", "sphere", "aproach", "opera", "orkestra",
    "ativum", "cronnos", "unizeb", "connect", "galil", "perito", "curbix", "belt", "premio", "intrepid",
    "lannate", "roundup", "select", "standak", "fortenza", "nativo", "abacus", "blavity", "evolution",
    "azoxistrobina", "tebuconazol*", "protioconazol*", "ciproconazol*", "picoxistrobina", "trifloxistrobina",
    "fluxapiroxade", "benzovindiflupir", "mancozeb*", "clorotalonil", "lambda-cialotrina", "lambdacialotrina",
    "tiametoxam", "imidacloprid*", "acefato", "bifentrina", "clorantraniliprol*", "espinetoram", "metomil",
    "abamectina", "glifosato", "cletodim", "haloxifop*", "atrazina", "mesotriona", "2,4-d", "dicamba",
    "ureia", "kcl", "cloreto de potassio", "superfosfato", "calcario", "gesso", "inoculante*",
    "bradyrhizobium", "azospirillum", "adjuvante", "oleo mineral", "micronutriente*", "biologico*",
    "bacillus", "trichoderma"];
  const CLASSES_PRODUTO = ["fungicida*", "inseticida*", "herbicida*", "nematicida*", "acaricida*",
    "adubo*", "adubacao", "fertilizante*", "foliar*", "dessecacao", "dessecante*", "tratamento de semente*",
    "cobertura"];

  const CULTURAS = ["soja", "milho", "trigo", "feijao", "cevada", "aveia", "canola", "fumo", "tabaco",
    "sorgo", "erva-mate", "erva mate", "pastagem", "azevem"];

  /* "mosca-branca" acha também "mosca branca" e "moscabranca"; o * no fim
     aceita qualquer final ("lagarta*" acha lagartas). */
  const termo = t => t.replace(/[.+?^${}()|[\]\\]/g, m => "\\" + m)
                      .replace(/[ -]/g, "[ -]?").replace(/\*$/, "[a-z]*");
  const lista = ts => new RegExp("(^|[^a-z0-9])(" + ts.map(termo).join("|") + ")(?![a-z0-9])");
  const RX_ALVO = Object.fromEntries(Object.entries(ALVOS).map(([k, v]) => [k, lista(v)]));
  const RX_PRODUTO = lista(PRODUTOS);
  const RX_CLASSE_PRODUTO = lista(CLASSES_PRODUTO);
  const RX_CULTURA = lista(CULTURAS);

  const RX = {
    nivelNumerico: /\d+([.,]\d+)?\s*(%|por cento|por (metro|m|planta|pano|batida|ponto|m2)|\/\s?(m|m2|planta|pano|batida|ponto|ha)|lagartas?|percevejos?|insetos?|adultos?|ninfas?|plantas?|folhas?|pontos?)/,
    nivelTecnico: /(severidade|incidencia|nota \d|escala|nivel de (controle|dano|acao)|\bnc\b|\bnde\b|desfolha)/,
    nivelVago: /\b(baixa|baixo|media|medio|alta|alto|leve|moderad[ao]|sever[ao]|forte|inicio de|pouc[ao]s?|muit[ao]s?)\b/,
    formulacao: /\b[a-z]{3,}\s*\d+\s?(ec|sc|wg|sl|ew|od|cs|wp|fs|ce|gr)\b/,
    dose: /\d+([.,]\d+)?\s*(l|lt|litros?|ml|kg|g|gramas?|t|ton|sc|sacos?)\s*(p\.?c\.?|de p\.?c\.?|i\.?a\.?)?\s*(\/|por)\s*(ha|hectare|alqueire|100\s?kg)/,
    momento: /(imediat|hoje|amanha|esta semana|proxima semana|em ate \d+ dias?|\d+ dias|antes d[aoe]|apos|depois d[aoe]|no estadio|\b(v|r)\d|\bvt\b|pre-?(semeadura|emergen|plantio)|pos-?emergen|proxim[ao] (aplicacao|entrada|visita)|quando|na janela|junto com|ate (o )?dia|\b\d{1,2}\/\d{1,2}\b|no plantio|na semeadura|na dessecacao|florescimento|fechamento)/,
    semAcao: /(sem (necessidade de )?(acao|aplicacao|intervencao|controle)|nao (ha necessidade|necessita|recomend|justifica)|apenas monitorar|seguir monitorando|manter (o )?monitoramento|continuar monitorando)/,
    justificativaSemAcao: /(abaixo d[oe] (nivel|nc|nde)|nivel de (controle|dano)|\d+([.,]\d+)?\s*(%|\/|por))/,
    semProblema: /(sem (praga|doenca|problema|ocorrencia|incidencia|sintoma)s?|sanidade (boa|ok)|livre de|nao (foi )?(encontrad|observad|constatad)|ausencia de)/,
    generico: /(tudo (ok|certo|bem|tranquilo)|lavoura (bonita|boa|linda|top|otima)|sem novidades|nada a declarar|\bnormal\b|visita de rotina)/,
    estadioCodigo: /(^|[^a-z0-9])(ve|vc|v\d{1,2}|vn|vt|r[1-9](\.\d)?)(?![a-z0-9])/,
    estadioZadoks: /(\bz\s?\d{2}\b|zadoks)/,
    estadioPalavra: /(emergencia|florescimento|floracao|enchimento de graos?|maturacao|maturidade|perfilhamento|emborrachamento|espigamento|pendoamento|embonecamento|vegetativo|reprodutivo|plantul|colheita|pre-?colheita|dessecacao)/
  };

  /* ---------- utilitários ---------- */
  const norm = s => (s || "").toString().toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

  function shingles(texto, n = 3) {
    const p = norm(texto).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    const s = new Set();
    for (let i = 0; i + n <= p.length; i++) s.add(p.slice(i, i + n).join(" "));
    return s;
  }
  function similaridade(A, B) {
    if (A.size < 5 || B.size < 5) return 0;   /* curto demais para comparar */
    let inter = 0;
    A.forEach(x => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  /* ---------- leitura do texto ---------- */
  function lerTexto(v) {
    const desc = norm(v.descricao);
    const acao = norm(v.acao);
    const tudo = `${desc} ${acao}`;

    const alvos = Object.keys(RX_ALVO).filter(k => RX_ALVO[k].test(desc));
    let nivel = "ausente";
    if (RX.nivelNumerico.test(desc) || RX.nivelTecnico.test(desc)) nivel = "quantificado";
    else if (RX.nivelVago.test(desc)) nivel = "vago";

    const produtoNome = RX_PRODUTO.test(tudo) || RX.formulacao.test(tudo);
    const semAcao = RX.semAcao.test(tudo);
    const semProblema = RX.semProblema.test(desc);
    const cultura = (tudo.match(RX_CULTURA) || [])[2] || "";

    return {
      alvos,
      nivel,
      /* "sem ocorrência de doenças" cita "doença" mas é ausência de
         problema; com nível quantificado, vale o problema. */
      semProblema: semProblema && nivel !== "quantificado",
      cultura: cultura.replace(/ /g, "-"),
      estadio: (RX.estadioCodigo.exec(desc) || [])[2] ||
               ((RX.estadioZadoks.exec(desc) || [])[0]) ||
               ((RX.estadioPalavra.exec(desc) || [])[0]) || "",
      produto: produtoNome ? "nome" : RX_CLASSE_PRODUTO.test(tudo) ? "classe" : "",
      dose: RX.dose.test(tudo),
      momento: RX.momento.test(tudo) || !!v.prazo_acao,
      semAcao,
      semAcaoJustificada: semAcao && (RX.justificativaSemAcao.test(tudo) || semProblema),
      generico: RX.generico.test(tudo) && !alvos.length && nivel === "ausente"
    };
  }

  /* ---------- avaliação de um relatório ----------
     v          linha da tabela visitas
     anteriores Sets de trigramas dos relatórios anteriores da mesma
                pessoa (para a trava de texto copiado) */
  function avaliar(v, anteriores = []) {
    const L = lerTexto(v);
    const nota = {};
    const pendencias = [];
    const alertas = [];
    const extras = v.extras || {};

    /* 1. Completude (20) */
    const campos = {
      produtor: !!(v.produtor || "").trim(),
      município: !!(v.municipio || "").trim(),
      talhão: !!(extras.talhao || "").toString().trim(),
      data: !!v.data_visita,
      cultura: !!L.cultura
    };
    const faltam = Object.keys(campos).filter(k => !campos[k]);
    nota.completude = (5 - faltam.length) * 3;
    if (faltam.length) pendencias.push(`Informar: ${faltam.join(", ")}${faltam.includes("cultura") ? " (citar a cultura no texto)" : ""}.`);

    if (!L.estadio) {
      pendencias.push("Informar o estádio fenológico (ex.: V4, R1, pendoamento).");
    } else {
      const cereal = /trigo|cevada|aveia/.test(L.cultura);
      const graoVR = /soja|milho|feijao/.test(L.cultura);
      const codigoVR = /^(ve|vc|vn|vt|v\d|r\d)/.test(L.estadio);
      const zadoks = /^z|zadoks/.test(L.estadio);
      if ((cereal && codigoVR) || (graoVR && zadoks)) {
        nota.completude += 2;
        alertas.push(`Estádio "${L.estadio.toUpperCase()}" fora da escala usual de ${L.cultura}.`);
      } else nota.completude += 5;
    }

    /* 2. Diagnóstico (25) */
    nota.diagnostico = 0;
    if (L.alvos.length || L.semProblema) nota.diagnostico += 10;
    else pendencias.push("Dizer qual problema foi encontrado (praga, doença, daninha, nutrição, clima, estande) ou registrar que não há ocorrência.");

    if (L.nivel === "quantificado") nota.diagnostico += 15;
    else if (L.semProblema && L.nivel !== "vago") nota.diagnostico += 10;
    else if (L.nivel === "vago") {
      nota.diagnostico += 5;
      pendencias.push("Quantificar o nível (ex.: 3 lagartas/m, 15% de severidade, nota da escala).");
    } else if (L.alvos.length) pendencias.push("Informar o nível do problema com número ou escala.");

    if (L.generico) {
      nota.diagnostico = 0;
      pendencias.push('Evitar texto genérico ("tudo ok", "lavoura bonita"): registrar o que foi observado.');
    }

    /* 3. Recomendação (25) */
    nota.recomendacao = 0;
    if (L.semAcao) {
      nota.recomendacao = L.semAcaoJustificada ? 25 : 10;
      if (!L.semAcaoJustificada) pendencias.push('Justificar o "sem ação" (ex.: abaixo do nível de controle, com o número observado).');
    } else if (L.semProblema && !L.produto && !L.dose) {
      /* sem problema e sem produto: falta só dizer que não precisa agir */
      pendencias.push('Sem problema encontrado: registrar "sem necessidade de aplicação, seguir monitorando".');
    } else {
      if (L.produto === "nome") nota.recomendacao += 8;
      else if (L.produto === "classe") { nota.recomendacao += 4; pendencias.push("Dar o nome do produto ou do ativo, não só a classe (fungicida, inseticida…)."); }
      else pendencias.push("Indicar o produto recomendado.");
      if (L.dose) nota.recomendacao += 9; else pendencias.push("Indicar a dose com unidade por hectare (ex.: 0,5 L/ha).");
      if (L.momento) nota.recomendacao += 8; else pendencias.push("Indicar o momento (ex.: em até 3 dias, no R1) ou o prazo da ação.");
      if (L.produto && !L.alvos.length && !L.semProblema) {
        nota.recomendacao = Math.round(nota.recomendacao / 2);
        alertas.push("Produto recomendado sem problema diagnosticado.");
      }
    }

    /* 4. Evidência (15) */
    const fotos = (v.fotos || []).length;
    nota.evidencia = fotos >= 2 ? 15 : fotos === 1 ? 12 : 0;
    if (!fotos) pendencias.push("Anexar ao menos uma foto do talhão.");

    /* 5. Encaminhamento (10) */
    nota.encaminhamento = 0;
    if ((v.acao || "").trim()) {
      if (v.prazo_acao) {
        const d = diasEntre(v.data_visita, v.prazo_acao);
        if (d >= 0 && d <= CONFIG.prazoProximoPassoDias) nota.encaminhamento = 10;
        else { nota.encaminhamento = 6; pendencias.push(`Prazo da ação fora do esperado (até ${CONFIG.prazoProximoPassoDias} dias depois da visita).`); }
      } else { nota.encaminhamento = 4; pendencias.push("Colocar prazo na ação combinada."); }
    } else pendencias.push("Registrar a ação combinada (próximo passo) com prazo.");

    /* 6. Pontualidade (5) — horas depois do fim do dia da visita.
       Só conta com USAR_PONTUALIDADE ligado. */
    if (USAR_PONTUALIDADE) {
      let horas = Infinity;
      if (v.registrado_em && v.data_visita) {
        horas = (Date.parse(v.registrado_em) - new Date(v.data_visita + "T23:59:59").getTime()) / 36e5;
      }
      nota.pontualidade = horas <= 24 ? 5 : horas <= 48 ? 3 : 0;
      if (horas > 24) pendencias.push("Registrar o relatório até o dia seguinte à visita.");
    }

    /* Trava: texto copiado */
    const meu = shingles(`${v.descricao || ""} ${v.acao || ""}`);
    let maxSim = 0;
    for (const a of anteriores) maxSim = Math.max(maxSim, similaridade(meu, a));
    const copiado = maxSim >= CONFIG.limiteTextoCopiado;
    if (copiado) {
      nota.diagnostico = 0;
      nota.recomendacao = 0;
      alertas.push(`Texto ${Math.round(maxSim * 100)}% igual a um relatório anterior.`);
    }

    let total = Math.round(100 * Object.values(nota).reduce((a, b) => a + b, 0) / MAXIMO);
    if (copiado) total = Math.min(total, 49);
    const { classe, rotulo } = CLASSES.find(c => total >= c.min);

    return {
      nota: total, classe, rotulo, dimensoes: nota,
      pendencias: [...new Set(pendencias)], alertas,
      auditoria: alertas.length > 0, leitura: L, trigramas: meu
    };
  }

  /* ---------- todos de uma vez ----------
     Avalia uma lista de visitas comparando cada uma só com as anteriores
     da mesma pessoa (autor). Devolve Map id -> resultado. */
  function avaliarTodas(visitas, autor = v => v.consultor) {
    const ordem = [...visitas].sort((a, b) =>
      (a.data_visita || "").localeCompare(b.data_visita || "") ||
      (a.registrado_em || "").localeCompare(b.registrado_em || ""));
    const historico = {};
    const saida = new Map();
    for (const v of ordem) {
      const quem = autor(v);
      const anteriores = historico[quem] || (historico[quem] = []);
      const r = avaliar(v, anteriores);
      anteriores.push(r.trigramas);
      delete r.trigramas;
      saida.set(v.id, r);
    }
    return saida;
  }

  /* Indicadores de uma pessoa no período. */
  function resumo(resultados) {
    const n = resultados.length;
    if (!n) return { relatorios: 0 };
    const pct = f => Math.round(100 * resultados.filter(f).length / n);
    return {
      relatorios: n,
      nota_media: Math.round(resultados.reduce((a, r) => a + r.nota, 0) / n),
      pct_A_B: pct(r => r.classe === "A" || r.classe === "B"),
      pct_D: pct(r => r.classe === "D"),
      pct_no_prazo: USAR_PONTUALIDADE ? pct(r => r.dimensoes.pontualidade === PESOS.pontualidade) : null,
      com_alerta: resultados.filter(r => r.auditoria).length,
      classes: Object.fromEntries(CLASSES.map(c => [c.classe, resultados.filter(r => r.classe === c.classe).length]))
    };
  }

  const API = { PESOS, NOMES, CLASSES, CONFIG, MAXIMO, USAR_PONTUALIDADE, lerTexto, avaliar, avaliarTodas, resumo };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else raiz.AVALIADOR = API;
})(typeof window !== "undefined" ? window : globalThis);
