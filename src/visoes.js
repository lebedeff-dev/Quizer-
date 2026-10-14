'use strict';
// Constrói o que cada tipo de cliente pode ver. A /tela e os celulares nunca recebem
// a alternativa correta nem a explicação antes da hora.
const G = require('./game');
const { acoesDoGrupo, regrasDoJogo } = require('./celular');
const CFG = require('./config-campos');
const { nomesDosGrupos } = require('./nomes');

const FASES_COM_ALTERNATIVAS = ['alternativas', 'resposta', 'explicacao', 'so_correta'];
const FASES_COM_ORDEM = ['ordem', 'resposta', 'explicacao', 'so_correta'];

function perguntaDaRodada(estado) {
  return estado.rodada ? estado.perguntas.find((p) => p.id === estado.rodada.perguntaId) : null;
}

function ordemVisivel(estado) {
  return estado.rodada.ordem.map((cor, i) => ({
    cor,
    posicao: i + 1,
  }));
}

function janelaInfo(estado, janela) {
  if (estado.fase !== 'janela') return null;
  return { fimEm: janela.fimEm, restanteMs: janela.restanteMs, pausado: estado.pausado };
}

const r0Ganhos = (estado) => (estado.rodada ? estado.rodada.ganhos : []);

function emAndamento(estado) {
  return estado.fase !== 'capa' && (estado.fase !== 'espera' || estado.grupos.length > 0);
}

// Opacidade (0 a 30, por cento) das imagens decorativas dos times; vale na hora, mesmo com partida em andamento.
function opacidadeImagens(ctx) {
  const v = ctx.configJogo?.imagensOpacidade;
  return Number.isInteger(v) && v >= 0 && v <= 30 ? v : G.CONFIG_PADRAO.imagensOpacidade;
}

function visaoTela(ctx) {
  const { estado, ui, final } = ctx;
  const base = { papel: 'tela', agora: Date.now(), nomes: nomesDosGrupos(estado.grupos, ui.tema), imagens: opacidadeImagens(ctx), tema: ui.tema, autenticado: !!ctx.autenticado, disciplina: final.disciplina };
  if (ui.cena !== 'jogo' || estado.fase === 'capa') return { ...base, cena: 'capa' };
  if (ui.regras) return { ...base, cena: 'regras', config: estado.config, pagina: Number(ui.regras) || 1 };
  if (ui.teste.ativo && estado.fase === 'espera') {
    return {
      ...base,
      cena: 'teste',
      grupos: estado.grupos.map((g) => ({ cor: g.cor, conectado: g.conectado })),
      ordem: ui.teste.ordem,
      ultimo: ui.teste.ultimo,
      nonce: ui.teste.nonce,
    };
  }
  if (estado.fase === 'espera') {
    return {
      ...base,
      cena: 'espera',
      cores: G.CORES.map((cor) => {
        const g = estado.grupos.find((x) => x.cor === cor);
        return { cor, ocupada: !!g, conectado: !!g?.conectado };
      }),
      corSelecionada: ui.corSelecionada,
      qr: ui.corSelecionada ? `/api/qr/${ui.corSelecionada}.svg?v=${ui.ip || ''}` : null,
    };
  }
  const fase = estado.fase;
  const v = { ...base, cena: 'jogo', fase, respondidas: estado.respondidas, meta: estado.config.meta, pausado: estado.pausado };
  if (fase === 'placar') {
    v.placar = G.placar(estado);
    v.ganhos = r0Ganhos(estado); // trocas de acertos feitas nesta pausa do placar
    return v;
  }
  if (fase === 'ranking' || fase === 'final') {
    v.ranking = G.classificacao(estado);
    v.lideres = G.lideres(estado);
    v.vencedor = G.vencedor(estado);
    v.empatados = G.empatadosNoTopo(estado);
    v.desempatePendente = !!estado.desempate && !estado.desempate.vencedor;
    // Comemoração: o projetor recebe o vencedor (nome do grupo e pontos) e se o banner está na tela.
    if (fase === 'ranking' && ctx.comemoracao) {
      const c = ctx.comemoracao;
      v.comemoracao = { id: c.id, banner: c.banner, cor: c.cor, nome: nomesDosGrupos(estado.grupos, ui.tema)[c.cor], pontos: v.ranking.find((r) => r.cor === c.cor)?.pontos ?? 0 };
    }
    if (fase === 'final') v.final = final;
    return v;
  }
  const r = estado.rodada;
  const p = perguntaDaRodada(estado);
  v.rodada = r.numero;
  v.rodadaFinal = r.final;
  v.desempate = r.desempate;
  v.enunciado = p.enunciado;
  v.avisos = Object.entries(r.ativacoes).map(([cor, a]) => ({
    cor, tipo: a.tipo, alvo: a.alvo,
    // Aposta: só o modo e a quantia (pontos pagos ou nº de habilidades), nunca quais habilidades.
    ...(a.tipo === 'aposta' ? { modo: a.modo, detalhe: a.modo === 'pontos' ? r.apostas[cor].custo : r.apostas[cor].reservadas.length } : {}),
    anulado: a.tipo === 'bloqueio' && r.anulacoes.some((x) => x.atacante === cor && x.alvo === a.alvo), // Escudo anulou
  }));
  if (FASES_COM_ALTERNATIVAS.includes(fase)) v.alternativas = p.alternativas;
  if (FASES_COM_ORDEM.includes(fase)) {
    v.ordem = ordemVisivel(estado);
    v.atual = G.respondenteAtual(estado);
  }
  if (fase === 'resposta' || fase === 'explicacao' || fase === 'so_correta') v.erradas = r.erradas;
  if (fase === 'resposta') v.eliminadas = r.eliminadas; // retiradas pela Dica 50/50 (aparecem apagadas)
  if (fase === 'explicacao' || fase === 'so_correta') {
    v.correta = p.correta;
    v.tentativas = r.tentativas.map((t) => ({ cor: t.cor, tipo: t.tipo, alternativa: t.alternativa, pontos: t.pontos, dobro: r.dobros.includes(t.cor), ...(t.aposta ? { aposta: t.aposta } : {}) }));
    // Apostas da rodada (cobradas ou devolvidas): a /tela mostra o resultado só depois do desfecho.
    if (Object.keys(r.apostas).length) v.apostas = Object.entries(r.apostas).map(([cor, a]) => ({ cor, modo: a.modo, estado: a.estado, delta: a.delta }));
    // Habilidades ganhas ao fim desta rodada: a /tela comemora com o ícone.
    v.ganhos = r.ganhos;
  }
  if (fase === 'explicacao') v.explicacao = p.explicacao;
  if (fase === 'pergunta' || fase === 'alternativas') v.ganhos = r.ganhos; // trocas feitas antes da janela
  v.anulacoes = r.anulacoes; // Escudo anulou um Bloqueio: a /tela mostra a animação
  if (r.passes.length) v.passes = r.passes;
  if (r.dicas.length) v.dicas = r.dicas;
  v.janela = janelaInfo(estado, ctx.janela);
  return v;
}

