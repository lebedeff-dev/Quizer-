'use strict';
// Etapa 8: Configurações (regras do jogo, capa e tela final) e Registro de eventos.
const test = require('node:test');
const G = require('../src/game');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');
const { descrever, emTexto, hora } = require('../src/registro');
const { Cliente, entrarGrupo, autenticar, dormir, PIN, nomeDaCor } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');

async function subir(t, dir) {
  dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-c-'));
  if (!fs.existsSync(path.join(dir, 'perguntas.json'))) fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const c = { dir, abertos: [] };
  c.srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN });
  t.after(async () => {
    c.abertos.forEach((x) => x.fechar());
    await c.srv.fechar().catch(() => {});
  });
  c.host = new Cliente(c.srv.porta, 'papel=host');
  c.tela = new Cliente(c.srv.porta, 'papel=tela');
  c.abertos.push(c.host, c.tela);
  await Promise.all([c.host.aberto, c.tela.aberto]);
  return c;
}
const limpar = (dir) => fs.rmSync(dir, { recursive: true, force: true });

const VALIDA = { meta: 10, janela: 20, pontosPrimeiro: 8, pontosSegundo: 4, seqBloqueio: 2, seqDobro: 4 };

test('Configurações do jogo: valida, persiste, aplica na sala e adia com a partida em andamento', async (t) => {
  const c = await subir(t);
  t.after(() => limpar(c.dir));
  await c.host.acao('novoJogo', {});
  const h0 = c.host.ultimo;
  assert.deepEqual(h0.configJogo, G.CONFIG_PADRAO);
  assert.equal(h0.padroes.jogo.meta, 14);

  // Validação: o servidor recusa e não altera nada
  for (const [campo, valor, msg] of [
    ['meta', 0, /Perguntas respondidas/], ['meta', 3.5, /Perguntas respondidas/], ['janela', 4, /Tempo para apertar/], ['pontosPrimeiro', 'abc', /acerta primeiro/],
    ['seqBloqueio', 1, /Bloqueio/],
  ]) {
    const r = await c.host.acao('salvarConfigJogo', { ...VALIDA, [campo]: valor });
    assert.equal(r.t, 'erro', `${campo}=${valor}`);
    assert.match(r.msg, msg);
  }
  assert.match((await c.host.acao('salvarConfigJogo', { ...VALIDA, pontosSegundo: 9 })).msg, /em segundo/);
  assert.match((await c.host.acao('salvarConfigJogo', { ...VALIDA, seqBloqueio: 4, seqDobro: 4 })).msg, /Dobro/);
  assert.equal(c.host.ultimo.configJogo.meta, 14);

  // Salvar na sala de espera vale já para a partida; a /tela mostra a nova meta
  assert.equal((await c.host.acao('salvarConfigJogo', VALIDA)).t, 'ok');
  assert.deepEqual(c.host.ultimo.configJogo, { ...G.CONFIG_PADRAO, ...VALIDA });
  assert.equal(c.host.ultimo.estado.config.meta, 10);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(c.dir, 'config.json'), 'utf8')).jogo, VALIDA);

  // Com a partida em andamento, as regras salvas só valem no próximo jogo novo
  for (const cor of ['vermelho', 'azul']) { const f = await entrarGrupo(c.srv.porta, cor, nomeDaCor(cor)); c.abertos.push(f.c); }
  await c.host.estadoApos((s) => s.estado.grupos.length === 2);
  assert.equal((await c.host.acao('iniciar')).t, 'ok');
  assert.equal((await c.host.acao('salvarConfigJogo', { ...VALIDA, meta: 12, janela: 45 })).t, 'ok');
  assert.equal(c.host.ultimo.estado.config.meta, 10);
  assert.equal(c.host.ultimo.estado.config.janela, 20);
  assert.equal((await c.host.acao('zerarJogo')).t, 'ok');
  assert.equal(c.host.ultimo.estado.config.meta, 12);
  assert.equal(c.host.ultimo.estado.config.janela, 45);
  const tela = await c.tela.estadoApos(() => true);
  assert.ok(tela);
});

test('Configurações da capa e da tela final aparecem na hora e sobrevivem ao reinício', async (t) => {
  const c = await subir(t);
  const dir = c.dir;
  t.after(() => limpar(dir));
  assert.match((await c.host.acao('salvarTextos', { disciplina: '', professor: 'X', mensagem: 'Y', integrantes: ['A'] })).msg, /Preencha/);
  const textos = { disciplina: 'Outra disciplina', professor: 'Profa. Dra. Teste', mensagem: 'Valeu!', integrantes: ['Ana', 'Bia', 'Caio'] };
  assert.equal((await c.host.acao('salvarTextos', textos)).t, 'ok');
  assert.equal(c.host.ultimo.final.professor, 'Profa. Dra. Teste');
  assert.equal((await (await fetch(`http://127.0.0.1:${c.srv.porta}/api/capa`)).json()).disciplina, 'Outra disciplina');

  c.abertos.forEach((x) => x.fechar());
  await c.srv.fechar();
  const c2 = await subir(t, dir);
  assert.deepEqual(c2.host.ultimo.final, { ...textos, parabens: c.host.ultimo.padroes.final.parabens }); // a mensagem de parabenização não enviada mantém o padrão
});

