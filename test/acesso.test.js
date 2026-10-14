'use strict';
// Quem é o responsável: o próprio notebook (sem PIN), quem digita o PIN (outros aparelhos) ou todos (SEM_PIN).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');
const { Cliente, autenticar } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');

async function subir(t, opcoes = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-a-'));
  fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '4321', ...opcoes });
  const abertos = [];
  t.after(async () => {
    abertos.forEach((c) => c.fechar());
    await srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const cliente = async (query, cookie) => {
    const c = new Cliente(srv.porta, query, cookie);
    abertos.push(c);
    await c.aberto;
    return c;
  };
  const status = async () => (await (await fetch(`http://127.0.0.1:${srv.porta}/api/auth/status`)).json()).autenticado;
  return { srv, cliente, status };
}

test('no próprio notebook (padrão) não precisa de PIN nem de cookie, no HTTP e no WebSocket', async (t) => {
  const { srv, cliente, status } = await subir(t); // ehLocal padrão: 127.0.0.1 é local
  assert.equal(await status(), true);
  const r = await fetch(`http://127.0.0.1:${srv.porta}/api/perguntas`);
  assert.equal(r.status, 200);
  const host = await cliente('papel=host'); // sem cookie
  const tela = await cliente('papel=tela'); // sem cookie: já recebe as setas
  assert.equal((await host.acao('novoJogo', {})).t, 'ok');
  assert.equal((await tela.estadoApos((s) => s.cena === 'espera')).autenticado, true);
});

test('o IP da rede do próprio notebook também é local', async (t) => {
  const meu = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  if (!meu) return t.skip('sem interface de rede externa');
  const { srv } = await subir(t);
  const r = await fetch(`http://${meu.address}:${srv.porta}/api/auth/status`);
  assert.equal((await r.json()).autenticado, true);
});

test('outros aparelhos: sem PIN não há /host, nem ações, nem setas; com o PIN certo passam', async (t) => {
  const { srv, cliente, status } = await subir(t, { ehLocal: () => false });
  assert.equal(await status(), false);
  assert.equal((await fetch(`http://127.0.0.1:${srv.porta}/api/perguntas`)).status, 401);
  await assert.rejects(new Cliente(srv.porta, 'papel=host').aberto, /401/);
  const tela = await cliente('papel=tela');
  assert.equal((await tela.estadoApos(() => true)).autenticado, false);
  assert.match((await tela.acao('continuar')).msg, /permiss/i);
  assert.match((await tela.acao('definirTema', 'noturno')).msg, /permiss/i);

  assert.equal((await autenticar(srv.porta, '0000')).status, 401);
  const ok = await autenticar(srv.porta, '4321');
  assert.equal(ok.status, 200);
  const host = await cliente('papel=host', ok.cookie);
  assert.equal((await host.acao('novoJogo', {})).t, 'ok');
});

test('5 PINs errados bloqueiam por 30 s (mesmo com o PIN certo)', async (t) => {
  const { srv } = await subir(t, { ehLocal: () => false });
  for (let i = 0; i < 5; i += 1) assert.equal((await autenticar(srv.porta, '0000')).status, 401);
  assert.equal((await autenticar(srv.porta, '4321')).status, 429);
});

test('SEM_PIN desliga o PIN para todos os aparelhos', async (t) => {
  const { cliente, status } = await subir(t, { ehLocal: () => false, semPin: true });
  assert.equal(await status(), true);
  const host = await cliente('papel=host');
  assert.equal((await host.acao('novoJogo', {})).t, 'ok');
});
