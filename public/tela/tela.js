import { el, conectar, capa, aplicarTema, restaurarTemaLocal, DISCIPLINA_PADRAO } from '/shared/ui.js';
import { fundoCapa, fundoDiscreto } from '/shared/decoracao.js';
import { CORES, ORDEM_CORES, estiloCor, textoSobre } from '/shared/cores.js';
import { imagemTime } from '/shared/imagens-times.js';
import { nomeG, usarNomes, classeTam } from '/shared/nomes.js';
import { atualizarComemoracao } from '/tela/comemoracao.js';
import { criarJogoTela, cenaRegras } from '/tela/jogo.js';

restaurarTemaLocal(); // até a 1ª visão chegar, usa o último tema conhecido (sem piscar)

const app = document.getElementById('app');
let disciplina = DISCIPLINA_PADRAO;
let ultimaAssinatura = '';
let ultimoNonce = -1;
let recebeuEstado = false;
let conexao = null;
let autenticada = false;
const jogo = criarJogoTela({ acao: (...a) => conexao.acao(...a) });

// ---------- cena: cores e times ----------
// Cor livre mostra o nome da cor; cor ocupada mostra só o nome do grupo (a cor é o fundo do bloco).
function bloco(cor, estado, imagens, nomeGrupo = null) {
  const nome = nomeGrupo || CORES[cor].nome;
  return el('div', { class: 'bloco tem-img', style: estiloCor(cor), 'data-cor': cor },
    imagemTime(cor, imagens),
    // Nome de cor (cor livre) nunca quebra no meio nem em duas linhas; nome de grupo digitado pode quebrar ou encolher.
    el('span', { class: nomeGrupo ? `bloco-nome${classeTam(nome)}` : 'bloco-nome cor-nome' }, nome),
    estado ? el('span', { class: 'bloco-estado' }, estado) : null);
}

function cenaEspera(v) {
  const selecionada = v.corSelecionada && v.cores.find((c) => c.cor === v.corSelecionada);
  const blocos = v.cores.map((c) => {
    let estado = 'Livre';
    if (c.ocupada) estado = c.conectado ? '' : 'sem conexão';
    else if (c.cor === v.corSelecionada) estado = 'Aguardando QR';
    return bloco(c.cor, estado, v.imagens, c.ocupada ? nomeG(c.cor) : null);
  });
  const mostrarQr = selecionada && !selecionada.ocupada;
  return el('section', { class: 'cena sala' },
    el('div', { class: 'fundo', html: fundoDiscreto() }),
    el('div', { class: 'conteudo sala-corpo' },
      el('h1', { class: 'sala-titulo' }, 'Escolha a cor do grupo'),
      el('div', { class: 'blocos' }, blocos),
      mostrarQr ? el('div', { class: 'veu' }) : null,
      mostrarQr ? cartaoQr(v) : null));
}

function cartaoQr(v) {
  const hex = CORES[v.corSelecionada].hex;
  return el('div', { class: 'qr-cartao cartao', role: 'dialog', 'aria-label': 'QR code para entrar' },
    el('div', { class: 'qr-faixa tem-img', style: estiloCor(v.corSelecionada) }, imagemTime(v.corSelecionada, v.imagens), CORES[v.corSelecionada].nome),
    el('img', { class: 'qr-img', src: v.qr, alt: `QR code do grupo ${CORES[v.corSelecionada].nome}` }),
    el('p', { class: 'qr-texto' }, 'Escaneie para entrar'));
}

