'use strict';
// Etapa 8c: aleatorizar ordem das perguntas, troféu no ranking final e placar parcial.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const G = require('../src/game.js');
const P = require('../src/perguntas.js');
const { visaoTela, visaoGrupo, visaoHost } = require('../src/visoes.js');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, PIN, ajustarPontosTeste, nomeDaCor } = require('./ajuda');

function banco(n = 24) {
  const ps = [];
  for (let i = 1; i <= n; i++) ps.push({ id: i, tipo: 'facil', enunciado: `P${i}`, alternativas: ['a', 'b', 'c', 'd'], correta: i % 4, explicacao: `x${i}`, reserva: false });
  ps.push({ id: 99, tipo: 'atencao', enunciado: 'R', alternativas: ['a', 'b', 'c', 'd'], correta: 3, explicacao: 'x', reserva: true });
  return ps;
}
function novo(config = {}, cores = ['vermelho', 'azul']) {
  let s = G.criarJogo({ config, perguntas: banco() });
  for (const c of cores) s = G.registrarGrupo(s, c, `rep-${c}`);
  return G.iniciar(s);
}
const certa = (s) => s.perguntas.find((p) => p.id === s.rodada.perguntaId).correta;
// Rodada em que `cor` acerta; para na explicação (sem continuar).
function acerta(s, cor = 'vermelho') {
  s = G.abrirJanela(G.mostrarAlternativas(s));
  s = G.clicar(s, cor);
  s = G.encerrarJanela(s);
  s = G.mostrarResposta(s);
  return G.responder(s, certa(s));
}
// Rodada em que ninguém aperta.
function ninguem(s) {
  s = G.abrirJanela(G.mostrarAlternativas(s));
  return G.encerrarJanela(s);
}
function recusarOfertas(s) {
  return s;
}
// Avança `n` rodadas com acerto, devolvendo o estado depois do último Continuar (se parar, na explicação).
function rodadas(s, n, { parar = false } = {}) {
  for (let i = 1; i <= n; i += 1) {
    s = recusarOfertas(acerta(s));
    if (parar && i === n) return s;
    s = G.continuar(s);
    if (s.fase === 'placar') s = G.continuar(s);
  }
  return s;
}

// ---------- 8c-3: placar parcial ----------
test('placar parcial: com os padrões aparece uma vez, depois da explicação da 7ª respondida, e a 14ª vai ao Ranking', () => {
  let s = novo();
  const fases = [];
  for (let i = 1; i <= 14; i += 1) {
    s = recusarOfertas(acerta(s));
    s = G.continuar(s);
    fases.push(s.fase);
    if (s.fase === 'placar') s = G.continuar(s);
  }
  assert.deepEqual(fases.map((f, i) => [i + 1, f]).filter(([, f]) => f === 'placar'), [[7, 'placar']]);
  assert.equal(fases[13], 'ranking', 'na 14ª vem o Ranking, sem placar antes');
  assert.equal(s.respondidas, 14);
});

test('placar parcial: continuar sai do placar para a próxima rodada; Desfazer volta para a explicação', () => {
  let s = rodadas(novo(), 6);
  s = recusarOfertas(acerta(s));
  const antes = s;
  s = G.continuar(s);
  assert.equal(s.fase, 'placar');
  assert.equal(s.rodadaNum, 7, 'ainda é a rodada 7');
  assert.equal(G.desfazer(s).fase, antes.fase);
  const prox = G.continuar(s);
  assert.equal(prox.fase, 'pergunta');
  assert.equal(prox.rodadaNum, 8);
});

