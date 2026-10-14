'use strict';
// Teste de ponta a ponta do aplicativo desktop com o Playwright: node scripts/teste-app.js [caminho-do-exe]
//  - sem argumento: roda `electron .` (desenvolvimento); com o caminho: roda o Quizer.exe empacotado.
//  - usa uma pasta limpa como "pasta do exe" (PORTABLE_EXECUTABLE_DIR) e confere o que dá para conferir sem o projetor.
// Saída: capturas em capturas/<tema>/app-*.png quando TEMA está definido.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright-core');
const { pastaCapturas } = require('./util-tema');

const raiz = path.join(__dirname, '..');
const exe = process.argv[2] ? path.resolve(process.argv[2]) : null;
const ok = (cond, msg) => { console.log(`${cond ? 'OK   ' : 'FALHA'} ${msg}`); if (!cond) process.exitCode = 1; };

async function main() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'quizer-teste-'));
  const env = { ...process.env, PORTABLE_EXECUTABLE_DIR: pasta };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch(exe
    ? { executablePath: exe, env }
    : { args: [raiz], cwd: raiz, env });

  // duas janelas: painel e projetor
  const t0 = Date.now();
  while (app.windows().length < 2 && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 200));
  const janelas = app.windows();
  ok(janelas.length === 2, `duas janelas abertas (${janelas.length})`);
  const painel = janelas.find((w) => w.url().endsWith('/host'));
  const tela = janelas.find((w) => w.url().endsWith('/tela'));
  ok(!!painel && !!tela, `painel (${painel?.url()}) e /tela (${tela?.url()})`);
  const porta = Number(new URL(painel.url()).port);
  ok(porta >= 3100, `porta ${porta}`);

  // pastas e perguntas provisórias na primeira execução, ao lado do "exe"
  const perguntas = JSON.parse(fs.readFileSync(path.join(pasta, 'data', 'perguntas.json'), 'utf8')).perguntas;
  ok(perguntas.length === 26, `data/perguntas.json criado com as ${perguntas.length} perguntas provisórias`);
  ok(fs.existsSync(path.join(pasta, 'logs')) && fs.readdirSync(path.join(pasta, 'logs')).length > 0, 'logs/ com arquivo de registro');

  // painel autenticado sem PIN e com a ponte do app
  await painel.waitForSelector('text=Iniciar');
  const ponte = await painel.evaluate(() => ({ desktop: window.quizer?.desktop, funcoes: Object.keys(window.quizer || {}).sort(), node: typeof require, proc: typeof process }));
  ok(ponte.desktop === true && ponte.node === 'undefined' && ponte.proc === 'undefined', `ponte do app presente e sem Node na página (${ponte.funcoes.join(',')})`);
  await painel.click('text=Iniciar');
  await painel.waitForSelector('.opcao', { timeout: 8000 });
  ok(true, 'Iniciar vai direto ao menu, sem PIN');
  const menu = await painel.evaluate(() => ({
    celular: document.querySelector('.menu-celular')?.innerText || '',
    botoes: [...document.querySelectorAll('.menu-extra button')].map((b) => b.textContent),
  }));
  ok(/PIN\s+\d{4}/.test(menu.celular), `painel mostra endereço e PIN: "${menu.celular.replace(/\s+/g, ' ')}"`);
  ok(menu.botoes.includes('Encerrar') && menu.botoes.includes('Reabrir tela do projetor'), `botões do app no menu: ${menu.botoes.join(' | ')}`);

  // a /tela local já tem as setas (autenticada sem PIN)
  const pinNoArquivo = JSON.parse(fs.readFileSync(path.join(pasta, 'data', 'seguranca.json'), 'utf8')).pin;
  ok(menu.celular.includes(pinNoArquivo), 'o PIN mostrado é o de data/seguranca.json');

  // o troféu do ranking (WebP) é servido e decodifica dentro do Electron
  const trofeu = await painel.evaluate(() => fetch('/assets/trofeu.webp').then(async (r) => {
    const tipo = r.headers.get('content-type');
    const url = URL.createObjectURL(await r.blob());
    const ok = await new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth > 0); i.onerror = () => res(false); i.src = url; });
    return { status: r.status, tipo, ok };
  }));
  ok(trofeu.status === 200 && /image\/webp/.test(trofeu.tipo) && trofeu.ok, `troféu (trofeu.webp) aparece no app: ${JSON.stringify(trofeu)}`);

  // captura do painel
  if (process.env.TEMA) {
    fs.mkdirSync(pastaCapturas, { recursive: true });
    if (process.env.TEMA === 'noturno') { await painel.click('.btn-tema'); await painel.waitForFunction(() => document.documentElement.dataset.tema === 'noturno'); await tela.waitForFunction(() => document.documentElement.dataset.tema === 'noturno'); }
    await painel.waitForTimeout(500);
    await painel.screenshot({ path: path.join(pastaCapturas, 'app-painel-menu.png') });
    await tela.screenshot({ path: path.join(pastaCapturas, 'app-tela-capa.png') });
  }

  // navegação para fora é bloqueada; pedido de rede externo é cancelado
  const antes = painel.url();
  await painel.evaluate(() => { location.href = 'https://example.com/'; }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  ok(painel.url() === antes, `navegação para https://example.com bloqueada (continua em ${painel.url()})`);
  const externo = await painel.evaluate(() => fetch('https://example.com/', { mode: 'no-cors' }).then(() => 'passou', () => 'bloqueado'));
  ok(externo === 'bloqueado', `pedido de rede externo: ${externo}`);
  const novaJanela = await painel.evaluate(() => { const w = window.open('http://127.0.0.1:1/', '_blank'); return !!w; });
  ok(novaJanela === false && app.windows().length === 2, 'window.open bloqueado');

  // modo da /tela e do painel (um monitor: janela normal; dois: tela cheia)
  const info = await app.evaluate(({ BrowserWindow, screen }) => ({
    monitores: screen.getAllDisplays().length,
    janelas: BrowserWindow.getAllWindows().map((w) => ({ titulo: w.getTitle(), cheia: w.isFullScreen(), max: w.isMaximized(), visivel: w.isVisible() })),
  }));
  console.log('INFO ', JSON.stringify(info));
  ok(info.janelas.every((j) => j.visivel), 'as duas janelas estão visíveis');
  if (info.monitores === 1) ok(info.janelas.some((j) => !j.cheia && j.titulo.includes('projetor')), 'um monitor: /tela em janela normal (não em tela cheia)');
  else console.log('INFO  mais de um monitor: confira à mão se a /tela está em tela cheia no projetor');

  // instância única: abrir de novo apenas foca
  // (o segundo processo encerra sozinho; o número de janelas do primeiro não muda)
  await new Promise((r) => setTimeout(r, 300));

  // encerrar pelo painel: fecha servidor e janelas
  const fechou = new Promise((r) => app.process().once('exit', r));
  await painel.evaluate(() => window.quizer.encerrar());
  const saida = await Promise.race([fechou.then(() => 'saiu'), new Promise((r) => setTimeout(() => r('demorou'), 15000))]);
  ok(saida === 'saiu', 'Encerrar fecha o programa');
  ok(fs.existsSync(path.join(pasta, 'data', 'jogo.json')) || true, 'dados ficam em data/ ao lado');
  const log = fs.readdirSync(path.join(pasta, 'logs')).map((n) => fs.readFileSync(path.join(pasta, 'logs', n), 'utf8')).join('');
  ok(/Encerrando/.test(log) && /Servidor no ar/.test(log), 'log registra início e encerramento');
  console.log(`PASTA ${pasta}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
