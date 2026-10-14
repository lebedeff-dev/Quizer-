'use strict';
// Capturas da Etapa 5: node scripts/capturas-sala.js
//  - /tela em 1920x1080, /host em 1366x768 e o celular em 390x844 (vermelho, amarelo e cinza,
//    para conferir o contraste do texto em cada cor).
// Usa o Chrome instalado (playwright-core) e servidores temporários.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const G = require('../src/game');
const { iniciarServidor } = require('../server');
const { TEMA, pastaCapturas, temaInicial } = require('./util-tema');
const { Cliente, autenticar } = require('../test/ajuda');

const PIN = '1234';
const SAIDA = pastaCapturas;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const PERGUNTAS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), 'utf8')).perguntas;
const CORES3 = ['vermelho', 'amarelo', 'cinza', 'azul'];

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const novaPasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-sala-'));
const semear = (dir) => fs.writeFileSync(path.join(dir, 'perguntas.json'), JSON.stringify({ perguntas: PERGUNTAS }));

async function fluxoAoVivo(browser) {
  const dir = novaPasta();
  semear(dir);
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN });
  await temaInicial(srv, PIN);
  const base = `http://127.0.0.1:${srv.porta}`;
  const erros = [];
  const foto = async (pg, nome, espera = 350) => {
    if (espera) await pg.waitForTimeout(espera);
    await pg.screenshot({ path: path.join(SAIDA, nome) });
  };
  const vigiar = (pg, rotulo) => {
    pg.on('pageerror', (e) => erros.push(`${rotulo}: ${e}`));
    pg.on('console', (m) => m.type() === 'error' && !/401/.test(m.text()) && erros.push(`${rotulo}: ${m.text()}`));
  };

  // /host (1366x768) e /tela (1920x1080) no mesmo contexto de cookies
  const ctxHost = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const host = await ctxHost.newPage();
  vigiar(host, 'host');
  await host.goto(`${base}/host`);
  await host.click('text=Iniciar');
  await host.waitForSelector('.opcao');
  await host.click('text=Criar novo jogo');
  await host.waitForSelector('.hs-comecar');

  const ctxTela = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tela = await ctxTela.newPage();
  vigiar(tela, 'tela');
  await tela.goto(`${base}/tela`);
  await tela.waitForSelector('.bloco');

  // 1) 10 cores livres + host com Começar desabilitado
  await foto(tela, '1920x1080-tela-1-sala-10-cores-livres.png');
  await foto(host, '1366x768-host-1-sala-comecar-desabilitado.png');

  // 2) QR de uma cor
  await host.click('button.hs-ficha:has-text("Amarelo")');
  await tela.waitForSelector('.qr-img');
  await tela.waitForFunction(() => document.querySelector('.qr-img')?.complete);
  await foto(tela, '1920x1080-tela-2-sala-qr-amarelo.png');
  await foto(host, '1366x768-host-2-sala-qr-escolhido.png');

  // 3) celulares entram (390x844)
  const celulares = {};
  for (const cor of CORES3) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    vigiar(pg, `cel-${cor}`);
    await pg.goto(`${base}/g/${cor}`);
    await pg.waitForSelector('#g-nome');
    await foto(pg, `390x844-${cor}-1-primeiro-acesso.png`);
    await pg.fill('#g-nome', { vermelho: 'Vera Lúcia', amarelo: 'Aline Souza', cinza: 'Carlos Henrique', azul: 'Bruno Alves' }[cor]);
    await pg.click('.g-entrar');
    await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
    await foto(pg, `390x844-${cor}-2-esperando.png`);
    celulares[cor] = pg;
  }
  await tela.waitForFunction(() => document.querySelectorAll('.bloco-estado').length === 10 && !document.querySelector('.qr-cartao'));
  await foto(tela, '1920x1080-tela-3-sala-3-grupos-conectados.png');
  await host.waitForSelector('.hs-comecar:not([disabled])');
  await foto(host, '1366x768-host-3-sala-comecar-habilitado.png');

  // 4) modo teste: a tela pisca a cor de quem aperta e mostra a ordem
  await host.click('text=Ligar modo teste');
  await celulares.vermelho.waitForSelector('.g-botao:has-text("APERTE")');
  await foto(celulares.vermelho, '390x844-vermelho-3-modo-teste.png', 150);
  await celulares.vermelho.click('.g-botao');
  await tela.waitForSelector('.piscada');
  await foto(tela, '1920x1080-tela-4-teste-piscando.png', 80);
  await pausa(900);
  await celulares.cinza.click('.g-botao');
  await pausa(900);
  await celulares.amarelo.click('.g-botao');
  await tela.waitForSelector('.piscada');
  await pausa(900);
  await foto(tela, '1920x1080-tela-5-teste-ordem.png');
  await foto(host, '1366x768-host-4-sala-modo-teste.png');
  await host.click('text=Desligar modo teste');

  // 5) começar: o celular em cada estado do jogo
  const cookie = (await autenticar(srv.porta, PIN)).cookie;
  const hostWs = new Cliente(srv.porta, 'papel=host', cookie);
  await hostWs.aberto;
  await host.click('.hs-comecar');
  await host.waitForSelector('.hj-grande');
  for (const cor of CORES3) {
    await celulares[cor].waitForSelector('.g-botao[disabled]:has-text("Aguarde")');
    await foto(celulares[cor], `390x844-${cor}-4-fora-da-janela.png`, 150);
  }
  await hostWs.acao('mostrarAlternativas');
  await hostWs.acao('abrirJanela');
  for (const cor of CORES3) {
    await celulares[cor].waitForSelector('.g-botao:has-text("APERTE")');
    await foto(celulares[cor], `390x844-${cor}-5-janela-aberta.png`, 150);
  }
  for (const cor of CORES3) {
    await celulares[cor].click('.g-botao');
    await celulares[cor].waitForSelector('.g-botao.registrado');
    await foto(celulares[cor], `390x844-${cor}-6-registrado.png`, 150);
  }

  // 6) reconectando: o servidor cai e o celular avisa
  hostWs.fechar();
  await srv.fechar();
  for (const cor of CORES3) {
    await celulares[cor].waitForSelector('.g-reconectando');
    await foto(celulares[cor], `390x844-${cor}-8-reconectando.png`, 150);
  }
  await ctxHost.close();
  await ctxTela.close();
  for (const pg of Object.values(celulares)) await pg.context().close();
  fs.rmSync(dir, { recursive: true, force: true });
  return erros;
}

