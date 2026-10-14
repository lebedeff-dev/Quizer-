'use strict';
// Capturas da 8l: o time Preto/Branco por tema. Seleção de cores e QR, celulares Preto/Branco, Amarelo e Azul, ranking com o
// Preto/Branco em 1º, banner de parabéns e o aviso do painel quando o tema muda. node scripts/capturas-8l.js (TEMA=claro|noturno)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente } = require('../test/ajuda');
const { TEMA, pastaCapturas, temaInicial } = require('./util-tema');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const erros = [];
const OUTRO = TEMA === 'noturno' ? 'claro' : 'noturno';

async function foto(pg, nome, espera = 450) {
  await pg.waitForTimeout(espera);
  const [sw, iw, texto] = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.body.innerText]);
  if (sw > iw) erros.push(`${nome}: rolagem horizontal`);
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

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8l-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { meta: 2, placarModo: 'desligado' } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const base = `http://127.0.0.1:${srv.porta}`;
  const host = new Cliente(srv.porta, 'papel=host');
  await host.aberto;
  const ok = async (nome, ...a) => { const r = await host.acao(nome, ...a); if (r.t !== 'ok') throw new Error(`${nome}: ${r.msg}`); };
  await ok('novoJogo', {});
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const tela = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const painel = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await tela.goto(`${base}/tela`);
  await painel.goto(`${base}/host`);
  await tela.waitForSelector('.bloco');
  await painel.waitForSelector('.hs-ficha');

  // seleção de cores e QR do Preto/Branco
  await foto(tela, `8l-1366x768-tela-selecao-de-cores`);
  await foto(painel, `8l-1366x768-host-selecao-de-cores`);
  await ok('selecionarCor', 'preto');
  await tela.waitForSelector('.qr-cartao');
  await foto(tela, `8l-1366x768-tela-qr-preto-ou-branco`);
  await ok('selecionarCor', null);

  // celulares
  const pgPreto = await celular(browser, base, 'preto', 'Ana');
  const pgAma = await celular(browser, base, 'amarelo', 'Bia');
  const pgAzul = await celular(browser, base, 'azul', 'Clara');
  await host.estadoApos((s) => s.estado.grupos.length === 3 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  for (const [pg, cor] of [[pgPreto, 'preto'], [pgAma, 'amarelo'], [pgAzul, 'azul']]) {
    await pg.waitForSelector('.g-botao:has-text("APERTE")');
    await foto(pg, `8l-390x844-cel-${cor === 'preto' ? 'preto-ou-branco' : cor}`, 200);
  }
  // ranking com o Preto/Branco em 1º
  await pgPreto.click('.g-botao');
  await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
  await ok('encerrarJanela'); await ok('mostrarResposta'); await ok('responder', host.ultimo.pergunta.correta); await ok('continuar');
  await ok('mostrarAlternativas'); await ok('abrirJanela');
  await pgPreto.waitForSelector('.g-botao:has-text("APERTE")');
  await pgPreto.click('.g-botao');
  await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
  await ok('encerrarJanela'); await ok('mostrarResposta'); await ok('responder', host.ultimo.pergunta.correta); await ok('continuar');
  await host.estadoApos((s) => s.estado.fase === 'ranking' && s.vencedor === 'preto');
  await tela.waitForSelector('.rank-barra');
  await painel.waitForSelector('.hr-linha');
  await foto(tela, `8l-1366x768-tela-ranking-preto-ou-branco-em-1o`);
  await foto(painel, `8l-1366x768-host-ranking-preto-ou-branco-em-1o`);

  // banner de parabéns e pop-up
  await ok('comemorar');
  await tela.waitForSelector('.comem-banner');
  await pgPreto.waitForSelector('.g-parabens');
  await new Promise((r) => setTimeout(r, 1800));
  await foto(tela, `8l-1366x768-tela-banner-de-parabens-preto-ou-branco`, 0);
  await foto(pgPreto, `8l-390x844-cel-preto-ou-branco-popup-comemoracao`, 0);
  await foto(pgAzul, `8l-390x844-cel-azul-popup-comemoracao`, 0);

  // aviso do painel: o tema muda e o time Preto/Branco está em uso
  await ok('definirTema', OUTRO);
  await painel.waitForFunction((t) => document.documentElement.dataset.tema === t, OUTRO);
  await painel.waitForTimeout(500);
  await ok('definirTema', TEMA || 'claro');
  await painel.waitForSelector('.aviso-tema');
  await foto(painel, `8l-1366x768-host-aviso-de-tema`, 300);
  await foto(tela, `8l-1366x768-tela-banner-depois-de-alternar-o-tema`, 500);
  await foto(pgPreto, `8l-390x844-cel-preto-ou-branco-depois-de-alternar`, 300);

  host.fechar();
  await browser.close();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
