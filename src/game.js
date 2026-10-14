'use strict';
// Regras do jogo, puras: sem rede, disco ou relógio.
// Cada função recebe um estado e devolve um NOVO estado (ou lança ErroJogo).
// Cliques ignorados devolvem o mesmo objeto de estado recebido.

const CORES = ['vermelho', 'azul', 'verde', 'amarelo', 'laranja', 'roxo', 'rosa', 'ciano', 'preto', 'cinza'];
const MAX_DESFAZER = 20;
const MAX_TENTATIVAS = 2;

// Habilidades (regras em docs/regras-habilidades.md). Cada grupo guarda até `estoqueMax`.
const TIPOS_HAB = ['bloqueio', 'dobro', 'escudo', 'passe', 'dica5050'];
const ATIVAVEIS = ['bloqueio', 'dobro']; // ativadas antes da janela de cliques
const VERSAO = 6; // 1 = Dobro automático; 2 = escada de ofertas e estoque; 3 = Dica 50/50, Aposta, negativos; 4 = acertos como moeda; 5 = limite de trocas; 6 = rodadas sem pontuar (Tigrinho)

const CONFIG_PADRAO = {
  meta: 14,
  janela: 30,
  pontosPrimeiro: 10,
  pontosSegundo: 5,
  seqBloqueio: 3, // 1º marco da escada: oferece Bloqueio, Escudo ou Passe
  seqDobro: 5, //    2º marco: oferece o Dobro
  seqDica: 7, //     3º marco: oferece a Dica 50/50
  estoqueMax: 2,
  apostaCusto: 10, //       modo "pagar pontos": quanto o grupo paga
  apostaMult: 3, //         modo "pagar pontos": os pontos da rodada valem esse tanto
  apostaTrocaQtd: 2, //     modo "trocar habilidades": quantas habilidades o grupo entrega
  apostaTrocaBonus: 10, //  modo "trocar habilidades": bônus ao acertar
  apostaTrocaPenal: 5, //   modo "trocar habilidades": pontos perdidos ao errar
  apostaDivida: 20, //      o modo "pagar pontos" não deixa o saldo abaixo de -apostaDivida
  apostaMax: 2, //          apostas cobradas por grupo por jogo (soma dos dois modos)
  compraMax: 3, //          trocas de acertos por habilidade que cada grupo pode fazer por jogo
  placarModo: 'cada', //    placar parcial: 'desligado', 'cada' (a cada placarN respondidas) ou 'toda' rodada
  placarN: 7, //            de quantas em quantas respondidas aparece o placar parcial
  placarOcultar: 0, //      não mostra o placar nas últimas K respondidas do jogo
  imagensOpacidade: 12, //  opacidade (0 a 30 por cento) das imagens decorativas dos times; 0 desliga
};

// A Dica 50/50 (3º marco) precisa pedir mais acertos que o Dobro (2º marco).
function normalizarConfig(config) {
  const c = { ...CONFIG_PADRAO, ...config };
  if (!(c.seqDica > c.seqDobro)) c.seqDica = c.seqDobro + 2;
  if (!['desligado', 'cada', 'toda'].includes(c.placarModo)) c.placarModo = CONFIG_PADRAO.placarModo;
  return c;
}

// Acertos seguidos viram moeda (Etapa 8f): o contador vai de 0 até seqDica (7 por padrão) e para aí. Com ele o grupo
// troca acertos por UMA habilidade, quando quiser. As faixas são cumulativas: seqBloqueio ou mais (Bloqueio, Escudo,
// Passe), seqDobro ou mais (+ Dobro), seqDica (+ Dica 50/50).
function opcoesDaSequencia(config, n) {
  if (n >= config.seqDica) return ['bloqueio', 'escudo', 'passe', 'dobro', 'dica5050'];
  if (n >= config.seqDobro) return ['bloqueio', 'escudo', 'passe', 'dobro'];
  if (n >= config.seqBloqueio) return ['bloqueio', 'escudo', 'passe'];
  return [];
}

// Fases em que o grupo pode trocar acertos por habilidade: até a janela de 30 s abrir.
const FASES_TROCA = ['explicacao', 'so_correta', 'placar', 'pergunta', 'alternativas'];

// Por que a troca não é possível agora (ou null).
function motivoTroca(state, g) {
  const c = state.config;
  if (g.trocas >= c.compraMax) return c.compraMax === 1 ? 'Seu grupo já usou a única troca do jogo.' : `Seu grupo já usou as ${c.compraMax} trocas do jogo.`;
  if (!FASES_TROCA.includes(state.fase)) return 'Só antes da janela de 30 s.';
  if (state.rodada?.desempate) return 'Não vale no desempate.';
  if (state.respondidas >= c.meta) return 'O jogo está no fim.';
  if (g.sequencia < c.seqBloqueio) {
    const falta = c.seqBloqueio - g.sequencia;
    return `Faltam ${falta} ${falta === 1 ? 'acerto' : 'acertos'} para trocar.`;
  }
  return null;
}

