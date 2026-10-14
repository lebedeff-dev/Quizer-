// Cenas do jogo na /tela (projetor). Uma ideia por tela, centralizado, texto grande.
// Não mostra placar durante as rodadas; só "Respondidas X/14" discreto no canto.
import { el, tituloDuasCores, botaoSeta } from '/shared/ui.js';
import { fundoDiscreto, fundoMenu } from '/shared/decoracao.js';
import { CORES, estiloCor } from '/shared/cores.js';
import { nomeG, usarNomes, classeTam } from '/shared/nomes.js';
import { tocarAtivacao, subirNumero } from '/tela/animacoes.js';
import { ICONES, NOMES as NOME_HAB, descricoes } from '/shared/habilidades.js';
import { CELULAR as TXT_CEL, textosAposta, resumoEscada, pontosComSinal, pontosTotal } from '/shared/textos.js';

const LETRAS = ['A', 'B', 'C', 'D'];

// "Azul apostou 10 pontos" / "Azul apostou 2 habilidades" (a /tela só sabe quantas, nunca quais).
function textoAposta(a) {
  const nome = nomeG(a.cor);
  return a.modo === 'pontos' ? `${nome} apostou ${a.detalhe} pontos` : `${nome} apostou ${a.detalhe} ${a.detalhe === 1 ? 'habilidade' : 'habilidades'}`;
}

// Habilidades em jogo (ordem e resposta): ícone com movimento contínuo junto ao grupo afetado.
function habsRodada(v) {
  const itens = [];
  for (const a of v.avisos || []) {
    if (a.anulado) continue; // o Bloqueio anulado pelo Escudo não vale
    if (a.tipo === 'bloqueio') itens.push({ tipo: 'bloqueio', texto: `${nomeG(a.alvo)} bloqueado` });
    else if (a.tipo === 'dobro') itens.push({ tipo: 'dobro', texto: `${nomeG(a.cor)} com Dobro` });
    else if (a.tipo === 'aposta') itens.push({ tipo: 'aposta', texto: textoAposta(a) });
  }
  for (const cor of v.passes || []) itens.push({ tipo: 'passe', texto: `${nomeG(cor)} passou a vez` });
  for (const cor of v.dicas || []) itens.push({ tipo: 'dica5050', texto: `${nomeG(cor)} usou a Dica 50/50` });
  if (!itens.length) return null;
  return el('div', { class: 'habs-rodada' }, itens.map((i) =>
    el('p', { class: 'hab-rodada' },
      el('span', { class: `hab-selo hab-em-jogo ${i.tipo}` }, el('img', { src: ICONES[i.tipo], alt: '' })),
      i.texto)));
}

// Desfecho: habilidades ganhas agora (ícone entra com repique e brilho) e Dobro com os pontos subindo.
function habsDesfecho(v) {
  const itens = [];
  for (const g of v.ganhos || []) {
    itens.push(el('div', { class: 'hab-pilula', style: estiloCor(g.cor) },
      el('span', { class: 'hab-selo hab-ganho' }, el('img', { src: ICONES[g.tipo], alt: '' })),
      g.acertos ? `${nomeG(g.cor)} trocou ${g.acertos} acertos por ${NOME_HAB[g.tipo]}` : `${nomeG(g.cor)} ganhou ${NOME_HAB[g.tipo]}`));
  }
  for (const t of v.tentativas || []) {
    if (!t.dobro || !(t.pontos > 0)) continue;
    const valor = el('span', { class: 'dp-valor' });
    subirNumero(valor, t.pontos / 2, t.pontos);
    itens.push(el('div', { class: 'hab-pilula', style: estiloCor(t.cor) },
      el('span', { class: 'hab-selo hab-em-jogo dobro' }, el('img', { src: ICONES.dobro, alt: '' })),
      `${nomeG(t.cor)} com Dobro`,
      valor));
  }
  for (const a of v.apostas || []) {
    const nome = nomeG(a.cor);
    itens.push(el('div', { class: 'hab-pilula', style: estiloCor(a.cor) },
      el('span', { class: 'hab-selo hab-em-jogo aposta' }, el('img', { src: ICONES.aposta, alt: '' })),
      a.estado === 'cobrada' ? `${nome} apostou: ${pontosComSinal(a.delta)} pontos` : `${nome}: aposta não cobrada`));
  }
  return itens.length ? el('div', { class: 'habs-desfecho' }, itens) : null;
}