// ---------- cena: teste de botões ----------
function cenaTeste(v) {
  const posicao = (cor) => v.ordem.indexOf(cor) + 1;
  // Quem já apertou aparece primeiro, na ordem do aperto; depois os que ainda não apertaram.
  const chave = (cor) => (posicao(cor) || 99);
  const blocos = v.grupos.filter((g) => g.conectado).sort((a, b) => chave(a.cor) - chave(b.cor)).map((g) =>
    el('div', { class: `bloco teste${g.cor === v.ultimo ? ' ultimo' : ''}`, style: estiloCor(g.cor), 'data-cor': g.cor },
      el('span', { class: `bloco-nome${classeTam(nomeG(g.cor))}` }, nomeG(g.cor)),
      el('span', { class: 'bloco-estado' }, posicao(g.cor) ? `${posicao(g.cor)}º a apertar` : 'Ainda não apertou')));
  return el('section', { class: 'cena sala' },
    el('div', { class: 'fundo', html: fundoDiscreto() }),
    el('div', { class: 'conteudo sala-corpo' },
      el('h1', { class: 'sala-titulo' }, 'Teste de botões'),
      blocos.length
        ? el('div', { class: 'blocos teste-grade' }, blocos)
        : el('p', { class: 'sala-aviso' }, 'Nenhum grupo conectado.'),
      el('p', { class: 'sala-aviso' }, 'Aperte o botão no celular. Nada vale ponto.')));
}

// Piscada em tela cheia na cor do grupo que apertou (sem som). Só dispara quando o nonce muda.
function piscada(v) {
  if (!v.ultimo) return null;
  const hex = CORES[v.ultimo].hex;
  return el('div', { class: 'piscada', key: v.nonce, style: `background:${hex};color:${textoSobre(hex)}`, 'aria-hidden': 'true' },
    el('span', {}, nomeG(v.ultimo)));
}

// Cenas do jogo: só refaz o quadro quando algo visível mudou.
function trocar(chave, nos) {
  if (chave === ultimaAssinatura) return;
  ultimaAssinatura = chave;
  ultimoNonce = -1;
  app.replaceChildren(...nos);
}

function desenhar(v) {
  if (v?.disciplina) disciplina = v.disciplina;
  usarNomes(v?.nomes);
  atualizarComemoracao(v);
  let tela = null;
  let extra = null;
  if (v?.cena === 'espera') tela = cenaEspera(v);
  else if (v?.cena === 'teste') {
    tela = cenaTeste(v);
    if (v.nonce !== ultimoNonce && v.nonce > 0) extra = piscada(v);
    ultimoNonce = v.nonce;
  } else if (v?.cena === 'jogo') {
    const j = jogo.render(v);
    return trocar(j.chave, j.nos);
  } else if (v?.cena === 'regras') tela = cenaRegras(v);
  else tela = capa(fundoCapa(), null, disciplina);
  if (v?.cena !== 'teste') ultimoNonce = -1;

  // Evita refazer o quadro (e a imagem do QR) quando nada mudou.
  const assinatura = JSON.stringify([v?.cena, v?.cores, v?.corSelecionada, v?.qr, v?.grupos, v?.ordem, v?.ultimo, disciplina, v?.pagina, v?.config, v?.imagens, v?.nomes, v?.tema]);
  if (!extra && assinatura === ultimaAssinatura) return;
  ultimaAssinatura = assinatura;
  app.replaceChildren(tela, ...(extra ? [extra] : []));
  if (extra) setTimeout(() => extra.remove(), 700);
}

desenhar();
fetch('/api/capa').then((r) => r.json()).then((d) => { disciplina = d.disciplina || disciplina; aplicarTema(d.tema); if (!recebeuEstado) desenhar(); }).catch(() => {});
conexao = conectar({ papel: 'tela', aoEstado: (v) => { recebeuEstado = true; aplicarTema(v.tema); autenticada = !!v.autenticado; desenhar(v); } });

// O cookie do responsável é do navegador, não da conexão: quando o responsável entra com o PIN
// no /host (outra janela), a /tela reconecta sozinha para ganhar os botões Continuar e Próximo.
setInterval(async () => {
  if (autenticada) return;
  try {
    const r = await fetch('/api/auth/status', { cache: 'no-store' });
    if ((await r.json()).autenticado) conexao.reconectar();
  } catch { /* servidor fora do ar: tenta de novo no próximo ciclo */ }
}, 2000);
