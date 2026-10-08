/* ===================================================================
   SESSÃO — login no Supabase, compartilhado pelo painel e pela página
   dos produtores focalizados.

   As duas páginas guardam a sessão na mesma chave do aparelho, então
   quem entrou numa já está dentro da outra. Cada página define, antes
   de usar estas funções, o objeto SUPABASE ({ url, chave }) e a função
   mostraLogin(aviso), chamada quando a sessão morre de vez.
   =================================================================== */
const GUARDA = "painel-sessao";

let sessao = null;   /* { access_token, refresh_token, expira_em, email } */

function guarda(s) {
  sessao = s;
  try { localStorage.setItem(GUARDA, JSON.stringify(s)); } catch (e) { console.warn(e); }
}

function esquece() {
  sessao = null;
  try { localStorage.removeItem(GUARDA); } catch (e) { console.warn(e); }
}

function recupera() {
  try { return JSON.parse(localStorage.getItem(GUARDA) || "null"); }
  catch (e) { return null; }
}

function daSessao(resposta, email) {
  return {
    access_token:  resposta.access_token,
    refresh_token: resposta.refresh_token,
    /* um minuto de folga, para não usar um token que vence no caminho */
    expira_em:     Date.now() + (resposta.expires_in - 60) * 1000,
    email:         (resposta.user && resposta.user.email) || email || ""
  };
}

async function entra(email, senha) {
  const r = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE.chave, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha })
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(
      /invalid/i.test(corpo.error_description || corpo.msg || corpo.error || "")
        ? "E-mail ou senha não conferem."
        : (corpo.error_description || corpo.msg || "Não foi possível entrar."));
  }
  guarda(daSessao(corpo, email));
}

async function renova() {
  if (!sessao || !sessao.refresh_token) return false;
  const r = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE.chave, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: sessao.refresh_token })
  });
  if (!r.ok) return false;
  guarda(daSessao(await r.json(), sessao.email));
  return true;
}

/* Todo pedido ao banco passa por aqui, para renovar o token quando
   preciso e cair no login quando a sessão morreu de vez. Sem corpo é
   leitura. Com corpo, grava: POST insere e não espera nada de volta;
   PATCH altera e devolve as linhas como ficaram — lista vazia quer
   dizer que a regra do banco não deixou alterar nenhuma. */
async function pede(caminho, corpo, metodo = "POST") {
  if (sessao && Date.now() > sessao.expira_em) {
    if (!await renova()) { mostraLogin("Sua sessão expirou. Entre de novo."); return null; }
  }
  const cab = {
    apikey: SUPABASE.chave,
    Authorization: "Bearer " + sessao.access_token
  };
  const r = await fetch(`${SUPABASE.url}${caminho}`, corpo === undefined
    ? { headers: cab }
    : { method: metodo,
        headers: { ...cab, "Content-Type": "application/json",
                   Prefer: metodo === "PATCH" ? "return=representation" : "return=minimal" },
        body: JSON.stringify(corpo) });
  /* 401 é token vencido. O 403 só vale como sessão morta na leitura:
     numa gravação ele é a regra do banco recusando, e esse motivo tem
     que chegar à tela em vez de virar "entre de novo". */
  if (r.status === 401 || (r.status === 403 && corpo === undefined)) {
    if (await renova()) return pede(caminho, corpo, metodo);
    mostraLogin("Sua sessão expirou. Entre de novo.");
    return null;
  }
  if (!r.ok) throw new Error("banco: " + r.status + " " + await r.text());
  return corpo === undefined || metodo === "PATCH" ? r.json() : true;
}

/* Sair avisa o Supabase, para o refresh token não continuar valendo
   caso alguém tenha copiado o que estava guardado no aparelho. */
function sai() {
  if (sessao && sessao.access_token) {
    fetch(`${SUPABASE.url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE.chave, Authorization: "Bearer " + sessao.access_token }
    }).catch(() => {});
  }
  mostraLogin();
}
