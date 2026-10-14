'use strict';
// Sobe o servidor de verdade e simula o responsável, a /tela e 8 celulares por WebSocket.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');

const { Cliente, autenticar, entrarGrupo, dormir, PIN, nomeDaCor } = require('./ajuda');
const CORES8 = ['vermelho', 'azul', 'verde', 'amarelo', 'laranja', 'roxo', 'rosa', 'ciano'];

test('integração: 8 celulares, ordem de cliques, reconexão e persistência', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-'));
  let srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  const aberto = [];
  t.after(async () => {
    aberto.forEach((c) => c.fechar());
    await srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // --- PIN e cookie ---
  assert.equal((await autenticar(srv.porta, '0000')).status, 401);
  const auth = await autenticar(srv.porta, PIN);
  assert.equal(auth.status, 200);
  await assert.rejects(new Cliente(srv.porta, 'papel=host').aberto, /401/);

  const host = new Cliente(srv.porta, 'papel=host', auth.cookie);
  aberto.push(host);
  await host.aberto;
  const tela = new Cliente(srv.porta, 'papel=tela');
  aberto.push(tela);
  await tela.aberto;
  const telaAuth = new Cliente(srv.porta, 'papel=tela', auth.cookie);
  aberto.push(telaAuth);
  await telaAuth.aberto;

  // Sem o cookie, a /tela só lê.
  assert.match((await tela.acao('continuar')).msg, /permiss/i);
  assert.equal((await host.acao('novoJogo', {})).t, 'ok');
  assert.equal((await tela.estadoApos((s) => s.cena === 'espera')).cena, 'espera');

  // --- 8 celulares entram ---
  const grupos = {};
  for (const cor of CORES8) {
    const { c, entrou } = await entrarGrupo(srv.porta, cor, nomeDaCor(cor));
    assert.equal(entrou.t, 'entrou');
    grupos[cor] = { c, token: entrou.token };
    aberto.push(c);
  }
  await host.estadoApos((s) => s.estado.grupos.length === 8 && s.estado.grupos.every((g) => g.conectado));

  // Cor já usada por outro aparelho é recusada.
  const intruso = await entrarGrupo(srv.porta, 'azul', 'Intruso');
  assert.equal(intruso.entrou.t, 'erro');
  intruso.c.fechar();

  // --- jogo ---
  assert.equal((await host.acao('iniciar')).t, 'ok');
  assert.equal((await host.acao('mostrarAlternativas')).t, 'ok');

  // A /tela não pode receber a resposta correta antes da hora.
  const vTela = await tela.estadoApos((s) => s.fase === 'alternativas');
  assert.equal(vTela.correta, undefined);
  assert.equal(vTela.explicacao, undefined);
  assert.equal(vTela.alternativas.length, 4);

  // Clique fora da janela é ignorado.
  grupos.azul.c.enviar({ t: 'apertar' });
  await grupos.azul.c.esperar((m) => m.t === 'ignorado');

  assert.equal((await host.acao('abrirJanela')).t, 'ok');
  const alvo = ['verde', 'vermelho', 'ciano', 'azul', 'rosa'];
  for (const cor of alvo) {
    grupos[cor].c.enviar({ t: 'apertar' });
    const v = await grupos[cor].c.estadoApos((s) => s.botao === 'registrado');
    assert.equal(v.posicao, alvo.indexOf(cor) + 1);
  }
  // Clique duplicado do mesmo grupo é ignorado.
  grupos.verde.c.enviar({ t: 'apertar' });
  await grupos.verde.c.esperar((m) => m.t === 'ignorado');
  let h = await host.estadoApos((s) => s.estado.rodada?.ordem.length === 5);
  assert.deepEqual(h.estado.rodada.ordem, alvo);

  // Os três restantes clicam ao mesmo tempo: a ordem é a de chegada ao servidor.
  const resto = ['amarelo', 'laranja', 'roxo'];
  resto.forEach((cor) => grupos[cor].c.enviar({ t: 'apertar' }));
  h = await host.estadoApos((s) => s.estado.fase === 'ordem'); // todos clicaram: a janela fecha sozinha
  assert.equal(h.estado.rodada.ordem.length, 8);
  assert.deepEqual(h.estado.rodada.ordem.slice(0, 5), alvo);
  assert.deepEqual(h.estado.rodada.ordem.slice(5), srv.chegadas.slice(-3).map((x) => x.cor));
  const ns = srv.chegadas.map((x) => x.ns);
  assert.ok(ns.every((v, i) => i === 0 || v >= ns[i - 1]), 'tempos de chegada crescentes');

  // --- reconexão pelo token ---
  grupos.verde.c.fechar();
  await host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'verde').conectado === false);
  const volta = await entrarGrupo(srv.porta, 'verde', undefined, grupos.verde.token);
  aberto.push(volta.c);
  assert.equal(volta.entrou.t, 'entrou');
  assert.equal(volta.entrou.token, grupos.verde.token);
  const vv = await volta.c.estadoApos((s) => s.registrado);
  assert.equal(vv.botao, 'registrado');
  assert.equal(vv.posicao, 1);
  grupos.verde.c = volta.c;

  // --- resposta e pontuação ---
  assert.equal((await host.acao('mostrarResposta')).t, 'ok');
  const correta = host.ultimo.pergunta.correta;
  assert.equal((await host.acao('responder', correta)).t, 'ok');
  h = await host.estadoApos((s) => s.estado.fase === 'explicacao');
  assert.equal(h.estado.grupos.find((g) => g.cor === 'verde').pontos, 10);
  const vTela2 = await tela.estadoApos((s) => s.fase === 'explicacao');
  assert.equal(vTela2.correta, correta);

  // --- persistência: reiniciar o servidor mantém o jogo ---
  const porta1 = srv.porta;
  aberto.splice(0).forEach((c) => c.fechar());
  await srv.fechar();
  assert.ok(fs.existsSync(path.join(dir, 'jogo.json')));
  srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  assert.notEqual(srv.porta, 0);
  void porta1;

  const auth2 = await autenticar(srv.porta, PIN);
  const host2 = new Cliente(srv.porta, 'papel=host', auth2.cookie);
  aberto.push(host2);
  await host2.aberto;
  const h2 = await host2.estadoApos((s) => s.estado);
  assert.equal(h2.estado.fase, 'explicacao');
  assert.equal(h2.estado.grupos.length, 8);
  assert.equal(h2.estado.grupos.find((g) => g.cor === 'verde').pontos, 10);
  assert.equal(h2.ui.cena, 'jogo');

  // Celular reconecta sozinho com o token e volta ao mesmo grupo.
  const volta2 = await entrarGrupo(srv.porta, 'verde', undefined, grupos.verde.token);
  aberto.push(volta2.c);
  assert.equal(volta2.entrou.t, 'entrou');
  const vv2 = await volta2.c.estadoApos((s) => s.registrado);
  assert.equal(vv2.nome, 'Verde');

  // Segue o jogo normalmente depois da retomada.
  assert.equal((await host2.acao('continuar')).t, 'ok');
  const h3 = await host2.estadoApos((s) => s.estado.fase === 'pergunta');
  assert.equal(h3.estado.rodada.numero, 2);
});

