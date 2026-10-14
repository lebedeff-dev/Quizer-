'use strict';
// Etapa 8b-1 pelo servidor real: ofertas, Escudo, Passe, avisos na /tela e no celular, e jogo salvo antigo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const G = require('../src/game');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, dormir, PIN, nomeDaCor } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');

async function preparar(t, cores, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-h-')), { iniciar = true } = {}) {
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
const ok = async (c, nome, ...a) => { const r = await c.host.acao(nome, ...a); assert.equal(r.t, 'ok', `${nome}: ${r.msg}`); };
async function apertar(c, cor) {
  const antes = estado(c).rodada.ordem.length;
  c.fones[cor].enviar({ t: 'apertar' });
  await c.host.estadoApos((s) => s.estado.rodada.ordem.length > antes || s.estado.fase !== 'janela');
}
// Rodada em que `ordem` aperta e as respostas são aplicadas; depois decide as ofertas (recusa, ou aceita `escolhas`).
async function rodada(c, ordem, respostas, { parar = false, escolhas = {} } = {}) {
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  for (const cor of ordem) await apertar(c, cor);
  if (estado(c).fase === 'janela') await ok(c, 'encerrarJanela');
  if (ordem.length) {
    await ok(c, 'mostrarResposta');
    for (const r of respostas) await ok(c, 'responder', r === 'c' ? certa(c) : (certa(c) + 1) % 4);
  }
  if (parar) return;
  await ok(c, 'continuar');
}
// `cor` acerta `n` rodadas seguidas sozinha e aceita `escolha` na última oferta.
async function ganhar(c, cor, n, escolha) {
  for (let i = 1; i <= n; i += 1) await rodada(c, [cor], ['c']);
  if (escolha) await ok(c, 'trocarAcertos', cor, escolha); // os acertos viram moeda: troca por uma habilidade da faixa
}

test('Escudo pelo servidor: o Bloqueio abre a decisão, a janela espera, usar anula e a /tela anima', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'azul', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, 'bloqueio');
  assert.deepEqual(estoque(c, 'azul'), ['escudo']);
  assert.deepEqual(estoque(c, 'vermelho'), ['bloqueio']);

  await ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  assert.deepEqual(estado(c).rodada.escudos, [{ atacante: 'vermelho', alvo: 'azul' }]);
  await ok(c, 'mostrarAlternativas');
  assert.match((await c.host.acao('abrirJanela')).msg, /Escudo/); // a janela espera a decisão do grupo
  await ok(c, 'decidirEscudo', 'azul', 'vermelho', true);
  assert.deepEqual(estoque(c, 'azul'), []);
  assert.deepEqual(estoque(c, 'vermelho'), []);
  const tela = await c.tela.estadoApos((s) => s.anulacoes?.length === 1);
  assert.deepEqual(tela.anulacoes, [{ atacante: 'vermelho', alvo: 'azul' }]);
  assert.equal(tela.avisos[0].anulado, true); // o aviso na /tela mostra "anulado pelo Escudo"
  await ok(c, 'abrirJanela');
  const celAzul = await c.fones.azul.esperar((m) => m.t === 'estado' && m.botao === 'aberto', 3000, true);
  assert.equal(celAzul.botao, 'aberto'); // azul não está bloqueado
  await apertar(c, 'azul');
  assert.deepEqual(estado(c).rodada.ordem, ['azul']);
  const reg = await c.registro();
  assert.ok(reg.some((m) => m.includes('Vermelho ativou Bloqueio sobre Azul. Aguarda a decisão do grupo sobre o Escudo')));
  assert.ok(reg.some((m) => m.includes('decisão do grupo: Azul usou o Escudo e anulou o Bloqueio de Vermelho (os dois foram consumidos)')));
});

test('Escudo guardado pelo servidor: o Bloqueio vale e o celular do alvo fica bloqueado', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'azul', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, 'bloqueio');
  await ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  await ok(c, 'decidirEscudo', 'azul', 'vermelho', false);
  assert.deepEqual(estoque(c, 'azul'), ['escudo']);
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  const cel = await c.fones.azul.esperar((m) => m.t === 'estado' && m.botao === 'bloqueado', 3000, true);
  assert.equal(cel.botao, 'bloqueado');
  assert.deepEqual(cel.habilidades, ['escudo']); // o Escudo continua guardado e o celular mostra
});

test('Passe pelo servidor: 1º passa, o 2º responde com as 4 alternativas e ganha 5; a /tela e o celular recebem os avisos', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'vermelho', 3, 'passe');
  const cel = await c.fones.vermelho.estadoApos((s) => s.habilidades?.includes('passe'));
  assert.deepEqual(cel.habilidades, ['passe']);

  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await apertar(c, 'vermelho');
  await apertar(c, 'azul');
  await ok(c, 'mostrarResposta');
  const antes = grupo(c, 'azul').pontos;
  await ok(c, 'usarPasse');
  assert.deepEqual(estoque(c, 'vermelho'), []);
  const tela = await c.tela.estadoApos((s) => s.fase === 'resposta' && s.passes?.length === 1);
  assert.deepEqual(tela.passes, ['vermelho']);
  assert.equal(tela.atual, 'azul');
  assert.deepEqual(tela.erradas, []); // as 4 alternativas continuam disponíveis
  assert.equal((await c.fones.vermelho.estadoApos((s) => s.ativa === 'passe')).ativa, 'passe');
  assert.match((await c.host.acao('usarPasse')).msg, /Passe|1º/); // não dá para usar de novo
  await ok(c, 'responder', certa(c));
  assert.equal(grupo(c, 'azul').pontos - antes, 5);
  assert.equal(estado(c).respondidas, 4);
  const fim = await c.tela.estadoApos((s) => s.fase === 'explicacao' && s.tentativas?.length === 1);
  assert.equal(fim.tentativas[0].pontos, 5);
});

