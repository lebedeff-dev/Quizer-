'use strict';
// Capturas da 8g: node scripts/capturas-8g.js   (TEMA=claro|noturno)
// 1) tela de espera do celular sem o texto "null"; 2) folha do Escudo sem "Fechar"; 3) o ícone do Passe visível sobre
// o círculo escuro no celular (lista de trocas, estoque, menu de uso), no painel e no projetor.
// Em TODA foto de celular confere que o texto da página não tem "null" nem "undefined".
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente } = require('../test/ajuda');
const { pastaCapturas, temaInicial } = require('./util-tema');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const erros = [];

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8g-'));
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
  for (const [cor, nome] of [['azul', 'Teste'], ['vermelho', 'Vera Lúcia']]) {
    const pg = await nova(390, 844, true);
    await pg.goto(`${base}/g/${cor}`);
    await pg.waitForSelector('#g-nome');
    await pg.fill('#g-nome', nome);
    await pg.click('.g-entrar');
    await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
    cel[cor] = pg;
  }
  const semNull = async (pg, rotulo) => {
    const texto = await pg.evaluate(() => document.body.innerText);
    if (/\bnull\b|\bundefined\b/i.test(texto)) erros.push(`${rotulo}: a página mostra null/undefined: ${JSON.stringify(texto.slice(0, 160))}`);
  };
  const foto = async (cor, nome) => {
    const pg = cel[cor];
    await pg.waitForSelector('.g-ganho', { state: 'detached', timeout: 6000 }).catch(() => {});
    await pg.waitForTimeout(300);
    await semNull(pg, `${cor} ${nome}`);
    await pg.screenshot({ path: path.join(pastaCapturas, `390x844-8g-cel-${cor}-${nome}.png`) });
  };
  await foto('azul', '01-espera-sem-null');

  await ws.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  const tela = await nova(1366, 768);
  await tela.goto(`${base}/tela`);
  const host = await nova(1366, 768);
  await host.goto(`${base}/host`);
  await host.waitForSelector('.hj-grande');

  const estado = () => ws.ultimo.estado;
  const certa = () => ws.ultimo.pergunta.correta;
  const toque = async (cor, sel) => { await cel[cor].click(sel); await cel[cor].waitForTimeout(150); };
  const clique = async (cor) => {
    const antes = estado().rodada.ordem.length;
    await cel[cor].waitForSelector('.g-botao:has-text("APERTE")');
    await cel[cor].click('.g-botao');
    await ws.estadoApos((s) => s.estado.rodada.ordem.length > antes || s.estado.fase !== 'janela');
  };
  const rodada = async (cor, { parar = false } = {}) => {
    await ok('mostrarAlternativas');
    await ok('abrirJanela');
    await clique(cor);
    await ok('encerrarJanela');
    await ok('mostrarResposta');
    await ok('responder', certa());
    if (!parar) await ok('continuar');
  };

  // ---------- vermelho: 3 acertos, lista de trocas com o Passe e compra ----------
  for (let i = 1; i <= 3; i += 1) await rodada('vermelho', { parar: i === 3 });
  await cel.vermelho.waitForSelector('.g-troca-btn:not([disabled])');
  await toque('vermelho', '.g-troca-btn');
  await cel.vermelho.waitForSelector('.g-folha .g-fitem');
  await foto('vermelho', '02-lista-de-trocas-com-passe');
  await toque('vermelho', '.g-fitem:has-text("Passe")');
  await foto('vermelho', '03-confirmar-passe');
  await toque('vermelho', '.g-fbtn:has-text("Confirmar")');
  await cel.vermelho.waitForSelector('.g-folha', { state: 'detached' });
  await ok('continuar');
  await foto('vermelho', '04-estoque-com-passe');
  await host.waitForSelector('.hg-cartao:has-text("Vermelho") .hg-item:has-text("Passe")');
  await host.waitForTimeout(300);
  await host.screenshot({ path: path.join(pastaCapturas, '1366x768-8g-painel-passe-no-cartao.png') });

  // ---------- a rodada do Passe: menu de uso no celular e resultado no projetor ----------
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  await clique('vermelho');
  await clique('azul');
  if (estado().fase === 'janela') await ok('encerrarJanela'); // com os dois grupos apertando a janela já fecha sozinha
  await ok('mostrarResposta');
  await foto('vermelho', '05-chip-do-passe-habilitado');
  await toque('vermelho', '.g-chip[data-tipo="passe"]');
  await cel.vermelho.waitForSelector('.g-folha');
  await foto('vermelho', '05b-confirmar-passe-pelo-chip');
  await toque('vermelho', '.g-fbtn:has-text("Confirmar")');
  await tela.waitForSelector('.ativacao.passe');
  await tela.waitForSelector('.ativacao', { state: 'detached' });
  await tela.waitForSelector('.habs-rodada .hab-selo img');
  await tela.waitForTimeout(300);
  await tela.screenshot({ path: path.join(pastaCapturas, '1366x768-8g-projetor-passe.png') });
  await ok('responder', certa());
  await ok('continuar');

  // ---------- Escudo: azul tem Escudo, vermelho compra Bloqueio e o ativa sobre azul ----------
  for (let i = 1; i <= 3; i += 1) await rodada('azul', { parar: i === 3 });
  await ok('trocarAcertos', 'azul', 'escudo');
  await ok('continuar');
  for (let i = 1; i <= 3; i += 1) await rodada('vermelho', { parar: i === 3 });
  await ok('trocarAcertos', 'vermelho', 'bloqueio');
  await ok('continuar');
  await ok('ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  await cel.azul.waitForSelector('.g-folha:has-text("bloqueou vocês")');
  await foto('azul', '06-decisao-do-escudo-sem-fechar');
  const botoes = await cel.azul.$$eval('.g-folha .g-fbtn', (b) => b.map((x) => x.textContent.trim()));
  if (JSON.stringify(botoes) !== JSON.stringify(['Usar o Escudo', 'Aceitar o bloqueio'])) erros.push(`folha do Escudo com botões inesperados: ${botoes.join(' | ')}`);
  await toque('azul', '.g-fbtn:has-text("Usar o Escudo")');
  await foto('azul', '07-confirmar-escudo');
  await toque('azul', '.g-fbtn:has-text("Voltar")');
  await cel.azul.waitForSelector('.g-folha:has-text("bloqueou vocês")');

  await browser.close();
  ws.fechar();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}. Sem "null", sem "Fechar" na decisão do Escudo e sem erros.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