// ---------- peças ----------
function cena(classe, ...filhos) {
  return el('section', { class: `cena jogo ${classe}` },
    el('div', { class: 'fundo', html: fundoDiscreto() }),
    ...filhos);
}

function cantos(v) {
  return [
    el('p', { class: 'canto-resp' }, v.desempate ? 'Desempate' : `Respondidas ${v.respondidas}/${v.meta}`),
    v.rodadaFinal ? el('p', { class: 'selo-final' }, 'RODADA FINAL: PONTOS EM DOBRO') : null,
  ];
}

function avisos(v) {
  if (!v.avisos?.length) return null;
  return el('div', { class: 'avisos' }, v.avisos.map((a) => {
    const quem = nomeG(a.cor);
    const texto = a.tipo === 'bloqueio'
      ? `${quem} ativou Bloqueio sobre ${nomeG(a.alvo)}${a.anulado ? ' (anulado pelo Escudo)' : ''}`
      : a.tipo === 'aposta' ? textoAposta(a) : `${quem} ativou Dobro`;
    return el('p', { class: 'aviso' },
      el('span', { class: `aviso-selo hab-em-jogo ${a.tipo}` }, el('img', { src: ICONES[a.tipo], alt: '' })),
      texto);
  }));
}

// Cartão de alternativa. estado: 'certa' | 'errada' | null
function alternativa(i, texto, estado, extraClasse = '') {
  return el('div', { class: `alt cartao ${estado || ''} ${extraClasse}` },
    el('span', { class: 'alt-letra' }, LETRAS[i]),
    el('span', { class: 'alt-texto' }, texto),
    estado ? el('span', { class: 'alt-rotulo' }, estado === 'certa' ? 'correta' : estado === 'eliminada' ? 'eliminada' : 'errada') : null);
}

function chip(o, { atual = false, compacto = false } = {}) {
  return el('div', { class: `chip-ordem${atual ? ' atual' : ''}${compacto ? ' compacto' : ''}`, style: estiloCor(o.cor) },
    el('span', { class: 'chip-pos' }, `${o.posicao}º`),
    el('span', { class: 'chip-texto' },
      el('span', { class: `chip-cor${classeTam(nomeG(o.cor))}` }, nomeG(o.cor))));
}

function navegacao(v, rotulo, acao, mostrar = true) {
  return v.autenticado && mostrar ? botaoSeta('proximo', rotulo, acao) : null;
}

// ---------- cenas ----------
function pergunta(v) {
  return cena('c-pergunta', ...cantos(v),
    el('div', { class: 'conteudo coluna' },
      el('div', { class: 'cartao q-cartao' }, el('p', { class: 'q-texto' }, v.enunciado)),
      avisos(v), habsDesfecho({ ganhos: v.ganhos })));
}

function alternativas(v) {
  return cena('c-alternativas', ...cantos(v),
    el('div', { class: 'conteudo coluna' },
      el('p', { class: 'q-menor' }, v.enunciado),
      el('div', { class: 'alts' }, v.alternativas.map((t, i) => alternativa(i, t, null))),
      avisos(v), habsDesfecho({ ganhos: v.ganhos })));
}

function janela(v, refs) {
  const numero = el('div', { class: 'contagem-numero', 'aria-live': 'off' }, '30');
  refs.contagem = numero;
  return cena('c-janela', ...cantos(v),
    el('div', { class: 'conteudo coluna' },
      el('p', { class: 'q-menor q-janela' }, v.enunciado),
      el('div', { class: 'contagem' }, numero, el('p', { class: 'contagem-legenda' }, 'segundos'))));
}

function ordem(v) {
  return cena('c-ordem', ...cantos(v),
    el('div', { class: 'conteudo coluna' },
      el('h1', { class: 'titulo-cena' }, 'Ordem dos grupos'),
      el('div', { class: `ordem-grade${v.ordem.length > 5 ? ' dupla' : ''}`, style: `--linhas:${Math.ceil(v.ordem.length / (v.ordem.length > 5 ? 2 : 1))}` },
        v.ordem.map((o) => chip(o))),
      habsRodada(v)));
}

function resposta(v) {
  const alts = v.alternativas.map((t, i) => alternativa(i, t, v.erradas.includes(i) ? 'errada' : (v.eliminadas || []).includes(i) ? 'eliminada' : null, 'menor'));
  return cena('c-resposta', ...cantos(v),
    el('div', { class: 'conteudo coluna' },
      el('p', { class: 'q-menor' }, v.enunciado),
      el('div', { class: 'alts' }, alts),
      el('div', { class: 'ordem-linha' }, v.ordem.map((o) => chip(o, { atual: o.cor === v.atual, compacto: true }))),
      habsRodada(v)));
}

