// Comemoração no projetor (Etapa 8k-2): fogos em tela cheia por ~8 s e o banner de parabéns do grupo vencedor, que fica até o
// responsável avançar. Os dois ficam em camadas próprias no <body>, para não sumirem quando a /tela refaz o quadro.
import { el } from '/shared/ui.js';
import { CORES, VIVAS, textoSobre } from '/shared/cores.js';
import { imagemTime } from '/shared/imagens-times.js';
import { iniciarFogos } from '/shared/fogos.js';
import { classeTam } from '/shared/nomes.js';
import { pontosTotal } from '/shared/textos.js';

const DURACAO_MS = 8000;
let idAtual = null;
let canvas = null;
let escuro = null;
let fogos = null;
let banner = null;
let bannerId = null;
let bannerTema = null;

// Camada escura atrás dos fogos (e atrás do banner): as cores aparecem melhor. Entra e sai com transição suave de 400 ms.
function ligarEscuro() {
  if (escuro) { escuro.classList.add('ligado'); return; }
  escuro = el('div', { class: 'comem-escuro', 'aria-hidden': 'true' });
  document.body.append(escuro);
  requestAnimationFrame(() => requestAnimationFrame(() => escuro?.classList.add('ligado')));
}

function desligarEscuro(rapido = false) {
  const e = escuro;
  if (!e) return;
  escuro = null;
  e.classList.remove('ligado');
  if (rapido) e.remove(); else setTimeout(() => e.remove(), 450);
}

function limparFogos(rapido = true) {
  fogos?.parar();
  fogos = null;
  canvas?.remove();
  canvas = null;
  desligarEscuro(rapido);
}

function limparBanner() {
  banner?.remove();
  banner = null;
  bannerId = null;
}

function tocarFogos(c) {
  limparFogos();
  ligarEscuro();
  canvas = el('canvas', { class: 'comem-fogos', 'aria-hidden': 'true' });
  document.body.append(canvas);
  // cores saturadas dos grupos, com a cor do vencedor em destaque
  fogos = iniciarFogos(canvas, {
    duracaoMs: DURACAO_MS,
    cores: Object.values(VIVAS),
    destaque: VIVAS[c.cor],
    max: 520,
    aoFim: () => { canvas?.remove(); canvas = null; desligarEscuro(); }, // a camada some suave e o banner continua
  });
}

function montarBanner(v, c) {
  const hex = CORES[c.cor].hex;
  const nome = c.nome || CORES[c.cor].nome;
  const no = el('div', {
    class: 'comem-banner', role: 'status', 'data-cor': c.cor, 'data-comem-id': String(c.id),
    style: `background:${hex};color:${textoSobre(hex)};${CORES[c.cor].contorno ? `--contorno:${CORES[c.cor].contorno};` : ''}`,
  },
  imagemTime(c.cor, v.imagens, 'grande'),
  el('h1', { class: `comem-titulo${classeTam(nome)}` }, `Parabéns, ${nome}!`),
  el('p', { class: 'comem-pontos' }, `${pontosTotal(c.pontos)} ${Math.abs(c.pontos) === 1 ? 'ponto' : 'pontos'}`));
  return no;
}

// Chamado a cada visão da /tela. `v.comemoracao` só existe no Ranking, depois do botão Comemorar do painel.
export function atualizarComemoracao(v) {
  const c = v?.cena === 'jogo' && v.fase === 'ranking' ? v.comemoracao : null;
  if (!c) {
    idAtual = null;
    limparFogos();
    limparBanner();
    return;
  }
  if (c.id !== idAtual) { // toque novo (ou repetido) no Comemorar: fogos de novo
    idAtual = c.id;
    tocarFogos(c);
  }
  if (!c.banner) { limparBanner(); return; }
  if (bannerId !== c.id || !banner || bannerTema !== v.tema) { // o tema mudou: o Preto vira Branco na hora
    limparBanner();
    banner = montarBanner(v, c);
    bannerId = c.id;
    bannerTema = v.tema;
    document.body.append(banner);
  }
}
