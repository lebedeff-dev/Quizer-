'use strict';
// Etapa 8k-1: cores pastel (Marrom virou Preto), imagens dos times com opacidade configurável, ajuste manual de pontos
// removido e textos das Configurações. O navegador de verdade só entra nos testes de tela (pulam sem Chrome/Edge).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const G = require('../src/game');
const CFG = require('../src/config-campos');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, autenticar, PIN } = require('./ajuda');

const PUBLIC = path.join(__dirname, '..', 'public');
const esm = (rel) => import(pathToFileURL(path.join(PUBLIC, rel)).href);
const HEX = {
  vermelho: '#E57373', azul: '#64B5F6', verde: '#81C784', amarelo: '#FFEE58', laranja: '#FFB74D',
  roxo: '#BA68C8', rosa: '#F48FB1', ciano: '#4DB6AC', preto: '#212121', cinza: '#90A4AE',
};
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));
let chromium = null;
try { ({ chromium } = require('playwright-core')); } catch { /* sem playwright */ }

async function servidor(t, extra = {}) {
  const dir = extra.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8k-'));
  if (!fs.existsSync(path.join(dir, 'perguntas.json'))) fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => !!extra.local });
  const auth = await autenticar(srv.porta, PIN);
  const host = new Cliente(srv.porta, 'papel=host', auth.cookie);
  const abertos = [host];
  t.after(async () => { abertos.forEach((x) => x.fechar()); await srv.fechar().catch(() => {}); if (!extra.manter) fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  return { dir, srv, host, abertos, auth };
}

test('as 10 cores são as pastel combinadas, na mesma ordem do servidor, sem Marrom', async () => {
  const { CORES, ORDEM_CORES, textoSobre, contraste } = await esm('shared/cores.js');
  assert.deepEqual(ORDEM_CORES, G.CORES);
  assert.equal(ORDEM_CORES.length, 10);
  assert.ok(!ORDEM_CORES.includes('marrom'));
  for (const [cor, hex] of Object.entries(HEX)) assert.equal(CORES[cor].hex, hex, cor);
  assert.equal(CORES.preto.nome, 'Preto');
});

test('o texto sobre cada cor é preto, só o Preto leva branco, e o contraste passa de 4,5', async () => {
  const { CORES, textoSobre, contraste, estiloCor } = await esm('shared/cores.js');
  for (const [cor, { hex }] of Object.entries(CORES)) {
    const texto = textoSobre(hex);
    assert.equal(texto, cor === 'preto' ? '#FFFFFF' : '#000000', cor);
    assert.ok(contraste(hex, texto) >= 4.5, `${cor}: contraste ${contraste(hex, texto).toFixed(2)}`);
  }
  assert.match(estiloCor('preto'), /box-shadow:inset 0 0 0 2px #616161/, 'o Preto ganha contorno cinza');
  assert.doesNotMatch(estiloCor('amarelo'), /box-shadow/);
});

test('nenhum CSS ou JS do front fixa texto branco sobre a cor do grupo', () => {
  const g = fs.readFileSync(path.join(PUBLIC, 'g', 'g.js'), 'utf8');
  assert.match(g, /textoSobre\(info\.hex\)/);
  for (const f of ['host/sala.js', 'tela/tela.js', 'tela/jogo.js', 'host/jogo.js']) {
    const s = fs.readFileSync(path.join(PUBLIC, f), 'utf8');
    assert.doesNotMatch(s, /style: `[^`]*background:\$\{[^}]*hex\}[^`]*color:#fff/i, f);
  }
});

test('jogo salvo com Marrom vira Preto: grupo, token e Registro, e /g/marrom redireciona', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8k-mig-'));
  let a = await servidor(t, { dir, manter: true });
  await a.host.acao('novoJogo', {});
  const { c, entrou } = await entrarGrupo(a.srv.porta, 'cinza', 'Rep do grupo');
  a.abertos.push(c);
  assert.equal(entrou.t, 'entrou');
  const token = entrou.token;
  assert.ok(token);
  await a.host.estadoApos((s) => s.estado.grupos.length === 1);
  c.fechar();
  a.host.fechar();
  await a.srv.fechar();
  // simula o arquivo da versão antiga
  const arq = path.join(dir, 'jogo.json');
  fs.writeFileSync(arq, fs.readFileSync(arq, 'utf8').replace(/cinza/g, 'marrom'));
  assert.match(fs.readFileSync(arq, 'utf8'), /marrom/);
  a = await servidor(t, { dir });
  const grupos = a.host.ultimo ? a.host.ultimo.estado.grupos : (await a.host.estadoApos(() => true)).estado.grupos;
  assert.deepEqual(grupos.map((g) => g.cor), ['preto']);
  assert.equal(grupos[0].representante, 'Rep do grupo');
  const volta = await entrarGrupo(a.srv.porta, 'preto', '', token);
  a.abertos.push(volta.c);
  assert.equal(volta.entrou.t, 'entrou', `${JSON.stringify(volta.entrou)} o token do celular continua valendo`);
  const r = await fetch(`http://127.0.0.1:${a.srv.porta}/g/marrom`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/g/preto');
  assert.equal((await fetch(`http://127.0.0.1:${a.srv.porta}/g/preto`)).status, 200);
});

test('opacidade das imagens: padrão 12, de 0 a 30, vale na hora nas três visões e recusa fora do intervalo', async (t) => {
  const { dir, srv, host, abertos } = await servidor(t);
  assert.equal(G.CONFIG_PADRAO.imagensOpacidade, 12);
  await host.acao('novoJogo', {});
  const tela = new Cliente(srv.porta, 'papel=tela');
  abertos.push(tela);
  const { c: fone } = await entrarGrupo(srv.porta, 'preto', 'Rep');
  const { c: fone2 } = await entrarGrupo(srv.porta, 'azul', 'Rep 2');
  abertos.push(fone, fone2);
  await tela.aberto;
  await host.estadoApos((s) => s.estado.grupos.length === 2);
  assert.equal(host.ultimo.imagens, 12);
  assert.equal(tela.ultimo.imagens, 12);
  const base = { meta: 14, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5 };
  for (const v of [-1, 31, 12.5, 'abc']) {
    const r = await host.acao('salvarConfigJogo', { ...base, imagensOpacidade: v });
    assert.equal(r.t, 'erro', String(v));
    assert.match(r.msg, /Opacidade das imagens dos times: use um número inteiro de 0 a 30/);
  }
  for (const v of [0, 30]) {
    assert.equal((await host.acao('salvarConfigJogo', { ...base, imagensOpacidade: v })).t, 'ok');
    await host.estadoApos((s) => s.imagens === v);
    await tela.estadoApos((s) => s.imagens === v);
    await fone.esperar((m) => m.t === 'estado' && m.imagens === v, 3000, true);
  }
  // com a partida em andamento também vale na hora
  assert.equal((await host.acao('iniciar')).t, 'ok');
  assert.equal((await host.acao('salvarConfigJogo', { ...base, imagensOpacidade: 7 })).t, 'ok');
  await host.estadoApos((s) => s.imagens === 7);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).jogo.imagensOpacidade, 7, 'persistido');
});

test('os 10 desenhos existem, são traço único e a opacidade 0 não cria elemento', async () => {
  const { DESENHOS, svgDoTime, OPACIDADE_PADRAO } = await esm('shared/imagens-times-dados.js');
  assert.deepEqual(Object.keys(DESENHOS).sort(), [...G.CORES].sort());
  assert.equal(OPACIDADE_PADRAO, 12);
  for (const cor of G.CORES) {
    const svg = svgDoTime(cor);
    assert.match(svg, /viewBox="0 0 64 64"/);
    assert.match(svg, /fill="none" stroke="currentColor" stroke-width="2\.6" stroke-linecap="round" stroke-linejoin="round"/);
    assert.match(svg, /<(path|circle|rect)/);
    assert.doesNotMatch(svg, /https?:|href=|<image/i, 'nada externo');
  }
  assert.equal(new Set(Object.values(DESENHOS)).size, 10, 'os 10 ícones são todos diferentes');
});

test('o ajuste manual de pontos não existe mais: nem no jogo, nem no servidor, nem na tela', async (t) => {
  assert.equal(G.ajustarPontos, undefined);
  const { host, srv, abertos } = await servidor(t);
  await host.acao('novoJogo', {});
  const { c: fone } = await entrarGrupo(srv.porta, 'azul', 'Rep');
  abertos.push(fone);
  await host.estadoApos((s) => s.estado.grupos.length === 1);
  const r = await host.acao('ajustarPontos', 'azul', 50);
  assert.equal(r.t, 'erro');
  assert.match(r.msg, /desconhecida/i);
  assert.equal(host.ultimo.estado.grupos[0].pontos, 0);
  // o celular também não consegue pedir
  fone.enviar({ t: 'acao', id: 'x', nome: 'ajustarPontos', args: ['azul', 50] });
  await fone.esperar((m) => m.id === 'x', 3000, true).catch(() => null);
  assert.equal(host.ultimo.estado.grupos[0].pontos, 0);
  for (const f of ['host/jogo.js', 'host/mobile.css', 'host/jogo.css']) {
    assert.doesNotMatch(fs.readFileSync(path.join(PUBLIC, f), 'utf8'), /ajustarPontos|hg-mini|hg-ajuste/, f);
  }
});

test('Configurações: todo campo tem nome, explicação, unidade e limites em português, sem nome interno', () => {
  assert.ok(CFG.TODOS.length >= 18);
  for (const c of CFG.TODOS) {
    assert.ok(c.nome && c.efeito && c.unidade, c.chave);
    assert.ok(Number.isInteger(c.min) && Number.isInteger(c.max) && c.min < c.max, c.chave);
    assert.ok(c.chave in G.CONFIG_PADRAO, c.chave);
    const texto = `${c.nome} ${c.efeito}`;
    assert.doesNotMatch(texto, /seq[A-Z]|aposta[A-Z]|compraMax|placar[A-Z]|[a-z][A-Z]/, `nome interno em "${c.chave}"`);
    assert.doesNotMatch(texto, /—|–/, `travessão em "${c.chave}"`);
    assert.doesNotMatch(texto, /\b(máx|mín|qtd|pts|seg)\b\.?/i, `abreviação em "${c.chave}"`);
  }
  assert.deepEqual(CFG.SECOES.map((s) => s.titulo), ['Jogo e perguntas', 'Pontuação', 'Habilidades', 'Aposta', 'Placar parcial', 'Aparência']);
  assert.ok(CFG.validarNumeros({}).erro, 'sem os campos obrigatórios, recusa');
});

test('telas novas em navegador de verdade: imagens nos banners e no celular, null/undefined, Preto e Amarelo', { skip: !CHROME || !chromium ? 'sem navegador instalado' : false, timeout: 120000 }, async (t) => {
  const { srv, host, abertos } = await servidor(t, { local: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  const base = `http://127.0.0.1:${srv.porta}`;
  await ok('novoJogo', {});
  const limpo = async (pg, rotulo) => {
    const texto = await pg.evaluate(() => document.body.innerText);
    assert.doesNotMatch(texto, /\bnull\b|\bundefined\b/i, rotulo);
    const [sw, iw] = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sw <= iw, `${rotulo}: rolagem horizontal`);
  };

  // projetor na seleção: um banner por cor, com imagem, e o QR do Preto com a faixa dele
  const tela = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await tela.goto(`${base}/tela`);
  await ok('irMenu'); await ok('novoJogo', {});
  await tela.waitForSelector('.bloco');
  assert.equal(await tela.locator('.bloco .time-img').count(), 10);
  assert.equal(await tela.locator('.time-img').first().evaluate((n) => getComputedStyle(n).pointerEvents), 'none');
  assert.equal(await tela.locator('.bloco[data-cor="preto"] .time-img').evaluate((n) => getComputedStyle(n).color), 'rgb(255, 255, 255)');
  assert.equal(await tela.locator('.bloco[data-cor="amarelo"] .time-img').evaluate((n) => getComputedStyle(n).color), 'rgb(0, 0, 0)');
  assert.equal(await tela.locator('.bloco[data-cor="amarelo"] .time-img').evaluate((n) => getComputedStyle(n).opacity), '0.12');
  await ok('selecionarCor', 'preto');
  await tela.waitForSelector('.qr-faixa .time-img');
  await limpo(tela, 'tela com QR');
  await ok('selecionarCor', null);

  // painel: fichas com imagem
  const painel = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await painel.goto(`${base}/host`);
  await painel.waitForSelector('.hs-ficha');
  assert.equal(await painel.locator('.hs-ficha .time-img').count(), 10);
  await limpo(painel, 'painel sala');

  // celular do Preto e do Amarelo: imagem grande atrás do conteúdo; opacidade 0 tira o elemento
  for (const [cor, texto] of [['preto', 'rgb(255, 255, 255)'], ['amarelo', 'rgb(0, 0, 0)']]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    await pg.goto(`${base}/g/${cor}`);
    await pg.waitForSelector('#g-nome');
    await pg.fill('#g-nome', 'Teste');
    await pg.click('.g-entrar');
    await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
    assert.equal(await pg.locator('.g .time-img.celular').count(), 1, cor);
    assert.equal(await pg.locator('.time-img').evaluate((n) => getComputedStyle(n).color), texto, cor);
    assert.equal(await pg.locator('.time-img').evaluate((n) => Math.round(n.getBoundingClientRect().width)), 109);
    await limpo(pg, `celular ${cor}`);
    if (cor === 'preto') {
      const base0 = { meta: 14, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5 };
      await ok('salvarConfigJogo', { ...base0, imagensOpacidade: 0 });
      await pg.waitForFunction(() => !document.querySelector('.time-img'));
      await ok('salvarConfigJogo', { ...base0, imagensOpacidade: 12 });
      await pg.waitForSelector('.time-img');
    }
    await ctx.close();
  }
  void abertos;

  // Configurações no painel: seções com títulos claros, campo de opacidade, sem null
  await ok('irMenu');
  await painel.goto(`${base}/host`);
  await painel.waitForSelector('.opcao');
  await painel.click('.menu-extra >> text=Configurações');
  await painel.waitForSelector('#cfg-imagensOpacidade');
  const titulos = await painel.locator('.pg-cartao h2').allTextContents();
  assert.deepEqual(titulos, ['Jogo e perguntas', 'Pontuação', 'Habilidades', 'Aposta', 'Placar parcial', 'Aparência', 'Capa e tela final']);
  await limpo(painel, 'configurações');
});

test('Desfazer depois de uma Aposta volta ao estado anterior; jogo salvo sem a opacidade ganha o padrão', () => {
  const ps = [];
  for (let i = 1; i <= 24; i += 1) ps.push({ id: i, tipo: 'facil', enunciado: `P${i}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, explicacao: 'x', reserva: false });
  ps.push({ id: 99, tipo: 'atencao', enunciado: 'R', alternativas: ['a', 'b', 'c', 'd'], correta: 3, explicacao: 'x', reserva: true });
  let s = G.criarJogo({ config: { placarModo: 'desligado' }, perguntas: ps });
  for (const c of ['preto', 'amarelo']) s = G.registrarGrupo(s, c, `rep-${c}`);
  s = G.iniciar(s);
  const antes = JSON.stringify({ ...s, _undo: undefined });
  const apostou = G.apostar(s, 'preto', 'pontos');
  assert.notEqual(JSON.stringify({ ...apostou, _undo: undefined }), antes);
  const volta = G.desfazer(apostou);
  assert.equal(JSON.stringify({ ...volta, _undo: undefined }), antes);

  const antigo = JSON.parse(JSON.stringify({ ...s, _undo: [] }));
  delete antigo.config.imagensOpacidade;
  assert.equal(G.migrarEstado(antigo).config.imagensOpacidade, 12);
});
