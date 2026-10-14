'use strict';
// Capturas da Etapa 8c (aleatorizar ordem, troféu no ranking e placar parcial): node scripts/capturas-8c.js   (TEMA=claro|noturno)
// Painel no notebook (1366x768) e no celular (390x844), /tela (1920x1080 e 1366x768) e celular do grupo.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, ajustarPontosNoServidor } = require('../test/ajuda');
const { pastaCapturas, temaInicial, conferirBotaoTema } = require('./util-tema');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const erros = [];

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8c-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const base = `http://127.0.0.1:${srv.porta}`;
  const ws = new Cliente(srv.porta, 'papel=host');
  await ws.aberto;
  const ok = async (nome, ...a) => { const r = await ws.acao(nome, ...a); if (r.t !== 'ok') throw new Error(`${nome}: ${r.msg}`); };
  await ws.acao('novoJogo', {});

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const vigiar = (pg, r) => {
    pg.on('pageerror', (e) => erros.push(`${r}: ${e}`));
    pg.on('console', (m) => m.type() === 'error' && !/ERR_CONNECTION|401/.test(m.text()) && erros.push(`${r}: ${m.text()}`));
  };
  const nova = async (w, h, mobile = false) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const pg = await ctx.newPage();
    vigiar(pg, `${w}x${h}`);
    return pg;
  };
  const tela = await nova(1920, 1080);
  await tela.goto(`${base}/tela`);
  const celV = await nova(390, 844, true);
  await celV.goto(`${base}/g/vermelho`);
  await celV.waitForSelector('#g-nome');
  await celV.fill('#g-nome', 'Vera Lúcia');
  await celV.click('.g-entrar');
  await celV.waitForSelector('.g-msg h2:has-text("Aguarde")');
  const fones = {};
  for (const cor of ['azul', 'verde']) fones[cor] = (await entrarGrupo(srv.porta, cor, `Rep ${cor}`)).c;
  await ws.estadoApos((s) => s.estado.grupos.length === 3 && s.estado.grupos.every((g) => g.conectado));

  const host = await nova(1366, 768);
  await host.goto(`${base}/host`);
  const hostM = await nova(390, 844, true);
  await hostM.goto(`${base}/host`);

  const salvar = async (pg, nome, { cheia = false } = {}) => {
    await pg.waitForTimeout(350);
    await pg.screenshot({ path: path.join(pastaCapturas, `${nome}.png`), fullPage: cheia });
  };
  const hostAmbos = async (nome, { cheiaM = false } = {}) => {
    await salvar(host, `1366x768-8c-${nome}`);
    await salvar(hostM, `390x844-8c-host-${nome}`, { cheia: cheiaM });
    const sw = await hostM.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (sw[0] > sw[1]) erros.push(`painel no celular ${nome}: rolagem horizontal ${sw[0]} > ${sw[1]}`);
    await conferirBotaoTema(hostM, `painel no celular ${nome}`, erros);
    const sn = await host.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (sn[0] > sn[1]) erros.push(`painel no notebook ${nome}: rolagem horizontal ${sn[0]} > ${sn[1]}`);
  };

  // ---------- 8c-1: editor, aleatorizar ordem ----------
  await ok('irEditor');
  await host.waitForSelector('.ed-item');
  await salvar(host, '1366x768-8c-01-editor-aleatorizar');
  const primeiros = await host.$$eval('.ed-item', (n) => n.slice(0, 3).map((x) => x.textContent.slice(0, 40)));
  await host.click('.ed-topo button:has-text("Aleatorizar ordem")');
  await host.waitForSelector('.ed-modal .painel');
  await salvar(host, '1366x768-8c-02-aleatorizar-confirmar');
  await host.click('.ed-modal button:has-text("Aleatorizar")');
  await host.waitForSelector('.ed-topo button:has-text("Desfazer ordem")');
  await salvar(host, '1366x768-8c-03-aleatorizado-com-desfazer');
  const depois = await host.$$eval('.ed-item', (n) => n.slice(0, 3).map((x) => x.textContent.slice(0, 40)));
  if (JSON.stringify(primeiros) === JSON.stringify(depois)) erros.push('a ordem não mudou depois de aleatorizar');
  await host.click('.ed-topo button:has-text("Desfazer ordem")');
  await host.waitForFunction((p) => JSON.stringify([...document.querySelectorAll('.ed-item')].slice(0, 3).map((x) => x.textContent.slice(0, 40))) === p, JSON.stringify(primeiros));
  await ok('irMenu');
  await ok('continuarJogo');
  await ok('iniciar');
  await host.waitForSelector('.hj-grande');
  await hostM.waitForSelector('.hj-grande');

  // ---------- partida: vermelho 4, azul 3 acertos; depois ajustes para empate no topo e saldo negativo ----------
  const estado = () => ws.ultimo.estado;
  const certa = () => ws.ultimo.pergunta.correta;
  const clique = async (cor) => {
    const antes = estado().rodada.ordem.length;
    if (cor === 'vermelho') { await celV.waitForSelector('.g-botao:has-text("APERTE")'); await celV.click('.g-botao'); } else fones[cor].enviar({ t: 'apertar' });
    await ws.estadoApos((s) => s.estado.rodada.ordem.length > antes || s.estado.fase !== 'janela');
  };
  const rodada = async (cor, { parar = false } = {}) => {
    await ok('mostrarAlternativas');
    await ok('abrirJanela');
    await clique(cor);
    await ok('encerrarJanela');
    await ok('mostrarResposta');
    await ok('responder', certa());
    if (parar) return;
    for (const g of estado().grupos) if (g.oferta) await ok('decidirOferta', g.cor, null);
    await ok('continuar');
  };
  const seq = ['vermelho', 'azul', 'vermelho', 'azul', 'vermelho', 'azul', 'vermelho'];
  await ajustarPontosNoServidor({ srv, host: ws }, 'azul', 10);
  await ajustarPontosNoServidor({ srv, host: ws }, 'verde', -15);
  for (let i = 0; i < seq.length - 1; i += 1) await rodada(seq[i]);
  await rodada(seq[6], { parar: true });
  await tela.waitForSelector('.explicacao');
  for (const g of estado().grupos) if (g.oferta) await ok('decidirOferta', g.cor, null);
  await host.waitForSelector('.hg-pontos.neg');
  await host.waitForFunction(() => document.querySelector('.hj-grande'));
  await hostAmbos('04-sinal-menos-nos-cartoes', { cheiaM: true });
  await ok('continuar'); // 7ª respondida: placar parcial
  await tela.waitForSelector('.c-placar');
  await salvar(tela, '1920x1080-8c-placar-parcial');
  await celV.waitForSelector('.g-msg h2:has-text("Placar na tela")');
  await salvar(celV, '390x844-8c-cel-placar-na-tela');
  await host.waitForSelector('.hj-cartao h2:has-text("Placar na tela")');
  await hostAmbos('05-placar-no-painel', { cheiaM: true });
  const tela2 = await nova(1366, 768);
  await tela2.goto(`${base}/tela`);
  await tela2.waitForSelector('.c-placar');
  await salvar(tela2, '1366x768-8c-placar-parcial');
  await ok('continuar');

  // ---------- Regras, página 1 (menciona o placar) ----------
  await ok('regras', 1);
  await tela.waitForSelector('.regras-pagina');
  await salvar(tela, '1920x1080-8c-regras-1');
  await ok('regras', false);

  // ---------- até o Ranking (troféu nos empatados no topo) ----------
  while (estado().fase !== 'ranking') await rodada(seq[estado().respondidas % 2 === 0 ? 0 : 1]);
  await ajustarPontosNoServidor({ srv, host: ws }, 'azul', estado().grupos.find((g) => g.cor === 'vermelho').pontos - estado().grupos.find((g) => g.cor === 'azul').pontos);
  await tela.waitForSelector('.rank-trofeu');
  await salvar(tela, '1920x1080-8c-ranking-trofeu');
  await tela2.waitForSelector('.rank-trofeu');
  await salvar(tela2, '1366x768-8c-ranking-trofeu');
  await host.waitForSelector('.hr-trofeu');
  await hostAmbos('06-ranking-trofeu', { cheiaM: true });
  await ok('irEditor');
  await host.waitForSelector('.ed-motivo');
  await salvar(host, '1366x768-8c-07-aleatorizar-bloqueado');
  await ok('irMenu');

  // ---------- Configurações (placar parcial) ----------
  await ok('irConfig');
  await host.waitForSelector('#cfg-placarModo');
  await hostM.waitForSelector('#cfg-placarModo');
  await salvar(host, '1366x768-8c-08-config-placar', { cheia: true });
  await salvar(hostM, '390x844-8c-host-08-config-placar', { cheia: true });
  const sw = await hostM.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  if (sw[0] > sw[1]) erros.push(`config no celular: rolagem horizontal ${sw[0]} > ${sw[1]}`);
  await conferirBotaoTema(hostM, 'config no celular', erros);

  await browser.close();
  Object.values(fones).forEach((c) => c.fechar());
  ws.fechar();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}. Sem rolagem horizontal, sem sobreposição e sem erros.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
