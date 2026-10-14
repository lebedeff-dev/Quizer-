'use strict';
// O que o celular de UM grupo pode fazer agora com habilidades (Etapa 8d), calculado só com dados do próprio
// grupo: estoque, saldo, oferta, pedido de Bloqueio, decisão de Escudo e a vez de responder. Puro: sem rede nem disco.
// As regras continuam em game.js; aqui só se decide o que mostrar (o servidor valida de novo cada ação).
const G = require('./game');

const FASES_PREPARO = ['pergunta', 'alternativas'];

// Parâmetros de regra que o celular precisa para escrever os textos (nada de outros grupos).
function regrasDoJogo(c) {
  const { apostaCusto, apostaMult, apostaTrocaQtd, apostaTrocaBonus, apostaTrocaPenal, apostaDivida, apostaMax, pontosPrimeiro, pontosSegundo, estoqueMax, seqBloqueio, seqDobro, seqDica, compraMax } = c;
  return { apostaCusto, apostaMult, apostaTrocaQtd, apostaTrocaBonus, apostaTrocaPenal, apostaDivida, apostaMax, pontosPrimeiro, pontosSegundo, estoqueMax, seqBloqueio, seqDobro, seqDica, compraMax };
}

// Por que a Aposta não pode ser feita agora (ou null). `modo` null = a Aposta em geral.
function motivoAposta(estado, g, modo) {
  const r = estado.rodada;
  const c = estado.config;
  if (g.apostas >= c.apostaMax) return `O grupo já fez ${g.apostas} de ${c.apostaMax} apostas permitidas neste jogo.`;
  if (modo === 'habilidades' && g.habilidades.length < c.apostaTrocaQtd) {
    return `O grupo tem ${g.habilidades.length} habilidade(s) guardada(s) e precisa de ${c.apostaTrocaQtd}.`;
  }
  if (modo === 'pontos') {
    if (r.final) return 'Não vale na rodada final.';
    if (g.pontos - c.apostaCusto < -c.apostaDivida) return `O saldo ficaria abaixo de −${c.apostaDivida} pontos.`;
  }
  return null;
}

function acoesBase(estado, cor, pedidos = {}) {
  const g = estado.grupos.find((x) => x.cor === cor);
  const r = estado.rodada;
  if (!g) return null;
  const out = { saldo: g.pontos, apostasFeitas: g.apostas, estoque: g.habilidades.map((h) => h.tipo) };
  // Acertos seguidos como moeda (8f): contador, se a troca é possível agora (ou o motivo) e as habilidades da faixa.
  if (r && !['espera', 'ranking', 'final', 'capa'].includes(estado.fase)) {
    const motivo = G.motivoTroca(estado, g);
    out.troca = {
      sequencia: g.sequencia,
      max: estado.config.seqDica,
      usadas: g.trocas,
      limite: estado.config.compraMax,
      pode: !motivo,
      motivo,
      opcoes: motivo ? [] : G.opcoesDaSequencia(estado.config, g.sequencia),
      cheio: g.habilidades.length >= estado.config.estoqueMax,
    };
  }
  if (!r || r.desempate) return out;
  const usou = r.usou[cor] || null;
  if (FASES_PREPARO.includes(estado.fase)) {
    out.preparo = true;
    out.usou = usou;
    const escudo = r.escudos.find((e) => e.alvo === cor);
    if (escudo) out.escudo = { atacante: escudo.atacante }; // decisão pendente: a janela espera por ela
    out.pedido = pedidos[cor] || null; // pedido de Bloqueio aguardando o responsável
    if (!usou && !out.pedido) {
      const usaveis = [...new Set(g.habilidades.map((h) => h.tipo))].filter((t) => ['dobro', 'bloqueio'].includes(t) && G.livres(g, r, t) > 0);
      out.usaveis = usaveis;
      if (usaveis.includes('bloqueio')) out.alvos = estado.grupos.filter((x) => x.cor !== cor).map((x) => x.cor);
      out.aposta = {
        motivo: out.escudo ? 'Responda antes à decisão do Escudo.' : motivoAposta(estado, g, null),
        habilidades: motivoAposta(estado, g, 'habilidades'),
        pontos: motivoAposta(estado, g, 'pontos'),
      };
      // Tigrinho: 3, 6, 9... rodadas sem pontuar e o grupo PODE apostar agora (as condições da Aposta) e ainda não dispensou.
      const n = g.rodadasSemPontos;
      const podeApostar = !out.escudo && !out.aposta.motivo && (!out.aposta.habilidades || !out.aposta.pontos);
      if (n >= 3 && n % 3 === 0 && g.tigrinhoVisto !== n && podeApostar) out.tigrinho = { n };
    }
  } else if (estado.fase === 'resposta' && !usou) {
    if (r.tentativas.length === 0 && r.pulos === 0 && r.ordem[0] === cor && r.ordem[1] && G.livres(g, r, 'passe') > 0) out.passe = true;
    if (r.tentativas.length + r.pulos === 1 && r.ordem[1] === cor && G.livres(g, r, 'dica5050') > 0) out.dica = { tirar: 2 - r.erradas.length };
  }
  return out;
}