function explicacao(v) {
  // Correta em verde; se os dois erraram, as erradas ficam vermelhas junto.
  const indices = [...new Set([...v.erradas, v.correta])].sort((a, b) => a - b);
  return cena('c-explicacao', ...cantos(v),
    el('div', { class: 'conteudo coluna' },
      el('div', { class: `alts-poucas n${indices.length}` },
        indices.map((i) => alternativa(i, v.alternativas[i], i === v.correta ? 'certa' : 'errada', 'menor'))),
      el('div', { class: 'cartao explicacao' }, el('p', {}, v.explicacao)),
      habsDesfecho(v)),
    navegacao(v, 'Continuar', () => v.acao('continuar')));
}

function soCorreta(v) {
  const ninguem = !v.tentativas.length;
  return cena('c-so-correta', ...cantos(v),
    el('div', { class: 'conteudo coluna' },
      ninguem ? el('p', { class: 'legenda-cena' }, 'Ninguém apertou o botão') : null,
      el('div', { class: 'alts-poucas n1' }, alternativa(v.correta, v.alternativas[v.correta], 'certa', 'grande')),
      habsDesfecho(v)),
    navegacao(v, 'Continuar', () => v.acao('continuar')));
}

function ranking(v) {
  const topo = Math.max(1, ...v.ranking.map((r) => r.pontos));
  const empate = v.empatados.length > 1 && !v.vencedor;
  const linhas = v.ranking.map((r, i) => {
    const pct = Math.max(22, Math.round((Math.max(0, r.pontos) / topo) * 100));
    const vence = v.vencedor === r.cor;
    return el('div', { class: `rank-linha${vence ? ' vence' : ''}` },
      el('span', { class: 'rank-pos' }, `${i + 1}º`),
      el('div', { class: 'rank-trilho' },
        el('div', { class: 'rank-barra', style: `${estiloCor(r.cor)}width:${pct}%` },
          el('span', { class: `rank-nome${classeTam(nomeG(r.cor))}` }, nomeG(r.cor)),
          (v.lideres || []).includes(r.cor) ? el('span', { class: 'hab-selo rank-trofeu' }, el('img', { src: '/assets/trofeu.webp', alt: 'Vencedor' })) : null)),
      el('span', { class: `rank-pontos${r.pontos < 0 ? ' neg' : ''}` }, pontosTotal(r.pontos)),
      el('div', { class: 'rank-lado' },
        vence ? el('span', { class: 'rank-vence' }, 'Vencedor') : (r.elegivel === false ? el('span', { class: 'rank-inelegivel' }, TXT_CEL.naoElegivel) : null)));
  });
  const nota = empate
    ? 'Empate na primeira colocação'
    : v.desempatePendente ? 'Ninguém acertou o desempate' : null;
  return cena('c-ranking',
    el('p', { class: 'canto-resp' }, `Respondidas ${v.respondidas}/${v.meta}`),
    el('div', { class: 'conteudo coluna' },
      el('h1', { class: 'titulo-cena' }, 'Ranking'),
      el('div', { class: 'rank' }, linhas),
      nota ? el('p', { class: 'legenda-cena' }, nota) : null),
    navegacao(v, 'Próximo', () => v.acao('proximo'), !empate));
}

// Placar parcial: só cor e pontos, do maior para o menor, empates dividem a posição.
function placar(v) {
  const topo = Math.max(1, ...v.placar.map((r) => r.pontos));
  const linhas = v.placar.map((r) => {
    const pct = Math.max(22, Math.round((Math.max(0, r.pontos) / topo) * 100));
    return el('div', { class: 'rank-linha placar' },
      el('span', { class: 'rank-pos' }, `${r.posicao}º`),
      el('div', { class: 'rank-trilho' },
        el('div', { class: 'rank-barra', style: `${estiloCor(r.cor)}width:${pct}%` },
          el('span', { class: `rank-nome${classeTam(nomeG(r.cor))}` }, nomeG(r.cor)))),
      el('span', { class: `rank-pontos${r.pontos < 0 ? ' neg' : ''}` }, pontosTotal(r.pontos)));
  });
  return cena('c-ranking c-placar',
    el('p', { class: 'canto-resp' }, `Respondidas ${v.respondidas}/${v.meta}`),
    el('div', { class: 'conteudo coluna' },
      el('h1', { class: 'titulo-cena' }, 'Placar'),
      el('div', { class: 'rank' }, linhas),
      habsDesfecho({ ganhos: v.ganhos })),
    navegacao(v, 'Continuar', () => v.acao('continuar')));
}

