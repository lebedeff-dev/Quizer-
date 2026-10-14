// Animações das habilidades na /tela: ativação em tela cheia (~2 s) e pontos subindo (Dobro).
import { el } from '/shared/ui.js';
import { CORES, textoSobre } from '/shared/cores.js';
import { nomeG } from '/shared/nomes.js';
import { ICONES as ICONE } from '/shared/habilidades.js';
const DURACAO_MS = 2200; // uma ativação sozinha
const DURACAO_FILA_MS = 1600; // quando há outras esperando (mais curta, para a fila não se arrastar)
const INTERVALO_MS = 100; // pausa entre duas ativações da fila

// Tempo total (ms) para tocar `n` ativações em fila: as n-1 primeiras na duração curta, a última na normal.
export const tempoDaFila = (n) => (n <= 0 ? 0 : (n - 1) * (DURACAO_FILA_MS + INTERVALO_MS) + DURACAO_MS);

const fila = [];
let tocando = false;

// Tela cheia na cor do alvo (o texto é preto ou branco, opaco, o que tiver mais contraste com ela) (Bloqueio cai sobre ele) ou do próprio grupo (o "x2" pulsa sobre ele).
// Tipos: bloqueio (cai sobre o alvo), dobro (pulsa na cor do grupo), escudo (anulou um Bloqueio: `cor` é quem
// usou o Escudo e `alvo` o atacante) e passe (o 1º respondente passou a vez).
// Ativações em fila, uma de cada vez: vários grupos ativando juntos nunca se sobrepõem.
export function tocarAtivacao(ativacao) {
  fila.push(ativacao);
  if (!tocando) proxima();
}

function proxima() {
  const a = fila.shift();
  if (!a) { tocando = false; return; }
  tocando = true;
  const duracao = fila.length ? DURACAO_FILA_MS : DURACAO_MS;
  montar(a, duracao);
  setTimeout(proxima, duracao + INTERVALO_MS);
}

function montar({ cor, tipo, alvo, modo, detalhe, qtd }, duracao) {
  const dono = nomeG(cor);
  const corFundo = tipo === 'bloqueio' ? alvo : cor;
  const hex = CORES[corFundo].hex;
  const texto = {
    bloqueio: `${dono} bloqueou ${alvo && nomeG(alvo)}`,
    dobro: `${dono} ativou o Dobro`,
    escudo: `Escudo anulou o Bloqueio de ${alvo && nomeG(alvo)}`,
    passe: `${dono} passou a vez`,
    aposta: modo === 'pontos' ? `${dono} apostou ${detalhe} pontos` : `${dono} apostou ${detalhe} ${detalhe === 1 ? 'habilidade' : 'habilidades'}`,
    dica5050: `${dono} usou a Dica 50/50`,
  }[tipo];
  const sub = tipo === 'escudo' ? `${dono} usou o Escudo contra ${nomeG(alvo)}`
    : tipo === 'dica5050' ? 'Só duas alternativas continuam valendo'
      : tipo === 'aposta' ? 'Só é cobrada se o grupo responder' : null;
  const no = el('div', { class: `ativacao ${tipo}`, style: `background:${hex};color:${textoSobre(hex)};--dur:${duracao}ms`, 'aria-hidden': 'true' },
    el('div', { class: 'hab-selo ativacao-selo' }, el('img', { src: ICONE[tipo], alt: '' })),
    el('p', { class: 'ativacao-texto' }, texto),
    sub ? el('p', { class: 'ativacao-sub' }, sub) : null);
  document.body.append(no);
  setTimeout(() => no.remove(), duracao);
}

// Número que sobe de `de` até `ate` (10 para 20). Com movimento reduzido, mostra direto o final.
export function subirNumero(no, de, ate, { atrasoMs = 450, duracaoMs = 1100 } = {}) {
  const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  no.textContent = `+${reduzido ? ate : de}`;
  if (reduzido) return;
  const inicio = performance.now() + atrasoMs;
  const passo = (agora) => {
    const t = Math.min(1, Math.max(0, (agora - inicio) / duracaoMs));
    const suave = 1 - (1 - t) ** 3;
    no.textContent = `+${Math.round(de + (ate - de) * suave)}`;
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
