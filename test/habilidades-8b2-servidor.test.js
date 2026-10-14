'use strict';
// Etapa 8b-2 pelo servidor real: Aposta, Dica 50/50, pontos negativos, configurações, Registro e jogo salvo da 8b-1.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const G = require('../src/game');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, PIN, nomeDaCor } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');

async function preparar(t, cores, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-b2-')), { iniciar = true } = {}) {
  if (!fs.existsSync(path.join(dir, 'perguntas.json'))) fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const c = { dir, abertos: [], fones: {} };
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

test('Aposta com pontos pelo servidor: cobrada ao responder, erro vira pontos negativos e aparece no Registro, na /tela e no celular', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ok(c, 'apostar', 'vermelho', 'pontos');
  const aviso = (await c.tela.estadoApos((s) => s.avisos?.some((a) => a.tipo === 'aposta'))).avisos[0];
  assert.deepEqual({ tipo: aviso.tipo, modo: aviso.modo, detalhe: aviso.detalhe, cor: aviso.cor }, { tipo: 'aposta', modo: 'pontos', detalhe: 10, cor: 'vermelho' });
  const cel0 = await c.fones.vermelho.estadoApos((s) => s.ativa === 'aposta');
  assert.equal(cel0.aposta.estado, 'ativa');
  assert.match((await c.host.acao('apostar', 'vermelho', 'pontos')).msg, /Uma habilidade por grupo/);

  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await apertar(c, 'vermelho');
  await apertar(c, 'azul');
  await ok(c, 'mostrarResposta');
  await ok(c, 'responder', errada(c)); // vermelho erra: -10
  assert.equal(grupo(c, 'vermelho').pontos, -10);
  await ok(c, 'responder', certa(c)); // azul acerta como 2º: +5
  const fim = await c.tela.estadoApos((s) => s.fase === 'explicacao' && s.apostas);
  assert.deepEqual(fim.apostas, [{ cor: 'vermelho', modo: 'pontos', estado: 'cobrada', delta: -10 }]);
  assert.deepEqual(fim.tentativas.map((x) => x.pontos), [-10, 5]);
  const celFim = await c.fones.vermelho.estadoApos((s) => s.aposta?.estado === 'cobrada');
  assert.equal(celFim.aposta.delta, -10);

  await ok(c, 'continuar');
  const rank = c.host.ultimo.ranking.map((r) => [r.cor, r.pontos]);
  assert.deepEqual(rank, [['azul', 5], ['vermelho', -10]]);
  const reg = await c.registro();
  assert.ok(reg.some((m) => m.includes('decisão do grupo: Vermelho ativou a Aposta (paga 10 pontos; os pontos da rodada valem 3 vezes')));
  assert.ok(reg.some((m) => m.includes('Aposta de Vermelho cobrada (pagou 10 pontos): −10 pontos no total da rodada')));
  assert.ok(reg.some((m) => m.includes('Vermelho respondeu') && m.includes('(−10 pontos, com a Aposta)')));
});

test('Aposta não cobrada pelo servidor: quem não aperta recupera tudo e o Registro diz isso', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'vermelho', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, 'passe');
  assert.deepEqual(estoque(c, 'vermelho'), ['escudo', 'passe']);
  await ok(c, 'apostar', 'vermelho', 'habilidades', [0, 1]);
  assert.deepEqual(estoque(c, 'vermelho'), ['escudo', 'passe']);
  const cel = await c.fones.vermelho.estadoApos((s) => s.reservadas?.length === 2);
  assert.deepEqual(cel.reservadas, ['escudo', 'passe']);
  await rodada(c, ['azul'], ['c']); // vermelho não apertou
  assert.deepEqual(estoque(c, 'vermelho'), ['escudo', 'passe']);
  assert.equal(grupo(c, 'vermelho').apostas, 0);
  const reg = await c.registro();
  assert.ok(reg.some((m) => m.includes('Aposta de Vermelho não cobrada, o grupo não respondeu (as habilidades continuam guardadas)')));
});