class ErroJogo extends Error {}

function falhar(msg) {
  throw new ErroJogo(msg);
}

// ---------- utilitários internos ----------

// Clona o estado, empilha o anterior em _undo e aplica a mudança no clone.
function mut(state, fn) {
  const { _undo, ...resto } = state;
  const novo = structuredClone(resto);
  novo._undo = [..._undo.slice(-(MAX_DESFAZER - 1)), resto];
  fn(novo);
  return novo;
}

function grupo(state, cor) {
  const g = state.grupos.find((x) => x.cor === cor);
  if (!g) falhar(`Grupo inexistente: ${cor}`);
  return g;
}

function perguntaAtual(state) {
  return state.perguntas.find((p) => p.id === state.rodada.perguntaId);
}

function perguntasDoJogo(state) {
  return state.perguntas.filter((p) => !p.reserva);
}

function registrar(state, tipo, msg) {
  state.log.push({ tipo, msg });
}

function exigirFase(state, ...fases) {
  if (!fases.includes(state.fase)) falhar(`Ação inválida na fase "${state.fase}"`);
}

function bloqueados(rodada) {
  return Object.keys(rodada.bloqueios);
}

// Habilidades que a Aposta (modo "trocar habilidades") deixou reservadas: só saem do estoque quando a aposta é cobrada.
function reservadasDe(r, cor) {
  const a = r?.apostas?.[cor];
  return a && a.estado === 'ativa' && a.modo === 'habilidades' ? a.reservadas : [];
}

// Quantas habilidades deste tipo o grupo pode usar agora (guardadas menos reservadas).
function livres(g, r, tipo) {
  return g.habilidades.filter((h) => h.tipo === tipo).length - reservadasDe(r, g.cor).filter((x) => x === tipo).length;
}

function participantes(state) {
  const r = state.rodada;
  return state.grupos.filter((g) => g.conectado && (!r.participantes || r.participantes.includes(g.cor)));
}

// ---------- criação e grupos ----------

function criarJogo({ config = {}, perguntas = [] } = {}) {
  return {
    config: normalizarConfig(config),
    perguntas: structuredClone(perguntas),
    grupos: [],
    fase: 'espera',
    rodadaNum: 0,
    indice: 0,
    respondidas: 0,
    rodada: null,
    pausado: false,
    desempate: null,
    perguntasUsadas: [],
    log: [],
    versao: VERSAO,
    _undo: [],
  };
}

function novoGrupo(cor, representante) {
  return {
    cor,
    representante,
    conectado: true,
    pontos: 0,
    sequencia: 0,
    habilidades: [], // estoque: [{ tipo }], até config.estoqueMax
    apostas: 0, // apostas já cobradas neste jogo (limite: config.apostaMax)
    trocas: 0, // trocas de acertos por habilidade já feitas neste jogo (limite: config.compraMax)
    rodadasSemPontos: 0, // rodadas seguidas (sem contar desempate) em que o grupo não ganhou ponto algum
    tigrinhoVisto: 0, // contagem de rodadasSemPontos cuja mensagem do Tigrinho o grupo já dispensou
    elegivel: true,
  };
}

function registrarGrupo(state, cor, representante) {
  if (!CORES.includes(cor)) falhar(`Cor inválida: ${cor}`);
  exigirFase(state, 'espera');
  return mut(state, (s) => {
    const g = s.grupos.find((x) => x.cor === cor);
    if (g) {
      g.representante = representante;
      g.conectado = true;
    } else {
      s.grupos.push(novoGrupo(cor, representante));
    }
  });
}

// Conexão não entra no histórico de desfazer: é um fato da rede, não uma ação do jogo.
function definirConectado(state, cor, conectado) {
  const g = grupo(state, cor);
  if (g.conectado === !!conectado) return state;
  const novo = structuredClone(state);
  novo._undo = state._undo;
  grupo(novo, cor).conectado = !!conectado;
  return novo;
}

// Alinha o campo "conectado" de todos os grupos com o conjunto de cores realmente conectadas.
function sincronizarConexoes(state, coresConectadas) {
  let s = state;
  for (const g of state.grupos) s = definirConectado(s, g.cor, coresConectadas.has(g.cor));
  return s;
}

function renomearGrupo(state, cor, representante) {
  grupo(state, cor);
  const nome = String(representante || '').trim();
  if (!nome) falhar('O nome do grupo não pode ficar vazio.');
  return mut(state, (s) => {
    grupo(s, cor).representante = nome;
  });
}

function liberarGrupo(state, cor) {
  grupo(state, cor);
  exigirFase(state, 'espera');
  return mut(state, (s) => {
    s.grupos = s.grupos.filter((g) => g.cor !== cor);
  });
}