test('Registro: eventos com horário em português, mais novo por último, persistido e limpo no novo jogo', async (t) => {
  const c = await subir(t);
  const dir = c.dir;
  t.after(() => limpar(dir));
  const auth = await autenticar(c.srv.porta, PIN);
  await c.host.acao('novoJogo', {});
  const fones = {};
  for (const cor of ['vermelho', 'azul']) { fones[cor] = (await entrarGrupo(c.srv.porta, cor, nomeDaCor(cor))).c; c.abertos.push(fones[cor]); }
  await c.host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await c.host.acao('iniciar');
  await c.host.acao('mostrarAlternativas');
  await c.host.acao('abrirJanela');
  fones.azul.enviar({ t: 'apertar' });
  await c.host.estadoApos((s) => s.estado.rodada?.ordem.length === 1);
  fones.vermelho.enviar({ t: 'apertar' }); // todos apertaram: a janela fecha sozinha
  await c.host.estadoApos((s) => s.estado.fase === 'ordem');
  await c.host.acao('mostrarResposta');
  const certa = c.host.ultimo.pergunta.correta;
  await c.host.acao('responder', (certa + 1) % 4);
  await c.host.acao('responder', certa);
  await dormir(50);

  const r = await fetch(`http://127.0.0.1:${c.srv.porta}/api/registro`, { headers: { Cookie: auth.cookie } });
  const { itens } = await r.json();
  const msgs = itens.map((i) => i.msg);
  assert.ok(itens.every((i) => i.t > 1e12 && i.tipo && i.msg), 'cada linha tem horário, tipo e texto');
  assert.ok(msgs.some((m) => /Azul conectado/.test(m)));
  assert.ok(msgs.some((m) => /Jogo iniciado com 2 grupos/.test(m)));
  assert.ok(msgs.some((m) => /Rodada 1: janela de 30 s aberta/.test(m)));
  assert.ok(msgs.some((m) => /Azul apertou \(1º\)/.test(m)));
  assert.ok(msgs.some((m) => /Vermelho apertou \(2º\)/.test(m)));
  assert.ok(msgs.some((m) => /janela encerrada porque todos os aptos apertaram, ordem: Azul, Vermelho/.test(m)));
  assert.ok(msgs.some((m) => /Azul respondeu [A-D] e errou/.test(m)));
  assert.ok(msgs.some((m) => /Vermelho respondeu [A-D] e acertou \(\+5 pontos\)\. Rodada encerrada, respondidas 1\/14/.test(m)));
  const ordenado = itens.every((i, k) => k === 0 || i.t >= itens[k - 1].t);
  assert.ok(ordenado);

  // endpoints exigem o responsável; o .txt é baixável
  const semAuth = await fetch(`http://127.0.0.1:${c.srv.porta}/api/registro`);
  assert.equal(semAuth.status, 200); // 127.0.0.1 é o próprio notebook (responsável)
  const txt = await fetch(`http://127.0.0.1:${c.srv.porta}/api/registro.txt`);
  assert.match(txt.headers.get('content-disposition'), /attachment/);
  assert.match(await txt.text(), /\d\d:\d\d:\d\d {2}\[clique\] {2}Rodada 1: Azul apertou \(1º\)/);
  assert.ok(c.host.ultimo.registroTotal >= itens.length);

  // persiste ao reiniciar; um novo jogo limpa
  fones.azul.fechar(); fones.vermelho.fechar();
  c.abertos.forEach((x) => x.fechar());
  await c.srv.fechar();
  const c2 = await subir(t, dir);
  const depois = await (await fetch(`http://127.0.0.1:${c2.srv.porta}/api/registro`)).json();
  assert.ok(depois.itens.some((i) => /Jogo iniciado/.test(i.msg)));
  await c2.host.acao('novoJogo', { substituir: true });
  const limpo = await (await fetch(`http://127.0.0.1:${c2.srv.porta}/api/registro`)).json();
  assert.equal(limpo.itens.length, 1);
  assert.match(limpo.itens[0].msg, /Novo jogo criado/);
});

test('Registro: o endpoint exige o PIN para outros aparelhos', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-r-'));
  fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  t.after(async () => { await srv.fechar(); limpar(dir); });
  assert.equal((await fetch(`http://127.0.0.1:${srv.porta}/api/registro`)).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${srv.porta}/api/registro.txt`)).status, 401);
  const a = await autenticar(srv.porta, PIN);
  assert.equal((await fetch(`http://127.0.0.1:${srv.porta}/api/registro`, { headers: { Cookie: a.cookie } })).status, 200);
});

test('descrever: texto das ações e formato da hora', () => {
  assert.equal(descrever('pausar', [], {}, { pausado: true }).msg, 'Jogo pausado');
  assert.equal(descrever('mostrarAlternativas', [], {}, { rodadaNum: 3, rodada: {} }).msg, 'Rodada 3: alternativas na tela');
  assert.equal(descrever('nao-existe', [], {}, {}), null);
  assert.match(hora(new Date(2026, 9, 23, 8, 5, 9).getTime()), /^08:05:09$/);
  assert.equal(emTexto([{ t: new Date(2026, 9, 23, 8, 5, 9).getTime(), tipo: 'jogo', msg: 'X' }]), '08:05:09  [jogo]  X\r\n');
});
