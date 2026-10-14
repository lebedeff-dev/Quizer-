'use strict';
// Tema noturno: ação do responsável, persistido, difundido para /tela, /host e celular, sem mexer nas regras.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');

test('definirTema altera ui.tema, difunde, persiste e sobrevive ao reinício e a um novo jogo', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-t-'));
  fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  let srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1111' });
  const abertos = [];
  t.after(async () => {
    abertos.forEach((c) => c.fechar());
    await srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const abrir = async (query) => {
    const c = new Cliente(srv.porta, query);
    abertos.push(c);
    await c.aberto;
    return c;
  };

  let host = await abrir('papel=host');
  const tela = await abrir('papel=tela');
  assert.equal((await host.estadoApos(() => true)).ui.tema, 'claro'); // padrão
  await host.acao('novoJogo', {});
  const { c: cel } = await entrarGrupo(srv.porta, 'azul', 'Ana');
  abertos.push(cel);

  assert.match((await host.acao('definirTema', 'rosa')).msg, /inválido/i);
  assert.equal((await host.acao('definirTema', 'noturno')).t, 'ok');
  assert.equal(host.ultimo.ui.tema, 'noturno');
  assert.equal((await tela.estadoApos((s) => s.tema === 'noturno')).tema, 'noturno'); // o projetor troca junto
  assert.equal((await cel.estadoApos((s) => s.tema === 'noturno')).tema, 'noturno');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'jogo.json'), 'utf8')).ui.tema, 'noturno');

  // O tema não afeta as regras: o estado do jogo é o mesmo com os dois temas.
  const antes = JSON.stringify(host.ultimo.estado);
  await host.acao('definirTema', 'claro');
  await host.acao('definirTema', 'noturno');
  assert.equal(JSON.stringify(host.ultimo.estado), antes);

  // Novo jogo mantém o tema.
  await host.acao('novoJogo', { substituir: true });
  assert.equal(host.ultimo.ui.tema, 'noturno');

  // Reinício do servidor: volta ao último tema usado.
  cel.fechar();
  host.fechar();
  tela.fechar();
  await srv.fechar();
  srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1111' });
  host = await abrir('papel=host');
  assert.equal((await host.estadoApos(() => true)).ui.tema, 'noturno');
  const tela2 = await abrir('papel=tela');
  assert.equal((await tela2.estadoApos(() => true)).tema, 'noturno');
});