// Atualiza o banco de perguntas do jogo (só antes de começar).
function definirPerguntas(state, perguntas) {
  exigirFase(state, 'espera');
  return mut(state, (s) => {
    s.perguntas = structuredClone(perguntas);
  });
}

function novoJogo(state) {
  const base = criarJogo({ config: state.config, perguntas: state.perguntas });
  base.grupos = state.grupos.map((g) => ({ ...novoGrupo(g.cor, g.representante), conectado: g.conectado }));
  return base;
}

// ---------- fluxo da rodada ----------

function iniciarRodada(s, desempate = null) {
  const pool = perguntasDoJogo(s);
  let pergunta;
  if (desempate) {
    const livres = s.perguntas.filter((p) => !s.perguntasUsadas.includes(p.id));
    const base = livres.length ? livres : s.perguntas;
    pergunta = base.find((p) => p.reserva) || base[0];
  } else {
    pergunta = pool[s.indice];
    s.indice += 1;
  }
  if (!pergunta) falhar('Não há pergunta disponível');
  s.perguntasUsadas.push(pergunta.id);
  s.rodadaNum += 1;
  s.fase = 'pergunta';
  s.rodada = {
    numero: s.rodadaNum,
    perguntaId: pergunta.id,
    final: !desempate && s.respondidas === s.config.meta - 1,
    desempate: !!desempate,
    participantes: desempate ? desempate : null,
    ordem: [],
    tentativas: [], // { cor, tipo: 'certa'|'errada'|'desqualificado'|'sem_resposta', alternativa, pontos }
    erradas: [],
    correta: null, // índice da alternativa correta, revelado só no desfecho
    bloqueios: {}, // alvo -> [quem bloqueou]
    ativacoes: {}, // cor -> { tipo, alvo }
    dobros: [],
    usou: {}, // cor -> tipo da habilidade usada na rodada (no máximo 1 por grupo; o Escudo não conta)
    escudos: [], // decisões de Escudo pendentes: { atacante, alvo }
    anulacoes: [], // Bloqueios anulados pelo Escudo: { atacante, alvo }
    apostas: {}, // cor -> { modo, reservadas, custo, mult, bonus, penal, estado: 'ativa'|'cobrada'|'devolvida', delta }
    eliminadas: [], // alternativas retiradas pela Dica 50/50 (diferentes de "erradas", que foram tentadas)
    dicas: [], // quem usou a Dica 50/50
    pulos: 0, // 1 se o 1º respondente usou o Passe
    passes: [], // quem usou o Passe
    ganhos: [], // habilidades compradas com acertos durante esta rodada: { cor, tipo, acertos }
    desfecho: null, // 'explicacao' | 'so_correta'
  };
}

function iniciar(state) {
  exigirFase(state, 'espera');
  const conectados = state.grupos.filter((g) => g.conectado);
  if (conectados.length < 2) falhar('Conecte pelo menos 2 grupos');
  if (!perguntasDoJogo(state).length) falhar('Não há perguntas');
  return mut(state, (s) => {
    s.grupos = s.grupos.filter((g) => g.conectado);
    iniciarRodada(s);
    registrar(s, 'jogo', 'Jogo iniciado');
  });
}

function mostrarAlternativas(state) {
  exigirFase(state, 'pergunta');
  return mut(state, (s) => {
    s.fase = 'alternativas';
  });
}

function abrirJanela(state) {
  exigirFase(state, 'alternativas');
  if (state.rodada.escudos.length) falhar('Registre a decisão do grupo sobre o Escudo antes de abrir a janela');
  return mut(state, (s) => {
    s.fase = 'janela';
  });
}

// Ativa Bloqueio ou Dobro do estoque, antes da janela. Uma habilidade usada por grupo por rodada.
function ativarHabilidade(state, cor, tipo, alvo) {
  exigirFase(state, 'pergunta', 'alternativas');
  const r0 = state.rodada;
  if (r0.desempate) falhar('Sem habilidades no desempate');
  if (!ATIVAVEIS.includes(tipo)) falhar('Esta habilidade não se ativa antes da janela');
  const g0 = grupo(state, cor);
  if (livres(g0, r0, tipo) < 1) falhar('O grupo não tem esta habilidade');
  if (r0.usou[cor]) falhar('Uma habilidade por grupo por rodada');
  if (tipo === 'bloqueio') {
    if (!alvo || alvo === cor) falhar('Escolha outro grupo como alvo');
    grupo(state, alvo);
  }
  return mut(state, (s) => {
    const g = grupo(s, cor);
    const r = s.rodada;
    g.habilidades.splice(g.habilidades.findIndex((h) => h.tipo === tipo), 1); // consumida na ativação, mesmo sem pontos
    r.usou[cor] = tipo;
    r.ativacoes[cor] = { tipo, alvo: tipo === 'bloqueio' ? alvo : null };
    if (tipo === 'bloqueio') {
      r.bloqueios[alvo] = [...(r.bloqueios[alvo] || []), cor];
      // O alvo tem Escudo guardado: o grupo decide (antes da janela) se usa.
      if (livres(grupo(s, alvo), r, 'escudo') > 0) r.escudos.push({ atacante: cor, alvo });
    } else {
      r.dobros.push(cor);
    }
    registrar(s, 'habilidade', `${cor} ativou ${tipo}${tipo === 'bloqueio' ? ` sobre ${alvo}` : ''}`);
  });
}