function visaoHost(ctx) {
  const { estado, ui, ips, porta } = ctx;
  const { perguntas, _undo, ...resto } = estado;
  const ipPainel = ips.some((i) => i.ip === ui.ip) ? ui.ip : null; // endereço para abrir o /host em outro aparelho
  const p = perguntaDaRodada(estado);
  return {
    papel: 'host',
    agora: Date.now(),
    nomes: nomesDosGrupos(estado.grupos, ui.tema), // nome de exibição de cada grupo (o que o grupo digitou)
    imagens: opacidadeImagens(ctx),
    ui,
    estado: resto,
    pergunta: p || null,
    atual: G.respondenteAtual(estado),
    podeDesfazer: _undo.length,
    totalPerguntas: perguntas.length,
    totalBanco: perguntas.filter((x) => !x.reserva).length,
    emAndamento: emAndamento(estado),
    janela: janelaInfo(estado, ctx.janela),
    ranking: G.classificacao(estado),
    lideres: G.lideres(estado),
    empatados: G.empatadosNoTopo(estado),
    vencedor: G.vencedor(estado),
    ips,
    porta,
    final: ctx.final,
    perguntasInfo: ctx.perguntasInfo,
    pin: ctx.pin,
    semRede: ips.length === 0,
    enderecoPainel: ipPainel ? `http://${ipPainel}:${porta}/host` : null,
    registroTotal: ctx.registroTotal,
    pedidos: Object.entries(ctx.pedidos || {}).map(([cor, alvo]) => ({ cor, alvo })),
    configJogo: ctx.configJogo,
    comemoracao: ctx.comemoracao ? { id: ctx.comemoracao.id, banner: ctx.comemoracao.banner } : null,
    // Botão Comemorar do Ranking: habilitado só com vencedor definido pela regra de sempre.
    podeComemorar: estado.fase !== 'ranking' ? { pode: false, motivo: 'A comemoração é feita na tela de Ranking.' } : G.vencedor(estado) ? { pode: true, motivo: null } : { pode: false, motivo: 'Defina o vencedor antes de comemorar.' },
    padroes: ctx.padroes,
    camposConfig: CFG.secoesParaTela(),
  };
}

