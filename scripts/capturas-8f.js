'use strict';
// Capturas da Etapa 8f (acertos seguidos viram moeda): node scripts/capturas-8f.js   (TEMA=claro|noturno)
// Celulares (390x844), painel no notebook (1366x768) e no celular (390x844) e a /tela (1366x768).
// Estados: contador em 2, 3, 5 e 7; lista da faixa; confirmação; estoque cheio com troca; botão desabilitado com motivo;
// painel com pontinhos e a reserva "No lugar do grupo"; resultado no projetor.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente } = require('../test/ajuda');
const { pastaCapturas, temaInicial, conferirBotaoTema } = require('./util-tema');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const erros = [];

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8f-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const base = `http://127.0.0.1:${srv.porta}`;
  const ws = new Cliente(srv.porta, 'papel=host');
  await ws.aberto;
  const ok = async (nome, ...a) => { const r = await ws.acao(nome, ...a); if (r.t !== 'ok') throw new Error(`${nome}: ${r.msg}`); };
  await ws.acao('novoJogo', {});
  await ok('salvarConfigJogo', { meta: 40, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5, placarModo: 'desligado' });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const nova = async (w, h, mobile = false) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => erros.push(`${w}x${h}: ${e}`));
    pg.on('console', (m) => m.type() === 'error' && !/ERR_CONNECTION|401/.test(m.text()) && erros.push(`${w}x${h}: ${m.text()}`));
    return pg;
  };
  const cel = {};
  for (const [cor, nome] of [['vermelho', 'Vera Lúcia'], ['azul', 'André Luiz']]) {
    const pg = await nova(390, 844, true);
    await pg.goto(`${base}/g/${cor}`);
    await pg.waitForSelector('#g-nome');
    await pg.fill('#g-nome', nome);
    await pg.click('.g-entrar');
    await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
    cel[cor] = pg;
  }
  await ws.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  const tela = await nova(1366, 768);
  await tela.goto(`${base}/tela`);
  const host = await nova(1366, 768);
  await host.goto(`${base}/host`);
  const hostM = await nova(390, 844, true);
  await hostM.goto(`${base}/host`);
  await host.waitForSelector('.hj-grande');
  await hostM.waitForSelector('.hj-grande');

  const salvar = async (pg, nome, cheia = false) => { await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(pastaCapturas, `${nome}.png`), fullPage: cheia }); };
  const foto = async (cor, nome) => {
    const pg = cel[cor];
    await pg.waitForSelector('.g-ganho', { state: 'detached', timeout: 6000 }).catch(() => {});
    await salvar(pg, `390x844-8f-cel-${cor}-${nome}`);
    const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (sw[0] > sw[1]) erros.push(`celular ${cor} ${nome}: rolagem horizontal ${sw[0]} > ${sw[1]}`);
  };
  const hostAmbos = async (nome, cheiaM = false) => {
    await salvar(host, `1366x768-8f-${nome}`);
    await salvar(hostM, `390x844-8f-host-${nome}`, cheiaM);
    for (const [pg, rot] of [[host, 'notebook'], [hostM, 'celular']]) {
      const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      if (sw[0] > sw[1]) erros.push(`painel no ${rot} ${nome}: rolagem horizontal ${sw[0]} > ${sw[1]}`);
    }
    await conferirBotaoTema(hostM, `painel no celular ${nome}`, erros);
  };
  const toque = async (cor, sel) => { await cel[cor].click(sel); await cel[cor].waitForTimeout(150); };
  const estado = () => ws.ultimo.estado;
  const certa = () => ws.ultimo.pergunta.correta;
  const rodada = async (cor, { parar = false } = {}) => {
    await ok('mostrarAlternativas');
    await ok('abrirJanela');
    const antes = estado().rodada.ordem.length;
    await cel[cor].waitForSelector('.g-botao:has-text("APERTE")');
    await cel[cor].click('.g-botao');
    await ws.estadoApos((s) => s.estado.rodada.ordem.length > antes || s.estado.fase !== 'janela');
    await ok('encerrarJanela');
    await ok('mostrarResposta');
    await ok('responder', certa());
    if (!parar) await ok('continuar');
  };
  const contador = async (cor, n) => { await cel[cor].waitForSelector(`.g-acertos-txt:has-text("Acertos seguidos: ${n} de 7")`); };
  const marcas = async (cor, n) => {
    const cheias = await cel[cor].$$eval('.g-marcas i.cheia', (x) => x.length);
    const total = await cel[cor].$$eval('.g-marcas i', (x) => x.length);
    if (cheias !== n || total !== 7) erros.push(`celular ${cor}: ${cheias} de ${total} marcas (esperava ${n} de 7)`);
  };

  // ---------- vermelho: 2 acertos (botão desabilitado com motivo) ----------
  await rodada('vermelho');
  await rodada('vermelho', { parar: true });
  await contador('vermelho', 2);
  await marcas('vermelho', 2);
  await cel.vermelho.waitForSelector('.g-troca-btn[disabled]');
  await foto('vermelho', '01-contador-2-desabilitado');
  await hostAmbos('01-pontinhos-2');
  await ok('continuar');

  // ---------- 3 acertos: botão habilitado, lista da faixa e confirmação ----------
  await rodada('vermelho', { parar: true });
  await contador('vermelho', 3);
  await marcas('vermelho', 3);
  await cel.vermelho.waitForSelector('.g-troca-btn:not([disabled])');
  await foto('vermelho', '02-contador-3');
  await toque('vermelho', '.g-troca-btn');
  await cel.vermelho.waitForSelector('.g-folha .g-fitem');
  if ((await cel.vermelho.$$eval('.g-folha .g-fitem', (x) => x.length)) !== 3) erros.push('faixa de 3 acertos: esperava 3 habilidades');
  await foto('vermelho', '03-lista-faixa-3');
  await toque('vermelho', '.g-fitem:has-text("Escudo")');
  await foto('vermelho', '04-confirmar-troca');
  await toque('vermelho', '.g-fbtn:has-text("Voltar")');
  await toque('vermelho', '.g-fbtn:has-text("Fechar")');
  await ok('continuar');

  // ---------- 5 acertos ----------
  await rodada('vermelho');
  await rodada('vermelho', { parar: true });
  await contador('vermelho', 5);
  await marcas('vermelho', 5);
  await foto('vermelho', '05-contador-5');
  await toque('vermelho', '.g-troca-btn');
  await cel.vermelho.waitForSelector('.g-folha .g-fitem');
  if ((await cel.vermelho.$$eval('.g-folha .g-fitem', (x) => x.length)) !== 4) erros.push('faixa de 5 acertos: esperava 4 habilidades');
  await foto('vermelho', '06-lista-faixa-5');
  await toque('vermelho', '.g-fbtn:has-text("Fechar")');
  await ok('continuar');

  // ---------- 7 acertos: lista com 5 habilidades, que rola; o contador para em 7 ----------
  await rodada('vermelho');
  await rodada('vermelho', { parar: true });
  await contador('vermelho', 7);
  await marcas('vermelho', 7);
  await foto('vermelho', '07-contador-7');
  await toque('vermelho', '.g-troca-btn');
  await cel.vermelho.waitForSelector('.g-folha .g-fitem');
  if ((await cel.vermelho.$$eval('.g-folha .g-fitem', (x) => x.length)) !== 5) erros.push('faixa de 7 acertos: esperava 5 habilidades');
  await foto('vermelho', '08-lista-faixa-7');
  await cel.vermelho.evaluate(() => { const f = document.querySelector('.g-folha'); f.scrollTop = f.scrollHeight; });
  await foto('vermelho', '09-lista-faixa-7-fim-da-folha');
  const alcance = await cel.vermelho.evaluate(() => { const b = [...document.querySelectorAll('.g-folha .g-fbtn')].pop().getBoundingClientRect(); return b.bottom <= innerHeight + 1 && b.top >= 0; });
  if (!alcance) erros.push('faixa de 7: o último botão não fica visível ao rolar a folha');
  await toque('vermelho', '.g-fbtn:has-text("Fechar")');
  await ok('continuar');
  await rodada('vermelho', { parar: true }); // 8º acerto: o contador continua em 7
  await contador('vermelho', 7);
  await ok('continuar');

  // ---------- painel: pontinhos, botão de reserva e janela de compra ----------
  await host.waitForSelector('.hg-comprar');
  await hostAmbos('02-pontinhos-7-e-reserva', true);
  await host.click('.hg-cartao:has-text("Vermelho") .hg-comprar');
  await hostM.click('.hg-cartao:has-text("Vermelho") .hg-comprar');
  await host.waitForSelector('.hj-modal');
  await hostAmbos('03-reserva-comprar-habilidade');
  await host.click('.hj-modal button:has-text("Cancelar")');
  await hostM.click('.hj-modal button:has-text("Cancelar")');

  // ---------- compra pelo celular e resultado no projetor (antes da janela) ----------
  await toque('vermelho', '.g-troca-btn');
  await toque('vermelho', '.g-fitem:has-text("Dica 50/50")');
  await toque('vermelho', '.g-fbtn:has-text("Confirmar")');
  await cel.vermelho.waitForSelector('.g-folha', { state: 'detached' });
  await contador('vermelho', 0);
  await tela.waitForSelector('.hab-pilula:has-text("trocou 7 acertos por Dica 50/50")');
  await salvar(tela, '1366x768-8f-projetor-resultado-da-troca');
  await foto('vermelho', '10-depois-da-troca');

  // ---------- botão desabilitado fora da faixa de fases e janela aberta ----------
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  await cel.vermelho.waitForSelector('.g-botao:has-text("APERTE")');
  await foto('vermelho', '11-janela-aberta-so-o-contador');
  await cel.vermelho.click('.g-botao');
  await ws.estadoApos((s) => s.estado.rodada.ordem.length === 1);
  await ok('encerrarJanela');
  await ok('mostrarResposta');
  await cel.vermelho.waitForSelector('.g-troca-motivo:has-text("Só antes da janela")');
  await foto('vermelho', '12-resposta-desabilitado-com-motivo');
  await ok('responder', certa());
  await ok('continuar');

  // ---------- azul: estoque cheio e troca ----------
  for (let i = 1; i <= 3; i += 1) await rodada('azul', { parar: i === 3 });
  await toque('azul', '.g-troca-btn');
  await toque('azul', '.g-fitem:has-text("Escudo")');
  await toque('azul', '.g-fbtn:has-text("Confirmar")');
  await cel.azul.waitForSelector('.g-folha', { state: 'detached' });
  await ok('continuar');
  for (let i = 1; i <= 3; i += 1) await rodada('azul', { parar: i === 3 });
  await toque('azul', '.g-troca-btn');
  await toque('azul', '.g-fitem:has-text("Passe")');
  await toque('azul', '.g-fbtn:has-text("Confirmar")');
  await cel.azul.waitForSelector('.g-folha', { state: 'detached' });
  await ok('continuar');
  for (let i = 1; i <= 3; i += 1) await rodada('azul', { parar: i === 3 });
  await toque('azul', '.g-troca-btn');
  await toque('azul', '.g-fitem:has-text("Bloqueio")');
  await foto('azul', '13-estoque-cheio-qual-trocar');
  await toque('azul', '.g-fitem:has-text("Trocar Passe")');
  await foto('azul', '14-estoque-cheio-confirmar');
  await toque('azul', '.g-fbtn:has-text("Confirmar")');
  await cel.azul.waitForSelector('.g-folha', { state: 'detached' });

  // ---------- limite de trocas: o 3º uso esgota; com 3 acertos de novo o botão fica desabilitado por limite ----------
  await ok('continuar');
  for (let i = 1; i <= 3; i += 1) await rodada('azul', { parar: i === 3 });
  await contador('azul', 3);
  await cel.azul.waitForSelector('.g-troca-btn[disabled]');
  await cel.azul.waitForSelector('.g-troca-motivo:has-text("Seu grupo já usou as 3 trocas do jogo.")');
  await cel.azul.waitForSelector('.g-trocas-usadas:has-text("Trocas usadas: 3 de 3")');
  await foto('azul', '15-limite-de-trocas-desabilitado');
  await host.waitForSelector('.hg-cartao:has-text("Azul") .hg-tag:has-text("Trocas 3/3")');
  if (await host.$('.hg-cartao:has-text("Azul") .hg-comprar')) erros.push('painel: botão de reserva visível com o limite atingido');
  await hostAmbos('04-limite-de-trocas-cartoes', true);

  await browser.close();
  ws.fechar();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}. Sem rolagem horizontal, sem sobreposição e sem erros.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
