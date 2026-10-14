'use strict';
// Integração: edição, importação, exportação e regras de bloqueio das perguntas, pela API real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');
const { Cliente, autenticar, entrarGrupo, PIN, nomeDaCor } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');
const nova = (id, extra = {}) => ({
  id, tipo: 'facil', enunciado: `Pergunta ${id}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, explicacao: 'e', reserva: false, ...extra,
});

// Sobe um servidor temporário já com as 26 perguntas provisórias.
async function preparar(t, { semente = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-p-'));
  if (semente) fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const ctx = { dir, srv: null, abertos: [] };
  ctx.srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  t.after(async () => {
    ctx.abertos.forEach((c) => c.fechar());
    await ctx.srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  ctx.auth = await autenticar(ctx.srv.porta, PIN);
  ctx.http = async (metodo, rota, corpo, cookie = ctx.auth.cookie) => {
    const r = await fetch(`http://127.0.0.1:${ctx.srv.porta}${rota}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let dados = null;
    const texto = await r.text();
    try { dados = JSON.parse(texto); } catch { dados = texto; }
    return { status: r.status, dados, headers: r.headers };
  };
  ctx.host = new Cliente(ctx.srv.porta, 'papel=host', ctx.auth.cookie);
  ctx.abertos.push(ctx.host);
  await ctx.host.aberto;
  return ctx;
}

async function reiniciar(ctx) {
  ctx.abertos.splice(0).forEach((c) => c.fechar());
  await ctx.srv.fechar();
  ctx.srv = await iniciarServidor({ port: 0, dataDir: ctx.dir, pin: PIN, ehLocal: () => false });
  ctx.auth = await autenticar(ctx.srv.porta, PIN);
  ctx.host = new Cliente(ctx.srv.porta, 'papel=host', ctx.auth.cookie);
  ctx.abertos.push(ctx.host);
  await ctx.host.aberto;
}

// Cria um jogo com dois grupos e deixa na sala de espera.
async function salaComDoisGrupos(ctx) {
  assert.equal((await ctx.host.acao('novoJogo', {})).t, 'ok');
  for (const cor of ['azul', 'verde']) {
    const { c } = await entrarGrupo(ctx.srv.porta, cor, nomeDaCor(cor));
    ctx.abertos.push(c);
  }
  await ctx.host.estadoApos((s) => s.estado.grupos.length === 2);
}

test('as rotas de perguntas exigem o cookie do responsável', async (t) => {
  const c = await preparar(t);
  for (const [m, r] of [['GET', '/api/perguntas'], ['PUT', '/api/perguntas'], ['GET', '/api/perguntas/exportar'], ['POST', '/api/perguntas/importar/analisar'], ['POST', '/api/perguntas/importar/aplicar']]) {
    const res = await c.http(m, r, m === 'GET' ? undefined : {}, null);
    assert.equal(res.status, 401, `${m} ${r}`);
  }
  assert.equal((await c.http('GET', '/api/perguntas')).status, 200);
});

test('a /tela e os celulares nunca recebem a lista de perguntas', async (t) => {
  const c = await preparar(t);
  const tela = new Cliente(c.srv.porta, 'papel=tela');
  c.abertos.push(tela);
  await tela.aberto;
  await salaComDoisGrupos(c);
  const g = await entrarGrupo(c.srv.porta, 'roxo', 'x');
  c.abertos.push(g.c);
  assert.equal((await c.host.acao('iniciar')).t, 'ok');
  await c.host.acao('mostrarAlternativas');
  await tela.estadoApos((s) => s.fase === 'alternativas');
  const todas = JSON.stringify([...tela.mensagens, ...g.c.mensagens]);
  assert.ok(!todas.includes('"perguntas"'), 'sem a lista');
  assert.ok(!todas.includes('"explicacao"'), 'sem explicação antes da hora');
  assert.ok(!todas.includes('"correta"'), 'sem a correta antes da hora');
  assert.equal((await c.http('GET', '/api/perguntas', undefined, '')).status, 401);
});