// O grupo que tem Escudo decide, antes da janela, se anula o Bloqueio. Se usar, os dois são consumidos.
function decidirEscudo(state, alvo, atacante, usar) {
  exigirFase(state, 'pergunta', 'alternativas');
  const pendente = state.rodada.escudos.find((e) => e.alvo === alvo && e.atacante === atacante);
  if (!pendente) falhar('Não há decisão de Escudo pendente');
  return mut(state, (s) => {
    const r = s.rodada;
    r.escudos = r.escudos.filter((e) => !(e.alvo === alvo && e.atacante === atacante));
    if (!usar) {
      registrar(s, 'habilidade', `${alvo} guardou o Escudo e aceitou o Bloqueio de ${atacante}`);
      return;
    }
    const g = grupo(s, alvo);
    const i = g.habilidades.findIndex((h) => h.tipo === 'escudo');
    if (i < 0 || livres(g, r, 'escudo') < 1) falhar('O grupo não tem mais o Escudo');
    g.habilidades.splice(i, 1);
    const lista = (r.bloqueios[alvo] || []).filter((c) => c !== atacante);
    if (lista.length) r.bloqueios[alvo] = lista;
    else delete r.bloqueios[alvo];
    r.anulacoes.push({ atacante, alvo });
    registrar(s, 'habilidade', `${alvo} usou o Escudo: o Bloqueio de ${atacante} foi anulado`);
    // Sem outro Escudo, os demais Bloqueios sobre o mesmo alvo não têm o que perguntar: valem sem Escudo.
    if (livres(g, r, 'escudo') < 1) {
      for (const outro of r.escudos.filter((e) => e.alvo === alvo)) {
        registrar(s, 'habilidade', `${alvo} aceitou o Bloqueio de ${outro.atacante}, sem Escudo`);
      }
      r.escudos = r.escudos.filter((e) => e.alvo !== alvo);
    }
  });
}

// Aposta (não é habilidade de estoque): o grupo arrisca antes da janela e só paga se de fato responder.
// modo 'habilidades': entrega config.apostaTrocaQtd habilidades guardadas (`trocar` = posições no estoque);
// modo 'pontos': paga config.apostaCusto pontos e os pontos da rodada valem apostaMult vezes.
function apostar(state, cor, modo, trocar = []) {
  exigirFase(state, 'pergunta', 'alternativas');
  const r0 = state.rodada;
  const c = state.config;
  if (r0.desempate) falhar('Sem habilidades no desempate');
  if (modo !== 'habilidades' && modo !== 'pontos') falhar('Escolha como o grupo vai pagar a Aposta');
  const g0 = grupo(state, cor);
  if (r0.usou[cor]) falhar('Uma habilidade por grupo por rodada');
  if (r0.escudos.some((e) => e.alvo === cor)) falhar('Registre antes a decisão do grupo sobre o Escudo');
  if (g0.apostas >= c.apostaMax) falhar(`Cada grupo pode fazer no máximo ${c.apostaMax} apostas por jogo`);
  let reservadas = [];
  if (modo === 'habilidades') {
    const pos = Array.isArray(trocar) ? trocar : [];
    const validas = pos.every((i) => Number.isInteger(i) && i >= 0 && i < g0.habilidades.length);
    if (!validas || new Set(pos).size !== c.apostaTrocaQtd) falhar(`Escolha ${c.apostaTrocaQtd} habilidades guardadas para trocar`);
    reservadas = pos.map((i) => g0.habilidades[i].tipo);
  } else {
    if (r0.final) falhar('A Aposta com pontos não vale na rodada final');
    if (g0.pontos - c.apostaCusto < -c.apostaDivida) falhar(`Saldo insuficiente: a Aposta deixaria o grupo abaixo de −${c.apostaDivida} pontos`);
  }
  return mut(state, (s) => {
    const r = s.rodada;
    r.usou[cor] = 'aposta';
    r.ativacoes[cor] = { tipo: 'aposta', alvo: null, modo };
    r.apostas[cor] = {
      modo, reservadas, custo: c.apostaCusto, mult: c.apostaMult, bonus: c.apostaTrocaBonus, penal: c.apostaTrocaPenal,
      estado: 'ativa', delta: null,
    };
    registrar(s, 'habilidade', `${cor} ativou Aposta (${modo === 'habilidades' ? `entrega ${reservadas.join(' e ')}` : `paga ${c.apostaCusto} pontos`})`);
  });
}