test('placar parcial: rodada sem tentativa não dispara, nem o desempate, nem o Ranking', () => {
  // 6 respondidas, depois uma rodada sem ninguém: respondidas continuam 6 (múltiplo? não), nenhuma exibição
  let s = rodadas(novo(), 6);
  s = G.continuar(recusarOfertas(ninguem(s)));
  assert.equal(s.fase, 'pergunta');
  // com N=1, rodada sem tentativa continua sem placar
  let t = novo({ placarN: 1 });
  t = G.continuar(ninguem(t));
  assert.equal(t.fase, 'pergunta');
  // em 7 respondidas, uma rodada sem tentativa depois não repete o placar
  let u = rodadas(novo(), 7);
  u = G.continuar(ninguem(u));
  assert.equal(u.fase, 'pergunta');
  // desempate: vai ao Ranking, nunca ao placar
  let d = novo({ meta: 2, placarModo: 'toda' }, ['vermelho', 'azul']);
  d = G.continuar(recusarOfertas(acerta(d, 'vermelho')));
  assert.equal(d.fase, 'placar');
  d = G.continuar(d);
  d = recusarOfertas(acerta(d, 'azul'));
  d = G.continuar(d);
  assert.equal(d.fase, 'ranking'); // meta atingida: Ranking, sem placar
  d = ajustarPontosTeste(d, 'azul', d.grupos[0].pontos - d.grupos[1].pontos);
  d = G.iniciarDesempate(d);
  d = G.continuar(acerta(d, 'azul'));
  assert.equal(d.fase, 'ranking');
});

test('placar parcial: muda com N, funciona toda rodada e fica desligado', () => {
  const fases = (config, n) => {
    let s = novo({ meta: 30, ...config });
    const out = [];
    for (let i = 1; i <= n; i += 1) {
      s = G.continuar(recusarOfertas(acerta(s)));
      if (s.fase === 'placar') { out.push(i); s = G.continuar(s); }
    }
    return out;
  };
  assert.deepEqual(fases({ placarN: 3 }, 10), [3, 6, 9]);
  assert.deepEqual(fases({ placarModo: 'toda' }, 4), [1, 2, 3, 4]);
  assert.deepEqual(fases({ placarModo: 'desligado' }, 8), []);
  assert.deepEqual(fases({}, 15), [7, 14]);
});

test('placar parcial: "ocultar nas últimas K" respeita a meta', () => {
  const fases = (config, n) => {
    let s = novo({ placarModo: 'toda', ...config });
    const out = [];
    for (let i = 1; i <= n; i += 1) {
      s = G.continuar(recusarOfertas(acerta(s)));
      if (s.fase === 'placar') { out.push(i); s = G.continuar(s); }
      if (s.fase === 'ranking') break;
    }
    return out;
  };
  assert.deepEqual(fases({ meta: 6, placarOcultar: 2 }, 6), [1, 2, 3, 4]);
  assert.deepEqual(fases({ meta: 6, placarOcultar: 0 }, 6), [1, 2, 3, 4, 5]);
  assert.deepEqual(fases({ meta: 14, placarModo: 'cada', placarN: 7, placarOcultar: 8 }, 14), [], 'a 7ª cai dentro das últimas 8');
  assert.deepEqual(fases({ meta: 14, placarModo: 'cada', placarN: 7, placarOcultar: 7 }, 14), [7]);
});

test('placar parcial: só cor e pontos, ordenados, empates dividem a posição e negativos aparecem', () => {
  let s = novo({}, ['vermelho', 'azul', 'verde']);
  s = ajustarPontosTeste(s, 'azul', 10);
  s = ajustarPontosTeste(s, 'verde', 10);
  s = ajustarPontosTeste(s, 'vermelho', -5);
  const p = G.placar(s);
  assert.deepEqual(p, [{ cor: 'azul', pontos: 10, posicao: 1 }, { cor: 'verde', pontos: 10, posicao: 1 }, { cor: 'vermelho', pontos: -5, posicao: 3 }]);
  const ctx = { estado: { ...s, fase: 'placar' }, ui: { cena: 'jogo', tema: 'claro', regras: false, teste: { ativo: false } }, janela: {}, final: {} };
  const v = visaoTela(ctx);
  assert.deepEqual(v.placar, p);
  for (const proibido of ['ranking', 'sequencia', 'habilidades', 'enunciado', 'alternativas', 'correta']) assert.equal(proibido in v, false, proibido);
  assert.equal(JSON.stringify(v.placar).includes('sequencia'), false);
  const cel = visaoGrupo(ctx, 'azul', true);
  assert.equal(cel.botao, 'placar');
});

test('placar parcial: jogo salvo antigo (sem as chaves do placar) carrega com os padrões', () => {
  const s = novo();
  const antigo = JSON.parse(JSON.stringify(s));
  for (const k of ['placarModo', 'placarN', 'placarOcultar']) delete antigo.config[k];
  const m = G.migrarEstado(antigo);
  assert.equal(m.config.placarModo, 'cada');
  assert.equal(m.config.placarN, 7);
  assert.equal(m.config.placarOcultar, 0);
});

