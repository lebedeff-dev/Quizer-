'use strict';
// A barra do Tigrinho no celular, num navegador de verdade (pula sozinho sem Chrome/Edge): aparece no começo da
// rodada seguinte à 3ª sem pontuar, sem "null", abre a Aposta ao tocar, X dispensa (e não volta, nem recarregando),
// some com a janela de 30 s e nunca cobre o botão APERTE nem a folha de decisão.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, PIN } = require('./ajuda');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));
let chromium = null;
try { ({ chromium } = require('playwright-core')); } catch { /* sem playwright */ }

test('Tigrinho no celular: barra, toque abre a Aposta, X dispensa, some com a janela e não cobre APERTE', { skip: !CHROME || !chromium ? 'sem navegador instalado' : false, timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-tigc-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { placarModo: 'desligado', meta: 30 } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const host = new Cliente(srv.porta, 'papel=host');
  t.after(async () => { host.fechar(); await browser.close(); await srv.fechar().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  const certa = () => host.ultimo.pergunta.correta;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: Date.now() }); // sem o tempo correndo, a barra não expira no meio das verificações (o relógio tem teste próprio)
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
    await pg.waitForTimeout(300);
    const texto = await pg.evaluate(() => document.body.innerText);
    assert.doesNotMatch(texto, /\bnull\b|\bundefined\b/i, `${rotulo}: ${JSON.stringify(texto.slice(0, 160))}`);
    const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(sw[0] <= sw[1], `${rotulo}: rolagem horizontal ${sw[0]} > ${sw[1]}`);
  };
  const rodadaVermelho = async () => {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    outro.c.enviar({ t: 'apertar' });
    await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta'); await ok('responder', certa()); await ok('continuar');
  };

  for (let i = 0; i < 2; i += 1) await rodadaVermelho();
  await pg.waitForSelector('.g-botao');
  assert.equal(await pg.$('.g-tig'), null, 'com 2 rodadas sem pontuar não há mensagem');
  await rodadaVermelho();
  await pg.waitForSelector('.g-tig');
  await verificar('barra do Tigrinho (3 rodadas)');
  const texto = await pg.$eval('.g-tig', (n) => n.innerText);
  assert.match(texto, /Tigrinho/);
  assert.doesNotMatch(texto, /\d\d:\d\d/, 'sem horário');
  assert.match(texto, /Oi! Seu grupo está há 3 rodadas sem pontuar\. Que tal uma aposta para virar o jogo\?/);
  assert.doesNotMatch(texto, /whatsapp|online|digitando|✓/i, 'só foto, nome e mensagem');
  assert.doesNotMatch(texto, /—/, 'sem travessão longo');
  // a foto vem do servidor local; o arquivo existe e é pequeno
  const foto = await pg.$eval('.g-tig-foto', (i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0 }));
  assert.equal(foto.src, '/shared/tigrinho.png');
  assert.equal(foto.ok, true);
  assert.ok(fs.statSync(path.join(__dirname, '..', 'public', 'shared', 'tigrinho.png')).size <= 150 * 1024, 'imagem de até 150 KB');
  // a barra fica no topo e não cobre o botão da tela
  const caixa = await pg.$eval('.g-tig', (n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
  assert.ok(caixa.top >= 0 && caixa.left >= 0 && caixa.right <= 390, 'barra dentro da tela');

  // tocar na barra abre direto a Aposta (a folha fica por cima da barra)
  await pg.click('.g-tig-corpo');
  await pg.waitForSelector('.g-folha:has-text("Aposta")');
  assert.equal(await pg.$('.g-tig'), null, 'a barra não cobre a folha');
  await verificar('Aposta aberta pela barra');
  await host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'azul').tigrinhoVisto === 3);
  await pg.click('.g-fbtn:has-text("Voltar")');
  await pg.waitForTimeout(600);
  assert.equal(await pg.$('.g-tig'), null, 'abrir a Aposta pela barra a encerra: não volta nesta contagem');
  await pg.reload();
  await pg.waitForSelector('.g-botao');
  await pg.waitForTimeout(500);
  assert.equal(await pg.$('.g-tig'), null, 'nem recarregando a página');

  // 6 sem pontuar: volta; o X dispensa na hora e não volta (nem recarregando)
  await rodadaVermelho(); await rodadaVermelho(); await rodadaVermelho();
  await pg.waitForSelector('.g-tig');
  assert.match(await pg.$eval('.g-tig', (n) => n.innerText), /há 6 rodadas/);
  const x =await pg.$eval('.g-tig-x', (b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
  assert.ok(x[0] >= 44 && x[1] >= 44, `área de toque do X: ${x}`);
  await verificar('barra do Tigrinho (6 rodadas)');
  await pg.click('.g-tig-x');
  await pg.waitForSelector('.g-tig', { state: 'detached' });
  await host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'azul').tigrinhoVisto === 6);
  await pg.reload();
  await pg.waitForSelector('.g-botao');
  await pg.waitForTimeout(500);
  assert.equal(await pg.$('.g-tig'), null, 'dispensada, não volta para esta contagem');

  // 9 sem pontuar: a janela aberta a esconde sem cobrir o APERTE
  await rodadaVermelho(); await rodadaVermelho(); await rodadaVermelho();
  await pg.waitForSelector('.g-tig');
  await ok('mostrarAlternativas');
  await pg.waitForSelector('.g-tig');
  await ok('abrirJanela');
  await pg.waitForSelector('.g-botao:has-text("APERTE")');
  await pg.waitForSelector('.g-tig', { state: 'detached' });
  await verificar('janela aberta sem a barra');
});