// Cobra a Aposta quando o grupo realmente responde (acertou, errou, foi desqualificado ou ficou sem resposta).
// `tent.pontos` chega com os pontos normais da rodada e sai com a variação total do grupo na rodada.
function cobrarAposta(s, cor, tent) {
  const a = s.rodada.apostas[cor];
  if (!a || a.estado !== 'ativa') return;
  const g = grupo(s, cor);
  const certa = tent.tipo === 'certa';
  let extra;
  if (a.modo === 'habilidades') {
    extra = certa ? a.bonus : -a.penal; // o bônus é fixo: não é dobrado pela rodada final nem pelo Dobro
    for (const tipo of a.reservadas) g.habilidades.splice(g.habilidades.findIndex((h) => h.tipo === tipo), 1);
  } else {
    extra = (certa ? tent.pontos * (a.mult - 1) : 0) - a.custo; // pontos x3 menos os pagos
  }
  g.pontos += extra;
  tent.pontos += extra;
  g.apostas += 1;
  a.estado = 'cobrada';
  a.delta = tent.pontos;
  tent.aposta = { modo: a.modo, delta: tent.pontos };
  registrar(s, 'habilidade', `${cor}: Aposta cobrada (${tent.pontos} pontos na rodada)`);
}

function clicar(state, cor) {
  if (state.fase !== 'janela' || state.pausado) return state;
  const r = state.rodada;
  const g = state.grupos.find((x) => x.cor === cor);
  if (!g || !g.conectado) return state;
  if (r.participantes && !r.participantes.includes(cor)) return state;
  if (r.bloqueios[cor]) return state;
  if (r.ordem.includes(cor)) return state;
  const novo = mut(state, (s) => {
    s.rodada.ordem.push(cor);
  });
  const aptos = participantes(novo).filter((x) => !novo.rodada.bloqueios[x.cor]);
  if (aptos.every((x) => novo.rodada.ordem.includes(x.cor))) return encerrarJanela(novo);
  return novo;
}

function encerrarJanela(state) {
  exigirFase(state, 'janela');
  return mut(state, (s) => {
    if (s.rodada.ordem.length === 0) resolver(s);
    else s.fase = 'ordem';
  });
}

function mostrarResposta(state) {
  exigirFase(state, 'ordem');
  return mut(state, (s) => {
    s.fase = 'resposta';
  });
}

// Posição (na ordem dos cliques) de quem responde agora: o Passe do 1º empurra a vez para o 2º.
const posicaoAtual = (r) => r.tentativas.length + r.pulos;

function respondenteAtual(state) {
  const r = state.rodada;
  if (!r || state.fase !== 'resposta') return null;
  return r.ordem[posicaoAtual(r)] || null;
}

function multiplicador(r, cor) {
  let m = 1;
  if (r.dobros.includes(cor)) m *= 2;
  if (r.final) m *= 2;
  return m;
}

function pontosBase(s, r) {
  const { pontosPrimeiro, pontosSegundo } = s.config;
  if (posicaoAtual(r) === 0) return pontosPrimeiro;
  // Quem responde depois de um Passe é sempre o 2º (pontuação do 2º); só a desqualificação do 1º dá a inteira.
  if (r.pulos > 0) return pontosSegundo;
  return r.tentativas[0].tipo === 'desqualificado' ? pontosPrimeiro : pontosSegundo;
}

// Registra uma tentativa e decide se a rodada acabou.
function registrarTentativa(s, tipo, alternativa) {
  const r = s.rodada;
  const cor = r.ordem[posicaoAtual(r)];
  if (!cor) falhar('Não há respondente');
  const tent = { cor, tipo, alternativa: alternativa ?? null, pontos: 0 };
  if (tipo === 'certa') {
    if (!r.desempate) {
      tent.pontos = pontosBase(s, r) * multiplicador(r, cor);
      grupo(s, cor).pontos += tent.pontos;
    }
  } else if (alternativa != null) {
    r.erradas.push(alternativa);
  }
  cobrarAposta(s, cor, tent);
  r.tentativas.push(tent);
  const acabou = tipo === 'certa' || posicaoAtual(r) >= MAX_TENTATIVAS || !r.ordem[posicaoAtual(r)];
  if (acabou) resolver(s);
}