test('exportar e importar de volta devolve as mesmas perguntas', async (t) => {
  const c = await preparar(t);
  const original = (await c.http('GET', '/api/perguntas')).dados.perguntas;
  assert.equal(original.length, 26);
  const exp = await c.http('GET', '/api/perguntas/exportar');
  assert.match(exp.headers.get('content-disposition'), /attachment; filename="perguntas-\d{4}-\d{2}-\d{2}\.json"/);
  assert.deepEqual(Object.keys(exp.dados), ['perguntas']);
  const texto = JSON.stringify(exp.dados);
  // apaga tudo e importa de volta
  assert.equal((await c.http('PUT', '/api/perguntas', { perguntas: [nova(1)] })).status, 200);
  const r = await c.http('POST', '/api/perguntas/importar/aplicar', { texto, modo: 'substituir' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.dados.perguntas, original);
});

test('arquivo inválido não altera nada', async (t) => {
  const c = await preparar(t);
  const antes = (await c.http('GET', '/api/perguntas')).dados.perguntas;
  const a = await c.http('POST', '/api/perguntas/importar/analisar', { texto: '{"perguntas": 5}' });
  assert.equal(a.dados.ok, false);
  assert.ok(a.dados.erros.length);
  const r = await c.http('POST', '/api/perguntas/importar/aplicar', { texto: 'lixo', modo: 'substituir' });
  assert.equal(r.status, 400);
  assert.deepEqual((await c.http('GET', '/api/perguntas')).dados.perguntas, antes);
});

test('Substituir e Acrescentar pela API, com resumo antes de aplicar', async (t) => {
  const c = await preparar(t);
  const arquivo = JSON.stringify({ perguntas: [nova(1), nova(2, { enunciado: '' }), nova(3, { reserva: true })] });
  const a = (await c.http('POST', '/api/perguntas/importar/analisar', { texto: arquivo })).dados;
  assert.equal(a.total, 3);
  assert.equal(a.validas, 2);
  assert.equal(a.itens[1].problemas[0], 'Falta o enunciado');
  assert.equal(a.atuais, 26);
  assert.equal(a.avisosAcrescentar.length, 1); // já existe reserva
  assert.equal((await c.http('GET', '/api/perguntas')).dados.perguntas.length, 26); // analisar não altera

  const acr = await c.http('POST', '/api/perguntas/importar/aplicar', { texto: arquivo, modo: 'acrescentar' });
  assert.equal(acr.dados.perguntas.length, 29);
  assert.equal(acr.dados.perguntas.filter((p) => p.reserva).length, 1);
  assert.equal(acr.dados.info.invalidas, 1);

  const sub = await c.http('POST', '/api/perguntas/importar/aplicar', { texto: arquivo, modo: 'substituir' });
  assert.equal(sub.dados.perguntas.length, 3);
  assert.equal((await c.http('POST', '/api/perguntas/importar/aplicar', { texto: arquivo, modo: 'xis' })).status, 400);
});

test('apenas uma reserva é aceita ao salvar', async (t) => {
  const c = await preparar(t);
  const duas = [nova(1, { reserva: true }), nova(2, { reserva: true })];
  const r = await c.http('PUT', '/api/perguntas', { perguntas: duas });
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /reserva/);
  assert.equal((await c.http('PUT', '/api/perguntas', { perguntas: [nova(1), nova(1)] })).status, 400);
  assert.equal((await c.http('GET', '/api/perguntas')).dados.perguntas.length, 26);
});

test('salvar grava em data/perguntas.json, guarda cópias (no máximo 10) e sobrevive ao reinício', async (t) => {
  const c = await preparar(t);
  let lista = (await c.http('GET', '/api/perguntas')).dados.perguntas;
  for (let i = 0; i < 13; i++) {
    lista = lista.slice(0, -1); // cada exclusão força uma cópia da versão anterior
    const r = await c.http('PUT', '/api/perguntas', { perguntas: lista });
    assert.equal(r.status, 200);
    assert.ok(r.dados.salvoEm > 0);
  }
  const copias = fs.readdirSync(path.join(c.dir, 'backup'));
  assert.equal(copias.length, 10);
  assert.ok(copias.every((n) => /^perguntas-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}\.json$/.test(n)));
  const noDisco = JSON.parse(fs.readFileSync(path.join(c.dir, 'perguntas.json'), 'utf8'));
  assert.equal(noDisco.perguntas.length, 13);

  await reiniciar(c);
  assert.equal((await c.http('GET', '/api/perguntas')).dados.perguntas.length, 13);
});

test('sem arquivo, semeia 5 exemplos; com arquivo vazio, respeita o vazio', async (t) => {
  const c = await preparar(t, { semente: false });
  const lista = (await c.http('GET', '/api/perguntas')).dados.perguntas;
  assert.equal(lista.length, 5);
  assert.ok(lista.every((p) => p.enunciado.startsWith('[EXEMPLO, substitua]')));
  await c.http('PUT', '/api/perguntas', { perguntas: [] });
  await reiniciar(c);
  assert.equal((await c.http('GET', '/api/perguntas')).dados.perguntas.length, 0);
});

