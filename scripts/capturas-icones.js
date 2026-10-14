'use strict';
// Capturas do ajuste de ícones (rosa, azul, verde, laranja): seleção de cores no projetor (1366x768 e 1920x1080) e os 4 celulares.
// node scripts/capturas-icones.js   (TEMA=claro|noturno grava em capturas/<tema>/)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente } = require('../test/ajuda');
const { pastaCapturas, temaInicial } = require('./util-tema');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const erros = [];

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-ic-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const base = `http://127.0.0.1:${srv.porta}`;
  const host = new Cliente(srv.porta, 'papel=host');
  await host.aberto;
  await host.acao('novoJogo', {});
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    const pg = await (await browser.newContext({ viewport: vp })).newPage();
    await pg.goto(`${base}/tela`);
    await pg.waitForSelector('.bloco');
    await pg.waitForTimeout(500);
    const ok = await pg.evaluate(() => [...document.querySelectorAll('.bloco')].every((b) => { const i = b.querySelector('.time-img').getBoundingClientRect(); const B = b.getBoundingClientRect(); return i.left >= B.left && i.right <= B.right && i.top >= B.top && i.bottom <= B.bottom; }));
    if (!ok) erros.push(`${vp.width}: ícone fora do banner`);
    await pg.screenshot({ path: path.join(pastaCapturas, `icones-${vp.width}x${vp.height}-tela-selecao-de-cores.png`) });
    await pg.context().close();
  }
  for (const [cor, nome] of [['rosa', 'Rosas'], ['azul', 'Azuis'], ['verde', 'Verdes'], ['laranja', 'Laranjas']]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await pg.goto(`${base}/g/${cor}`);
    await pg.waitForSelector('#g-nome');
    await pg.fill('#g-nome', nome);
    await pg.click('.g-entrar');
    await pg.waitForSelector('.g-nome-grupo');
    await pg.waitForTimeout(500);
    const ok = await pg.evaluate(() => { const i = document.querySelector('.g .time-img').getBoundingClientRect(); return i.left >= 0 && i.top >= 0 && i.right <= innerWidth && i.bottom <= innerHeight; });
    if (!ok) erros.push(`${cor}: ícone fora da tela`);
    await pg.screenshot({ path: path.join(pastaCapturas, `icones-390x844-cel-${cor}.png`) });
    await ctx.close();
  }
  host.fechar();
  await browser.close();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