function responder(state, alternativa) {
  exigirFase(state, 'resposta');
  if (!Number.isInteger(alternativa) || alternativa < 0 || alternativa > 3) falhar('Alternativa inválida');
  if (state.rodada.erradas.includes(alternativa)) falhar('Alternativa já descartada');
  if (state.rodada.eliminadas.includes(alternativa)) falhar('Alternativa eliminada pela Dica 50/50');
  return mut(state, (s) => {
    const certa = perguntaAtual(s).correta === alternativa;
    registrarTentativa(s, certa ? 'certa' : 'errada', alternativa);
  });
}

function desqualificar(state) {
  exigirFase(state, 'resposta');
  return mut(state, (s) => {
    registrarTentativa(s, 'desqualificado', null);
  });
}

function semResposta(state) {
  exigirFase(state, 'resposta');
  return mut(state, (s) => {
    registrarTentativa(s, 'sem_resposta', null);
  });
}

// Passe: o 1º respondente passa a vez ao 2º. Não é erro, não é tentativa; consome o Passe.
function usarPasse(state) {
  exigirFase(state, 'resposta');
  const r0 = state.rodada;
  if (r0.desempate) falhar('Sem habilidades no desempate');
  if (r0.tentativas.length > 0 || r0.pulos > 0) falhar('O Passe é só do 1º respondente');
  if (!r0.ordem[1]) falhar('Não há 2º respondente para receber a vez');
  const cor = r0.ordem[0];
  const g0 = grupo(state, cor);
  if (livres(g0, r0, 'passe') < 1) falhar('O grupo não tem o Passe');
  if (r0.usou[cor]) falhar('Uma habilidade por grupo por rodada');
  return mut(state, (s) => {
    const r = s.rodada;
    const g = grupo(s, cor);
    g.habilidades.splice(g.habilidades.findIndex((h) => h.tipo === 'passe'), 1);
    r.usou[cor] = 'passe';
    r.passes.push(cor);
    r.pulos = 1;
    registrar(s, 'habilidade', `${cor} usou o Passe`);
  });
}

// Dica 50/50: só o 2º respondente, quando ele vira o respondente atual. Deixa exatamente duas opções (a correta
// e uma errada), eliminando as erradas necessárias. A escolha é aleatória (`aleatorio` é injetável nos testes).
function usarDica5050(state, aleatorio = Math.random) {
  exigirFase(state, 'resposta');
  const r0 = state.rodada;
  if (r0.desempate) falhar('Sem habilidades no desempate');
  if (posicaoAtual(r0) !== 1) falhar('A Dica 50/50 é só do 2º respondente');
  const cor = r0.ordem[1];
  const g0 = grupo(state, cor);
  if (livres(g0, r0, 'dica5050') < 1) falhar('O grupo não tem a Dica 50/50');
  if (r0.usou[cor]) falhar('Uma habilidade por grupo por rodada');
  const correta = perguntaAtual(state).correta;
  const erradasVivas = [0, 1, 2, 3].filter((i) => i !== correta && !r0.erradas.includes(i));
  const fica = erradasVivas[Math.min(erradasVivas.length - 1, Math.floor(aleatorio() * erradasVivas.length))];
  const tirar = erradasVivas.filter((i) => i !== fica);
  return mut(state, (s) => {
    const r = s.rodada;
    const g = grupo(s, cor);
    g.habilidades.splice(g.habilidades.findIndex((h) => h.tipo === 'dica5050'), 1);
    r.usou[cor] = 'dica5050';
    r.dicas.push(cor);
    r.eliminadas = tirar;
    registrar(s, 'habilidade', `${cor} usou a Dica 50/50 (${tirar.length} alternativa(s) eliminada(s))`);
  });
}

// Fecha a rodada: desfecho, sequências e ofertas da escada.
function resolver(s) {
  const r = s.rodada;
  const p = perguntaAtual(s);
  r.correta = p.correta;
  const acertou = r.tentativas.some((t) => t.tipo === 'certa');
  r.desfecho = acertou || r.tentativas.length >= MAX_TENTATIVAS ? 'explicacao' : 'so_correta';
  s.fase = r.desfecho;

  // Aposta de quem não respondeu (não apertou, ficou fora dos 2 primeiros, bloqueado ou só passou a vez): nada é
  // cobrado e as habilidades reservadas continuam no estoque.
  for (const [cor, a] of Object.entries(r.apostas)) {
    if (a.estado !== 'ativa') continue;
    a.estado = 'devolvida';
    registrar(s, 'habilidade', `${cor}: Aposta não cobrada (o grupo não respondeu)`);
  }

  if (r.desempate) {
    if (acertou) {
      s.desempate.vencedor = r.tentativas.find((t) => t.tipo === 'certa').cor;
    }
    return;
  }

  if (r.tentativas.length > 0) s.respondidas += 1;

  // Rodadas sem pontuar (mensagem do Tigrinho): ganhar algum ponto na rodada zera; não responder, ser bloqueado ou
  // perder pontos numa aposta contam como rodada sem pontuar. Rodada de desempate não passa por aqui.
  for (const g of s.grupos) {
    const t = r.tentativas.find((x) => x.cor === g.cor);
    if (t && t.pontos > 0) { g.rodadasSemPontos = 0; g.tigrinhoVisto = 0; } else g.rodadasSemPontos += 1;
  }

  // Só erro ou desqualificação zeram a sequência; quem não respondeu (ou só passou) a mantém. O contador para no
  // topo da escada (seqDica). Não há mais oferta: o grupo troca os acertos quando quiser (trocarAcertos).
  for (const g of s.grupos) {
    const t = r.tentativas.find((x) => x.cor === g.cor);
    if (!t) continue;
    g.sequencia = t.tipo === 'certa' ? Math.min(g.sequencia + 1, s.config.seqDica) : 0;
  }
}