// Estado de cada chip tocável do celular (Etapa 8j): para cada habilidade guardada e para a Aposta, se pode ser
// usada agora e, se não, o motivo em texto curto. É só apresentação: as regras continuam em game.js e o servidor
// valida de novo cada ação.
const MOTIVOS = {
  jaUsou: 'Já usaram uma habilidade nesta rodada.',
  janela: 'Só antes da janela de 30 s.',
  desempate: 'Não vale no desempate.',
  reservada: 'Está reservada na Aposta desta rodada.',
  pedido: 'Há um pedido de Bloqueio aguardando o responsável.',
  escudo: 'O Escudo é usado quando bloquearem vocês.',
  naoComecou: 'O jogo ainda não começou.',
  terminou: 'O jogo terminou.',
};

function usosDoGrupo(estado, g, cor, pedidos, base) {
  const r = estado.rodada;
  const fase = estado.fase;
  const emJogo = !!r && !['espera', 'ranking', 'final', 'capa'].includes(fase);
  const preparo = emJogo && FASES_PREPARO.includes(fase);
  const usou = r?.usou?.[cor] || null;
  const pedido = pedidos[cor] || null;
  const fora = fase === 'espera' ? MOTIVOS.naoComecou : !emJogo ? MOTIVOS.terminou : null;
  const reservada = (t) => emJogo && G.livres(g, r, t) < 1;
  const usos = {};
  const ok = () => ({ pode: true, motivo: null });
  const no = (motivo, extra = {}) => ({ pode: false, motivo, ...extra });

  // Bloqueio e Dobro: antes da janela, uma habilidade por rodada
  const antesDaJanela = (tipo) => {
    if (fora) return no(fora);
    if (r.desempate) return no(MOTIVOS.desempate);
    if (!preparo) return no(MOTIVOS.janela);
    if (usou) return no(MOTIVOS.jaUsou);
    if (reservada(tipo)) return no(MOTIVOS.reservada);
    if (pedido && tipo !== 'bloqueio') return no(MOTIVOS.pedido);
    return ok();
  };
  for (const tipo of new Set(g.habilidades.map((h) => h.tipo))) {
    if (tipo === 'bloqueio') {
      // com pedido enviado, o chip abre o pedido (para cancelar); sem outros grupos não há alvo
      usos.bloqueio = pedido && preparo ? { pode: true, motivo: null, pendente: true } : antesDaJanela('bloqueio');
      if (usos.bloqueio.pode && !pedido && !(base.alvos?.length)) usos.bloqueio = no('Não há outro grupo para bloquear.');
    } else if (tipo === 'dobro') usos.dobro = antesDaJanela('dobro');
    else if (tipo === 'escudo') usos.escudo = base.escudo ? ok() : no(MOTIVOS.escudo);
    else if (tipo === 'passe') {
      if (fora) usos.passe = no(fora);
      else if (r.desempate) usos.passe = no(MOTIVOS.desempate);
      else if (fase !== 'resposta') usos.passe = no('O Passe é usado na hora da resposta, pelo 1º respondente.');
      else if (r.ordem[0] !== cor || r.tentativas.length > 0 || r.pulos > 0) usos.passe = no('Só o 1º respondente pode passar a vez.');
      else if (!r.ordem[1]) usos.passe = no('Não há 2º respondente para receber a vez.');
      else if (usou) usos.passe = no(MOTIVOS.jaUsou);
      else if (reservada('passe')) usos.passe = no(MOTIVOS.reservada);
      else usos.passe = ok();
    } else if (tipo === 'dica5050') {
      if (fora) usos.dica5050 = no(fora);
      else if (r.desempate) usos.dica5050 = no(MOTIVOS.desempate);
      else if (fase !== 'resposta') usos.dica5050 = no('A Dica 50/50 é usada na hora da resposta, pelo 2º respondente.');
      else if (r.ordem[1] !== cor || r.tentativas.length + r.pulos !== 1) usos.dica5050 = no('Só o 2º respondente usa, quando for a vez dele.');
      else if (usou) usos.dica5050 = no(MOTIVOS.jaUsou);
      else if (reservada('dica5050')) usos.dica5050 = no(MOTIVOS.reservada);
      else usos.dica5050 = ok();
    }
  }
  // Aposta: sempre existe; habilitada pelas regras e fases da Aposta
  if (fora) usos.aposta = no(fora);
  else if (r.desempate) usos.aposta = no(MOTIVOS.desempate);
  else if (!preparo) usos.aposta = no(MOTIVOS.janela);
  else if (usou) usos.aposta = no(MOTIVOS.jaUsou);
  else if (pedido) usos.aposta = no(MOTIVOS.pedido);
  else if (base.escudo) usos.aposta = no('Responda antes à decisão do Escudo.');
  else usos.aposta = base.aposta?.motivo ? no(base.aposta.motivo) : ok();
  return usos;
}

function acoesDoGrupo(estado, cor, pedidos = {}) {
  const out = acoesBase(estado, cor, pedidos);
  if (!out) return out;
  const g = estado.grupos.find((x) => x.cor === cor);
  out.habs = usosDoGrupo(estado, g, cor, pedidos, out);
  return out;
}

module.exports = { acoesDoGrupo, regrasDoJogo, motivoAposta };
