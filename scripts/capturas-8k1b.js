'use strict';
// Capturas da 8k-1b: ícones próprios e inteiros, nome do grupo no lugar do nome da cor, os 10 celulares, ranking com 8 grupos,
// projetor e painel na seleção, Configurações e editor. node scripts/capturas-8k1b.js   (TEMA=claro|noturno grava em capturas/<tema>/)
// Em toda foto confere null/undefined e rolagem horizontal.
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
const erros = [];
const TODAS = ['vermelho', 'azul', 'verde', 'amarelo', 'laranja', 'roxo', 'rosa', 'ciano', 'preto', 'cinza'];
const LONGO = 'Maria Aparecida de Albuquerque Nascimento Souza';

async function subir(config = { placarModo: 'desligado' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8k-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: config }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const host = new Cliente(srv.porta, 'papel=host');
  await host.aberto;
  const ok = async (nome, ...a) => { const r = await host.acao(nome, ...a); if (r.t !== 'ok') throw new Error(`${nome}: ${r.msg}`); };
  await ok('novoJogo', {});
  return { dir, srv, host, ok, base: `http://127.0.0.1:${srv.porta}` };
}

function conferir(nome, texto, larguras) {
  if (/\bnull\b|\bundefined\b/i.test(texto)) erros.push(`${nome}: null/undefined na página`);
  if (larguras[0] > larguras[1]) erros.push(`${nome}: rolagem horizontal ${larguras[0]} > ${larguras[1]}`);
}

async function foto(pg, nome, { cheia = false, espera = 450 } = {}) {
  await pg.waitForTimeout(espera);
  conferir(nome, await pg.evaluate(() => document.body.innerText), await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
  await pg.screenshot({ path: path.join(pastaCapturas, `${nome}.png`), fullPage: cheia });
}

async function entrarNoCelular(browser, base, cor, nome) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => erros.push(`${cor}: ${e}`));
  pg.on('console', (m) => m.type() === 'error' && !/ERR_CONNECTION|401/.test(m.text()) && erros.push(`${cor}: ${m.text()}`));
  await pg.goto(`${base}/g/${cor}`);
  await pg.waitForSelector('#g-nome');
  await pg.fill('#g-nome', nome);
  await pg.click('.g-entrar');
  await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
  return { ctx, pg };
}

// Rodada rápida: o primeiro a apertar acerta (10 pontos).
async function rodadaRapida(S, fones, cor) {
  const { host, ok } = S;
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  fones[cor].enviar({ t: 'apertar' });
  await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
  await ok('encerrarJanela');
  await ok('mostrarResposta');
  await ok('responder', host.ultimo.pergunta.correta);
  await ok('continuar');
}