// O grupo troca TODOS os acertos seguidos por uma habilidade da faixa (a sequência volta a zero, sem troco).
// Com o estoque cheio, `substituir` diz qual habilidade guardada sai.
function trocarAcertos(state, cor, tipo, substituir) {
  const g0 = grupo(state, cor);
  const motivo = motivoTroca(state, g0);
  if (motivo) falhar(motivo);
  if (!opcoesDaSequencia(state.config, g0.sequencia).includes(tipo)) falhar('Esta habilidade não está na faixa de acertos do grupo');
  const cheio = g0.habilidades.length >= state.config.estoqueMax;
  if (cheio && !(Number.isInteger(substituir) && substituir >= 0 && substituir < g0.habilidades.length)) {
    falhar('Estoque cheio: escolha qual habilidade guardada será trocada');
  }
  return mut(state, (s) => {
    const g = grupo(s, cor);
    const acertos = g.sequencia;
    let trocada = null;
    if (cheio) trocada = g.habilidades.splice(substituir, 1)[0].tipo;
    g.habilidades.push({ tipo });
    g.sequencia = 0;
    g.trocas += 1;
    s.rodada.ganhos.push({ cor, tipo, acertos });
    registrar(s, 'habilidade', `${cor} trocou ${acertos} acertos por ${tipo}${trocada ? ` no lugar de ${trocada}` : ''}`);
  });
}

// O placar parcial aparece depois da explicação da rodada em que as respondidas chegam a um múltiplo de placarN
// (ou em toda rodada, no modo 'toda'). Rodada sem tentativa não dispara; a meta leva ao Ranking, sem placar antes.
// O grupo dispensou a mensagem do Tigrinho: ela não volta para esta mesma contagem. Não entra no Desfazer (é só da tela).
function dispensarTigrinho(state, cor) {
  const g0 = grupo(state, cor);
  if (g0.tigrinhoVisto === g0.rodadasSemPontos) return state;
  const novo = structuredClone(state);
  novo._undo = state._undo;
  grupo(novo, cor).tigrinhoVisto = g0.rodadasSemPontos;
  return novo;
}

function placarDevido(s) {
  const c = s.config;
  if (c.placarModo === 'desligado' || s.rodada.desempate || s.rodada.tentativas.length === 0) return false;
  if (s.respondidas >= c.meta || s.respondidas > c.meta - c.placarOcultar) return false;
  return c.placarModo === 'toda' || s.respondidas % c.placarN === 0;
}

function continuar(state) {
  exigirFase(state, 'explicacao', 'so_correta', 'placar');
  return mut(state, (s) => {
    if (s.fase === 'placar') {
      iniciarRodada(s);
      return;
    }
    if (s.rodada.desempate) {
      s.fase = 'ranking';
      return;
    }
    if (s.respondidas >= s.config.meta || s.indice >= perguntasDoJogo(s).length) {
      s.fase = 'ranking';
    } else if (placarDevido(s)) {
      s.fase = 'placar';
    } else {
      iniciarRodada(s);
    }
  });
}

function proximo(state) {
  exigirFase(state, 'ranking', 'final');
  return mut(state, (s) => {
    if (s.fase === 'ranking') {
      if (!vencedor(s) && empatadosNoTopo(s).length > 1) falhar('Desempate pendente');
      s.fase = 'final';
    } else {
      s.fase = 'capa';
    }
  });
}

// ---------- ranking e desempate ----------

function classificacao(state) {
  return state.grupos
    .map((g, i) => ({ cor: g.cor, representante: g.representante, pontos: g.pontos, elegivel: g.elegivel, i }))
    .sort((a, b) => b.pontos - a.pontos || a.i - b.i)
    .map(({ i, ...x }) => x);
}

// Placar parcial: só cor e pontos, do maior para o menor. Empates dividem a posição (1, 1, 3).
function placar(state) {
  const ordem = classificacao(state);
  return ordem.map((g, i) => ({
    cor: g.cor,
    pontos: g.pontos,
    posicao: ordem.findIndex((x) => x.pontos === g.pontos) + 1,
  }));
}