function final(v) {
  const f = v.final;
  const vencedor = v.vencedor && v.ranking.find((r) => r.cor === v.vencedor);
  return el('section', { class: 'cena jogo c-final' },
    el('div', { class: 'fundo', html: fundoMenu() }),
    el('div', { class: 'conteudo coluna' },
      tituloDuasCores(f.mensagem),
      vencedor ? el('div', { class: 'final-vencedor', style: estiloCor(vencedor.cor) }, el('span', { class: 'hab-selo rank-trofeu' }, el('img', { src: '/assets/trofeu.webp', alt: 'Vencedor' })), `Vencedor: ${nomeG(vencedor.cor)}`) : null,
      el('ul', { class: 'integrantes' }, f.integrantes.map((n) => el('li', {}, n))),
      el('p', { class: 'orientador' }, `Professor orientador: ${f.professor}`)),
    navegacao(v, 'Próximo', () => v.acao('proximo')));
}

// Cena Regras, em 3 páginas (o responsável vira a página no painel): jogo, habilidades e Aposta.
export function cenaRegras(v) {
  const c = v.config;
  const pagina = v.pagina || 1;
  const D = descricoes(c);
  const T = textosAposta(c);
  const fundo = el('div', { class: 'fundo', html: fundoMenu() });
  const rodape = el('p', { class: 'regras-pagina' }, `Regras ${pagina} de 3`);
  if (pagina === 2) {
    const cartaoHab = (tipo) => el('div', { class: 'cartao regra regra-hab' },
      el('div', { class: 'regra-topo' }, el('span', { class: 'hab-selo regra-selo' }, el('img', { src: ICONES[tipo], alt: '' })), el('h2', {}, NOME_HAB[tipo])),
      el('p', {}, D[tipo]));
    return el('section', { class: 'cena jogo c-regras' }, fundo,
      el('div', { class: 'conteudo coluna' },
        tituloDuasCores('Habilidades'),
        el('p', { class: 'regras-escada' },
          `${resumoEscada(c)} Cada grupo guarda até ${c.estoqueMax} e usa 1 por rodada. O grupo escolhe no celular; o responsável confirma o alvo do Bloqueio.`),
        el('div', { class: 'regras-grade tres' }, ['bloqueio', 'escudo', 'passe', 'dobro', 'dica5050'].map(cartaoHab)),
        rodape));
  }
  if (pagina === 3) {
    return el('section', { class: 'cena jogo c-regras' }, fundo,
      el('div', { class: 'conteudo coluna' },
        tituloDuasCores('Aposta'),
        el('p', { class: 'regras-escada' }, T.introducao),
        el('div', { class: 'regras-grade' },
          el('div', { class: 'cartao regra regra-hab' },
            el('div', { class: 'regra-topo' }, el('span', { class: 'hab-selo regra-selo' }, el('img', { src: ICONES.aposta, alt: '' })), el('h2', {}, `Trocar ${c.apostaTrocaQtd} habilidades`)),
            el('p', {}, T.habilidades)),
          el('div', { class: 'cartao regra regra-hab' },
            el('div', { class: 'regra-topo' }, el('span', { class: 'hab-selo regra-selo' }, el('img', { src: ICONES.aposta, alt: '' })), el('h2', {}, `Pagar ${c.apostaCusto} pontos`)),
            el('p', {}, T.pontos))),
        el('p', { class: 'regras-escada' }, `Cada grupo pode apostar no máximo ${c.apostaMax} vezes por jogo. Os pontos podem ficar negativos, mas pagar com pontos não deixa o saldo abaixo de −${c.apostaDivida}.`),
        rodape));
  }
  const itens = [
    ['Como jogar', `Quando a janela de ${c.janela} segundos abrir, aperte o botão do celular. Só o primeiro aperto de cada grupo conta.`],
    ['Pontos', `Cada pergunta tem no máximo 2 respondentes. Quem acerta primeiro ganha ${c.pontosPrimeiro} pontos e o segundo ganha ${c.pontosSegundo}.${c.placarModo === 'cada' ? ` A cada ${c.placarN} respondidas aparece o placar parcial.` : c.placarModo === 'toda' ? ' Depois de cada rodada aparece o placar parcial.' : ''}`],
    ['Habilidades', `Os acertos seguidos viram marcas que o grupo troca por habilidades (próxima página). Cada grupo guarda até ${c.estoqueMax} e usa 1 por rodada. Só o erro zera a sequência.`],
    ['Rodada final', 'A última rodada vale pontos em dobro. Soprar a resposta desqualifica o jogador.'],
  ];
  return el('section', { class: 'cena jogo c-regras' }, fundo,
    el('div', { class: 'conteudo coluna' },
      tituloDuasCores('Regras do jogo'),
      el('div', { class: 'regras-grade' }, itens.map(([titulo, p]) =>
        el('div', { class: 'cartao regra' }, el('h2', {}, titulo), el('p', {}, p)))),
      rodape));
}