test('durante a partida: importação bloqueada e a pergunta da rodada não pode ser editada', async (t) => {
  const c = await preparar(t);
  await salaComDoisGrupos(c);
  assert.equal((await c.host.acao('iniciar')).t, 'ok');
  const h = await c.host.estadoApos((s) => s.estado.fase === 'pergunta');
  const emUso = h.perguntasInfo.emUso;
  assert.ok(emUso);
  assert.equal(h.perguntasInfo.partidaAtiva, true);

  const arquivo = JSON.stringify({ perguntas: [nova(1)] });
  const imp = await c.http('POST', '/api/perguntas/importar/aplicar', { texto: arquivo, modo: 'substituir' });
  assert.equal(imp.status, 409);
  assert.match(imp.dados.erro, /partida em andamento/);
  const ana = await c.http('POST', '/api/perguntas/importar/analisar', { texto: arquivo });
  assert.match(ana.dados.bloqueio, /partida em andamento/);

  const lista = (await c.http('GET', '/api/perguntas')).dados.perguntas;
  const editada = lista.map((p) => (p.id === emUso ? { ...p, enunciado: 'mudei' } : p));
  const r = await c.http('PUT', '/api/perguntas', { perguntas: editada });
  assert.equal(r.status, 409);
  assert.match(r.dados.erro, /rodada em andamento/);
  assert.equal((await c.http('PUT', '/api/perguntas', { perguntas: lista.filter((p) => p.id !== emUso) })).status, 409);

  // outra pergunta pode ser editada
  const outra = lista.map((p) => (p.id !== emUso && !p.reserva && p.id === lista.find((x) => x.id !== emUso).id ? { ...p, explicacao: 'nova explicação' } : p));
  assert.equal((await c.http('PUT', '/api/perguntas', { perguntas: outra })).status, 200);
});

test('o jogo só começa com perguntas válidas', async (t) => {
  const c = await preparar(t);
  const lista = (await c.http('GET', '/api/perguntas')).dados.perguntas;
  const rascunho = nova(500, { enunciado: '' });
  assert.equal((await c.http('PUT', '/api/perguntas', { perguntas: [...lista, rascunho] })).status, 200);
  await salaComDoisGrupos(c);
  const h = await c.host.estadoApos((s) => s.perguntasInfo.invalidas === 1);
  assert.equal(h.perguntasInfo.invalidas, 1);
  const r = await c.host.acao('iniciar');
  assert.equal(r.t, 'erro');
  assert.match(r.msg, /incompleta/);
  assert.equal(c.srv.estado().fase, 'espera');
  // corrigindo, começa
  assert.equal((await c.http('PUT', '/api/perguntas', { perguntas: lista })).status, 200);
  assert.equal((await c.host.acao('iniciar')).t, 'ok');
});

test('fluxo: importar, voltar ao menu e criar novo jogo usa as perguntas importadas', async (t) => {
  const c = await preparar(t);
  const importadas = [nova(1, { enunciado: 'Primeira importada' }), nova(2, { enunciado: 'Segunda importada' }), nova(3, { reserva: true, enunciado: 'Reserva importada' })];
  await c.host.acao('irEditor');
  const r = await c.http('POST', '/api/perguntas/importar/aplicar', { texto: JSON.stringify({ perguntas: importadas }), modo: 'substituir' });
  assert.equal(r.status, 200);
  await c.host.acao('irMenu');
  assert.equal((await c.host.acao('novoJogo', {})).t, 'ok');
  const h = await c.host.estadoApos((s) => s.totalPerguntas === 3);
  assert.equal(h.totalPerguntas, 3);
  for (const cor of ['azul', 'verde']) {
    const { c: cel } = await entrarGrupo(c.srv.porta, cor, nomeDaCor(cor));
    c.abertos.push(cel);
  }
  await c.host.estadoApos((s) => s.estado.grupos.length === 2);
  assert.equal((await c.host.acao('iniciar')).t, 'ok');
  const j = await c.host.estadoApos((s) => s.estado.fase === 'pergunta');
  assert.equal(j.pergunta.enunciado, 'Primeira importada');
});

test('editar durante a sala de espera vale para a partida que vai começar', async (t) => {
  const c = await preparar(t);
  await salaComDoisGrupos(c);
  const lista = (await c.http('GET', '/api/perguntas')).dados.perguntas;
  const editada = lista.map((p, i) => (i === 0 ? { ...p, enunciado: 'Editada na sala de espera' } : p));
  assert.equal((await c.http('PUT', '/api/perguntas', { perguntas: editada })).status, 200);
  assert.equal((await c.host.acao('iniciar')).t, 'ok');
  const j = await c.host.estadoApos((s) => s.estado.fase === 'pergunta');
  assert.equal(j.pergunta.enunciado, 'Editada na sala de espera');
});
