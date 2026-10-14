'use strict';
// Sala de espera, teste de botões e entrada dos celulares, pela API real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');
const { Cliente, autenticar, entrarGrupo, dormir, PIN } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');

async function preparar(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-s-'));
  fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const c = { dir, abertos: [] };
  c.srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  t.after(async () => {
    c.abertos.forEach((x) => x.fechar());
    await c.srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  c.auth = await autenticar(c.srv.porta, PIN);
  c.host = new Cliente(c.srv.porta, 'papel=host', c.auth.cookie);
  c.tela = new Cliente(c.srv.porta, 'papel=tela');
  c.abertos.push(c.host, c.tela);
  await Promise.all([c.host.aberto, c.tela.aberto]);
  c.celular = async (cor, nome, token) => {
    const r = await entrarGrupo(c.srv.porta, cor, nome, token);
    c.abertos.push(r.c);
    return r;
  };
  return c;
}

test('cor ocupada é recusada e a recusa não derruba o dono', async (t) => {
  const c = await preparar(t);
  await c.host.acao('novoJogo', {});
  const dono = await c.celular('azul', 'Ana');
  assert.equal(dono.entrou.t, 'entrou');
  const intruso = await c.celular('azul', 'Bia');
  assert.equal(intruso.entrou.t, 'erro');
  assert.equal(intruso.entrou.codigo, 'ocupada');
  const h = await c.host.estadoApos((s) => s.estado.grupos.length === 1);
  assert.equal(h.estado.grupos[0].representante, 'Ana');
  assert.equal(h.estado.grupos[0].conectado, true);
});

test('reconexão com o token devolve o mesmo grupo, sem pedir o nome', async (t) => {
  const c = await preparar(t);
  await c.host.acao('novoJogo', {});
  const a = await c.celular('verde', 'Vera');
  a.c.fechar();
  await c.host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'verde')?.conectado === false);
  const volta = await c.celular('verde', undefined, a.entrou.token);
  assert.equal(volta.entrou.t, 'entrou');
  assert.equal(volta.entrou.token, a.entrou.token);
  const v = await volta.c.estadoApos((s) => s.registrado);
  assert.equal(v.nome, 'Vera');
  // token errado não entra: pede o nome
  const falso = new Cliente(c.srv.porta, 'papel=g&cor=verde');
  c.abertos.push(falso);
  await falso.aberto;
  falso.enviar({ t: 'entrar', token: 'invalido' });
  await falso.esperar((m) => m.t === 'precisaNome');
});

test('Começar funciona com 2 grupos e não com 1; quem não conectou fica de fora', async (t) => {
  const c = await preparar(t);
  await c.host.acao('novoJogo', {});
  await c.celular('azul', 'Ana');
  let r = await c.host.acao('iniciar');
  assert.equal(r.t, 'erro');
  assert.match(r.msg, /2 grupos/);
  assert.equal(c.srv.estado().fase, 'espera');

  const verde = await c.celular('verde', 'Vera');
  const rosa = await c.celular('rosa', 'Rita');
  await c.host.estadoApos((s) => s.estado.grupos.length === 3);
  rosa.c.fechar(); // este grupo cai antes de começar
  await c.host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'rosa').conectado === false);
  r = await c.host.acao('iniciar');
  assert.equal(r.t, 'ok');
  const h = await c.host.estadoApos((s) => s.estado.fase === 'pergunta');
  assert.deepEqual(h.estado.grupos.map((g) => g.cor).sort(), ['azul', 'verde']);
  void verde;
});

test('celular novo não entra com a partida começada; quem já era do jogo volta pelo token', async (t) => {
  const c = await preparar(t);
  await c.host.acao('novoJogo', {});
  const a = await c.celular('azul', 'Ana');
  await c.celular('verde', 'Vera');
  await c.host.estadoApos((s) => s.estado.grupos.length === 2);
  assert.equal((await c.host.acao('iniciar')).t, 'ok');

  // celular novo, em outra cor: a própria visão avisa, e entrar com nome é recusado
  const novo = new Cliente(c.srv.porta, 'papel=g&cor=roxo');
  c.abertos.push(novo);
  await novo.aberto;
  const v = await novo.esperar((m) => m.t === 'estado', 3000, true);
  assert.equal(v.registrado, false);
  assert.equal(v.entrada, 'comecou');
  novo.enviar({ t: 'entrar', nome: 'Tarde demais' });
  const e = await novo.esperar((m) => m.t === 'erro');
  assert.equal(e.codigo, 'comecou');
  assert.match(e.msg, /já começou/);
  assert.equal(c.srv.estado().grupos.length, 2);

  // quem era do jogo volta pelo token, mesmo depois de começar
  a.c.fechar();
  await c.host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'azul').conectado === false);
  const volta = await c.celular('azul', undefined, a.entrou.token);
  assert.equal(volta.entrou.t, 'entrou');
  assert.equal((await volta.c.estadoApos((s) => s.registrado)).nome, 'Ana');
});

test('o primeiro clique de cada grupo conta e o segundo é ignorado', async (t) => {
  const c = await preparar(t);
  await c.host.acao('novoJogo', {});
  const a = await c.celular('azul', 'Ana');
  const v = await c.celular('verde', 'Vera');
  await c.host.estadoApos((s) => s.estado.grupos.length === 2);
  await c.host.acao('iniciar');
  await c.host.acao('mostrarAlternativas');
  await c.host.acao('abrirJanela');
  a.c.enviar({ t: 'apertar' });
  await a.c.estadoApos((s) => s.botao === 'registrado');
  a.c.enviar({ t: 'apertar' });
  await a.c.esperar((m) => m.t === 'ignorado');
  v.c.enviar({ t: 'apertar' });
  const h = await c.host.estadoApos((s) => s.estado.fase === 'ordem');
  assert.deepEqual(h.estado.rodada.ordem, ['azul', 'verde']);
});

