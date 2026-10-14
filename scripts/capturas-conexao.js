'use strict';
// Capturas da Etapa 9: endereço e PIN do painel no celular, aviso sem rede e botões do app (Quizer.exe).
// node scripts/capturas-conexao.js   (TEMA=claro|noturno grava em capturas/<tema>/)
// A ponte do Electron é simulada (window.quizer) para mostrar os botões que só existem no app.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo } = require('../test/ajuda');
const { pastaCapturas, temaInicial, conferirBotaoTema } = require('./util-tema');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizer-cap-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  let ips = [{ ip: '192.168.0.6', nome: 'Wi-Fi', provavel: true }];
  const srv = await iniciarServidor({ port: 3199, dataDir: dir, pin: '4821', descobrirIps: () => ips, intervaloRedeMs: 200 });
  await temaInicial(srv, '4821');
  const base = `http://127.0.0.1:${srv.porta}`;
  const ws = new Cliente(srv.porta, 'papel=host');
  await ws.aberto;

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const erros = [];
  const abrir = async (largura, altura) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: altura } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {});
    await ctx.addInitScript(() => {
      window.quizer = { desktop: true, copiar: async () => true, abrirHotspot: async () => true, reabrirTela: async () => true, encerrar: async () => true };
    });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => erros.push(String(e)));
    pg.on('console', (m) => m.type() === 'error' && !/401|ERR_CONNECTION/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const foto = async (pg, nome, espera = 400) => {
    await pg.waitForTimeout(espera);
    await pg.screenshot({ path: path.join(pastaCapturas, `${nome}.png`) });
  };

  const host = await abrir(1366, 768);
  await ws.acao('irMenu');
  await host.goto(`${base}/host`);
  await host.waitForSelector('.opcao');
  await foto(host, '1366x768-app-menu-endereco-pin');
  await host.click('text=Copiar endereço');
  await foto(host, '1366x768-app-menu-copiado', 150);
  await host.click('text=Encerrar');
  await host.waitForSelector('text=Encerrar o Quizer?');
  await foto(host, '1366x768-app-menu-confirmar-encerrar', 150);
  await host.click('text=Cancelar');

  // sem rede: aviso e botão do hotspot; o endereço some mas o PIN continua
  ips = [];
  await host.waitForSelector('.aviso-rede');
  await foto(host, '1366x768-app-menu-sem-rede');

  // sala de espera com QR na /tela: o endereço e o PIN continuam no painel
  ips = [{ ip: '192.168.0.6', nome: 'Wi-Fi', provavel: true }];
  await ws.acao('novoJogo', {});
  await ws.acao('selecionarCor', 'amarelo');
  await host.waitForSelector('.hs-comecar');
  await host.waitForFunction(() => !document.querySelector('.aviso-rede'));
  await foto(host, '1366x768-app-sala-com-qr');
  ips = [];
  await host.waitForSelector('.aviso-rede');
  await foto(host, '1366x768-app-sala-sem-rede');

  // celular (painel pelo celular): endereço, PIN e aviso em 390x844
  ips = [{ ip: '192.168.0.6', nome: 'Wi-Fi', provavel: true }];
  const cel = await abrir(390, 844);
  await ws.acao('irMenu');
  await cel.goto(`${base}/host`);
  await cel.waitForSelector('.opcao');
  await foto(cel, '390x844-app-menu-endereco-pin');
  await conferirBotaoTema(cel, '390x844 menu', erros);
  const largo = await cel.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (largo) erros.push('menu no celular com rolagem horizontal');
  ips = [];
  await cel.waitForSelector('.aviso-rede');
  const largo2 = await cel.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (largo2) erros.push('menu sem rede no celular com rolagem horizontal');
  await foto(cel, '390x844-app-menu-sem-rede');
  await conferirBotaoTema(cel, '390x844 menu sem rede', erros);

  await browser.close();
  ws.fechar();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}. Sem erros.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
