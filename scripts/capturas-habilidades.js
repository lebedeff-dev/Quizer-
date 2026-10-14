'use strict';
// Capturas da Etapa 7: node scripts/capturas-habilidades.js   (TEMA=claro|noturno grava em capturas/<tema>/)
// Conduz duas partidas (Bloqueio e Dobro) e fotografa 3 quadros de cada momento:
//   ganhar, ativar, em jogo e desfecho. /tela em 1920x1080 e celular em 390x844.
// Os quadros são tirados em instantes fixos depois do gatilho (ms), então saem parecidos a cada execução.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo } = require('../test/ajuda');
const { pastaCapturas, temaInicial } = require('./util-tema');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function cenario(browser, nome, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oficina-hab-${nome}-`));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' }); // 127.0.0.1 já é o responsável
  await temaInicial(srv);
  const base = `http://127.0.0.1:${srv.porta}`;
  const erros = [];
  const vigiar = (pg, r) => {
    pg.on('pageerror', (e) => erros.push(`${r}: ${e}`));
    pg.on('console', (m) => m.type() === 'error' && !/ERR_CONNECTION|401/.test(m.text()) && erros.push(`${r}: ${m.text()}`));
  };
  const ws = new Cliente(srv.porta, 'papel=host');
  await ws.aberto;
  await ws.acao('novoJogo', {});

  const ctxTela = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tela = await ctxTela.newPage();
  vigiar(tela, 'tela');
  await tela.goto(`${base}/tela`);

  const celular = async (cor, nomeRep) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    vigiar(pg, `cel-${cor}`);
    await pg.goto(`${base}/g/${cor}`);
    await pg.waitForSelector('#g-nome');
    await pg.fill('#g-nome', nomeRep);
    await pg.click('.g-entrar');
    await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
    return pg;
  };

  const ctxo = { srv, ws, tela, celular, base, erros };
  try { await fn(ctxo); } finally {
    await browser.contexts().reduce(async (p, c) => { await p; await c.close(); }, Promise.resolve());
    ws.fechar();
    await srv.fechar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return erros;
}

// Tira quadros em instantes fixos (ms) contados a partir de `t0`.
async function quadros(pg, arquivoBase, instantes, t0, opcoes = {}) {
  for (let i = 0; i < instantes.length; i += 1) {
    const falta = instantes[i] - (Date.now() - t0);
    if (falta > 0) await pausa(falta);
    await pg.screenshot({ path: path.join(pastaCapturas, `${arquivoBase}-${i + 1}.png`), ...opcoes });
  }
}

// Posiciona as animações CSS em instantes exatos (ms desde o início) e fotografa: quadros determinísticos.
async function quadrosAnim(pg, arquivoBase, tempos, opcoes = {}) {
  for (let i = 0; i < tempos.length; i += 1) {
    await pg.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), tempos[i]);
    await pg.screenshot({ path: path.join(pastaCapturas, `${arquivoBase}-${i + 1}.png`), ...opcoes });
  }
}

const certa = (ws) => ws.ultimo.pergunta.correta;
const ok = async (ws, nome, ...a) => { const r = await ws.acao(nome, ...a); if (r.t !== 'ok') throw new Error(`${nome}: ${r.msg}`); };