test('Aposta com habilidades pelo servidor: bônus +10 e as 2 habilidades saem do estoque quando cobrada', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'vermelho', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, 'passe');
  await ok(c, 'apostar', 'vermelho', 'habilidades', [0, 1]);
  const antes = grupo(c, 'vermelho').pontos;
  await rodada(c, ['vermelho'], ['c']);
  assert.equal(grupo(c, 'vermelho').pontos - antes, 20);
  assert.deepEqual(estoque(c, 'vermelho'), []);
  assert.equal(grupo(c, 'vermelho').apostas, 1);
  assert.ok((await c.registro()).some((m) => m.includes('Aposta de Vermelho cobrada (entregou Escudo e Passe): +20 pontos no total da rodada')));
});

test('Dica 50/50 pelo servidor: troca aos 7 acertos, uso pelo 2º respondente e efeito nas visões', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  for (let i = 1; i <= 7; i += 1) await rodada(c, ['azul'], ['c']);
  assert.equal(grupo(c, 'azul').sequencia, 7);
  await ok(c, 'trocarAcertos', 'azul', 'dica5050');
  assert.deepEqual(estoque(c, 'azul'), ['dica5050']);
  const celGanho = await c.fones.azul.estadoApos((s) => s.habilidades?.includes('dica5050'));
  assert.deepEqual(celGanho.habilidades, ['dica5050']);

  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await apertar(c, 'vermelho');
  await apertar(c, 'azul');
  await ok(c, 'mostrarResposta');
  assert.match((await c.host.acao('usarDica5050')).msg, /2º respondente/); // o 1º não pode
  await ok(c, 'responder', errada(c)); // vermelho erra
  await ok(c, 'usarDica5050');
  const elim = estado(c).rodada.eliminadas;
  assert.equal(elim.length, 1);
  assert.ok(!elim.includes(certa(c)));
  const tela = await c.tela.estadoApos((s) => s.fase === 'resposta' && s.dicas?.length === 1);
  assert.deepEqual(tela.eliminadas, elim);
  assert.equal('correta' in tela, false);
  const cel = await c.fones.azul.estadoApos((s) => s.eliminadas?.length === 1);
  assert.deepEqual(cel.eliminadas, elim);
  assert.equal('correta' in cel, false);
  assert.equal((await c.fones.vermelho.estadoApos(() => true)).eliminadas, undefined);
  assert.match((await c.host.acao('responder', elim[0])).msg, /eliminada/);
  await ok(c, 'responder', certa(c));
  assert.ok((await c.registro()).some((m) => /decisão do grupo: Azul usou a Dica 50\/50 e eliminou [A-D] \(pelo painel\)$/.test(m)));
});

test('Escudo pelo servidor: com um só Escudo e dois Bloqueios no mesmo alvo, o segundo é resolvido sozinho e registrado', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul', 'verde']);
  await ganhar(c, 'azul', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, 'bloqueio');
  await ganhar(c, 'verde', 3, 'bloqueio');
  await ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  await ok(c, 'ativarHabilidade', 'verde', 'bloqueio', 'azul');
  assert.equal(estado(c).rodada.escudos.length, 2);
  await ok(c, 'decidirEscudo', 'azul', 'vermelho', true);
  assert.deepEqual(estado(c).rodada.escudos, []);
  assert.deepEqual(estado(c).rodada.bloqueios.azul, ['verde']);
  const reg = await c.registro();
  assert.ok(reg.some((m) => m.includes('Azul aceitou o Bloqueio de Verde, sem Escudo (resolvido sozinho: o Escudo já foi usado)')));
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela'); // a janela já não espera decisão
});

