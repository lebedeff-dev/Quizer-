'use strict';
// Capturas da 8k-2: botão Comemorar (desabilitado e habilitado, notebook e celular), fogos e pop-up nos celulares, fogos e banner no
// projetor (1366x768 e 1920x1080) com Amarelo e Preto (nome longo) como vencedores, Configurações com a mensagem.
// node scripts/capturas-8k2.js   (TEMA=claro|noturno grava em capturas/<tema>/)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente, ajustarPontosNoServidor } = require('../test/ajuda');
const { pastaCapturas, temaInicial } = require('./util-tema');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const erros = [];
const LONGO = 'Maria Aparecida de Albuquerque Nasciment';

async function subir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8k2-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { meta: 2, placarModo: 'desligado' } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const host = new Cliente(srv.porta, 'papel=host');
  await host.aberto;
  const ok = async (nome, ...a) => { const r = await host.acao(nome, ...a); if (r.t !== 'ok') throw new Error(`${nome}: ${r.msg}`); };
  await ok('novoJogo', {});
  return { dir, srv, host, ok, base: `http://127.0.0.1:${srv.porta}` };
}

async function foto(pg, nome, espera = 400) {
  await pg.waitForTimeout(espera);
  const [sw, iw, texto] = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.body.innerText]);
  if (sw > iw) erros.push(`${nome}: rolagem horizontal ${sw} > ${iw}`);
  if (/\bnull\b|\bundefined\b/i.test(texto)) erros.push(`${nome}: null/undefined`);
  await pg.screenshot({ path: path.join(pastaCapturas, `${nome}.png`) });
}

async function celular(browser, base, cor, nome) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await pg.goto(`${base}/g/${cor}`);
  await pg.waitForSelector('#g-nome');
  await pg.fill('#g-nome', nome);
  await pg.click('.g-entrar');
  await pg.waitForSelector('.g-nome-grupo');
  return pg;
}

async function cenario(browser, rotulo, vencedor, nomeVencedor, perdedor, nomePerdedor, { completo }) {
  const S = await subir();
  const { host, ok, base } = S;
  const pgV = await celular(browser, base, vencedor, nomeVencedor);
  const pgP = await celular(browser, base, perdedor, nomePerdedor);
  await host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  for (let i = 0; i < 2; i += 1) {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    await pgV.waitForSelector('.g-botao:has-text("APERTE")');
    await pgV.click('.g-botao');
    await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta');
    await ok('responder', host.ultimo.pergunta.correta);
    await ok('continuar');
  }
  await host.estadoApos((s) => s.estado.fase === 'ranking');
  const tela = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const telaG = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const painel = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const painelM = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  for (const [p, rota] of [[tela, 'tela'], [telaG, 'tela'], [painel, 'host'], [painelM, 'host']]) await p.goto(`${base}/${rota}`);
  await painel.waitForSelector('#hr-comemorar');
  await painelM.waitForSelector('#hr-comemorar');
  if (completo) {
    // empate: o botão fica desabilitado com o motivo
    await ajustarPontosNoServidor({ srv: S.srv, host }, perdedor, host.ultimo.ranking.find((r) => r.cor === vencedor).pontos);
    await painel.waitForSelector('#hr-comemorar[disabled]');
    await painelM.waitForSelector('#hr-comemorar[disabled]');
    await foto(painel, `${rotulo}-1366x768-host-comemorar-desabilitado`);
    await foto(painelM, `${rotulo}-390x844-host-comemorar-desabilitado`);
    await ajustarPontosNoServidor({ srv: S.srv, host }, perdedor, -host.ultimo.ranking.find((r) => r.cor === vencedor).pontos);
    await painel.waitForSelector('#hr-comemorar:not([disabled])');
    await painelM.waitForSelector('#hr-comemorar:not([disabled])');
    await foto(painel, `${rotulo}-1366x768-host-comemorar-habilitado`);
    await foto(painelM, `${rotulo}-390x844-host-comemorar-habilitado`);
  }
  await ok('comemorar');
  const t0 = Date.now();
  await pgV.waitForSelector('canvas.g-fogos[data-fogos="ativo"]');
  await pgP.waitForSelector('.g-parabens');
  await tela.waitForSelector('.comem-banner');
  await telaG.waitForSelector('.comem-banner');
  // mais de um instante dos fogos: 0,8 s, 1,8 s e 3,0 s depois do toque em Comemorar
  for (const ms of [800, 1800, 3000]) {
    const resta = t0 + ms - Date.now();
    if (resta > 0) await new Promise((r) => setTimeout(r, resta));
    const rot = `${(ms / 1000).toFixed(1)}s`;
    await foto(pgV, `${rotulo}-390x844-cel-vencedor-fogos-${rot}`, 0);
    await foto(tela, `${rotulo}-1366x768-tela-banner-e-fogos-${rot}`, 0);
    await foto(telaG, `${rotulo}-1920x1080-tela-banner-e-fogos-${rot}`, 0);
  }
  await foto(pgP, `${rotulo}-390x844-cel-perdedor-popup`, 0);
  await foto(painel, `${rotulo}-1366x768-host-voltar-ao-ranking`, 0);
  await foto(painelM, `${rotulo}-390x844-host-voltar-ao-ranking`, 0);
  // depois dos fogos o banner continua
  await tela.waitForSelector('canvas.comem-fogos', { state: 'detached', timeout: 10000 });
  await foto(tela, `${rotulo}-1366x768-tela-banner-depois-dos-fogos`, 200);
  await foto(telaG, `${rotulo}-1920x1080-tela-banner-depois-dos-fogos`, 200);
  await pgV.click('.g-parabens-fechar');
  await foto(pgV, `${rotulo}-390x844-cel-vencedor-depois-de-fechar`, 300);
  host.fechar();
  await srv0(S);
}
async function srv0(S) {
  await S.srv.fechar();
  fs.rmSync(S.dir, { recursive: true, force: true });
}

async function configuracoes(browser) {
  const S = await subir();
  await S.ok('irMenu');
  for (const [rotulo, vp, mobile] of [['1366x768', { width: 1366, height: 768 }, false], ['390x844', { width: 390, height: 844 }, true]]) {
    await S.ok('irMenu');
    const pg = await (await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 })).newPage();
    await pg.goto(`${S.base}/host`);
    await pg.waitForSelector('.opcao');
    await pg.click('.menu-extra >> text=Configurações');
    await pg.waitForSelector('#cfg-parabens');
    await pg.locator('#cfg-parabens').scrollIntoViewIfNeeded();
    await foto(pg, `${rotulo}-host-config-mensagem-parabens`);
    await pg.context().close();
  }
  S.host.fechar();
  await srv0(S);
}

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  await cenario(browser, '8k2-amarelo', 'amarelo', 'Ana', 'vermelho', 'Bia', { completo: true });
  await cenario(browser, '8k2-preto', 'preto', LONGO, 'azul', 'Clara', { completo: false });
  await configuracoes(browser);
  await browser.close();
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
