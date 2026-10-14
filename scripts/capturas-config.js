'use strict';
// Capturas da Etapa 8: menu com Configurações e Registro, as duas páginas em 1366x768 e 390x844.
// node scripts/capturas-config.js   (TEMA=claro|noturno grava em capturas/<tema>/)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, dormir } = require('../test/ajuda');
const { pastaCapturas, temaInicial, conferirBotaoTema } = require('./util-tema');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-cfg-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const base = `http://127.0.0.1:${srv.porta}`;

  // uma partida curta para o Registro ter o que mostrar
  const ws = new Cliente(srv.porta, 'papel=host');
  await ws.aberto;
  await ws.acao('novoJogo', {});
  const f = {};
  for (const cor of ['vermelho', 'azul', 'verde']) f[cor] = (await entrarGrupo(srv.porta, cor, `Rep ${cor}`)).c;
  await ws.estadoApos((s) => s.estado.grupos.length === 3);
  await ws.acao('iniciar');
  await ws.acao('mostrarAlternativas');
  await ws.acao('abrirJanela');
  for (const cor of ['azul', 'vermelho']) { f[cor].enviar({ t: 'apertar' }); await dormir(60); }
  await ws.acao('encerrarJanela');
  await ws.acao('mostrarResposta');
  const certa = ws.ultimo.pergunta.correta;
  await ws.acao('responder', (certa + 1) % 4);
  await ws.acao('responder', certa);
  await ws.acao('pausar', true);
  await ws.acao('pausar', false);
  await ws.acao('irMenu');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const erros = [];
  for (const [rotulo, vp, mobile] of [['1366x768', { width: 1366, height: 768 }, false], ['390x844', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => erros.push(String(e)));
    pg.on('console', (m) => m.type() === 'error' && !/401/.test(m.text()) && erros.push(m.text()));
    const foto = async (nome, cheia = false) => {
      await pg.waitForTimeout(350);
      const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      if (sw[0] > sw[1]) erros.push(`${rotulo} ${nome}: rolagem horizontal ${sw[0]} > ${sw[1]}`);
      if (mobile) await conferirBotaoTema(pg, `${rotulo} ${nome}`, erros);
      await pg.screenshot({ path: path.join(pastaCapturas, `${rotulo}-host-${nome}.png`), fullPage: cheia });
    };
    await ws.acao('irMenu');
    await pg.goto(`${base}/host`);
    await pg.waitForSelector('.opcao');
    await foto('c1-menu-com-extras');

    await pg.click('.menu-extra >> text=Configurações');
    await pg.waitForSelector('#cfg-meta');
    await foto('c2-configuracoes', true);

    // valor inválido: o servidor recusa e a página mostra o motivo
    await pg.fill('#cfg-meta', '0');
    await pg.click('button:has-text("Salvar")');
    await pg.waitForSelector('.msg-erro:not([hidden])');
    await foto('c3-configuracoes-erro', true);

    // valores válidos: salvos, com a hora
    await pg.fill('#cfg-meta', '10');
    await pg.fill('#cfg-janela', '25');
    await pg.fill('#cfg-mensagem', 'Obrigado a todos pela participação!');
    await pg.click('button:has-text("Salvar")');
    await pg.waitForSelector('.pg-status:has-text("Salvo às")');
    await foto('c4-configuracoes-salvas', true);

    await pg.click('button:has-text("Restaurar padrões")');
    await foto('c5-configuracoes-padroes', true);
    await ws.acao('salvarConfigJogo', { meta: 14, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5 }).catch(() => {});

    await pg.click('.avanco.voltar');
    await pg.waitForSelector('.opcao');
    await pg.click('.menu-extra >> text=Registro');
    await pg.waitForSelector('.rg-linha');
    await foto('c6-registro', true);
    await pg.click('.rg-chip:has-text("Respostas")');
    await foto('c7-registro-filtrado', true);
    await ctx.close();
  }
  await browser.close();
  for (const c of Object.values(f)) c.fechar();
  ws.fechar();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}. Sem erros.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