test('integração: cronômetro da janela encerra sozinho e a pausa congela', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  const abertos = [];
  t.after(async () => {
    abertos.forEach((c) => c.fechar());
    await srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  // Janela curta, definida pelo config salvo antes de abrir o jogo.
  const auth = await autenticar(srv.porta, PIN);
  const host = new Cliente(srv.porta, 'papel=host', auth.cookie);
  abertos.push(host);
  await host.aberto;
  await host.acao('novoJogo', {});
  for (const cor of ['azul', 'verde']) {
    const { c } = await entrarGrupo(srv.porta, cor, nomeDaCor(cor));
    abertos.push(c);
  }
  await host.estadoApos((s) => s.estado.grupos.length === 2);
  await host.acao('iniciar');
  await host.acao('mostrarAlternativas');
  await host.acao('abrirJanela');
  let h = await host.estadoApos((s) => s.estado.fase === 'janela');
  assert.ok(h.janela.fimEm > Date.now() + 25000, 'janela de ~30 s');

  await host.acao('pausar', true);
  h = await host.estadoApos((s) => s.estado.pausado);
  assert.ok(h.janela.restanteMs > 25000);
  const antes = h.janela.restanteMs;
  await dormir(300);
  assert.equal(host.ultimo.janela.restanteMs, antes, 'pausado: não corre');

  // Clique durante a pausa é ignorado.
  const g = abertos[1];
  g.enviar({ t: 'apertar' });
  await g.esperar((m) => m.t === 'ignorado');

  await host.acao('pausar', false);
  h = await host.estadoApos((s) => !s.estado.pausado && s.janela);
  assert.ok(h.janela.fimEm > Date.now());

  // Encerrar a janela sem cliques vai direto ao desfecho (só a correta).
  await host.acao('encerrarJanela');
  h = await host.estadoApos((s) => s.estado.fase === 'so_correta');
  assert.equal(h.janela, null);
});

test('integração: textos da capa e da tela final são editáveis e persistem', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-'));
  let srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  const abertos = [];
  t.after(async () => {
    abertos.forEach((c) => c.fechar());
    await srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const get = async (porta) => (await (await fetch(`http://127.0.0.1:${porta}/api/capa`)).json()).disciplina;

  // Valores padrão
  assert.equal(await get(srv.porta), 'Profissão: Competências e Habilidades');
  const auth = await autenticar(srv.porta, PIN);
  const host = new Cliente(srv.porta, 'papel=host', auth.cookie);
  abertos.push(host);
  await host.aberto;
  const h0 = await host.estadoApos((s) => s.final);
  assert.equal(h0.final.professor, 'Prof. Dr. Itacir João Piasson');
  assert.equal(h0.final.integrantes.length, 6);
  assert.equal(h0.final.mensagem, 'Obrigado a todos que participaram!');

  // Salvar exige todos os campos
  assert.equal((await host.acao('salvarTextos', { disciplina: '', professor: 'X', mensagem: 'Y', integrantes: ['A'] })).t, 'erro');

  const novo = { disciplina: 'Outra disciplina', professor: 'Prof. Fulano', mensagem: 'Valeu!', integrantes: ['Ana', ' Bia ', ''] };
  assert.equal((await host.acao('salvarTextos', novo)).t, 'ok');
  assert.equal(await get(srv.porta), 'Outra disciplina');
  const tela = new Cliente(srv.porta, 'papel=tela');
  abertos.push(tela);
  await tela.aberto;
  assert.equal((await tela.estadoApos((s) => s.disciplina)).disciplina, 'Outra disciplina');

  // A /tela não pode editar
  assert.match((await tela.acao('salvarTextos', novo)).msg, /permiss/i);

  // Sobrevive ao reinício
  abertos.splice(0).forEach((c) => c.fechar());
  await srv.fechar();
  srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  assert.equal(await get(srv.porta), 'Outra disciplina');
  const auth2 = await autenticar(srv.porta, PIN);
  const host2 = new Cliente(srv.porta, 'papel=host', auth2.cookie);
  abertos.push(host2);
  await host2.aberto;
  const h2 = await host2.estadoApos((s) => s.final);
  assert.deepEqual(h2.final.integrantes, ['Ana', 'Bia']);
  assert.equal(h2.final.professor, 'Prof. Fulano');
});
