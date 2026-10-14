'use strict';
const { ajustarPontosTeste } = require('./ajuda');
// Etapa 8b-2: Aposta (dois modos), Dica 50/50 e pontos negativos, nas regras puras (src/game.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/game.js');
const { visaoTela, visaoGrupo } = require('../src/visoes.js');

// Perguntas: correta = 0 (A) em todas; a última é a reserva (correta = 3).
function banco(n = 24) {
  const ps = [];
  for (let i = 1; i <= n; i++) ps.push({ id: i, tipo: 'facil', enunciado: `P${i}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, explicacao: 'x', reserva: false });
  ps.push({ id: 99, tipo: 'atencao', enunciado: 'R', alternativas: ['a', 'b', 'c', 'd'], correta: 3, explicacao: 'x', reserva: true });
  return ps;
}
function novo(cores = ['vermelho', 'azul', 'verde'], config = {}) {
  let s = G.criarJogo({ config: { placarModo: 'desligado', ...config }, perguntas: banco() });
  for (const c of cores) s = G.registrarGrupo(s, c, `rep-${c}`);
  return G.iniciar(s);
}
const grp = (s, cor) => s.grupos.find((g) => g.cor === cor);
const pts = (s, cor) => grp(s, cor).pontos;
const estoque = (s, cor) => grp(s, cor).habilidades.map((h) => h.tipo);
const dar = (s, cor, ...tipos) => { for (const tipo of tipos) grp(s, cor).habilidades.push({ tipo }); return s; };
const certa = (s) => s.perguntas.find((p) => p.id === s.rodada.perguntaId).correta;
const errada = (s) => [1, 2, 3].find((i) => !s.rodada.erradas.includes(i) && !s.rodada.eliminadas.includes(i));

// Fase de resposta com `cliques` na ordem (ativações antes, na fase 'pergunta').
function ate(s, cliques) {
  if (s.fase === 'pergunta') s = G.mostrarAlternativas(s);
  s = G.abrirJanela(s);
  for (const c of cliques) s = G.clicar(s, c);
  if (s.fase === 'janela') s = G.encerrarJanela(s);
  return s.fase === 'ordem' ? G.mostrarResposta(s) : s;
}
const acerta = (s) => G.responder(s, certa(s));
const erra = (s) => G.responder(s, errada(s));
function fechar(s) {
  return G.continuar(s);
}

// ---------- Aposta, modo 2: pagar pontos ----------
test('Aposta com pontos: o 1º que acerta ganha +20 e o 2º +5; erro, desqualificação e "Sem resposta" custam -10', () => {
  let s = novo();
  s = G.apostar(s, 'vermelho', 'pontos');
  s = acerta(ate(s, ['vermelho', 'azul']));
  assert.equal(pts(s, 'vermelho'), 20); // 10 x 3 - 10
  assert.deepEqual(s.rodada.tentativas[0].aposta, { modo: 'pontos', delta: 20 });

  s = novo();
  s = G.apostar(s, 'azul', 'pontos');
  s = ate(s, ['vermelho', 'azul']);
  s = erra(s); // vermelho erra
  s = acerta(s); // azul (2º) acerta: 5 x 3 - 10
  assert.equal(pts(s, 'azul'), 5);

  for (const quem of ['errada', 'desqualificado', 'sem_resposta']) {
    let t = novo();
    t = G.apostar(t, 'vermelho', 'pontos');
    t = ate(t, ['vermelho', 'azul']);
    t = quem === 'errada' ? erra(t) : quem === 'desqualificado' ? G.desqualificar(t) : G.semResposta(t);
    assert.equal(pts(t, 'vermelho'), -10, quem);
    assert.equal(grp(t, 'vermelho').apostas, 1);
    assert.equal(grp(t, 'vermelho').sequencia, 0);
  }
});

test('Aposta com pontos: o 2º ganha a pontuação inteira se o 1º foi desqualificado (10 x 3 - 10 = +20)', () => {
  let s = novo();
  s = G.apostar(s, 'azul', 'pontos');
  s = G.desqualificar(ate(s, ['vermelho', 'azul']));
  s = acerta(s);
  assert.equal(pts(s, 'azul'), 20);
});

// ---------- Aposta, modo 1: trocar 2 habilidades ----------
test('Aposta com 2 habilidades: +10 de bônus ao acertar, -5 ao errar; as habilidades só saem quando é cobrada', () => {
  let s = novo();
  dar(s, 'vermelho', 'escudo', 'passe');
  s = G.apostar(s, 'vermelho', 'habilidades', [0, 1]);
  assert.deepEqual(estoque(s, 'vermelho'), ['escudo', 'passe'], 'reservadas, ainda no estoque');
  s = acerta(ate(s, ['vermelho', 'azul']));
  assert.equal(pts(s, 'vermelho'), 20); // 10 da rodada + 10 de bônus
  assert.deepEqual(estoque(s, 'vermelho'), []);
  assert.equal(grp(s, 'vermelho').apostas, 1);

  let t = novo();
  dar(t, 'azul', 'dobro', 'bloqueio');
  t = G.apostar(t, 'azul', 'habilidades', [0, 1]);
  t = ate(t, ['vermelho', 'azul']);
  t = erra(t);
  t = acerta(t); // azul é o 2º: 5 + 10
  assert.equal(pts(t, 'azul'), 15);
  let u = novo();
  dar(u, 'azul', 'dobro', 'bloqueio');
  u = G.apostar(u, 'azul', 'habilidades', [0, 1]);
  u = erra(ate(u, ['azul', 'vermelho']));
  assert.equal(pts(u, 'azul'), -5);
  assert.deepEqual(estoque(u, 'azul'), []);
});

test('Aposta com habilidades vale na rodada final e o bônus não é dobrado; o modo com pontos não vale', () => {
  let s = novo(['vermelho', 'azul'], { meta: 1 });
  assert.equal(s.rodada.final, true);
  dar(s, 'vermelho', 'escudo', 'passe');
  assert.throws(() => G.apostar(s, 'vermelho', 'pontos'), /rodada final/);
  s = G.apostar(s, 'vermelho', 'habilidades', [0, 1]);
  s = acerta(ate(s, ['vermelho']));
  assert.equal(pts(s, 'vermelho'), 30); // 10 x 2 da final + 10 de bônus, sem dobrar o bônus
});

// ---------- cobrança só se o grupo responde ----------
test('Aposta não cobrada: quem não aperta ou fica fora dos 2 primeiros não paga, recupera as habilidades e não gasta o limite', () => {
  const casos = {
    'não apertou': (s) => acerta(ate(s, ['azul', 'verde'])),
    'fora dos 2 primeiros': (s) => acerta(ate(s, ['azul', 'verde', 'vermelho'])),
  };
  for (const [nome, jogar] of Object.entries(casos)) {
    let s = novo(['vermelho', 'azul', 'verde']);
    dar(s, 'vermelho', 'escudo', 'dobro');
    s = G.apostar(s, 'vermelho', 'habilidades', [0, 1]);
    s = jogar(s);
    assert.equal(s.rodada.apostas.vermelho.estado, 'devolvida', nome);
    assert.equal(pts(s, 'vermelho'), 0, nome);
    assert.deepEqual(estoque(s, 'vermelho'), ['escudo', 'dobro'], nome);
    assert.equal(grp(s, 'vermelho').apostas, 0, `${nome}: não conta no limite`);
  }
  // e o grupo pode apostar de novo na rodada seguinte
  let s = novo();
  s = G.apostar(s, 'vermelho', 'pontos');
  s = acerta(ate(s, ['azul']));
  assert.equal(pts(s, 'vermelho'), 0);
  s = fechar(s);
  s = G.apostar(s, 'vermelho', 'pontos');
  assert.equal(s.rodada.usou.vermelho, 'aposta');
});

test('Aposta de quem ficou em 3º depois de um Passe do 1º também não é cobrada', () => {
  let s = novo();
  dar(s, 'vermelho', 'passe');
  dar(s, 'azul', 'escudo', 'dobro');
  s = G.apostar(s, 'azul', 'habilidades', [0, 1]);
  s = G.usarPasse(ate(s, ['vermelho', 'verde', 'azul']));
  s = acerta(s); // o 2º (verde) responde e a rodada acaba
  assert.equal(s.rodada.apostas.azul.estado, 'devolvida');
  assert.equal(pts(s, 'azul'), 0);
  assert.deepEqual(estoque(s, 'azul'), ['escudo', 'dobro']);
  assert.equal(grp(s, 'azul').apostas, 0);
});

test('Aposta de quem está bloqueado não é cobrada', () => {
  let s = novo();
  dar(s, 'azul', 'bloqueio');
  s = G.apostar(s, 'vermelho', 'pontos');
  s = G.ativarHabilidade(s, 'azul', 'bloqueio', 'vermelho');
  s = acerta(ate(s, ['azul', 'verde']));
  assert.equal(s.rodada.apostas.vermelho.estado, 'devolvida');
  assert.equal(pts(s, 'vermelho'), 0);
});

test('habilidades reservadas na Aposta não podem ser usadas na rodada', () => {
  let s = novo();
  dar(s, 'vermelho', 'bloqueio', 'dobro');
  s = G.apostar(s, 'vermelho', 'habilidades', [0, 1]);
  assert.throws(() => G.ativarHabilidade(s, 'vermelho', 'dobro'), /não tem esta habilidade/);
  // um Escudo reservado também não defende: o Bloqueio vale sem perguntar
  let t = novo();
  dar(t, 'azul', 'escudo', 'passe');
  dar(t, 'vermelho', 'bloqueio');
  t = G.apostar(t, 'azul', 'habilidades', [0, 1]);
  t = G.ativarHabilidade(t, 'vermelho', 'bloqueio', 'azul');
  assert.deepEqual(t.rodada.escudos, []);
  assert.deepEqual(t.rodada.bloqueios.azul, ['vermelho']);
});

// ---------- limites ----------
test('Aposta: no máximo 2 por grupo por jogo, somando os dois modos; só conta quando cobrada', () => {
  let s = novo();
  dar(s, 'vermelho', 'escudo', 'passe');
  s = G.apostar(s, 'vermelho', 'pontos');
  s = fechar(acerta(ate(s, ['vermelho'])));
  s = G.apostar(s, 'vermelho', 'habilidades', [0, 1]);
  s = fechar(acerta(ate(s, ['vermelho'])));
  assert.equal(grp(s, 'vermelho').apostas, 2);
  assert.throws(() => G.apostar(s, 'vermelho', 'pontos'), /no máximo 2 apostas/);
  assert.throws(() => G.apostar(s, 'vermelho', 'habilidades', [0, 1]), /no máximo 2 apostas/);
  const livre = G.apostar(s, 'azul', 'pontos'); // outro grupo ainda pode
  assert.equal(livre.rodada.usou.azul, 'aposta');
});

test('Aposta: não combina com Dobro nem com Bloqueio na mesma rodada, em qualquer ordem', () => {
  let s = novo();
  dar(s, 'vermelho', 'dobro');
  dar(s, 'azul', 'bloqueio');
  const comAposta = G.apostar(s, 'vermelho', 'pontos');
  assert.throws(() => G.ativarHabilidade(comAposta, 'vermelho', 'dobro'), /Uma habilidade por grupo/);
  const comDobro = G.ativarHabilidade(s, 'vermelho', 'dobro');
  assert.throws(() => G.apostar(comDobro, 'vermelho', 'pontos'), /Uma habilidade por grupo/);
  const comBloqueio = G.ativarHabilidade(s, 'azul', 'bloqueio', 'verde');
  assert.throws(() => G.apostar(comBloqueio, 'azul', 'pontos'), /Uma habilidade por grupo/);
});

test('Aposta no desempate é recusada', () => {
  let s = novo(['vermelho', 'azul'], { meta: 2 });
  s = fechar(acerta(ate(s, ['vermelho'])));
  s = fechar(acerta(ate(s, ['azul'])));
  assert.equal(s.fase, 'ranking');
  s = ajustarPontosTeste(s, 'azul', -10);
  s = ajustarPontosTeste(s, 'azul', 10);
  s = ajustarPontosTeste(s, 'azul', 0 + (pts(s, 'vermelho') - pts(s, 'azul'))); // empate
  assert.deepEqual([...G.empatadosNoTopo(s)].sort(), ['azul', 'vermelho']);
  s = G.iniciarDesempate(s);
  assert.equal(s.rodada.desempate, true);
  assert.throws(() => G.apostar(s, 'vermelho', 'pontos'), /desempate/);
});

test('Aposta com pontos: limite de dívida; pagar não pode deixar o saldo abaixo de -20, mas penalidades e ajustes podem', () => {
  let s = novo();
  s = ajustarPontosTeste(s, 'vermelho', -15);
  assert.throws(() => G.apostar(s, 'vermelho', 'pontos'), /abaixo de −20/); // -15 - 10 = -25
  s = ajustarPontosTeste(s, 'vermelho', 5); // -10 - 10 = -20: permitido
  s = G.apostar(s, 'vermelho', 'pontos');
  s = erra(ate(s, ['vermelho', 'azul']));
  assert.equal(pts(s, 'vermelho'), -20); // a penalidade cobrada chega ao limite
  s = ajustarPontosTeste(s, 'vermelho', -10); // ajuste manual passa do limite
  assert.equal(pts(s, 'vermelho'), -30);
  // o modo com habilidades não depende do saldo
  let t = novo();
  t = ajustarPontosTeste(t, 'azul', -50);
  dar(t, 'azul', 'escudo', 'passe');
  t = G.apostar(t, 'azul', 'habilidades', [0, 1]);
  t = erra(ate(t, ['azul', 'vermelho']));
  assert.equal(pts(t, 'azul'), -55);
});

test('Aposta com habilidades: exige as 2 escolhidas, sem repetir a mesma posição', () => {
  let s = novo();
  dar(s, 'vermelho', 'escudo');
  assert.throws(() => G.apostar(s, 'vermelho', 'habilidades', [0]), /Escolha 2 habilidades/);
  dar(s, 'vermelho', 'passe');
  assert.throws(() => G.apostar(s, 'vermelho', 'habilidades', [0, 0]), /Escolha 2 habilidades/);
  assert.throws(() => G.apostar(s, 'vermelho', 'habilidades', [0, 5]), /Escolha 2 habilidades/);
  assert.throws(() => G.apostar(s, 'vermelho', 'troca'), /Escolha como/);
  assert.throws(() => G.apostar(G.mostrarAlternativas(G.abrirJanela(G.mostrarAlternativas(s))), 'vermelho', 'pontos'), /fase/);
});

test('Aposta usa os valores da configuração', () => {
  let s = novo(['vermelho', 'azul'], { apostaCusto: 4, apostaMult: 2, apostaTrocaBonus: 7, apostaTrocaPenal: 3, apostaTrocaQtd: 1 });
  s = G.apostar(s, 'vermelho', 'pontos');
  s = acerta(ate(s, ['vermelho']));
  assert.equal(pts(s, 'vermelho'), 16); // 10 x 2 - 4
  let t = novo(['vermelho', 'azul'], { apostaTrocaBonus: 7, apostaTrocaPenal: 3, apostaTrocaQtd: 1 });
  dar(t, 'azul', 'passe');
  t = G.apostar(t, 'azul', 'habilidades', [0]);
  t = erra(ate(t, ['azul']));
  assert.equal(pts(t, 'azul'), -3);
});

// ---------- Dica 50/50 ----------
test('Dica 50/50: com 7 acertos seguidos o grupo a compra e ela entra no estoque; abaixo de 7 não', () => {
  let s = novo(['vermelho', 'azul']);
  for (let i = 1; i <= 7; i++) {
    s = acerta(ate(s, ['vermelho']));
    if (i === 6) assert.throws(() => G.trocarAcertos(s, 'vermelho', 'dica5050'), /faixa/);
    s = fechar(s);
  }
  assert.equal(grp(s, 'vermelho').sequencia, 7);
  s = G.trocarAcertos(s, 'vermelho', 'dica5050');
  assert.deepEqual(estoque(s, 'vermelho'), ['dica5050']);
  assert.equal(grp(s, 'vermelho').sequencia, 0);
});

test('seqDica é configurável e precisa ser maior que seqDobro (a normalização corrige configs antigas)', () => {
  assert.equal(G.CONFIG_PADRAO.seqDica, 7);
  assert.equal(G.normalizarConfig({ seqDobro: 9 }).seqDica, 11);
  assert.equal(G.normalizarConfig({ seqDobro: 4, seqDica: 6 }).seqDica, 6);
  let s = novo(['vermelho', 'azul'], { seqBloqueio: 2, seqDobro: 3, seqDica: 4 });
  for (let i = 1; i <= 4; i++) s = fechar(acerta(ate(s, ['vermelho'])));
  assert.equal(grp(s, 'vermelho').sequencia, 4);
  assert.deepEqual(G.opcoesDaSequencia(s.config, 4), ['bloqueio', 'escudo', 'passe', 'dobro', 'dica5050']);
});

test('Dica 50/50: quando o 1º errou, elimina 1 e sobram a correta e uma errada', () => {
  for (const aleatorio of [() => 0, () => 0.99]) {
    let s = novo();
    dar(s, 'azul', 'dica5050');
    s = ate(s, ['vermelho', 'azul']);
    s = G.responder(s, 1); // vermelho erra com B
    s = G.usarDica5050(s, aleatorio);
    assert.equal(s.rodada.eliminadas.length, 1);
    assert.ok(![0, 1].includes(s.rodada.eliminadas[0]), 'não elimina a correta nem a já errada');
    const vivas = [0, 1, 2, 3].filter((i) => !s.rodada.erradas.includes(i) && !s.rodada.eliminadas.includes(i));
    assert.equal(vivas.length, 2);
    assert.ok(vivas.includes(0));
    assert.equal(s.rodada.usou.azul, 'dica5050');
    assert.deepEqual(estoque(s, 'azul'), []);
    assert.throws(() => G.responder(s, s.rodada.eliminadas[0]), /eliminada/);
    s = G.responder(s, 0);
    assert.equal(pts(s, 'azul'), 5);
  }
});

test('Dica 50/50: depois de Passe, desqualificação ou "Sem resposta" elimina 2 e sobram 2', () => {
  const preparos = {
    passe: (s) => { dar(s, 'vermelho', 'passe'); return G.usarPasse(ate(s, ['vermelho', 'azul'])); },
    desqualificacao: (s) => G.desqualificar(ate(s, ['vermelho', 'azul'])),
    sem_resposta: (s) => G.semResposta(ate(s, ['vermelho', 'azul'])),
  };
  for (const [nome, preparar] of Object.entries(preparos)) {
    let s = novo();
    dar(s, 'azul', 'dica5050');
    s = preparar(s);
    s = G.usarDica5050(s, () => 0.5);
    assert.equal(s.rodada.eliminadas.length, 2, nome);
    const vivas = [0, 1, 2, 3].filter((i) => !s.rodada.eliminadas.includes(i));
    assert.equal(vivas.length, 2, nome);
    assert.ok(vivas.includes(0), `${nome}: a correta sobra`);
  }
});

test('Dica 50/50: só o 2º respondente, uma vez, e não no desempate', () => {
  let s = novo();
  dar(s, 'vermelho', 'dica5050');
  dar(s, 'azul', 'dica5050');
  s = ate(s, ['vermelho', 'azul']);
  assert.throws(() => G.usarDica5050(s), /2º respondente/, 'o 1º não pode');
  s = G.responder(s, 1);
  s = G.usarDica5050(s);
  assert.throws(() => G.usarDica5050(s), /Uma habilidade|não tem/, 'não repete');
  assert.deepEqual(estoque(s, 'vermelho'), ['dica5050'], 'a do 1º continua guardada');

  // sem a habilidade
  let t = novo();
  t = G.responder(ate(t, ['vermelho', 'azul']), 1);
  assert.throws(() => G.usarDica5050(t), /não tem a Dica/);
  // fora da fase de resposta
  assert.throws(() => G.usarDica5050(novo()), /fase/);

  // desempate
  let d = novo(['vermelho', 'azul'], { meta: 2 });
  d = fechar(acerta(ate(d, ['vermelho'])));
  d = fechar(acerta(ate(d, ['azul'])));
  d = ajustarPontosTeste(d, 'vermelho', pts(d, 'azul') - pts(d, 'vermelho'));
  d = G.iniciarDesempate(d);
  dar(d, 'azul', 'dica5050');
  d = G.responder(ate(d, ['vermelho', 'azul']), 1);
  assert.throws(() => G.usarDica5050(d), /desempate/);
});

test('Dica 50/50 conta como o uso da rodada: não combina com Aposta ativada', () => {
  let s = novo();
  dar(s, 'azul', 'dica5050', 'passe');
  s = G.apostar(s, 'azul', 'pontos');
  s = G.responder(ate(s, ['vermelho', 'azul']), 1);
  assert.throws(() => G.usarDica5050(s), /Uma habilidade por grupo/);
});

test('Dica 50/50 nas visões: a /tela e o celular do grupo veem as eliminadas; a correta nunca aparece antes do desfecho', () => {
  let s = novo();
  dar(s, 'azul', 'dica5050');
  s = G.responder(ate(s, ['vermelho', 'azul']), 1);
  s = G.usarDica5050(s, () => 0);
  const ctx = { estado: s, ui: { cena: 'jogo', tema: 'claro', regras: false, teste: { ativo: false } }, janela: {}, final: {}, autenticado: false };
  const tela = visaoTela(ctx);
  assert.deepEqual(tela.eliminadas, s.rodada.eliminadas);
  assert.deepEqual(tela.dicas, ['azul']);
  assert.equal('correta' in tela, false);
  assert.equal('explicacao' in tela, false);
  const cel = visaoGrupo(ctx, 'azul', true);
  assert.deepEqual(cel.eliminadas, s.rodada.eliminadas);
  assert.equal(cel.ativa, 'dica5050');
  assert.equal('correta' in cel, false);
  assert.equal('eliminadas' in visaoGrupo(ctx, 'vermelho', true), false, 'só o grupo que usou vê as letras');
});

// ---------- pontos negativos ----------
test('pontos negativos: classificação, vencedor e desempate funcionam com saldos abaixo de zero', () => {
  let s = novo();
  s = ajustarPontosTeste(s, 'vermelho', -7);
  s = ajustarPontosTeste(s, 'azul', -3);
  const c = G.classificacao(s);
  assert.deepEqual(c.map((x) => [x.cor, x.pontos]), [['verde', 0], ['azul', -3], ['vermelho', -7]]);
  assert.equal(G.vencedor(s), 'verde');
  // todos negativos: o menos negativo vence; empate negativo exige desempate
  s = ajustarPontosTeste(s, 'verde', -3);
  assert.deepEqual([...G.empatadosNoTopo(s)].sort(), ['azul', 'verde']);
  assert.equal(G.vencedor(s), null);
});

// ---------- jogo salvo da 8b-1 ----------
test('migrarEstado: jogo salvo da 8b-1 (versão 2, sem Aposta, Dica nem seqDica) carrega e continua funcionando', () => {
  let e = novo();
  const antigo = JSON.parse(JSON.stringify(e));
  const velho = (x) => {
    x.versao = 2;
    for (const k of ['seqDica', 'apostaCusto', 'apostaMult', 'apostaTrocaQtd', 'apostaTrocaBonus', 'apostaTrocaPenal', 'apostaDivida', 'apostaMax']) delete x.config[k];
    for (const g of x.grupos) delete g.apostas;
    for (const k of ['apostas', 'eliminadas', 'dicas']) delete x.rodada[k];
  };
  velho(antigo);
  antigo.config.seqDobro = 8; // config antiga com Dobro além do 7: a Dica passa a vir depois
  antigo.grupos[0].habilidades = [{ tipo: 'escudo' }];
  antigo._undo = [JSON.parse(JSON.stringify(antigo))];
  const s0 = G.migrarEstado(antigo);
  assert.equal(s0.versao, G.VERSAO);
  assert.equal(s0.config.seqDica, 10);
  assert.equal(s0.config.apostaMax, 2);
  assert.equal(s0.grupos[0].apostas, 0);
  assert.deepEqual(s0.rodada.apostas, {});
  assert.deepEqual(s0.rodada.eliminadas, []);
  assert.deepEqual(s0._undo[0].rodada.dicas, []);
  // continua funcionando: aposta e rodada normal
  let s = G.apostar(s0, 'vermelho', 'pontos');
  s = acerta(ate(s, ['vermelho']));
  assert.equal(pts(s, 'vermelho'), 20);
});