// Relógio da barra: 10 s só com a página visível; dispensar antes e abrir a Aposta também encerram a barra.
test('Tigrinho: expira em 10 s, pausa com a página oculta, dispensar antes e abrir a Aposta fecham e não voltam na mesma contagem', { skip: !CHROME || !chromium ? 'sem navegador instalado' : false, timeout: 150000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-tigt-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { placarModo: 'desligado', meta: 30 } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const host = new Cliente(srv.porta, 'papel=host');
  t.after(async () => { host.fechar(); await browser.close(); await srv.fechar().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  const certa = () => host.ultimo.pergunta.correta;
  const visto = () => host.ultimo.estado.grupos.find((g) => g.cor === 'azul').tigrinhoVisto;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: Date.now() }); // o relógio da página só anda quando o teste manda
  await ok('novoJogo', {});
  await pg.goto(`http://127.0.0.1:${srv.porta}/g/azul`);
  await pg.waitForSelector('#g-nome');
  await pg.fill('#g-nome', 'Teste');
  await pg.click('.g-entrar');
  await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
  const outro = await entrarGrupo(srv.porta, 'vermelho', 'Vermelho');
  await host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  const tresRodadas = async () => {
    for (let i = 0; i < 3; i += 1) {
      await ok('mostrarAlternativas'); await ok('abrirJanela');
      outro.c.enviar({ t: 'apertar' });
      await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
      await ok('encerrarJanela'); await ok('mostrarResposta'); await ok('responder', certa()); await ok('continuar');
    }
  };
  const visibilidade = (v) => pg.evaluate((estado) => {
    Object.defineProperty(document, 'visibilityState', { get: () => estado, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);
  const aberta = async () => !!(await pg.$('.g-tig'));

  // 1) expira: aos 9 s ainda está lá; passando de 10 s sai (com a animação) e não volta
  await tresRodadas();
  await pg.waitForSelector('.g-tig');
  await pg.clock.runFor(500); // um tick para o relógio da barra começar
  await pg.clock.runFor(9000);
  assert.equal(await aberta(), true, 'aos 9 s ainda está na tela');
  await pg.clock.runFor(1800);
  assert.equal(await aberta(), false, 'depois de 10 s some sozinha');
  await host.estadoApos(() => visto() === 3);
  await pg.clock.runFor(30000);
  assert.equal(await aberta(), false, 'expirada não volta para a mesma contagem');

  // 2) pausa: com a página oculta o tempo não corre; ao voltar, completa os 10 s
  await tresRodadas();
  await pg.waitForSelector('.g-tig');
  await pg.clock.runFor(500);
  await pg.clock.runFor(4000);
  await visibilidade('hidden');
  await pg.clock.runFor(60000);
  assert.equal(await aberta(), true, 'oculta por 60 s e a barra continua (o tempo pausou)');
  await visibilidade('visible');
  await pg.clock.runFor(3000);
  assert.equal(await aberta(), true, 'faltavam cerca de 5,5 s: aos 3 s da volta ainda está');
  await pg.clock.runFor(4000);
  assert.equal(await aberta(), false, 'completados os 10 s visíveis, sai');
  await host.estadoApos(() => visto() === 6);

  // 3) dispensar antes do fim: some na hora (animação de 350 ms) e não volta
  await tresRodadas();
  await pg.waitForSelector('.g-tig');
  await pg.click('.g-tig-x');
  await pg.clock.runFor(600);
  assert.equal(await aberta(), false, 'o X dispensa na hora');
  await host.estadoApos(() => visto() === 9);
  await pg.clock.runFor(30000);
  assert.equal(await aberta(), false);

  // 4) abrir a Aposta pela barra: a barra some na hora e não reaparece ao voltar
  await tresRodadas();
  await pg.waitForSelector('.g-tig');
  await pg.click('.g-tig-corpo');
  await pg.waitForSelector('.g-folha:has-text("Aposta")');
  assert.equal(await aberta(), false);
  await host.estadoApos(() => visto() === 12);
  await pg.click('.g-fbtn:has-text("Voltar")');
  await pg.clock.runFor(1000);
  assert.equal(await aberta(), false, 'abrir a Aposta encerra a barra desta contagem');
});