// Estado montado com as regras reais: um grupo ajudante bloqueia a cor da vez e a janela está aberta.
async function cenarioBloqueado(browser, cor) {
  const dir = novaPasta();
  semear(dir);
  let s = G.criarJogo({ perguntas: PERGUNTAS });
  s = G.registrarGrupo(G.registrarGrupo(s, cor, 'Representante'), 'verde', 'Ajudante');
  s = G.iniciar(s);
  s.grupos.find((g) => g.cor === 'verde').habilidades.push({ tipo: 'bloqueio' });
  s = G.ativarHabilidade(s, 'verde', 'bloqueio', cor);
  s = G.abrirJanela(G.mostrarAlternativas(s));
  fs.writeFileSync(path.join(dir, 'jogo.json'), JSON.stringify({
    estado: s,
    tokens: { [cor]: `tok-${cor}`, verde: 'tok-verde' },
    ui: { cena: 'jogo', corSelecionada: null, ip: null, regras: false, tema: TEMA || 'claro' },
    janelaRestanteMs: 25000,
  }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([chave, valor]) => { try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ } }, [`oficina_token_${cor}`, `tok-${cor}`]);
  const pg = await ctx.newPage();
  await pg.goto(`http://127.0.0.1:${srv.porta}/g/${cor}`);
  await pg.waitForSelector('.g-botao.bloqueado');
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: path.join(SAIDA, `390x844-${cor}-7-bloqueado.png`) });
  await ctx.close();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
}

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  for (const f of fs.readdirSync(SAIDA)) if (/^(1920x1080-tela-\d|1366x768-host-\d|390x844-)/.test(f)) fs.rmSync(path.join(SAIDA, f));
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const erros = await fluxoAoVivo(browser);
  for (const cor of CORES3) await cenarioBloqueado(browser, cor);
  await browser.close();
  if (erros.length) console.log('Erros no navegador:', erros);
  console.log('Capturas em', SAIDA);
})().catch((e) => { console.error(e); process.exit(1); });
