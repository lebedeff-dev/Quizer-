'use strict';
// Etapa 8j: habilidades e Aposta como chips tocáveis no celular (sem o botão "Habilidades" nem o menu).
// Parte 1: o que o servidor diz a cada chip (pode usar? por que não?). Parte 2: o celular num navegador de verdade
// (pula sozinho sem Chrome/Edge).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const G = require('../src/game.js');
const { acoesDoGrupo } = require('../src/celular.js');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, PIN } = require('./ajuda');

function banco(n = 40) {
  const ps = [];
  for (let i = 1; i <= n; i++) ps.push({ id: i, tipo: 'facil', enunciado: `P${i}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, explicacao: 'x', reserva: false });
  ps.push({ id: 99, tipo: 'atencao', enunciado: 'R', alternativas: ['a', 'b', 'c', 'd'], correta: 3, explicacao: 'x', reserva: true });
  return ps;
}
function novo(config = {}, cores = ['vermelho', 'azul']) {
  let s = G.criarJogo({ config: { meta: 40, placarModo: 'desligado', ...config }, perguntas: banco() });
  for (const c of cores) s = G.registrarGrupo(s, c, c);
  return G.iniciar(s);
}
const gp = (s, cor) => s.grupos.find((g) => g.cor === cor);
const dar = (s, cor, ...tipos) => { for (const tipo of tipos) gp(s, cor).habilidades.push({ tipo }); return s; };
const habs = (s, cor, pedidos = {}) => acoesDoGrupo(s, cor, pedidos).habs;
const ate = (s, ordem) => {
  s = G.abrirJanela(G.mostrarAlternativas(s));
  for (const c of ordem) s = G.clicar(s, c);
  if (s.fase === 'janela') s = G.encerrarJanela(s);
  return G.mostrarResposta(s);
};

test('a Aposta é um chip sempre presente, mesmo sem habilidades guardadas; habilitada na preparação da rodada', () => {
  const s = novo();
  assert.deepEqual(Object.keys(habs(s, 'azul')), ['aposta']);
  assert.deepEqual(habs(s, 'azul').aposta, { pode: true, motivo: null });
  const janela = G.abrirJanela(G.mostrarAlternativas(s));
  assert.deepEqual(habs(janela, 'azul').aposta, { pode: false, motivo: 'Só antes da janela de 30 s.' });
  const sala = G.criarJogo({ perguntas: banco() });
  assert.deepEqual(habs(G.registrarGrupo(G.registrarGrupo(sala, 'azul', 'a'), 'verde', 'b'), 'azul').aposta, { pode: false, motivo: 'O jogo ainda não começou.' });
  const lim = novo();
  gp(lim, 'azul').apostas = 2;
  assert.match(habs(lim, 'azul').aposta.motivo, /no máximo|já fez|apostas/i);
  assert.equal(habs(lim, 'azul').aposta.pode, false);
});

test('um chip por habilidade guardada, com o motivo quando não dá para usar', () => {
  let s = dar(novo(), 'azul', 'bloqueio', 'dobro');
  const h = habs(s, 'azul');
  assert.deepEqual(Object.keys(h).sort(), ['aposta', 'bloqueio', 'dobro']);
  assert.equal(h.bloqueio.pode, true);
  assert.equal(h.dobro.pode, true);
  // uma habilidade por rodada: depois de usar uma, as outras ficam desabilitadas com o motivo
  s = G.ativarHabilidade(s, 'azul', 'dobro');
  const depois = habs(s, 'azul');
  for (const t of ['bloqueio', 'aposta']) assert.deepEqual(depois[t], { pode: false, motivo: 'Já usaram uma habilidade nesta rodada.' }, t);
  // fora da preparação
  const janela = G.abrirJanela(G.mostrarAlternativas(dar(novo(), 'azul', 'bloqueio')));
  assert.deepEqual(habs(janela, 'azul').bloqueio, { pode: false, motivo: 'Só antes da janela de 30 s.' });
  // pedido de Bloqueio enviado: o chip do Bloqueio abre o pedido; os outros esperam
  const p = dar(novo(), 'azul', 'bloqueio', 'dobro');
  const hp = habs(p, 'azul', { azul: 'vermelho' });
  assert.deepEqual(hp.bloqueio, { pode: true, motivo: null, pendente: true });
  assert.match(hp.dobro.motivo, /pedido de Bloqueio/);
});

test('o Escudo guardado só é decidido na hora do bloqueio; o chip explica', () => {
  let s = dar(novo(), 'azul', 'escudo');
  assert.deepEqual(habs(s, 'azul').escudo, { pode: false, motivo: 'O Escudo é usado quando bloquearem vocês.' });
  dar(s, 'vermelho', 'bloqueio');
  s = G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'azul');
  assert.deepEqual(habs(s, 'azul').escudo, { pode: true, motivo: null }, 'com o bloqueio feito, a decisão está pendente');
});

test('Passe e Dica: motivos por fase e por posição; reservada na Aposta; no desempate nada vale', () => {
  const base = dar(dar(novo(), 'vermelho', 'passe'), 'azul', 'dica5050');
  // fora da hora da resposta
  assert.match(habs(base, 'vermelho').passe.motivo, /hora da resposta/);
  assert.match(habs(base, 'azul').dica5050.motivo, /hora da resposta/);
  // na resposta: vermelho é o 1º, azul o 2º
  const resp = ate(base, ['vermelho', 'azul']);
  assert.deepEqual(habs(resp, 'vermelho').passe, { pode: true, motivo: null });
  assert.match(habs(resp, 'azul').dica5050.motivo, /2º respondente usa, quando for a vez dele/);
  const errou = G.responder(resp, 1);
  assert.deepEqual(habs(errou, 'azul').dica5050, { pode: true, motivo: null });
  // só um respondente: o Passe diz por que não
  const so = ate(dar(novo(), 'vermelho', 'passe'), ['vermelho']);
  assert.deepEqual(habs(so, 'vermelho').passe, { pode: false, motivo: 'Não há 2º respondente para receber a vez.' });
  // o 2º respondente não passa a vez
  assert.match(habs(dar(ate(novo(), ['vermelho', 'azul']), 'azul', 'passe'), 'azul').passe.motivo, /1º respondente/);
  // reservada numa Aposta com habilidades
  let r = dar(novo(), 'azul', 'escudo', 'passe');
  r = G.apostar(r, 'azul', 'habilidades', [0, 1]);
  r = ate(r, ['azul', 'vermelho']);
  assert.equal(habs(r, 'azul').passe.pode, false);
  assert.match(habs(r, 'azul').passe.motivo, /usaram uma habilidade|reservada/i);
});

test('o chip de uma habilidade que o grupo não tem não existe (o celular só recebe o que é dele)', () => {
  const s = dar(novo(), 'azul', 'passe');
  assert.deepEqual(Object.keys(habs(s, 'vermelho')), ['aposta']);
  assert.equal(JSON.stringify(acoesDoGrupo(s, 'vermelho')).includes('passe'), false);
});

// ---------- o celular num navegador de verdade ----------
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));
let chromium = null;
try { ({ chromium } = require('playwright-core')); } catch { /* sem playwright */ }

test('celular: só chips (sem o botão Habilidades), Aposta sem habilidades, toque abre a confirmação certa e chip desabilitado mostra o motivo', { skip: !CHROME || !chromium ? 'sem navegador instalado' : false, timeout: 150000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-chip-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { placarModo: 'desligado', meta: 40 } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const host = new Cliente(srv.porta, 'papel=host');
  t.after(async () => { host.fechar(); await browser.close(); await srv.fechar().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  const certa = () => host.ultimo.pergunta.correta;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await ok('novoJogo', {});
  await pg.goto(`http://127.0.0.1:${srv.porta}/g/azul`);
  await pg.waitForSelector('#g-nome');
  await pg.fill('#g-nome', 'Teste');
  await pg.click('.g-entrar');
  await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
  const outro = await entrarGrupo(srv.porta, 'vermelho', 'Vermelho');
  await host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');

  const verificar = async (rotulo) => {
    await pg.waitForTimeout(250);
    const texto = await pg.evaluate(() => document.body.innerText);
    assert.doesNotMatch(texto, /\bnull\b|\bundefined\b/i, `${rotulo}: ${JSON.stringify(texto.slice(0, 160))}`);
    const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sw[0] <= sw[1], `${rotulo}: rolagem horizontal`);
  };
  const tipos = () => pg.$$eval('.g-chip', (n) => n.map((x) => x.dataset.tipo));
  const toque = async (sel) => { await pg.click(sel, { force: true }); await pg.waitForTimeout(200); }; // force: o chip desabilitado (aria-disabled) continua tocável, para mostrar o motivo
  const motivo = () => pg.$eval('.g-motivo', (n) => n.textContent.trim());
  const rodadaAzul = async () => {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    await pg.waitForSelector('.g-botao:has-text("APERTE")'); await pg.click('.g-botao');
    await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta'); await ok('responder', certa()); await ok('continuar');
  };

  // 1) sem habilidades: só a Aposta; o botão "Habilidades" não existe mais
  await pg.waitForSelector('.g-habs');
  assert.deepEqual(await tipos(), ['aposta']);
  assert.equal(await pg.$('.g-hab-btn'), null);
  const botoes = await pg.$$eval('button', (b) => b.map((x) => x.textContent.trim()));
  assert.equal(botoes.includes('Habilidades'), false, 'o botão Habilidades foi removido');
  assert.match(await pg.$eval('.g-habs', (n) => n.innerText), /Você tem:/);
  assert.equal(await pg.$eval('.g-chip[data-tipo="aposta"]', (n) => n.getAttribute('aria-label')), 'Usar Aposta');
  const altura = await pg.$eval('.g-chip', (n) => n.getBoundingClientRect().height);
  assert.ok(altura >= 44, `área de toque do chip: ${altura}`);
  await verificar('só a Aposta');
  await toque('.g-chip[data-tipo="aposta"]');
  await pg.waitForSelector('.g-folha:has-text("Aposta")');
  await verificar('Aposta aberta pelo chip');
  await toque('.g-fbtn:has-text("Voltar")');
  assert.equal(await pg.$('.g-folha'), null);
  // com a janela aberta a Aposta fica desabilitada e o toque explica
  await ok('mostrarAlternativas'); await ok('abrirJanela');
  await pg.waitForSelector('.g-botao:has-text("APERTE")');
  assert.equal(await pg.$eval('.g-chip[data-tipo="aposta"]', (n) => n.getAttribute('aria-disabled')), 'true');
  await toque('.g-chip[data-tipo="aposta"]');
  assert.equal(await motivo(), 'Só antes da janela de 30 s.');
  await verificar('chip desabilitado com o motivo');
  await ok('encerrarJanela'); await ok('continuar');

  // 2) Escudo guardado: tocar fora de bloqueio explica
  for (let i = 0; i < 3; i += 1) await rodadaAzul();
  await ok('trocarAcertos', 'azul', 'escudo');
  await pg.waitForSelector('.g-chip[data-tipo="escudo"]');
  assert.deepEqual(await tipos(), ['escudo', 'aposta']);
  await toque('.g-chip[data-tipo="escudo"]');
  assert.equal(await motivo(), 'O Escudo é usado quando bloquearem vocês.');
  await verificar('Escudo tocado fora de bloqueio');

  // 3) Bloqueio: o chip abre a escolha do alvo; o pedido enviado reabre como "pedido" para cancelar
  for (let i = 0; i < 3; i += 1) await rodadaAzul();
  await ok('trocarAcertos', 'azul', 'bloqueio');
  await pg.waitForSelector('.g-chip[data-tipo="bloqueio"]');
  await toque('.g-chip[data-tipo="bloqueio"]');
  await pg.waitForSelector('.g-folha:has-text("Escolha o grupo que será bloqueado.")');
  await verificar('escolha do alvo pelo chip');
  await toque('.g-alvo:has-text("Vermelho")');
  await pg.waitForSelector('.g-folha:has-text("Pedir o Bloqueio sobre Vermelho?")');
  await toque('.g-fbtn:has-text("Confirmar")');
  await pg.waitForSelector('.g-folha:has-text("Aguardando o responsável")');
  await verificar('pedido de Bloqueio enviado');
  await toque('.g-fbtn:has-text("Cancelar pedido")');
  await pg.waitForSelector('.g-folha', { state: 'detached' });
  assert.equal((await host.ultimo.pedidos).length, 0);

  // 4) Dobro: confirmação certa; depois o resto fica desabilitado com o motivo "Já usaram..."
  for (let i = 0; i < 5; i += 1) await rodadaAzul();
  await ok('trocarAcertos', 'azul', 'dobro', 0); // estoque cheio: troca o Escudo
  await pg.waitForSelector('.g-chip[data-tipo="dobro"]');
  await toque('.g-chip[data-tipo="dobro"]');
  await pg.waitForSelector('.g-folha:has-text("Usar o Dobro nesta rodada?")');
  await verificar('confirmação do Dobro pelo chip');
  await toque('.g-fbtn:has-text("Confirmar")');
  await pg.waitForSelector('.g-folha', { state: 'detached' });
  await pg.waitForSelector('.g-chip[data-tipo="aposta"][aria-disabled="true"]');
  await toque('.g-chip[data-tipo="bloqueio"]');
  assert.equal(await motivo(), 'Já usaram uma habilidade nesta rodada.');
  await toque('.g-chip[data-tipo="aposta"]');
  assert.equal(await motivo(), 'Já usaram uma habilidade nesta rodada.');
  await verificar('chips desabilitados depois de usar uma habilidade');

  // 5) Passe pelo chip: azul é o 1º e o outro grupo o 2º
  await ok('mostrarAlternativas'); await ok('abrirJanela');
  await pg.waitForSelector('.g-botao:has-text("APERTE")'); await pg.click('.g-botao');
  outro.c.enviar({ t: 'apertar' });
  await host.estadoApos((s) => s.estado.rodada.ordem.length === 2 || s.estado.fase !== 'janela');
  if (host.ultimo.estado.fase === 'janela') await ok('encerrarJanela');
  await ok('mostrarResposta');
  await ok('responder', certa());
  await verificar('fim da rodada');
});
