/* ===================================================================
   TRANSCRIÇÃO DO RELATO POR VOZ
   Recebe o áudio gravado no formulário, manda para o Gemini e devolve
   o relato já separado nos campos do relatório. Fica no servidor porque
   a chave do Gemini não pode aparecer no HTML.

   Configuração na Vercel (Settings > Environment Variables):
     GEMINI_API_KEY  chave criada em aistudio.google.com
     GEMINI_MODELO   opcional; sem ela usa o modelo abaixo
   =================================================================== */
const MODELO_PADRAO = "gemini-2.5-flash";
const MAX_BYTES = 4 * 1024 * 1024;   /* a Vercel recusa corpo acima de 4,5 MB */

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira",
              "quinta-feira", "sexta-feira", "sábado"];

const responde = (status, corpo) => Response.json(corpo, { status });

export async function POST(request) {
  /* O formulário é aberto (consultor não faz login), então ao menos o
     pedido precisa vir da própria página — sem isso qualquer site
     gastaria a cota do Gemini. */
  const origem = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origem || new URL(origem).host !== host) {
    return responde(403, { erro: "origem não permitida" });
  }

  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return responde(500, { erro: "GEMINI_API_KEY não configurada na Vercel" });

  const tipo = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!tipo.startsWith("audio/")) return responde(415, { erro: "envie um áudio" });

  const audio = Buffer.from(await request.arrayBuffer());
  if (!audio.length)            return responde(400, { erro: "áudio vazio" });
  if (audio.length > MAX_BYTES) return responde(413, { erro: "áudio grande demais" });

  /* A data da visita ancora os prazos falados ("até sexta", "semana que vem"). */
  const url = new URL(request.url);
  let data = url.searchParams.get("data") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) data = new Date().toISOString().slice(0, 10);
  const dia = DIAS[new Date(data + "T12:00:00Z").getUTCDay()];

  const instrucao = `Você recebe o áudio de um consultor agronômico relatando uma visita \
técnica a um produtor rural. Transcreva em português do Brasil e organize o relato nos \
campos do relatório:

- transcricao: o que foi falado, fiel ao áudio, sem repetir vícios de fala ("é…", "né", "tipo").
- descricao: o que foi observado e conversado na visita, em texto claro, do jeito que o \
consultor contou (mesma pessoa verbal), corrigindo só a gramática. Separe assuntos \
diferentes em parágrafos, um por linha. Não inclua aqui o que ficou combinado para fazer.
- acao: o que ficou combinado ou recomendado para fazer depois da visita. Vazio se nada \
foi combinado.
- prazo: data limite da ação no formato AAAA-MM-DD. A visita foi em ${data} (${dia}); \
converta referências como "sexta", "semana que vem" ou "em 10 dias" a partir dessa data. \
Vazio se nenhum prazo foi dito.

Não invente nada que não foi dito. Mantenha exatamente como falados os nomes de produtos, \
pragas, doenças, cultivares, talhões, números e doses.`;

  const modelo = process.env.GEMINI_MODELO || MODELO_PADRAO;
  let r;
  try {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: instrucao },
            { inline_data: { mime_type: tipo, data: audio.toString("base64") } }
          ] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                transcricao: { type: "STRING" },
                descricao:   { type: "STRING" },
                acao:        { type: "STRING" },
                prazo:       { type: "STRING" }
              },
              required: ["transcricao", "descricao", "acao", "prazo"]
            }
          }
        })
      });
  } catch (e) {
    return responde(502, { erro: "Gemini fora do ar: " + e.message });
  }

  if (!r.ok) {
    const aviso = (await r.text()).slice(0, 300);
    console.error("gemini", r.status, aviso);
    return responde(502, { erro: "Gemini " + r.status + ": " + aviso });
  }

  try {
    const corpo = await r.json();
    const texto = corpo.candidates[0].content.parts.map(p => p.text || "").join("");
    const res = JSON.parse(texto);
    const limpo = s => String(s || "").trim();
    return responde(200, {
      transcricao: limpo(res.transcricao),
      descricao:   limpo(res.descricao),
      acao:        limpo(res.acao),
      prazo:       /^\d{4}-\d{2}-\d{2}$/.test(limpo(res.prazo)) ? limpo(res.prazo) : ""
    });
  } catch (e) {
    return responde(502, { erro: "resposta do Gemini fora do formato" });
  }
}