// ---------- etapa 1: seleção das 10 cores e celulares ----------
async function etapaSelecao(browser) {
  const S = await subir();
  const { host, ok, base, srv } = S;
  const tela = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const telaGrande = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const painel = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  for (const p of [tela, telaGrande, painel]) {
    p.on('pageerror', (e) => erros.push(String(e)));
    p.on('console', (m) => m.type() === 'error' && !/ERR_CONNECTION|401/.test(m.text()) && erros.push(m.text()));
  }
  await tela.goto(`${base}/tela`); await telaGrande.goto(`${base}/tela`); await painel.goto(`${base}/host`);
  await ok('irMenu'); await ok('novoJogo', {});
  await ok('selecionarCor', null);
  await tela.waitForSelector('.bloco'); await telaGrande.waitForSelector('.bloco'); await painel.waitForSelector('.hs-ficha');
  await foto(tela, '1366x768-tela-selecao-10-cores');
  await foto(telaGrande, '1920x1080-tela-selecao-10-cores');
  await foto(painel, '1366x768-host-selecao-10-cores');
  for (const cor of ['preto', 'amarelo']) {
    await ok('selecionarCor', cor);
    await tela.waitForSelector('.qr-cartao'); await telaGrande.waitForSelector('.qr-cartao');
    await foto(tela, `1366x768-tela-selecao-qr-${cor}`);
    if (cor === 'preto') await foto(telaGrande, '1920x1080-tela-selecao-qr-preto');
  }
  await ok('selecionarCor', null);

  // 4 celulares de verdade (Preto, Amarelo, Vermelho, Cinza) e 6 simulados
  const cel = {};
  const reps = { preto: LONGO, amarelo: 'Ana', vermelho: 'Bia', cinza: 'Clara', azul: 'Time Azul', verde: 'Verdes', laranja: 'Laranjeiras', roxo: 'Roxos', rosa: 'Rosas', ciano: 'Ciclo' };
  for (const cor of TODAS) cel[cor] = await entrarNoCelular(browser, base, cor, reps[cor]);
  const fones = {};
  await host.estadoApos((s) => s.estado.grupos.length === 10 && s.estado.grupos.every((g) => g.conectado));
  await foto(tela, '1366x768-tela-selecao-todas-ocupadas');
  await foto(painel, '1366x768-host-selecao-todas-ocupadas');
  const painelM = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  await painelM.goto(`${base}/host`);
  await painelM.waitForSelector('.hs-ficha');
  await foto(painelM, '390x844-host-selecao-todas-ocupadas', { cheia: true });
  await painelM.context().close();
  for (const cor of Object.keys(cel)) await foto(cel[cor].pg, `390x844-cel-${cor}-aguarde`, { espera: 150 });

  await ok('iniciar');
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  for (const cor of Object.keys(cel)) { await cel[cor].pg.waitForSelector('.g-botao:has-text("APERTE")'); await foto(cel[cor].pg, `390x844-cel-${cor}-aperte`, { espera: 150 }); }

  // 10 grupos em jogo: janela, ordem e resposta no painel e no projetor
  await foto(painel, '1366x768-host-janela-10-grupos');
  await foto(tela, '1366x768-tela-janela-10-grupos');
  for (const cor of ['amarelo', 'preto', 'cinza', 'vermelho', 'roxo', 'rosa', 'ciano', 'verde', 'laranja', 'azul']) {
    const antes = host.ultimo.estado.rodada.ordem.length;
    (fones[cor] || { enviar: () => cel[cor].pg.click('.g-botao') }).enviar?.({ t: 'apertar' });
    await host.estadoApos((st) => st.estado.rodada.ordem.length > antes || st.estado.fase !== 'janela');
  }
  await host.estadoApos((st) => st.estado.fase === 'ordem');
  await foto(painel, '1366x768-host-ordem-10-grupos');
  await foto(tela, '1366x768-tela-ordem-10-grupos');
  await ok('mostrarResposta');
  await ok('responder', (host.ultimo.pergunta.correta + 1) % 4);
  await foto(painel, '1366x768-host-resposta-errada-10-grupos');
  await foto(tela, '1366x768-tela-resposta-errada-10-grupos');
  await ok('responder', host.ultimo.pergunta.correta);
  await foto(tela, '1366x768-tela-explicacao-10-grupos');
  
  // opacidade 0 desliga as imagens (vale na hora)
  const r = await host.acao('salvarConfigJogo', { meta: 14, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5, imagensOpacidade: 0 });
  if (r.t !== 'ok') throw new Error(r.msg);
  await cel.preto.pg.waitForFunction(() => !document.querySelector('.time-img'));
  await foto(cel.preto.pg, '390x844-cel-preto-sem-imagem');
  await host.acao('salvarConfigJogo', { meta: 14, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5, imagensOpacidade: 12 });

  for (const c of Object.values(cel)) await c.ctx.close();
  for (const c of Object.values(fones)) c.fechar();
  host.fechar();
  await srv.fechar();
  fs.rmSync(S.dir, { recursive: true, force: true });
  await tela.context().close(); await telaGrande.context().close(); await painel.context().close();
}