function pausado() {
  return el('div', { class: 'pausado', role: 'status' },
    el('div', { class: 'fundo', html: fundoDiscreto() }),
    el('p', { class: 'pausado-texto' }, 'Pausado'));
}

// ---------- montagem ----------
export function criarJogoTela({ acao }) {
  const refs = { contagem: null };
  let offset = 0; // diferença entre o relógio do servidor e o do navegador
  let atual = null;
  let chaveCena = '';
  const tocadas = new Set(); // ativações já animadas (nesta carga da página)
  let primeira = true;

  // Toca a animação de tela cheia quando uma ativação NOVA aparece. Quem abre a /tela no meio
  // da rodada não revê animações antigas.
  function verAtivacoes(v) {
    const atuais = new Map((v.avisos || []).map((a) => [`${v.rodada}|${a.cor}|${a.tipo}|${a.alvo}`, a]));
    // Escudo que anulou um Bloqueio e Passe do 1º respondente: também ganham a tela cheia de ~2 s.
    for (const x of v.anulacoes || []) atuais.set(`${v.rodada}|escudo|${x.alvo}|${x.atacante}`, { tipo: 'escudo', cor: x.alvo, alvo: x.atacante });
    for (const cor of v.passes || []) atuais.set(`${v.rodada}|passe|${cor}`, { tipo: 'passe', cor });
    for (const cor of v.dicas || []) atuais.set(`${v.rodada}|dica5050|${cor}`, { tipo: 'dica5050', cor, qtd: (v.eliminadas || []).length });
    for (const k of [...tocadas]) if (k.startsWith(`${v.rodada}|`) && !atuais.has(k)) tocadas.delete(k); // desfeita
    for (const [k, a] of atuais) {
      if (tocadas.has(k)) continue;
      tocadas.add(k);
      if (!primeira) tocarAtivacao(a);
    }
    primeira = false;
  }

  function restanteMs() {
    const j = atual?.janela;
    if (!j) return 0;
    if (atual.pausado || j.fimEm == null) return j.restanteMs ?? 0;
    return Math.max(0, j.fimEm - (Date.now() + offset));
  }

  function atualizarContagem() {
    if (!refs.contagem || !atual || atual.fase !== 'janela') return;
    const s = Math.ceil(restanteMs() / 1000);
    refs.contagem.textContent = String(s);
    refs.contagem.classList.toggle('fim', s <= 10);
  }
  setInterval(atualizarContagem, 100);

  const cenas = { pergunta, alternativas, janela, ordem, resposta, explicacao, so_correta: soCorreta, ranking, final, placar };

  // Devolve { no, chave } para a /tela decidir se refaz o quadro.
  function render(v) {
    usarNomes(v.nomes);
    offset = v.agora - Date.now();
    atual = v;
    refs.contagem = null;
    verAtivacoes(v);
    const vista = { ...v, acao };
    const no = (cenas[v.fase] || pergunta)(vista, refs);
    const chave = [v.fase, v.rodada, v.enunciado, v.erradas, v.atual, v.ordem, v.avisos, v.autenticado, v.aguardaDecisao,
      v.respondidas, v.ranking, v.vencedor, v.pausado, v.final, v.empatados, v.desempatePendente, v.ganhos, v.tentativas, v.eliminadas, v.dicas, v.apostas, v.placar, v.lideres, v.nomes, v.tema].map((x) => JSON.stringify(x)).join('|');
    const nova = chaveCena.split('#')[0] !== [v.fase, v.rodada].join('/');
    chaveCena = `${[v.fase, v.rodada].join('/')}#`;
    if (nova) no.classList.add('entra');
    const raiz = v.pausado ? [no, pausado()] : [no];
    queueMicrotask(atualizarContagem);
    return { nos: raiz, chave };
  }

  return { render };
}
