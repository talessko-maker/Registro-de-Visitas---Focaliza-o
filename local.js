/* ===================================================================
   LOCAL DO REGISTRO — mostra onde o celular estava quando o relatório
   foi salvo (extras.local, gravado pelo formulário). Usado no Painel e
   na Gestão. Registros de antes da captura não têm local, e não
   mostram nada.

   extras.local = { lat, lng, precisao_m, em }    posição obtida
                | { erro: "negado" | "tempo" | "indisponivel" }
   =================================================================== */

/* Data a partir da qual o formulário passou a pedir o local: antes dela,
   "sem local" é o normal e não conta nas porcentagens. */
const LOCAL_DESDE = "2026-11-14";

const LOCAL_MOTIVO = {
  negado: "localização bloqueada no celular",
  tempo: "o GPS não respondeu a tempo",
  indisponivel: "GPS indisponível no aparelho",
  aguardando: "o GPS não respondeu a tempo"
};

/* Endereço do mapa (abre no app de mapas do celular). */
function localMapa(l) {
  return `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`;
}

/* Linhas <dt>/<dd> para uma lista de dados do registro. */
function localHtml(l) {
  if (!l) return "";
  if (l.lat == null) {
    return `<dt>Local do registro</dt><dd>não registrado — ${LOCAL_MOTIVO[l.erro] || "sem GPS"}</dd>`;
  }
  return `<dt>Local do registro</dt><dd><a href="${localMapa(l)}" target="_blank" rel="noopener">Ver no mapa</a>
    <span style="color:#5A6876">· precisão de ${l.precisao_m} m · ${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}</span></dd>`;
}

/* O registro deveria ter local? (feito depois que a captura começou) */
function localEsperado(v) {
  return (v.registrado_em || "").slice(0, 10) >= LOCAL_DESDE;
}
const temLocal = v => !!(v.extras && v.extras.local && v.extras.local.lat != null);