// ---------- etapa 2: ranking com 8 grupos ----------
async function etapaRanking(browser) {
  const S = await subir();
  const { host, ok, base, srv } = S;
  const grupos = ['vermelho', 'azul', 'verde', 'amarelo', 'laranja', 'preto', 'rosa', 'cinza'];
  const fones = {};
  for (const cor of grupos) fones[cor] = (await entrarGrupo(srv.porta, cor, cor === 'preto' ? LONGO : { vermelho: 'Ana', azul: 'Bia', verde: 'Clara', amarelo: 'Dora', laranja: 'Eva', rosa: 'Fátima', cinza: 'Gabi' }[cor])).c;
  await host.estadoApos((s) => s.estado.grupos.length === 8 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  const ordem = ['amarelo', 'preto', 'amarelo', 'cinza', 'vermelho', 'preto', 'amarelo', 'azul', 'verde', 'preto', 'laranja', 'rosa', 'amarelo', 'cinza'];
  for (const cor of ordem) await rodadaRapida(S, fones, cor);
  await host.estadoApos((s) => s.estado.fase === 'ranking');
  const tela = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const painel = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await tela.goto(`${base}/tela`); await painel.goto(`${base}/host`);
  await tela.waitForSelector('.rank-barra'); await painel.waitForSelector('.hr-linha');
  await foto(tela, '1366x768-tela-ranking-8-grupos');
  await foto(painel, '1366x768-host-ranking-8-grupos');
  const painelM = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  await painelM.goto(`${base}/host`);
  await painelM.waitForSelector('.hr-linha');
  await foto(painelM, '390x844-host-ranking-8-grupos', { cheia: true });
  await painelM.context().close();
  for (const c of Object.values(fones)) c.fechar();
  host.fechar();
  await srv.fechar();
  fs.rmSync(S.dir, { recursive: true, force: true });
  await tela.context().close(); await painel.context().close();
}

// ---------- etapa 3: Configurações ----------
async function etapaConfiguracoes(browser) {
  const S = await subir({});
  const { host, ok, base, srv } = S;
  await ok('irMenu');
  for (const [rotulo, vp, mobile] of [['1366x768', { width: 1366, height: 768 }, false], ['390x844', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => erros.push(String(e)));
    await ok('irMenu');
    await pg.goto(`${base}/host`);
    await pg.waitForSelector('.opcao');
    await pg.click('.menu-extra >> text=Configurações');
    await pg.waitForSelector('#cfg-meta');
    await foto(pg, `${rotulo}-host-configuracoes`, { cheia: true });
    await pg.fill('#cfg-imagensOpacidade', '45');
    await pg.click('button:has-text("Salvar")');
    await pg.waitForSelector('.msg-erro:not([hidden])');
    await foto(pg, `${rotulo}-host-configuracoes-erro`, { cheia: true });
    await ctx.close();
  }
  // editor de perguntas: a barra de cima não muda de lugar depois de Aleatorizar
  const ed = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await ok('irMenu');
  await ed.goto(`${base}/host`);
  await ed.waitForSelector('.opcao');
  await ed.click('.opcao:has-text("editar perguntas")');
  await ed.waitForSelector('#ed-aleatorizar');
  await foto(ed, '1366x768-host-editor-antes-de-aleatorizar');
  await ed.click('#ed-aleatorizar');
  await foto(ed, '1366x768-host-editor-modal-aleatorizar');
  await ed.click('.sobreposicao button:has-text("Aleatorizar")');
  await ed.waitForSelector('.sobreposicao', { state: 'detached' });
  await foto(ed, '1366x768-host-editor-depois-de-aleatorizar');
  host.fechar();
  await srv.fechar();
  fs.rmSync(S.dir, { recursive: true, force: true });
}

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  await etapaSelecao(browser);
  await etapaRanking(browser);
  await etapaConfiguracoes(browser);
  await browser.close();
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}. Sem null/undefined e sem rolagem horizontal.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
