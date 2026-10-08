/* ===================================================================
   CARTEIRA — compartilhada pelo formulário, pelo painel e pela página
   dos produtores focalizados.

   Fica num arquivo só para que incluir um produtor, um relator ou um
   item de situação se faça num lugar só e valha nas três páginas.
   Carregue este arquivo antes de /relatorio.js, que usa o ITENS.
   =================================================================== */

/* -------------------------------------------------------------------
   1. PRODUTORES
   Uma linha por produtor: consultor, produtor, município. O nome do
   consultor tem que ser igual ao do vínculo de login no banco
   (public.consultores.nome) — é por ele que cada um vê o que é seu.
   ------------------------------------------------------------------- */
const CARTEIRA = [
  ["Johni Rocha","JORGE DALMOLIN","Mafra"],
  ["Alex","MARCOS ECKEL","Mafra"],
  ["Alex","ANTONIO CIDRAL DA COSTA","Mafra"],
  ["Daniel Bojarski","VALDECIR SLABISKI","Itaiópolis"],
  ["Daniel Bojarski","RAFAEL CELSO SOZO","Itaiópolis"],
  ["Daniel Bojarski","ACACIO GABRIEL KACHEL","Itaiópolis"],
  ["Daniel Prestes","EUCLIDES ZIEMANN","Irineópolis"],
  ["Daniel Prestes","THIAGO FELIPE SHAFASCHECK","Irineópolis"],
  ["Daniel Prestes","TURKOT","Irineópolis"],
  ["Gerson","ROMALDO CISLINSKI","Itaiópolis"],
  ["Gerson","CARLOS WAGNER","Itaiópolis"],
  ["Gerson","ALISSON KARACHINSKI","Itaiópolis"],
  ["Gilson","ANILDO DAL PIZZOL","Canoinhas"],
  ["Gilson","MAURO SFAIR","Irineópolis"],
  ["Gilson","FERNANDO/CLEONE GIURIATTI","Canoinhas"],
  ["Grexe","MARCELO RIBAS","Papanduva"],
  ["Grexe","DECIO E SERGIO AMORIM","Papanduva"],
  ["Grexe","DOUGLAS PSCHEIDT","Papanduva"],
  ["Grexe","JOSUI DE ALMEIDA CEZAR","Papanduva"],
  ["Grexe","WALTER SLABISKI","Papanduva"],
  ["Grexe","LAURECI POMA","Papanduva"],
  ["Gustavo","BRUNO KENZO IGARASHI AZUMA","Papanduva"],
  ["Gustavo","PEDRO GERALDO CIUPKA","Papanduva"],
  ["Jalmir","CÉSAR DANIEL SCHAPIEVSKI/DANIELLE DE LOURDES SCHAPIEVSKI","Major Vieira"],
  ["Jalmir","LOURIVAL RUTHES","Major Vieira"],
  ["Jalmir","MATHEUS ZIMMER SCHUPEL","Major Vieira"],
  ["Marcelo","ISMAEL SOPCZAK","Major Vieira"],
  ["Marcelo","IRINEU/IGOR/YURI RUTHES","Major Vieira"],
  ["Marcelo","MARCIO LISCZKOVSKI","Monte Castelo"],
  ["Marcelo","HELENICE DE SOUZA","Monte Castelo"],
  ["Marcelo","CARLOS AUGUSTO PAPES","Major Vieira"],
  ["Marcelo","REINALDO DUFFECK","Monte Castelo"],
  ["Marcos","AMARILDO HERBST","Papanduva"],
  ["Marcos","JOSÉ MÁRIO GRUBER/LUIS CARLOS GRUBER","Papanduva"],
  ["Marcos","SAUL SCHAFACHEK","Papanduva"],
  ["Marcos","WALMIR HUZIOKA","Papanduva"],
  ["Marçal","FABIO/FERNANDO GLONEK","Papanduva"],
  ["Marçal","JONER ANDRESON ADAMCZEVSKI","Papanduva"],
  ["Marçal","SCHADECK AGROPECUARIA S/A","Papanduva"],
  ["Marçal","JOAO JAIME IANSKOSKI","Papanduva"],
  ["Marçal","PEDRO GIACOMO DE LUCA","Papanduva"],
  ["Shander","MARCELO ENGEL","Canoinhas"],
  ["Shander","RAUL OLESCOWICZ","Canoinhas"],
  ["Shander","MARCIO PAUL","Canoinhas"]
];

/* -------------------------------------------------------------------
   2. RELATORES
   Quem digitou o relatório, quando não foi o próprio consultor da
   visita. Para incluir ou tirar alguém, edite só esta linha.
   ------------------------------------------------------------------- */
const RELATORES = ["Yuri", "Guilherme"];

/* -------------------------------------------------------------------
   3. SITUAÇÃO DO PRODUTOR
   id, rótulo, explicação curta (opcional). Marcada na página dos
   produtores focalizados; o PDF das visitas antigas também usa os
   rótulos, por isso o id de um item existente não deve mudar.
   ------------------------------------------------------------------- */
const ITENS = [
  ["consultoria_contratada","Consultoria contratada",""],
  ["visita_yuri","Visita do Yuri","Consultor de desenvolvimento de mercado"],
  ["visita_guilherme","Visita do Guilherme",""],
  ["ja_tem_ap","Já tem agricultura de precisão",""],
  ["ja_tinha_analise_solo","Já tinha análise de solo",""],
  ["regulagem_pulverizador","Regulagem de pulverizador",""],
  ["coleta_analise_solo","Coleta de análise de solo",""],
  ["coleta_analise_nematoide","Coleta de análise de nematoide",""]
];