test('Passe sem 2º respondente: o servidor recusa, o Passe continua guardado e a rodada segue', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'vermelho', 3, 'passe');
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await apertar(c, 'vermelho');
  await ok(c, 'encerrarJanela');
  await ok(c, 'mostrarResposta');
  const r = await c.host.acao('usarPasse');
  assert.equal(r.t, 'erro');
  assert.match(r.msg, /Não há 2º respondente para receber a vez/);
  assert.deepEqual(estoque(c, 'vermelho'), ['passe']);
  assert.equal(estado(c).fase, 'resposta');
});

test('troca de acertos pelo servidor: estoque cheio exige substituir; a decisão aparece no Registro em português', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'vermelho', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, 'passe');
  assert.deepEqual(estoque(c, 'vermelho'), ['escudo', 'passe']);
  for (let i = 1; i <= 3; i += 1) await rodada(c, ['vermelho'], ['c']);
  assert.equal(grupo(c, 'vermelho').sequencia, 3);
  assert.match((await c.host.acao('trocarAcertos', 'vermelho', 'bloqueio')).msg, /Estoque cheio/);
  await ok(c, 'trocarAcertos', 'vermelho', 'bloqueio', 0); // troca o Escudo
  assert.deepEqual(estoque(c, 'vermelho'), ['passe', 'bloqueio']);
  const reg = await c.registro();
  assert.ok(reg.some((m) => m.includes('Decisão do grupo: Vermelho trocou 3 acertos por Bloqueio no lugar de Escudo (a sequência volta a zero) (pelo painel)')));
});

test('jogo.json da versão anterior (Dobro automático, uma habilidade) carrega pelo servidor e continua funcionando', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-ant-'));
  fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  // monta um jogo em andamento e o converte para o formato antigo, como a versão anterior o gravava
  const perguntas = JSON.parse(fs.readFileSync(ORIGINAL, 'utf8')).perguntas;
  let e = G.criarJogo({ perguntas });
  for (const cor of ['vermelho', 'azul']) e = G.registrarGrupo(e, cor, nomeDaCor(cor));
  e = G.iniciar(e);
  const antigo = JSON.parse(JSON.stringify(e));
  const velho = (x) => {
    for (const g of x.grupos) { delete g.habilidades; delete g.oferta; g.habilidade = null; g.ofertaBloqueio = false; }
    delete x.versao;
    delete x.config.estoqueMax;
    for (const k of ['usou', 'escudos', 'anulacoes', 'pulos', 'passes', 'ganhos']) delete x.rodada[k];
  };
  velho(antigo);
  antigo.grupos[0].habilidade = { tipo: 'dobro', validaNaRodada: 1 };
  antigo.grupos[1].sequencia = 3;
  antigo.grupos[1].ofertaBloqueio = true;
  antigo._undo = [];
  fs.writeFileSync(path.join(dir, 'jogo.json'), JSON.stringify({
    estado: antigo, tokens: {}, ui: { cena: 'jogo', corSelecionada: null, ip: null, regras: false, tema: 'claro' }, janelaRestanteMs: null,
  }));

  const c = await preparar(t, [], dir, { iniciar: false }); // carrega o arquivo antigo
  const h = await c.host.estadoApos(() => true);
  assert.equal(h.estado.versao, G.VERSAO);
  assert.deepEqual(h.estado.grupos[0].habilidades, [{ tipo: 'dobro' }]);
  assert.equal(h.estado.grupos[1].oferta, undefined, 'a oferta antiga some');
  assert.equal(h.estado.grupos[1].sequencia, 3, 'a sequência é mantida');
  assert.ok(h.estado.grupos.every((g) => !('habilidade' in g) && !('ofertaBloqueio' in g)));
  assert.equal(h.estado.config.estoqueMax, 2);

  // continua funcionando: ativa o Dobro guardado e joga a rodada; a oferta antiga exige decisão para continuar
  await ok(c, 'ativarHabilidade', 'vermelho', 'dobro');
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await ok(c, 'encerrarJanela'); // ninguém apertou (nenhum celular conectado)
  assert.equal(estado(c).fase, 'so_correta');
  await ok(c, 'trocarAcertos', 'azul', 'escudo'); // os 3 acertos guardados viram a habilidade
  assert.deepEqual(estoque(c, 'azul'), ['escudo']);
  await ok(c, 'continuar');
  assert.equal(estado(c).rodadaNum, 2);
  await dormir(10);
});