test('Configurações da 8b-2: validam, persistem e alimentam o jogo', async (t) => {
  const c = await preparar(t, [], undefined, { iniciar: false });
  await c.host.acao('novoJogo', {});
  const base = { meta: 14, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5 };
  for (const [campo, valor, msg] of [
    ['seqDica', 5, /Dica 50\/50 precisa de mais/], ['apostaCusto', 0, /Pontos pagos/], ['apostaMult', 1, /Multiplicador/], ['apostaTrocaQtd', 3, /Habilidades entregues/],
    ['apostaTrocaBonus', 0, /Bônus/], ['apostaTrocaPenal', -1, /Pontos perdidos/], ['apostaDivida', 300, /Dívida máxima/], ['apostaMax', 11, /Apostas por grupo/],
  ]) {
    const r = await c.host.acao('salvarConfigJogo', { ...base, [campo]: valor });
    assert.equal(r.t, 'erro', campo);
    assert.match(r.msg, msg, campo);
  }
  // seqDobro novo não pode alcançar a Dica atual
  assert.match((await c.host.acao('salvarConfigJogo', { ...base, seqDobro: 8 })).msg, /Dica 50\/50 precisa de mais/);
  const nova = { ...base, seqDica: 9, apostaCusto: 6, apostaMult: 4, apostaTrocaQtd: 1, apostaTrocaBonus: 8, apostaTrocaPenal: 2, apostaDivida: 30, apostaMax: 3 };
  assert.equal((await c.host.acao('salvarConfigJogo', nova)).t, 'ok');
  assert.deepEqual(c.host.ultimo.configJogo, { ...G.CONFIG_PADRAO, placarModo: 'desligado', ...nova });
  assert.equal(c.host.ultimo.estado.config.seqDica, 9);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(c.dir, 'config.json'), 'utf8')).jogo, { placarModo: 'desligado', ...nova });
});

test('cena Regras: três páginas e a página vai na visão da /tela', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ok(c, 'regras', true);
  assert.equal((await c.tela.estadoApos((s) => s.cena === 'regras')).pagina, 1);
  await ok(c, 'regras', 2);
  assert.equal((await c.tela.estadoApos((s) => s.pagina === 2)).pagina, 2);
  await ok(c, 'regras', 3);
  assert.equal((await c.tela.estadoApos((s) => s.pagina === 3)).config.apostaCusto, 10);
  await ok(c, 'regras', false);
  assert.equal((await c.tela.estadoApos((s) => s.cena === 'jogo')).cena, 'jogo');
});

test('jogo.json da 8b-1 (versão 2, sem Aposta nem Dica) carrega pelo servidor e a Aposta funciona', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-b2v2-'));
  fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const perguntas = JSON.parse(fs.readFileSync(ORIGINAL, 'utf8')).perguntas;
  let e = G.criarJogo({ perguntas });
  for (const cor of ['vermelho', 'azul']) e = G.registrarGrupo(e, cor, nomeDaCor(cor));
  e = G.iniciar(e);
  const antigo = JSON.parse(JSON.stringify(e));
  antigo.versao = 2;
  for (const k of ['seqDica', 'apostaCusto', 'apostaMult', 'apostaTrocaQtd', 'apostaTrocaBonus', 'apostaTrocaPenal', 'apostaDivida', 'apostaMax']) delete antigo.config[k];
  for (const g of antigo.grupos) delete g.apostas;
  for (const k of ['apostas', 'eliminadas', 'dicas']) delete antigo.rodada[k];
  antigo.grupos[0].habilidades = [{ tipo: 'escudo' }, { tipo: 'passe' }];
  antigo.grupos[0].pontos = 12;
  antigo._undo = [];
  fs.writeFileSync(path.join(dir, 'jogo.json'), JSON.stringify({ estado: antigo, tokens: {}, ui: { cena: 'jogo', corSelecionada: null, ip: null, regras: false, tema: 'claro' }, janelaRestanteMs: null }));
  const c = await preparar(t, [], dir, { iniciar: false });
  const h = await c.host.estadoApos(() => true);
  assert.equal(h.estado.versao, G.VERSAO);
  assert.equal(h.estado.config.seqDica, 7);
  assert.equal(h.estado.grupos[0].apostas, 0);
  assert.equal(h.estado.grupos[0].pontos, 12);
  assert.deepEqual(h.estado.rodada.apostas, {});
  await ok(c, 'apostar', 'vermelho', 'habilidades', [0, 1]);
  assert.equal(estado(c).rodada.apostas.vermelho.estado, 'ativa');
  await ok(c, 'desfazer');
  assert.deepEqual(estado(c).rodada.apostas, {});
});