// ---------- troféu ----------
test('troféu: só o vencedor de verdade o recebe (detalhes em trofeu-elegivel.test.js)', () => {
  let s = novo({}, ['vermelho', 'azul', 'verde']);
  assert.deepEqual(G.lideres(s), [], 'todos empatados em 0: o desempate decide, ninguém leva o troféu ainda');
  s = ajustarPontosTeste(s, 'azul', 10);
  assert.deepEqual(G.lideres(s), ['azul']);
});

test('troféu: o arquivo é WebP com a extensão certa e ninguém referencia o nome antigo', () => {
  const dir = path.join(__dirname, '..', 'public', 'assets');
  assert.equal(fs.existsSync(path.join(dir, 'trofeu.png')), false);
  const b = fs.readFileSync(path.join(dir, 'trofeu.webp'));
  assert.equal(b.subarray(0, 4).toString(), 'RIFF');
  assert.equal(b.subarray(8, 12).toString(), 'WEBP');
  const achar = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? achar(path.join(d, e.name)) : [path.join(d, e.name)]));
  const raiz = path.join(__dirname, '..');
  const fontes = [...achar(path.join(raiz, 'public')), ...achar(path.join(raiz, 'src')), path.join(raiz, 'server.js'), path.join(raiz, 'main.js'), path.join(raiz, 'package.json')]
    .filter((f) => /\.(js|css|html|json)$/.test(f));
  assert.deepEqual(fontes.filter((f) => fs.readFileSync(f, 'utf8').includes('trofeu.png')), []);
  assert.ok(fontes.some((f) => fs.readFileSync(f, 'utf8').includes('trofeu.webp')));
});

// ---------- 8c-1: aleatorizar ordem ----------
test('aleatorizarOrdem: a ordem muda, o conjunto é o mesmo, a reserva fica no fim e as alternativas não mudam', () => {
  const lista = banco(10);
  lista.splice(3, 0, lista.pop()); // reserva no meio
  const nova = P.aleatorizarOrdem(lista);
  assert.notDeepEqual(nova.filter((p) => !p.reserva).map((p) => p.id), lista.filter((p) => !p.reserva).map((p) => p.id));
  assert.deepEqual(nova.map((p) => p.id).sort((a, b) => a - b), lista.map((p) => p.id).sort((a, b) => a - b));
  assert.equal(nova[nova.length - 1].reserva, true);
  assert.equal(nova.filter((p) => p.reserva).length, 1);
  for (const p of nova) assert.deepEqual(p, lista.find((x) => x.id === p.id), 'cada pergunta continua igual');
  // entrada não é alterada
  assert.equal(lista[3].reserva, true);
  // com aleatório "sem sorte" ainda muda a ordem
  assert.notDeepEqual(P.aleatorizarOrdem(banco(3), () => 0.999).map((p) => p.id), [1, 2, 3, 99]);
  assert.deepEqual(P.aleatorizarOrdem(banco(1)).map((p) => p.id), [1, 99]);
});

async function subir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8c-'));
  fs.writeFileSync(path.join(dir, 'perguntas.json'), JSON.stringify({ perguntas: banco(12) }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  const auth = (await fetch(`http://127.0.0.1:${srv.porta}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) })).headers.get('set-cookie').split(';')[0];
  const c = { dir, srv, cookie: auth, abertos: [] };
  c.host = new Cliente(srv.porta, 'papel=host', auth);
  c.abertos.push(c.host);
  await c.host.aberto;
  c.api = (url, opcoes = {}) => fetch(`http://127.0.0.1:${srv.porta}${url}`, { ...opcoes, headers: { Cookie: auth, 'Content-Type': 'application/json' } });
  t.after(async () => { c.abertos.forEach((x) => x.fechar()); await srv.fechar().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); });
  return c;
}

test('Aleatorizar ordem pela API: embaralha, grava backup, persiste e o Desfazer (PUT da ordem anterior) restaura', async (t) => {
  const c = await subir(t);
  const antes = (await (await c.api('/api/perguntas')).json()).perguntas;
  const r = await c.api('/api/perguntas/aleatorizar', { method: 'POST' });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.notDeepEqual(corpo.perguntas.map((p) => p.id), antes.map((p) => p.id));
  assert.equal(corpo.perguntas.at(-1).reserva, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(c.dir, 'perguntas.json'), 'utf8')).perguntas.map((p) => p.id), corpo.perguntas.map((p) => p.id));
  const backups = fs.readdirSync(path.join(c.dir, 'backup'));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(c.dir, 'backup', backups[0]), 'utf8')).perguntas.map((p) => p.id), antes.map((p) => p.id));
  const volta = await c.api('/api/perguntas', { method: 'PUT', body: JSON.stringify({ perguntas: antes }) });
  assert.equal(volta.status, 200);
  assert.deepEqual((await (await c.api('/api/perguntas')).json()).perguntas, antes);
  assert.equal((await fetch(`http://127.0.0.1:${c.srv.porta}/api/perguntas/aleatorizar`, { method: 'POST' })).status, 401, 'só o responsável');
});