// Quem recebe o troféu no ranking: só o grupo que realmente vence (a mesma regra de vencedor(): o de maior pontuação
// ENTRE OS ELEGÍVEIS ou o vencedor do desempate). Empate com desempate pendente ou ninguém elegível: ninguém.
function lideres(state) {
  const v = vencedor(state);
  return v ? [v] : [];
}

function empatadosNoTopo(state) {
  const elegiveis = state.grupos.filter((g) => g.elegivel);
  if (!elegiveis.length) return [];
  const max = Math.max(...elegiveis.map((g) => g.pontos));
  return elegiveis.filter((g) => g.pontos === max).map((g) => g.cor);
}

function vencedor(state) {
  if (state.desempate && state.desempate.vencedor) return state.desempate.vencedor;
  const topo = empatadosNoTopo(state);
  return topo.length === 1 ? topo[0] : null;
}

function definirElegivel(state, cor, elegivel) {
  grupo(state, cor);
  return mut(state, (s) => {
    grupo(s, cor).elegivel = !!elegivel;
    s.desempate = null;
  });
}

function iniciarDesempate(state) {
  exigirFase(state, 'ranking');
  const topo = empatadosNoTopo(state);
  if (topo.length < 2) falhar('Não há empate na primeira colocação');
  return mut(state, (s) => {
    s.desempate = { participantes: topo, vencedor: null };
    iniciarRodada(s, topo);
    registrar(s, 'jogo', `Desempate entre ${topo.join(', ')}`);
  });
}

// ---------- extras do painel ----------

function pausar(state, pausado = true) {
  return mut(state, (s) => {
    s.pausado = !!pausado;
  });
}

// Jogos salvos em versões anteriores viram o formato atual: a habilidade guardada entra no estoque; oferta pendente
// (Bloqueio da versão 1 ou escada da 8e) some e a sequência é mantida, limitada ao topo da escada (Etapa 8f).
function migrarEstado(estado) {
  const novo = structuredClone(estado);
  const um = (e) => {
    e.config = normalizarConfig(e.config);
    for (const g of e.grupos || []) {
      g.apostas = g.apostas || 0;
      g.trocas = g.trocas || 0; // jogo salvo antes do limite: a contagem começa em 0
      g.rodadasSemPontos = g.rodadasSemPontos || 0; // idem para o Tigrinho
      g.tigrinhoVisto = g.tigrinhoVisto || 0;
      if (!Array.isArray(g.habilidades)) g.habilidades = g.habilidade ? [{ tipo: g.habilidade.tipo }] : [];
      delete g.habilidade;
      delete g.ofertaBloqueio;
      delete g.oferta;
      g.sequencia = Math.min(g.sequencia || 0, e.config.seqDica);
    }
    const r = e.rodada;
    if (r) {
      r.usou = r.usou || Object.fromEntries(Object.entries(r.ativacoes || {}).map(([c, a]) => [c, a.tipo]));
      r.escudos = r.escudos || [];
      r.anulacoes = r.anulacoes || [];
      r.pulos = r.pulos || 0;
      r.passes = r.passes || [];
      r.ganhos = r.ganhos || [];
      r.apostas = r.apostas || {};
      r.eliminadas = r.eliminadas || [];
      r.dicas = r.dicas || [];
    }
    e.versao = VERSAO;
  };
  um(novo);
  for (const anterior of novo._undo || []) um(anterior);
  return novo;
}

function desfazer(state) {
  if (!state._undo.length) falhar('Nada para desfazer');
  const anterior = state._undo[state._undo.length - 1];
  return { ...structuredClone(anterior), _undo: state._undo.slice(0, -1) };
}

module.exports = {
  CORES,
  TIPOS_HAB,
  VERSAO,
  CONFIG_PADRAO,
  MAX_TENTATIVAS,
  ErroJogo,
  criarJogo,
  registrarGrupo,
  definirConectado,
  sincronizarConexoes,
  renomearGrupo,
  liberarGrupo,
  novoJogo,
  definirPerguntas,
  iniciar,
  mostrarAlternativas,
  abrirJanela,
  ativarHabilidade,
  livres,
  apostar,
  clicar,
  encerrarJanela,
  mostrarResposta,
  respondenteAtual,
  responder,
  desqualificar,
  semResposta,
  trocarAcertos,
  dispensarTigrinho,
  opcoesDaSequencia,
  motivoTroca,
  decidirEscudo,
  usarPasse,
  usarDica5050,
  normalizarConfig,
  migrarEstado,
  continuar,
  proximo,
  classificacao,
  placar,
  lideres,
  empatadosNoTopo,
  vencedor,
  definirElegivel,
  iniciarDesempate,
  pausar,
  desfazer,
};
