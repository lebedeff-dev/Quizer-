'use strict';
// Etapa 8i: mensagem do Tigrinho (3, 6, 9... rodadas sem pontuar) e troféu só para quem realmente vence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const G = require('../src/game.js');
const { acoesDoGrupo } = require('../src/celular.js');
const { visaoTela, visaoGrupo, visaoHost } = require('../src/visoes.js');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, PIN, ajustarPontosTeste, nomeDaCor } = require('./ajuda');

function banco(n = 40) {
  const ps = [];
  for (let i = 1; i <= n; i++) ps.push({ id: i, tipo: 'facil', enunciado: `P${i}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, explicacao: 'x', reserva: false });
  ps.push({ id: 99, tipo: 'atencao', enunciado: 'R', alternativas: ['a', 'b', 'c', 'd'], correta: 3, explicacao: 'x', reserva: true });
  return ps;
}
function novo(config = {}, cores = ['vermelho', 'azul']) {
  let s = G.criarJogo({ config: { meta: 40, placarModo: 'desligado', ...config }, perguntas: banco() });
  for (const c of cores) s = G.registrarGrupo(s, c, c);
  return G.iniciar(s);
}
const gp = (s, cor) => s.grupos.find((g) => g.cor === cor);
// `cor` aperta sozinha e acerta (para na explicação)
function acerta(s, cor = 'vermelho') {
  s = G.abrirJanela(G.mostrarAlternativas(s));
  s = G.encerrarJanela(G.clicar(s, cor));
  return G.responder(G.mostrarResposta(s), 0);
}
const erra = (s, cor) => G.responder(G.mostrarResposta(G.encerrarJanela(G.clicar(G.abrirJanela(G.mostrarAlternativas(s)), cor))), 1);
const semNinguem = (s) => G.encerrarJanela(G.abrirJanela(G.mostrarAlternativas(s)));
const seguir = (s) => G.continuar(s);

// ---------- contagem ----------
test('contagem de rodadas sem pontuar: 0, 1, 2, 3 e 6; ganhar ponto zera', () => {
  let s = novo();
  assert.equal(gp(s, 'azul').rodadasSemPontos, 0);
  const vistos = [];
  for (let i = 1; i <= 6; i += 1) {
    s = seguir(acerta(s, 'vermelho'));
    vistos.push([gp(s, 'azul').rodadasSemPontos, gp(s, 'vermelho').rodadasSemPontos]);
  }
  assert.deepEqual(vistos, [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]]);
  s = seguir(acerta(s, 'azul'));
  assert.equal(gp(s, 'azul').rodadasSemPontos, 0, 'pontuar zera');
  assert.equal(gp(s, 'azul').tigrinhoVisto, 0);
  assert.equal(gp(s, 'vermelho').rodadasSemPontos, 1);
});

test('rodada em que o grupo não respondeu, ficou sem tentativa ou foi bloqueado conta como sem pontuar', () => {
  let s = novo({}, ['vermelho', 'azul', 'verde']);
  gp(s, 'vermelho').habilidades.push({ tipo: 'bloqueio' });
  s = G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'verde'); // verde bloqueado
  s = acerta(s, 'azul');
  assert.deepEqual(['vermelho', 'azul', 'verde'].map((c) => gp(s, c).rodadasSemPontos), [1, 0, 1]);
  s = seguir(s);
  s = seguir(semNinguem(s)); // ninguém aperta: todos contam
  assert.deepEqual(['vermelho', 'azul', 'verde'].map((c) => gp(s, c).rodadasSemPontos), [2, 1, 2]);
});

test('errar conta como sem pontuar e pontos perdidos em aposta não contam como pontuar', () => {
  let s = novo();
  s = seguir(erra(s, 'vermelho'));
  assert.equal(gp(s, 'vermelho').rodadasSemPontos, 1);
  // aposta com pontos perdida: pontos negativos na rodada não são "pontuar"
  s = G.apostar(s, 'vermelho', 'pontos');
  s = erra(s, 'vermelho');
  assert.equal(gp(s, 'vermelho').pontos, -10);
  s = seguir(s);
  assert.equal(gp(s, 'vermelho').rodadasSemPontos, 2);
  // aposta ganha: os pontos da rodada são positivos e zeram
  s = G.apostar(s, 'vermelho', 'pontos');
  s = acerta(s, 'vermelho');
  assert.ok(gp(s, 'vermelho').pontos > -10);
  assert.equal(gp(s, 'vermelho').rodadasSemPontos, 0);
});

test('a rodada de desempate não conta', () => {
  let s = novo({ meta: 2 });
  s = seguir(acerta(s, 'vermelho'));
  s = seguir(acerta(s, 'azul'));
  assert.equal(s.fase, 'ranking');
  const antes = ['vermelho', 'azul'].map((c) => gp(s, c).rodadasSemPontos);
  s = ajustarPontosTeste(s, 'azul', gp(s, 'vermelho').pontos - gp(s, 'azul').pontos);
  s = G.iniciarDesempate(s);
  s = acerta(s, 'vermelho');
  assert.deepEqual(['vermelho', 'azul'].map((c) => gp(s, c).rodadasSemPontos), antes);
});

test('Desfazer devolve a contagem; novo jogo zera; migração começa em 0 e a versão sobe', () => {
  let s = novo();
  s = seguir(acerta(s));
  const depois = acerta(s);
  assert.equal(gp(depois, 'azul').rodadasSemPontos, 2);
  assert.equal(gp(G.desfazer(depois), 'azul').rodadasSemPontos, 1);
  assert.ok(G.novoJogo(depois).grupos.every((g) => g.rodadasSemPontos === 0 && g.tigrinhoVisto === 0));
  const antigo = JSON.parse(JSON.stringify(s));
  antigo.versao = 5;
  for (const g of antigo.grupos) { delete g.rodadasSemPontos; delete g.tigrinhoVisto; }
  antigo._undo = [JSON.parse(JSON.stringify(antigo))];
  const m = G.migrarEstado(antigo);
  assert.equal(G.VERSAO, 6);
  assert.equal(m.versao, 6);
  assert.ok(m.grupos.every((g) => g.rodadasSemPontos === 0 && g.tigrinhoVisto === 0));
  assert.ok(m._undo[0].grupos.every((g) => g.rodadasSemPontos === 0));
});

// ---------- quando a mensagem aparece ----------
function cheguei(n) { // azul com n rodadas sem pontuar, no começo da rodada seguinte (pergunta)
  let s = novo();
  for (let i = 0; i < n; i += 1) s = seguir(acerta(s, 'vermelho'));
  return s;
}

test('a mensagem vem com 3, 6, 9 rodadas, só na preparação da rodada e só se o grupo puder apostar', () => {
  for (const [n, aparece] of [[1, false], [2, false], [3, true], [4, false], [5, false], [6, true], [9, true]]) {
    const s = cheguei(n);
    assert.equal(s.fase, 'pergunta');
    assert.deepEqual(acoesDoGrupo(s, 'azul').tigrinho, aparece ? { n } : undefined, `n=${n}`);
    assert.equal(acoesDoGrupo(s, 'vermelho').tigrinho, undefined, 'quem pontuou não recebe');
  }
  const s = cheguei(3);
  assert.ok(acoesDoGrupo(G.mostrarAlternativas(s), 'azul').tigrinho, 'também nas alternativas');
  assert.equal(acoesDoGrupo(G.abrirJanela(G.mostrarAlternativas(s)), 'azul').tigrinho, undefined, 'some com a janela de 30 s');
  const fimRodada = acerta(cheguei(2), 'vermelho'); // contagem chegou a 3, mas a rodada ainda não recomeçou
  assert.equal(gp(fimRodada, 'azul').rodadasSemPontos, 3);
  assert.equal(acoesDoGrupo(fimRodada, 'azul').tigrinho, undefined, 'fora da preparação não aparece');
});

test('não aparece sem condição de apostar (limite de apostas, sem pontos e sem habilidades, outra habilidade já usada)', () => {
  let s = cheguei(3);
  gp(s, 'azul').apostas = 2; // apostaMax
  assert.equal(acoesDoGrupo(s, 'azul').tigrinho, undefined, 'limite de apostas');
  assert.equal(gp(s, 'azul').rodadasSemPontos, 3, 'a contagem segue normalmente');
  let t = cheguei(3);
  gp(t, 'azul').pontos = -15; // pagar 10 deixaria abaixo de -20
  assert.equal(acoesDoGrupo(t, 'azul').tigrinho, undefined, 'sem pontos para pagar e sem 2 habilidades');
  gp(t, 'azul').habilidades.push({ tipo: 'passe' }, { tipo: 'escudo' });
  assert.deepEqual(acoesDoGrupo(t, 'azul').tigrinho, { n: 3 }, 'com 2 habilidades para trocar já pode');
  let u = cheguei(3);
  gp(u, 'azul').habilidades.push({ tipo: 'dobro' });
  u = G.ativarHabilidade(u, 'azul', 'dobro');
  assert.equal(acoesDoGrupo(u, 'azul').tigrinho, undefined, 'já usou uma habilidade nesta rodada');
  // rodada final: o modo com pontos não vale, mas com 2 habilidades ainda pode
  let f = novo({ meta: 3 });
  f = seguir(acerta(f, 'vermelho'));
  f = seguir(acerta(f, 'vermelho'));
  f = seguir(acerta(f, 'vermelho')); // meta atingida
  assert.equal(f.fase, 'ranking');
});

test('dispensar não repete para a mesma contagem, mas volta nas próximas (6, 9)', () => {
  let s = cheguei(3);
  assert.ok(acoesDoGrupo(s, 'azul').tigrinho);
  s = G.dispensarTigrinho(s, 'azul');
  assert.equal(acoesDoGrupo(s, 'azul').tigrinho, undefined);
  assert.equal(acoesDoGrupo(G.mostrarAlternativas(s), 'azul').tigrinho, undefined, 'nem nas alternativas');
  assert.equal(G.dispensarTigrinho(s, 'azul'), s, 'idempotente');
  assert.equal(s._undo.length, cheguei(3)._undo.length, 'dispensar não entra no Desfazer');
  for (let i = 0; i < 3; i += 1) s = seguir(acerta(s, 'vermelho'));
  assert.equal(gp(s, 'azul').rodadasSemPontos, 6);
  assert.deepEqual(acoesDoGrupo(s, 'azul').tigrinho, { n: 6 });
  // pontuar zera a contagem e a dispensa: a próxima série de 3 avisa de novo
  s = seguir(acerta(s, 'azul'));
  for (let i = 0; i < 3; i += 1) s = seguir(acerta(s, 'vermelho'));
  assert.deepEqual(acoesDoGrupo(s, 'azul').tigrinho, { n: 3 });
});

test('a visão do grupo certo traz a mensagem; o projetor, o outro grupo e a tela não trazem nada; o painel só vê a contagem', () => {
  const s = cheguei(3);
  const ui = { cena: 'jogo', tema: 'claro', regras: false, teste: { ativo: false } };
  const ctx = { estado: s, ui, janela: {}, final: {}, autenticado: false };
  assert.deepEqual(visaoGrupo(ctx, 'azul', true).acoes.tigrinho, { n: 3 });
  assert.equal(visaoGrupo(ctx, 'vermelho', true).acoes.tigrinho, undefined);
  const tela = JSON.stringify(visaoTela(ctx));
  assert.equal(/tigrinho|rodadasSemPontos|sem pontuar/i.test(tela), false, 'o projetor não recebe nada');
  const host = visaoHost({ ...ctx, ips: [], porta: 1, pin: '1', perguntasInfo: {}, configJogo: {}, padroes: {}, pedidos: {} });
  assert.equal(host.estado.grupos.find((g) => g.cor === 'azul').rodadasSemPontos, 3, 'o responsável vê a contagem no cartão');
});

// ---------- troféu só para quem realmente vence ----------
const ranking = (s) => G.lideres(s);
function comPontos(pontos, elegiveis = {}) {
  let s = novo({}, ['vermelho', 'azul', 'verde']);
  for (const [cor, p] of Object.entries(pontos)) s = ajustarPontosTeste(s, cor, p);
  for (const [cor, e] of Object.entries(elegiveis)) s = G.definirElegivel(s, cor, e);
  return s;
}

test('troféu: todos elegíveis (comportamento de sempre): vai ao primeiro', () => {
  const s = comPontos({ vermelho: 30, azul: 20, verde: 10 });
  assert.deepEqual(ranking(s), ['vermelho']);
  assert.equal(G.vencedor(s), 'vermelho');
});

test('troféu: o primeiro é inelegível e o segundo é elegível: o troféu vai para o segundo', () => {
  const s = comPontos({ vermelho: 30, azul: 20, verde: 10 }, { vermelho: false });
  assert.equal(G.vencedor(s), 'azul');
  assert.deepEqual(ranking(s), ['azul']);
});

test('troféu: primeiro e segundo inelegíveis: vai para o terceiro; ninguém elegível: sem troféu', () => {
  let s = comPontos({ vermelho: 30, azul: 20, verde: 10 }, { vermelho: false, azul: false });
  assert.deepEqual(ranking(s), ['verde']);
  s = G.definirElegivel(s, 'verde', false);
  assert.equal(G.vencedor(s), null);
  assert.deepEqual(ranking(s), []);
});

test('troféu: empate no topo com desempate pendente: sem troféu até decidir; depois, só o vencedor do desempate', () => {
  let s = novo({ meta: 2 });
  s = seguir(acerta(s, 'vermelho'));
  s = seguir(acerta(s, 'azul'));
  s = ajustarPontosTeste(s, 'azul', gp(s, 'vermelho').pontos - gp(s, 'azul').pontos);
  assert.deepEqual(G.empatadosNoTopo(s).sort(), ['azul', 'vermelho']);
  assert.deepEqual(ranking(s), [], 'sem troféu enquanto o desempate está pendente');
  s = G.iniciarDesempate(s);
  const correta = s.perguntas.find((p) => p.id === s.rodada.perguntaId).correta; // a pergunta reserva tem outra correta
  s = G.responder(G.mostrarResposta(G.encerrarJanela(G.clicar(G.abrirJanela(G.mostrarAlternativas(s)), 'azul'))), correta);
  assert.equal(G.vencedor(s), 'azul');
  assert.deepEqual(ranking(s), ['azul']);
  // a visão do projetor e do painel usa a mesma regra e marca quem não é elegível
  const ui = { cena: 'jogo', tema: 'claro', regras: false, teste: { ativo: false } };
  const fim = G.continuar(s);
  assert.equal(fim.fase, 'ranking');
  const v = visaoTela({ estado: G.definirElegivel(fim, 'vermelho', false), ui, janela: {}, final: {} });
  assert.equal(v.ranking.find((r) => r.cor === 'vermelho').elegivel, false);
});

test('a visão da tela final traz o vencedor', () => {
  let s = comPontos({ vermelho: 30, azul: 20 }, { vermelho: false });
  s = { ...s, fase: 'final' };
  const v = visaoTela({ estado: s, ui: { cena: 'jogo', tema: 'claro', regras: false, teste: { ativo: false } }, janela: {}, final: { integrantes: [], mensagem: 'x', professor: 'y' } });
  assert.equal(v.vencedor, 'azul');
  assert.deepEqual(v.lideres, ['azul']);
});

// ---------- servidor: dispensar pelo celular e persistência ----------
test('dispensar pelo celular vale só para o próprio grupo e sobrevive a reconexão', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-tig-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { placarModo: 'desligado', meta: 30 } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => true });
  const abertos = [];
  t.after(async () => { abertos.forEach((c) => c.fechar()); await srv.fechar().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); });
  const host = new Cliente(srv.porta, 'papel=host');
  abertos.push(host);
  await host.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  await ok('novoJogo', {});
  const fones = {};
  const tokens = {};
  for (const cor of ['vermelho', 'azul']) { const r = await entrarGrupo(srv.porta, cor, nomeDaCor(cor)); fones[cor] = r.c; tokens[cor] = r.entrou.token; abertos.push(r.c); }
  await host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  for (let i = 0; i < 3; i += 1) {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    fones.vermelho.enviar({ t: 'apertar' });
    await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta'); await ok('responder', host.ultimo.pergunta.correta); await ok('continuar');
  }
  const vistaAzul = await fones.azul.estadoApos((s) => s.acoes?.tigrinho);
  assert.deepEqual(vistaAzul.acoes.tigrinho, { n: 3 });
  assert.equal((await fones.vermelho.estadoApos((s) => s.acoes)).acoes.tigrinho, undefined);
  assert.equal(host.ultimo.estado.grupos.find((g) => g.cor === 'azul').rodadasSemPontos, 3);
  // vermelho dispensa: nada muda para azul (não existe ação sobre outro grupo)
  assert.equal((await fones.vermelho.acao('dispensarTigrinho')).t, 'ok');
  assert.equal(host.ultimo.estado.grupos.find((g) => g.cor === 'azul').tigrinhoVisto, 0);
  // azul dispensa, reconecta e a mensagem não volta
  assert.equal((await fones.azul.acao('dispensarTigrinho')).t, 'ok');
  assert.equal((await fones.azul.estadoApos((s) => s.acoes && !s.acoes.tigrinho)).acoes.tigrinho, undefined);
  const antigo = fones.azul;
  const fechou = new Promise((r) => antigo.ws.once('close', r));
  antigo.fechar();
  await fechou;
  await host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'azul').conectado === false);
  const nova = await entrarGrupo(srv.porta, 'azul', 'x', tokens.azul);
  abertos.push(nova.c);
  const v = await nova.c.estadoApos((s) => s.registrado && s.acoes);
  assert.equal(v.acoes.tigrinho, undefined, 'dispensada, não volta para esta contagem');
  assert.equal(host.ultimo.estado.grupos.find((g) => g.cor === 'azul').tigrinhoVisto, 3);
  // ações de outro tipo continuam recusadas
  assert.match((await nova.c.acao('naoExiste')).msg, /desconhecida/);
});