// Rodada em que `quem` aperta (pelo celular de verdade) e acerta.
async function rodadaAcerto(ws, pgQuem, { parar = false } = {}) {
  await ok(ws, 'mostrarAlternativas');
  await ok(ws, 'abrirJanela');
  await pgQuem.waitForSelector('.g-botao:has-text("APERTE")');
  await pgQuem.click('.g-botao');
  await ws.estadoApos((s) => s.estado.rodada.ordem.length >= 1);
  if (ws.ultimo.estado.fase === 'janela') await ok(ws, 'encerrarJanela'); // fecha sozinha quando todos os aptos apertaram
  await ok(ws, 'mostrarResposta');
  await ok(ws, 'responder', certa(ws));
  if (parar) return;
  for (const g of ws.ultimo.estado.grupos) if (g.oferta) await ok(ws, 'decidirOferta', g.cor, null);
  await ok(ws, 'continuar');
}

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const todos = [];

  // ---------- A: Bloqueio ----------
  todos.push(...await cenario(browser, 'bloqueio', async ({ ws, tela, celular, srv }) => {
    const pgV = await celular('vermelho', 'Vera Lúcia');
    const pgA = await celular('azul', 'Bruno Alves');
    await ws.estadoApos((s) => s.estado.grupos.length === 2);
    await ok(ws, 'iniciar');
    await rodadaAcerto(ws, pgV);
    await rodadaAcerto(ws, pgV);
    await rodadaAcerto(ws, pgV, { parar: true }); // 3º acerto: oferta de Bloqueio

    // GANHAR: o responsável aceita; o ícone entra na /tela e no celular do grupo
    await ok(ws, 'decidirOferta', 'vermelho', 'bloqueio');
    let t0 = Date.now();
    await Promise.all([
      quadrosAnim(tela, '1920x1080-hab-bloqueio-1-ganhar', [80, 350, 1100]),
      quadrosAnim(pgV, '390x844-hab-bloqueio-1-ganhar', [80, 350, 1100]),
    ]);
    await pausa(1200);
    await ok(ws, 'continuar');

    // ATIVAR: tela cheia na cor do alvo, o ícone cai sobre ela
    await ok(ws, 'ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
    t0 = Date.now();
    await quadrosAnim(tela, '1920x1080-hab-bloqueio-2-ativar', [250, 800, 1500]);
    await pausa(1000);

    await tela.waitForSelector('.ativacao', { state: 'detached' }); // a tela cheia some sozinha
    // EM JOGO: aviso na pergunta e a linha "bloqueado" na ordem, com o ícone em movimento sutil
    t0 = Date.now();
    await quadrosAnim(tela, '1920x1080-hab-bloqueio-3-em-jogo', [0, 600, 1200], { clip: { x: 360, y: 280, width: 1200, height: 560 } });
    await quadrosAnim(pgV, '390x844-hab-bloqueio-3-em-jogo', [0, 600, 1200]);
    await ok(ws, 'mostrarAlternativas');
    await ok(ws, 'abrirJanela');
    await pgV.waitForSelector('.g-botao:has-text("APERTE")');
    await pgA.waitForSelector('.g-botao.bloqueado');
    t0 = Date.now();
    // DESFECHO: o alvo fica com o botão cinza no celular
    await quadros(pgA, '390x844-hab-bloqueio-4-desfecho-alvo', [0, 400, 800], t0);
    await pgV.click('.g-botao');
    await ws.estadoApos((s) => s.estado.rodada.ordem.length >= 1 || s.estado.fase !== 'janela');
    if (ws.ultimo.estado.fase === 'janela') await ok(ws, 'encerrarJanela'); // fecha sozinha quando todos os aptos apertaram
    await tela.waitForSelector('.habs-rodada');
    t0 = Date.now();
    await quadros(tela, '1920x1080-hab-bloqueio-4-ordem', [100, 700, 1300], t0);
    void srv;
  }));

  // ---------- B: Dobro ----------
  todos.push(...await cenario(browser, 'dobro', async ({ ws, tela, celular, srv }) => {
    const pgV = await celular('vermelho', 'Vera Lúcia');
    const pgA = await celular('azul', 'Bruno Alves');
    await ws.estadoApos((s) => s.estado.grupos.length === 2);
    await ok(ws, 'iniciar');
    for (let i = 0; i < 4; i += 1) await rodadaAcerto(ws, pgV); // recusa o Bloqueio do 3º
    await rodadaAcerto(ws, pgV, { parar: true }); // 5º acerto: oferta do Dobro
    await ok(ws, 'decidirOferta', 'vermelho', 'dobro');

    // GANHAR
    let t0 = Date.now();
    await Promise.all([
      quadrosAnim(tela, '1920x1080-hab-dobro-1-ganhar', [80, 350, 1100]),
      quadrosAnim(pgV, '390x844-hab-dobro-1-ganhar', [80, 350, 1100]),
    ]);
    await pausa(1200);
    await ok(ws, 'continuar');

    // ATIVAR: "x2" surge e pulsa sobre a cor do grupo
    await ok(ws, 'ativarHabilidade', 'vermelho', 'dobro');
    t0 = Date.now();
    await quadrosAnim(tela, '1920x1080-hab-dobro-2-ativar', [250, 800, 1500]);
    await pausa(1000);

    await tela.waitForSelector('.ativacao', { state: 'detached' }); // a tela cheia some sozinha
    // EM JOGO
    t0 = Date.now();
    await quadrosAnim(tela, '1920x1080-hab-dobro-3-em-jogo', [0, 600, 1200], { clip: { x: 360, y: 280, width: 1200, height: 560 } });
    await quadrosAnim(pgV, '390x844-hab-dobro-3-em-jogo', [0, 600, 1200]);

    // DESFECHO: os pontos sobem de 10 para 20
    await ok(ws, 'mostrarAlternativas');
    await ok(ws, 'abrirJanela');
    await pgV.waitForSelector('.g-botao:has-text("APERTE")');
    await pgV.click('.g-botao');
    await ws.estadoApos((s) => s.estado.rodada.ordem.length >= 1);
    if (ws.ultimo.estado.fase === 'janela') await ok(ws, 'encerrarJanela'); // fecha sozinha quando todos os aptos apertaram
    await ok(ws, 'mostrarResposta');
    await ok(ws, 'responder', certa(ws));
    t0 = Date.now();
    await quadros(tela, '1920x1080-hab-dobro-4-desfecho-pontos', [150, 900, 2000], t0);
    void srv; void pgA;
  }));

  await browser.close();
  console.log(todos.length ? `Erros no navegador:\n${todos.join('\n')}` : `Capturas em ${pastaCapturas}. Sem erros no console.`);
  if (todos.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