test('QR: aparece para a cor escolhida e some quando o grupo conecta', async (t) => {
  const c = await preparar(t);
  await c.host.acao('novoJogo', {});
  const livre = await c.tela.estadoApos((s) => s.cena === 'espera');
  assert.equal(livre.cores.length, 10);
  assert.ok(livre.cores.every((x) => !x.ocupada));
  assert.equal(livre.qr, null);

  assert.equal((await c.host.acao('selecionarCor', 'amarelo')).t, 'ok');
  const com = await c.tela.estadoApos((s) => s.corSelecionada === 'amarelo');
  assert.match(com.qr, /\/api\/qr\/amarelo\.svg/);
  const svg = await (await fetch(`http://127.0.0.1:${c.srv.porta}${com.qr}`)).text();
  assert.match(svg, /<svg/);

  await c.celular('amarelo', 'Aline');
  const depois = await c.tela.estadoApos((s) => s.cena === 'espera' && s.corSelecionada === null);
  assert.equal(depois.qr, null);
  const bloco = depois.cores.find((x) => x.cor === 'amarelo');
  assert.equal(bloco.conectado, true);
  assert.equal(depois.nomes.amarelo, 'Aline');

  // Editar nome e liberar
  assert.equal((await c.host.acao('renomearGrupo', 'amarelo', 'Aline Souza')).t, 'ok');
  assert.equal((await c.tela.estadoApos((s) => s.nomes?.amarelo === 'Aline Souza')).cena, 'espera');
  assert.equal((await c.host.acao('liberarGrupo', 'amarelo')).t, 'ok');
  const livreDeNovo = await c.tela.estadoApos((s) => s.cores?.find((x) => x.cor === 'amarelo')?.ocupada === false);
  assert.equal(livreDeNovo.cores.find((x) => x.cor === 'amarelo').conectado, false);
});

test('modo teste: cada aperto aparece na tela, nada vale ponto e zera ao sair', async (t) => {
  const c = await preparar(t);
  await c.host.acao('novoJogo', {});
  const a = await c.celular('azul', 'Ana');
  const v = await c.celular('verde', 'Vera');
  await c.host.estadoApos((s) => s.estado.grupos.length === 2);
  const antes = JSON.stringify(c.srv.estado().grupos);

  assert.equal((await c.host.acao('testeBotoes', true)).t, 'ok');
  assert.equal((await a.c.estadoApos((s) => s.botao === 'teste')).botao, 'teste');
  const t0 = await c.tela.estadoApos((s) => s.cena === 'teste');
  assert.deepEqual(t0.ordem, []);

  v.c.enviar({ t: 'apertar' });
  const t1 = await c.tela.estadoApos((s) => s.cena === 'teste' && s.ultimo === 'verde');
  assert.deepEqual(t1.ordem, ['verde']);
  a.c.enviar({ t: 'apertar' });
  const t2 = await c.tela.estadoApos((s) => s.ultimo === 'azul');
  assert.deepEqual(t2.ordem, ['verde', 'azul']);
  v.c.enviar({ t: 'apertar' }); // apertar de novo pisca outra vez, sem mudar a ordem
  const t3 = await c.tela.estadoApos((s) => s.ultimo === 'verde' && s.nonce === 3);
  assert.deepEqual(t3.ordem, ['verde', 'azul']);
  // o celular continua podendo apertar (não fica desativado) e não registra nada no jogo
  assert.equal(JSON.stringify(c.srv.estado().grupos), antes);
  assert.equal(c.srv.estado().fase, 'espera');

  assert.equal((await c.host.acao('testeZerar')).t, 'ok');
  assert.deepEqual((await c.tela.estadoApos((s) => s.cena === 'teste' && s.ordem.length === 0)).ordem, []);
  a.c.enviar({ t: 'apertar' });
  await c.tela.estadoApos((s) => s.ordem?.length === 1);

  assert.equal((await c.host.acao('testeBotoes', false)).t, 'ok');
  const fim = await c.tela.estadoApos((s) => s.cena === 'espera');
  assert.equal(fim.cena, 'espera');
  assert.equal(c.host.ultimo.ui.teste.ativo, false);
  assert.deepEqual(c.host.ultimo.ui.teste.ordem, []);
  assert.equal(JSON.stringify(c.srv.estado().grupos), antes); // pontos e sequências intactos
  // fora do modo teste, apertar na sala de espera não faz nada
  a.c.enviar({ t: 'apertar' });
  await a.c.esperar((m) => m.t === 'ignorado');
});

test('modo teste desliga ao começar e só vale na sala de espera', async (t) => {
  const c = await preparar(t);
  await c.host.acao('novoJogo', {});
  await c.celular('azul', 'Ana');
  await c.celular('verde', 'Vera');
  await c.host.estadoApos((s) => s.estado.grupos.length === 2);
  assert.equal((await c.host.acao('testeZerar')).t, 'erro'); // desligado
  await c.host.acao('testeBotoes', true);
  await c.host.acao('iniciar');
  const h = await c.host.estadoApos((s) => s.estado.fase === 'pergunta');
  assert.equal(h.ui.teste.ativo, false);
  assert.equal((await c.host.acao('testeBotoes', true)).t, 'erro');
});

test('rede: trocar o IP muda o endereço do QR', async (t) => {
  const c = await preparar(t);
  await c.host.acao('novoJogo', {});
  const h = await c.host.estadoApos((s) => s.ips);
  assert.equal(h.ui.ip, h.ips.find((i) => i.provavel)?.ip || '127.0.0.1');
  assert.equal((await c.host.acao('escolherIp', '1.2.3.4')).t, 'erro');
  void dormir;
});
