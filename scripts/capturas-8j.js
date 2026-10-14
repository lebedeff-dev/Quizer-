'use strict';
// Capturas da 8j (chips tocáveis de habilidade e Aposta no celular): node scripts/capturas-8j.js   (TEMA=claro|noturno)
// Celular 390x844: sem habilidades (só a Aposta), com 1 e com 2, chip desabilitado com motivo, confirmação de uso a partir
// do chip e Aposta aberta pelo chip. Em toda foto confere null/undefined e rolagem horizontal.
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

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8j-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { placarModo: 'desligado', meta: 40 } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const base = `http://127.0.0.1:${srv.porta}`;
  const ws = new Cliente(srv.porta, 'papel=host');
  await ws.aberto;
  const ok = async (nome, ...a) => { const r = await ws.acao(nome, ...a); if (r.t !== 'ok') throw new Error(`${nome}: ${r.msg}`); };
  await ws.acao('novoJogo', {});
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => erros.push(`${e}`));
  pg.on('console', (m) => m.type() === 'error' && !/ERR_CONNECTION|401/.test(m.text()) && erros.push(m.text()));
  await pg.goto(`${base}/g/azul`);
  await pg.waitForSelector('#g-nome');
  await pg.fill('#g-nome', 'Teste');
  await pg.click('.g-entrar');
  await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
  const outro = await entrarGrupo(srv.porta, 'vermelho', 'Rep vermelho');
  await ws.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');

  const foto = async (nome) => {
    await pg.waitForSelector('.g-ganho', { state: 'detached', timeout: 6000 }).catch(() => {});
    await pg.waitForTimeout(400);
    const texto = await pg.evaluate(() => document.body.innerText);
    if (/\bnull\b|\bundefined\b/i.test(texto)) erros.push(`${nome}: null/undefined na página`);
    const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (sw[0] > sw[1]) erros.push(`${nome}: rolagem horizontal ${sw[0]} > ${sw[1]}`);
    const baixos = await pg.$$eval('.g-chip', (n) => n.filter((x) => x.getBoundingClientRect().height < 44).length);
    if (baixos) erros.push(`${nome}: ${baixos} chip(s) com menos de 44 px de altura`);
    await pg.screenshot({ path: path.join(pastaCapturas, `390x844-8j-cel-${nome}.png`) });
  };
  const toque = async (sel) => { await pg.click(sel, { force: true }); await pg.waitForTimeout(250); };
  const certa = () => ws.ultimo.pergunta.correta;
  const rodadaAzul = async () => {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    await pg.waitForSelector('.g-botao:has-text("APERTE")'); await pg.click('.g-botao');
    await ws.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta'); await ok('responder', certa()); await ok('continuar');
  };

  await pg.waitForSelector('.g-habs');
  await foto('01-sem-habilidades-so-a-aposta');
  await toque('.g-chip[data-tipo="aposta"]');
  await pg.waitForSelector('.g-folha:has-text("Aposta")');
  await foto('02-aposta-aberta-pelo-chip');
  await toque('.g-fbtn:has-text("Voltar")');

  for (let i = 0; i < 3; i += 1) await rodadaAzul();
  await ok('trocarAcertos', 'azul', 'passe');
  await pg.waitForSelector('.g-chip[data-tipo="passe"]');
  await foto('03-uma-habilidade-o-passe');
  await toque('.g-chip[data-tipo="passe"]');
  await pg.waitForSelector('.g-motivo');
  await foto('04-chip-desabilitado-com-motivo');

  for (let i = 0; i < 3; i += 1) await rodadaAzul();
  await ok('trocarAcertos', 'azul', 'bloqueio');
  await pg.waitForSelector('.g-chip[data-tipo="bloqueio"]');
  await foto('05-duas-habilidades');
  await toque('.g-chip[data-tipo="bloqueio"]');
  await pg.waitForSelector('.g-folha:has-text("Escolha o grupo que será bloqueado.")');
  await foto('06-bloqueio-escolha-do-alvo-pelo-chip');
  await toque('.g-fbtn:has-text("Voltar")');

  // Passe pelo chip: azul é o 1º e o outro grupo o 2º
  await ok('mostrarAlternativas'); await ok('abrirJanela');
  await pg.waitForSelector('.g-botao:has-text("APERTE")'); await pg.click('.g-botao');
  outro.c.enviar({ t: 'apertar' });
  await ws.estadoApos((s) => s.estado.rodada.ordem.length === 2 || s.estado.fase !== 'janela');
  if (ws.ultimo.estado.fase === 'janela') await ok('encerrarJanela');
  await ok('mostrarResposta');
  await pg.waitForSelector('.g-chip[data-tipo="passe"][aria-disabled="false"]');
  await foto('07-passe-habilitado-na-resposta');
  await toque('.g-chip[data-tipo="passe"]');
  await pg.waitForSelector('.g-folha:has-text("Passar a vez")');
  await foto('08-confirmar-passe-pelo-chip');
  await toque('.g-fbtn:has-text("Confirmar")');
  await pg.waitForSelector('.g-folha', { state: 'detached' });
  await toque('.g-chip[data-tipo="bloqueio"]');
  await pg.waitForSelector('.g-motivo');
  await foto('09-ja-usaram-uma-habilidade');

  await browser.close();
  outro.c.fechar();
  ws.fechar();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}. Sem null, sem rolagem horizontal e chips de 44 px ou mais.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