function visaoGrupo(ctx, cor, ligado) {
  const { estado, ui } = ctx;
  const base = { papel: 'g', agora: Date.now(), imagens: opacidadeImagens(ctx), tema: ui.tema, cor, registrado: !!ligado };
  const g = estado.grupos.find((x) => x.cor === cor);
  const nomes = nomesDosGrupos(estado.grupos, ui.tema);
  if (!ligado || !g) {
    // Quem ainda não entrou: a visão diz se dá para entrar (livre), se a cor está ocupada,
    // se a partida já começou ou se o responsável ainda não abriu o jogo.
    let entrada = 'livre';
    if (ui.cena !== 'jogo' || estado.fase === 'capa') entrada = 'fechada';
    else if (g) entrada = 'ocupada';
    else if (estado.fase !== 'espera') entrada = 'comecou';
    return { ...base, registrado: false, botao: 'espera', entrada };
  }
  const emRodada = ui.cena === 'jogo' && estado.rodada && !['espera', 'ranking', 'final', 'capa', 'placar'].includes(estado.fase);
  const v = {
    ...base,
    nome: nomes[cor], // o nome do próprio grupo
    pausado: estado.pausado,
    habilidades: g.habilidades.map((h) => h.tipo), // estoque guardado (até 2)
    rodada: estado.rodadaNum,
    regras: regrasDoJogo(estado.config),
    acoes: acoesDoGrupo(estado, cor, ctx.pedidos || {}), // só o que este grupo pode fazer agora
    ...(ctx.recusados?.[cor] ? { pedidoRecusado: ctx.recusados[cor] } : {}),
    ativa: emRodada ? estado.rodada.usou[cor] || null : null, // usada nesta rodada
  };
  // Nomes só dos grupos que o celular precisa nomear agora: alvos do Bloqueio, quem bloqueou e o pedido pendente.
  const citados = new Set([...(v.acoes?.alvos || []), v.acoes?.escudo?.atacante, v.acoes?.pedido, v.pedidoRecusado].filter(Boolean));
  if (citados.size) v.acoes = { ...v.acoes, nomes: Object.fromEntries([...citados].map((c) => [c, nomes[c]])) };
  // Comemoração: o celular só sabe se o grupo venceu (fogos) e a mensagem; nada de pontos nem de outros grupos.
  if (ctx.comemoracao) v.comemoracao = { id: ctx.comemoracao.id, vencedor: ctx.comemoracao.cor === cor, mensagem: ctx.final?.parabens || '' };
  if (emRodada) {
    const r0 = estado.rodada;
    const ap = r0.apostas[cor];
    if (ap) v.aposta = { modo: ap.modo, estado: ap.estado, delta: ap.delta }; // a Aposta do próprio grupo
    if (ap && ap.estado === 'ativa' && ap.modo === 'habilidades') v.reservadas = ap.reservadas;
    // A Dica 50/50 usada pelo grupo: as alternativas eliminadas (o celular mostra as letras apagadas).
    if (r0.dicas.includes(cor)) v.eliminadas = r0.eliminadas;
  }
  if (ui.teste.ativo && estado.fase === 'espera') return { ...v, botao: 'teste' };
  const r = estado.rodada;
  if (estado.fase === 'placar') return { ...v, botao: 'placar' };
  if (ui.cena !== 'jogo' || !r || ['espera', 'ranking', 'final', 'capa'].includes(estado.fase)) return { ...v, botao: 'espera' };
  const bloqueado = !!r.bloqueios[cor];
  const pos = r.ordem.indexOf(cor);
  if (bloqueado) return { ...v, botao: 'bloqueado' };
  if (estado.fase === 'janela') {
    if (pos >= 0) return { ...v, botao: 'registrado', posicao: pos + 1 };
    if (estado.pausado) return { ...v, botao: 'pausado' };
    return { ...v, botao: 'aberto', janela: janelaInfo(estado, ctx.janela) };
  }
  if (pos >= 0) return { ...v, botao: 'registrado', posicao: pos + 1 };
  return { ...v, botao: 'fora' };
}

module.exports = { visaoTela, visaoHost, visaoGrupo, emAndamento };
