'use strict';
// Etapa 8f: acertos seguidos viram moeda (troca de acertos por habilidade): regras puras e pelo servidor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const G = require('../src/game');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, PIN, ajustarPontosTeste, ajustarPontosNoServidor, nomeDaCor } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');

async function preparar(t, cores, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-b2-')), { iniciar = true } = {}) {
  if (!fs.existsSync(path.join(dir, 'perguntas.json'))) fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const c = { dir, abertos: [], fones: {}, tokens: {} };
  if (!fs.existsSync(path.join(dir, 'config.json'))) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { placarModo: 'desligado' } })); // placar parcial tem testes próprios
  c.srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  t.after(async () => {
    c.abertos.forEach((x) => x.fechar());
    await c.srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const auth = await (await fetch(`http://127.0.0.1:${c.srv.porta}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) })).headers.get('set-cookie');
  const cookie = auth.split(';')[0];
  c.registro = async () => (await (await fetch(`http://127.0.0.1:${c.srv.porta}/api/registro`, { headers: { Cookie: cookie } })).json()).itens.map((i) => i.msg);
  c.host = new Cliente(c.srv.porta, 'papel=host', cookie);
  c.tela = new Cliente(c.srv.porta, 'papel=tela');
  c.abertos.push(c.host, c.tela);
  await Promise.all([c.host.aberto, c.tela.aberto]);
  if (iniciar) {
    await c.host.acao('novoJogo', {});
    for (const cor of cores) {
      const r = await entrarGrupo(c.srv.porta, cor, nomeDaCor(cor));
      c.fones[cor] = r.c;
      c.tokens[cor] = r.entrou.token;
      c.abertos.push(r.c);
    }
    await c.host.estadoApos((s) => s.estado.grupos.length === cores.length && s.estado.grupos.every((g) => g.conectado));
    assert.equal((await c.host.acao('iniciar')).t, 'ok');
  }
  return c;
}

const estado = (c) => c.host.ultimo.estado;
const grupo = (c, cor) => estado(c).grupos.find((g) => g.cor === cor);
const estoque = (c, cor) => grupo(c, cor).habilidades.map((h) => h.tipo);
const certa = (c) => c.host.ultimo.pergunta.correta;
const errada = (c) => [0, 1, 2, 3].find((i) => i !== certa(c) && !estado(c).rodada.erradas.includes(i) && !estado(c).rodada.eliminadas.includes(i));
const ok = async (c, nome, ...a) => { const r = await c.host.acao(nome, ...a); assert.equal(r.t, 'ok', `${nome}: ${r.msg}`); };
async function apertar(c, cor) {
  const antes = estado(c).rodada.ordem.length;
  c.fones[cor].enviar({ t: 'apertar' });
  await c.host.estadoApos((s) => s.estado.rodada.ordem.length > antes || s.estado.fase !== 'janela');
}
// Rodada com `ordem` apertando e as respostas ('c' certa, 'e' errada); depois recusa as ofertas e continua.
async function rodada(c, ordem, respostas, { parar = false, escolhas = {} } = {}) {
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  for (const cor of ordem) await apertar(c, cor);
  if (estado(c).fase === 'janela') await ok(c, 'encerrarJanela');
  if (ordem.length) {
    await ok(c, 'mostrarResposta');
    for (const r of respostas) await ok(c, 'responder', r === 'c' ? certa(c) : errada(c));
  }
  if (parar) return;
  await ok(c, 'continuar');
}
async function ganhar(c, cor, n, escolha) {
  for (let i = 1; i <= n; i += 1) await rodada(c, [cor], ['c']);
  if (escolha) await ok(c, 'trocarAcertos', cor, escolha); // os acertos viram moeda: troca por uma habilidade da faixa
}

const cel = (c, cor, nome, ...a) => c.fones[cor].acao(nome, ...a);
const celOk = async (c, cor, nome, ...a) => { const r = await cel(c, cor, nome, ...a); assert.equal(r.t, 'ok', `${cor}.${nome}: ${r.msg}`); };
const visaoCel = (c, cor, pred = () => true) => c.fones[cor].estadoApos(pred);

// ---------- regras puras (src/game.js) ----------
function bancoPuro(n = 30) {
  const ps = [];
  for (let i = 1; i <= n; i++) ps.push({ id: i, tipo: 'facil', enunciado: `P${i}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, explicacao: 'x', reserva: false });
  ps.push({ id: 99, tipo: 'atencao', enunciado: 'R', alternativas: ['a', 'b', 'c', 'd'], correta: 3, explicacao: 'x', reserva: true });
  return ps;
}
function novo(config = {}) {
  let s = G.criarJogo({ config: { meta: 40, placarModo: 'desligado', ...config }, perguntas: bancoPuro() });
  for (const cor of ['vermelho', 'azul']) s = G.registrarGrupo(s, cor, cor);
  return G.iniciar(s);
}
const gp = (s, cor) => s.grupos.find((g) => g.cor === cor);
const est = (s, cor) => gp(s, cor).habilidades.map((h) => h.tipo);
const comSeq = (s, cor, n) => { gp(s, cor).sequencia = n; return s; }; // atalho de teste
const acertar = (s, cor = 'vermelho') => {
  s = G.abrirJanela(G.mostrarAlternativas(s));
  s = G.encerrarJanela(G.clicar(s, cor));
  return G.responder(G.mostrarResposta(s), 0);
};
const TODAS = ['bloqueio', 'escudo', 'passe', 'dobro', 'dica5050'];

test('faixas: 3 acertos (Bloqueio, Escudo, Passe), 5 (+ Dobro), 7 (+ Dica 50/50); abaixo de 3 não troca', () => {
  const s = novo();
  for (const [n, opcoes] of [[3, TODAS.slice(0, 3)], [4, TODAS.slice(0, 3)], [5, TODAS.slice(0, 4)], [6, TODAS.slice(0, 4)], [7, TODAS]]) {
    assert.deepEqual(G.opcoesDaSequencia(s.config, n), opcoes, `faixa com ${n}`);
    for (const tipo of TODAS) {
      const t = comSeq(structuredClone(s), 'vermelho', n);
      if (opcoes.includes(tipo)) assert.deepEqual(est(G.trocarAcertos(t, 'vermelho', tipo), 'vermelho'), [tipo]);
      else assert.throws(() => G.trocarAcertos(t, 'vermelho', tipo), /faixa/, `${tipo} com ${n}`);
    }
  }
  assert.deepEqual(G.opcoesDaSequencia(s.config, 2), []);
  assert.throws(() => G.trocarAcertos(comSeq(structuredClone(s), 'vermelho', 2), 'vermelho', 'escudo'), /Faltam 1 acerto para trocar/);
  assert.throws(() => G.trocarAcertos(s, 'vermelho', 'escudo'), /Faltam 3 acertos/);
  assert.throws(() => G.trocarAcertos(comSeq(structuredClone(s), 'vermelho', 3), 'vermelho', 'invalida'), G.ErroJogo);
});

test('as faixas usam os marcos configuráveis', () => {
  const s = novo({ seqBloqueio: 2, seqDobro: 4, seqDica: 6 });
  assert.deepEqual(G.opcoesDaSequencia(s.config, 2), TODAS.slice(0, 3));
  assert.deepEqual(G.opcoesDaSequencia(s.config, 4), TODAS.slice(0, 4));
  assert.deepEqual(G.opcoesDaSequencia(s.config, 6), TODAS);
});

test('o contador sobe a cada acerto, para em 7, zera ao trocar e zera em erro, desclassificação e "Sem resposta"', () => {
  let s = novo();
  const vistos = [];
  for (let i = 1; i <= 9; i += 1) {
    s = acertar(s);
    vistos.push(gp(s, 'vermelho').sequencia);
    s = G.continuar(s);
  }
  assert.deepEqual(vistos, [1, 2, 3, 4, 5, 6, 7, 7, 7], 'o contador não passa de 7');
  s = G.trocarAcertos(s, 'vermelho', 'dica5050');
  assert.equal(gp(s, 'vermelho').sequencia, 0, 'comprar zera o contador inteiro, sem troco');
  for (const como of ['erra', 'desqualifica', 'semResposta']) {
    let t = comSeq(novo(), 'vermelho', 6);
    t = G.abrirJanela(G.mostrarAlternativas(t));
    t = G.mostrarResposta(G.encerrarJanela(G.clicar(t, 'vermelho')));
    t = como === 'erra' ? G.responder(t, 1) : como === 'desqualifica' ? G.desqualificar(t) : G.semResposta(t);
    assert.equal(gp(t, 'vermelho').sequencia, 0, como);
  }
  // quem não respondeu mantém
  let u = comSeq(novo(), 'azul', 5);
  u = acertar(u, 'vermelho');
  assert.equal(gp(u, 'azul').sequencia, 5);
});

test('uma habilidade por compra e sem troco: com 6 acertos compra uma e o contador vai a zero', () => {
  const s = G.trocarAcertos(comSeq(novo(), 'vermelho', 6), 'vermelho', 'dobro');
  assert.deepEqual(est(s, 'vermelho'), ['dobro']);
  assert.equal(gp(s, 'vermelho').sequencia, 0);
  assert.deepEqual(s.rodada.ganhos, [{ cor: 'vermelho', tipo: 'dobro', acertos: 6 }]);
  assert.throws(() => G.trocarAcertos(s, 'vermelho', 'escudo'), /Faltam/);
});

test('fases permitidas: explicação, só a correta, placar, pergunta e alternativas; proibidas: janela, ordem, resposta, desempate e depois da meta', () => {
  let s = comSeq(novo({ placarModo: 'toda' }), 'vermelho', 3);
  const pode = (x) => G.trocarAcertos(x, 'vermelho', 'escudo');
  assert.equal(s.fase, 'pergunta'); pode(s);
  s = G.mostrarAlternativas(s); assert.equal(s.fase, 'alternativas'); pode(s);
  s = G.abrirJanela(s); assert.equal(s.fase, 'janela'); assert.throws(() => pode(s), /Só antes da janela/);
  s = G.clicar(s, 'vermelho'); s = G.encerrarJanela(s); assert.equal(s.fase, 'ordem'); assert.throws(() => pode(s), /Só antes da janela/);
  s = G.mostrarResposta(s); assert.equal(s.fase, 'resposta'); assert.throws(() => pode(s), /Só antes da janela/);
  s = G.responder(s, 0); assert.equal(s.fase, 'explicacao'); pode(s);
  s = comSeq(G.continuar(s), 'vermelho', 3);
  assert.equal(s.fase, 'placar'); pode(s);
  // so_correta (ninguém aperta)
  let n = comSeq(novo(), 'vermelho', 3);
  n = G.encerrarJanela(G.abrirJanela(G.mostrarAlternativas(n)));
  assert.equal(n.fase, 'so_correta'); pode(n);
  // depois da meta: na explicação da última rodada e no ranking não vale
  let m = comSeq(novo({ meta: 1 }), 'vermelho', 2);
  m = acertar(m);
  assert.equal(m.respondidas, 1);
  assert.throws(() => pode(comSeq(m, 'vermelho', 3)), /O jogo está no fim/);
  m = G.continuar(m);
  assert.equal(m.fase, 'ranking');
  assert.throws(() => pode(comSeq(m, 'vermelho', 3)), /Só antes da janela/);
  // desempate
  let d = novo({ meta: 2 });
  d = G.continuar(acertar(d, 'vermelho'));
  d = G.continuar(acertar(d, 'azul'));
  d = ajustarPontosTeste(d, 'azul', gp(d, 'vermelho').pontos - gp(d, 'azul').pontos);
  d = comSeq(G.iniciarDesempate(d), 'vermelho', 3);
  assert.throws(() => pode(d), /desempate/);
});

test('estoque cheio: escolher qual guardada sai; a nova entra no fim; repetidas permitidas', () => {
  let s = novo();
  gp(s, 'vermelho').habilidades.push({ tipo: 'passe' }, { tipo: 'passe' });
  s = comSeq(s, 'vermelho', 5);
  assert.throws(() => G.trocarAcertos(s, 'vermelho', 'escudo'), /Estoque cheio/);
  assert.throws(() => G.trocarAcertos(s, 'vermelho', 'escudo', 2), /Estoque cheio/);
  assert.throws(() => G.trocarAcertos(s, 'vermelho', 'escudo', -1), /Estoque cheio/);
  const t = G.trocarAcertos(s, 'vermelho', 'dobro', 0);
  assert.deepEqual(est(t, 'vermelho'), ['passe', 'dobro']);
  assert.equal(gp(t, 'vermelho').sequencia, 0);
  const u = comSeq(novo(), 'vermelho', 3);
  gp(u, 'vermelho').habilidades.push({ tipo: 'bloqueio' });
  assert.deepEqual(est(G.trocarAcertos(u, 'vermelho', 'bloqueio'), 'vermelho'), ['bloqueio', 'bloqueio'], 'com uma guardada só acrescenta');
});

test('Desfazer desfaz a compra: restaura o contador e o estoque', () => {
  let s = comSeq(novo(), 'vermelho', 5);
  gp(s, 'vermelho').habilidades.push({ tipo: 'passe' });
  const comprada = G.trocarAcertos(s, 'vermelho', 'dobro');
  assert.deepEqual(est(comprada, 'vermelho'), ['passe', 'dobro']);
  const volta = G.desfazer(comprada);
  assert.equal(gp(volta, 'vermelho').sequencia, 5);
  assert.deepEqual(est(volta, 'vermelho'), ['passe']);
  assert.deepEqual(volta.rodada.ganhos, []);
});

test('migrarEstado: jogo salvo da 8e com oferta pendente perde a oferta, mantém a sequência (limitada a 7) e converte o histórico', () => {
  const base = JSON.parse(JSON.stringify(novo()));
  base.versao = 3;
  base.grupos[0].sequencia = 5;
  base.grupos[0].oferta = { marco: 5, opcoes: ['bloqueio', 'escudo', 'passe', 'dobro'] };
  base.grupos[1].sequencia = 9; // a 8e deixava passar de 7
  base.grupos[1].oferta = { marco: 7, opcoes: TODAS };
  base._undo = [JSON.parse(JSON.stringify(base))];
  const m = G.migrarEstado(base);
  assert.equal(m.versao, G.VERSAO);
  assert.equal(G.VERSAO, 6);
  assert.ok(m.grupos.every((g) => g.trocas === 0), "jogo salvo antes do limite começa com 0 trocas");
  assert.deepEqual(m.grupos.map((g) => ['oferta' in g, g.sequencia]), [[false, 5], [false, 7]]);
  assert.deepEqual(m._undo[0].grupos.map((g) => ['oferta' in g, g.sequencia]), [[false, 5], [false, 7]]);
  // continua funcionando: o grupo com 5 compra o Dobro
  assert.deepEqual(est(G.trocarAcertos(m, 'vermelho', 'dobro'), 'vermelho'), ['dobro']);
  assert.deepEqual(G.migrarEstado(m), m, 'idempotente');
});

test('o Continuar nunca é travado por oferta e a meta não recusa nada sozinha', () => {
  let s = novo({ meta: 3 });
  for (let i = 1; i <= 3; i += 1) {
    s = acertar(s);
    assert.equal(gp(s, 'vermelho').sequencia, i);
    s = G.continuar(s);
  }
  assert.equal(s.fase, 'ranking');
  assert.equal(gp(s, 'vermelho').sequencia, 3);
  assert.ok(!s.log.some((l) => /oferta/.test(l.msg)));
});

// ---------- servidor: celular, painel, Registro e privacidade ----------
test('troca pelo celular só com o token do próprio grupo; sem entrar no grupo o socket não troca; o celular não vê dados de outros grupos', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'azul', 5, null);
  await ajustarPontosNoServidor(c, 'azul', 777);
  await c.host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'azul').pontos >= 777);
  const vv = await visaoCel(c, 'vermelho', (s) => s.acoes?.troca);
  const valores = [];
  (function varre(x) { if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k !== 'agora') varre(v); } else valores.push(x); })(vv);
  assert.equal(valores.includes(777), false, 'saldo de outro grupo');
  assert.equal(vv.acoes.troca.sequencia, 0);
  assert.equal('grupos' in vv, false);
  // azul vê só o dele
  const va = await visaoCel(c, 'azul', (s) => s.acoes?.troca?.sequencia === 5);
  assert.deepEqual(va.acoes.troca.opcoes, ['bloqueio', 'escudo', 'passe', 'dobro']);
  // um socket de grupo que não entrou não troca
  const intruso = new Cliente(c.srv.porta, 'papel=g&cor=azul');
  c.abertos.push(intruso);
  await intruso.aberto;
  assert.match((await intruso.acao('trocarAcertos', 'dobro')).msg, /Sem conexão com o grupo/);
  assert.equal(grupo(c, 'azul').sequencia, 5);
  // vermelho não consegue gastar os acertos de azul (a ação não aceita outro grupo)
  assert.match((await cel(c, 'vermelho', 'trocarAcertos', 'dobro', 0, 'azul')).msg, /Faltam 3 acertos/);
  assert.equal(grupo(c, 'azul').sequencia, 5);
  // a troca pelo próprio celular vale e entra no Registro com a quantidade
  await celOk(c, 'azul', 'trocarAcertos', 'dobro');
  assert.deepEqual(estoque(c, 'azul'), ['dobro']);
  assert.ok((await c.registro()).some((m) => m.includes('Azul trocou 5 acertos por Dobro') && m.endsWith('(pelo celular)')));
});

test('o projetor recebe o resultado da troca antes da janela e na explicação, sem controles', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  for (let i = 1; i <= 3; i += 1) await rodada(c, ['vermelho'], ['c'], { parar: i === 3 });
  await celOk(c, 'vermelho', 'trocarAcertos', 'passe'); // na explicação
  const exp = await c.tela.estadoApos((s) => s.fase === 'explicacao' && s.ganhos?.length === 1);
  assert.deepEqual(exp.ganhos, [{ cor: 'vermelho', tipo: 'passe', acertos: 3 }]);
  await ok(c, 'continuar');
  for (let i = 1; i <= 3; i += 1) await rodada(c, ['vermelho'], ['c']);
  await celOk(c, 'vermelho', 'trocarAcertos', 'escudo'); // na pergunta
  const perg = await c.tela.estadoApos((s) => s.fase === 'pergunta' && s.ganhos?.length === 1);
  assert.deepEqual(perg.ganhos, [{ cor: 'vermelho', tipo: 'escudo', acertos: 3 }]);
  assert.equal('correta' in perg, false);
});

test('Bloqueio comprado segue o fluxo da 8d: pedido no celular, confirmação no painel e decisão do Escudo do alvo', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'azul', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, null);
  await celOk(c, 'vermelho', 'trocarAcertos', 'bloqueio');
  assert.deepEqual(estoque(c, 'vermelho'), ['bloqueio']);
  await celOk(c, 'vermelho', 'pedirBloqueio', 'azul');
  assert.deepEqual(c.host.ultimo.pedidos, [{ cor: 'vermelho', alvo: 'azul' }]);
  assert.deepEqual(estoque(c, 'vermelho'), ['bloqueio'], 'nada é gasto antes da confirmação');
  await ok(c, 'confirmarBloqueio', 'vermelho');
  assert.deepEqual(estado(c).rodada.escudos, [{ atacante: 'vermelho', alvo: 'azul' }]);
  await celOk(c, 'azul', 'decidirEscudo', true);
  assert.deepEqual(estoque(c, 'vermelho'), []);
  assert.deepEqual(estoque(c, 'azul'), []);
});

test('o botão de reserva do painel compra no lugar do grupo, com as mesmas regras, e fica "pelo painel"', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  for (let i = 1; i <= 2; i += 1) await rodada(c, ['vermelho'], ['c']);
  assert.match((await c.host.acao('trocarAcertos', 'vermelho', 'escudo')).msg, /Faltam 1 acerto/);
  await rodada(c, ['vermelho'], ['c']);
  await ok(c, 'trocarAcertos', 'vermelho', 'escudo');
  assert.ok((await c.registro()).some((m) => m.includes('Vermelho trocou 3 acertos por Escudo') && m.endsWith('(pelo painel)')));
  await ok(c, 'desfazer');
  assert.equal(grupo(c, 'vermelho').sequencia, 3);
  assert.deepEqual(estoque(c, 'vermelho'), []);
});

test('a reconexão do celular restaura o contador e o botão de troca', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  for (let i = 1; i <= 4; i += 1) await rodada(c, ['vermelho'], ['c']);
  const antigo = c.fones.vermelho;
  const fechou = new Promise((r) => antigo.ws.once('close', r));
  antigo.fechar();
  await fechou;
  await c.host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'vermelho').conectado === false);
  const nova = await entrarGrupo(c.srv.porta, 'vermelho', 'x', c.tokens.vermelho);
  c.abertos.push(nova.c);
  c.fones.vermelho = nova.c;
  const v = await nova.c.estadoApos((s) => s.registrado && s.acoes?.troca);
  assert.equal(v.acoes.troca.sequencia, 4);
  assert.equal(v.acoes.troca.pode, true);
  assert.deepEqual(v.acoes.troca.opcoes, ['bloqueio', 'escudo', 'passe']);
});

// ---------- limite de trocas por grupo ----------
const trocarVezes = (s, cor, n) => {
  for (let i = 0; i < n; i += 1) s = G.trocarAcertos(comSeq(s, cor, 3), cor, 'escudo', gp(s, cor).habilidades.length >= 2 ? 0 : undefined);
  return s;
};

test('3 trocas liberam e a 4ª é recusada com o motivo; a contagem é por grupo', () => {
  let s = novo();
  assert.equal(G.CONFIG_PADRAO.compraMax, 3);
  assert.equal(gp(s, 'vermelho').trocas, 0);
  for (let i = 1; i <= 3; i += 1) {
    s = G.trocarAcertos(comSeq(s, 'vermelho', 3), 'vermelho', 'passe', gp(s, 'vermelho').habilidades.length >= 2 ? 0 : undefined);
    assert.equal(gp(s, 'vermelho').trocas, i);
  }
  const quarta = comSeq(s, 'vermelho', 7);
  assert.throws(() => G.trocarAcertos(quarta, 'vermelho', 'dobro', 0), /Seu grupo já usou as 3 trocas do jogo./);
  assert.equal(G.motivoTroca(quarta, gp(quarta, 'vermelho')), 'Seu grupo já usou as 3 trocas do jogo.');
  assert.equal(gp(quarta, 'vermelho').sequencia, 7, 'os acertos continuam');
  // outro grupo não é afetado
  const b = G.trocarAcertos(comSeq(quarta, 'azul', 3), 'azul', 'escudo');
  assert.equal(gp(b, 'azul').trocas, 1);
  assert.equal(gp(b, 'vermelho').trocas, 3);
});

test('o limite de trocas é configurável', () => {
  let s = novo({ compraMax: 1 });
  s = G.trocarAcertos(comSeq(s, 'vermelho', 3), 'vermelho', 'escudo');
  assert.throws(() => G.trocarAcertos(comSeq(s, 'vermelho', 3), 'vermelho', 'passe'), /Seu grupo já usou a única troca do jogo./);
  let t = novo({ compraMax: 5 });
  for (let i = 0; i < 5; i += 1) t = G.trocarAcertos(comSeq(t, 'vermelho', 3), 'vermelho', 'escudo', gp(t, 'vermelho').habilidades.length >= 2 ? 0 : undefined);
  assert.equal(gp(t, 'vermelho').trocas, 5);
  assert.throws(() => G.trocarAcertos(comSeq(t, 'vermelho', 3), 'vermelho', 'escudo', 0), /Seu grupo já usou as 5 trocas do jogo./);
});

test('Desfazer devolve a troca ao contador; um novo jogo zera a contagem', () => {
  let s = trocarVezes(novo(), 'vermelho', 2);
  assert.equal(gp(s, 'vermelho').trocas, 2);
  const t = G.trocarAcertos(comSeq(s, 'vermelho', 3), 'vermelho', 'passe', 0);
  assert.equal(gp(t, 'vermelho').trocas, 3);
  const volta = G.desfazer(t);
  assert.equal(gp(volta, 'vermelho').trocas, 2);
  assert.equal(G.motivoTroca(comSeq(volta, 'vermelho', 3), gp(volta, 'vermelho')), null);
  const novoJ = G.novoJogo(t);
  assert.ok(novoJ.grupos.every((g) => g.trocas === 0));
});

test('a reserva do painel respeita o limite; o celular mostra as trocas usadas e o motivo', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'vermelho', 3, 'passe');
  await ganhar(c, 'vermelho', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, null);
  await ok(c, 'trocarAcertos', 'vermelho', 'bloqueio', 0); // 3ª troca, com o estoque cheio
  assert.equal(grupo(c, 'vermelho').trocas, 3);
  for (let i = 1; i <= 3; i += 1) await rodada(c, ['vermelho'], ['c']);
  const v = await visaoCel(c, 'vermelho', (s) => s.acoes?.troca?.usadas === 3 && s.acoes.troca.sequencia === 3);
  assert.equal(v.acoes.troca.pode, false);
  assert.equal(v.acoes.troca.limite, 3);
  assert.equal(v.acoes.troca.motivo, 'Seu grupo já usou as 3 trocas do jogo.');
  assert.match((await cel(c, 'vermelho', 'trocarAcertos', 'escudo', 0)).msg, /já usou as 3 trocas/);
  assert.match((await c.host.acao('trocarAcertos', 'vermelho', 'escudo', 0)).msg, /já usou as 3 trocas/);
  assert.equal(grupo(c, 'vermelho').sequencia, 3);
  assert.equal((await visaoCel(c, 'azul', (s) => s.acoes?.troca)).acoes.troca.usadas, 0, 'azul não é afetado');
});

test('Configurações: trocas por grupo no jogo valida de 1 a 7 e vale no jogo', async (t) => {
  const c = await preparar(t, [], undefined, { iniciar: false });
  await c.host.acao('novoJogo', {});
  const base = { meta: 14, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5 };
  for (const v of [0, 8, 2.5]) assert.match((await c.host.acao('salvarConfigJogo', { ...base, compraMax: v })).msg, /Trocas por grupo/);
  assert.equal((await c.host.acao('salvarConfigJogo', { ...base, compraMax: 5 })).t, 'ok');
  assert.equal(c.host.ultimo.configJogo.compraMax, 5);
  assert.equal(c.host.ultimo.estado.config.compraMax, 5);
});