test('Aleatorizar ordem fica bloqueado com partida em andamento', async (t) => {
  const c = await subir(t);
  await c.host.acao('novoJogo', {});
  for (const cor of ['vermelho', 'azul']) { const f = await entrarGrupo(c.srv.porta, cor, nomeDaCor(cor)); c.abertos.push(f.c); }
  await c.host.estadoApos((s) => s.estado.grupos.length === 2);
  assert.equal((await c.host.acao('iniciar')).t, 'ok');
  const r = await c.api('/api/perguntas/aleatorizar', { method: 'POST' });
  assert.equal(r.status, 409);
  assert.match((await r.json()).erro, /partida em andamento/);
  assert.equal(c.host.ultimo.perguntasInfo.partidaAtiva, true);
});

test('Configurações do placar parcial: validam e persistem; o placar aparece no servidor e no Registro', async (t) => {
  const c = await subir(t);
  await c.host.acao('novoJogo', {});
  const base = { meta: 14, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5 };
  assert.match((await c.host.acao('salvarConfigJogo', { ...base, placarModo: 'sempre' })).msg, /Placar parcial/);
  assert.match((await c.host.acao('salvarConfigJogo', { ...base, placarN: 0 })).msg, /a cada quantas/);
  assert.match((await c.host.acao('salvarConfigJogo', { ...base, placarOcultar: -1 })).msg, /Esconder o placar/);
  assert.equal((await c.host.acao('salvarConfigJogo', { ...base, placarModo: 'toda', placarN: 3, placarOcultar: 1 })).t, 'ok');
  assert.deepEqual([c.host.ultimo.configJogo.placarModo, c.host.ultimo.configJogo.placarN, c.host.ultimo.configJogo.placarOcultar], ['toda', 3, 1]);
  for (const cor of ['vermelho', 'azul']) { const f = await entrarGrupo(c.srv.porta, cor, nomeDaCor(cor)); c.abertos.push(f.c); c.fones = { ...c.fones, [cor]: f.c }; }
  await c.host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  const tela = new Cliente(c.srv.porta, 'papel=tela', c.cookie);
  c.abertos.push(tela);
  await tela.aberto;
  const ok = async (n, ...a) => { const r = await c.host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  await ok('iniciar');
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  c.fones.vermelho.enviar({ t: 'apertar' });
  await c.host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
  await ok('encerrarJanela');
  await ok('mostrarResposta');
  await ok('responder', c.host.ultimo.pergunta.correta);
  await ok('continuar');
  const v = await tela.estadoApos((s) => s.fase === 'placar');
  assert.equal(v.placar[0].cor, 'vermelho');
  assert.equal(v.placar[0].pontos, 10);
  const cel = await c.fones.azul.estadoApos((s) => s.botao === 'placar');
  assert.equal(cel.botao, 'placar');
  assert.equal(c.host.ultimo.perguntasInfo.partidaAtiva, true);
  const reg = (await (await c.api('/api/registro')).json()).itens.map((i) => i.msg);
  assert.ok(reg.some((m) => m.startsWith('Placar parcial na tela (respondidas 1/14): Vermelho 10, Azul 0')));
  await ok('desfazer');
  assert.equal(c.host.ultimo.estado.fase, 'explicacao');
  await ok('continuar');
  await ok('continuar'); // sai do placar
  assert.equal(c.host.ultimo.estado.fase, 'pergunta');
  assert.equal(c.host.ultimo.estado.rodadaNum, 2);
});
