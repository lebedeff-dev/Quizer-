'use strict';
// Capturas da Etapa 6: node scripts/capturas-jogo.js
//  - conduz uma partida inteira (celulares simulados por WebSocket) e fotografa cada cena:
//    /tela em 1920x1080 e /host em 1366x768, em ../capturas/jogo-*.png
// Usa o Chrome instalado (playwright-core) e um servidor temporário.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { TEMA, pastaCapturas, temaInicial } = require('./util-tema');
const { Cliente, autenticar, entrarGrupo, dormir } = require('../test/ajuda');

const PIN = '1234';
const SAIDA = pastaCapturas;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const PERGUNTAS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), 'utf8')).perguntas;
const CORES = ['vermelho', 'azul', 'verde', 'amarelo', 'laranja', 'roxo'];

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-jogo-'));
  fs.writeFileSync(path.join(dir, 'perguntas.json'), JSON.stringify({ perguntas: PERGUNTAS }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN });
  await temaInicial(srv, PIN);
  const base = `http://127.0.0.1:${srv.porta}`;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const erros = [];
  const vigiar = (pg, rotulo) => {
    pg.on('pageerror', (e) => erros.push(`${rotulo}: ${e}`));
    pg.on('console', (m) => m.type() === 'error' && !/401/.test(m.text()) && erros.push(`${rotulo}: ${m.text()}`));
  };

  const ctx = await browser.newContext();
  const host = await ctx.newPage();
  await host.setViewportSize({ width: 1366, height: 768 });
  vigiar(host, 'host');
  await host.goto(`${base}/host`);
  await host.click('text=Iniciar');
  await host.waitForSelector('.opcao');
  await host.click('text=Criar novo jogo');
  await host.waitForSelector('.hs-comecar');

  const tela = await ctx.newPage();
  await tela.setViewportSize({ width: 1920, height: 1080 });
  vigiar(tela, 'tela');
  await tela.goto(`${base}/tela`);

  const foto = async (pg, nome, espera = 350) => {
    await pg.waitForTimeout(espera);
    await pg.screenshot({ path: path.join(SAIDA, nome) });
  };
  const par = async (nome, espera) => {
    await foto(tela, `1920x1080-jogo-${nome}.png`, espera);
    await foto(host, `1366x768-jogo-${nome}.png`, 0);
  };

  // controle por WebSocket (mesmo cookie do responsável) e celulares
  const { cookie } = await autenticar(srv.porta, PIN);
  const ws = new Cliente(srv.porta, 'papel=host', cookie);
  await ws.aberto;
  const fones = {};
  const nomes = { vermelho: 'Vera Lúcia', azul: 'Bruno Alves', verde: 'Carla Dias', amarelo: 'Aline Souza', laranja: 'Davi Rocha', roxo: 'Elisa Prado' };
  for (const cor of CORES) {
    const { c } = await entrarGrupo(srv.porta, cor, nomes[cor]);
    fones[cor] = c;
  }
  await ws.estadoApos((s) => s.estado.grupos.length === 6 && s.estado.grupos.every((g) => g.conectado));
  await host.waitForSelector('.hs-comecar:not([disabled])');

  const certa = () => ws.ultimo.pergunta.correta;
  const errada = (n = 0) => [0, 1, 2, 3].filter((i) => i !== certa())[n];
  const clicar = async (ordem) => {
    for (const cor of ordem) { fones[cor].enviar({ t: 'apertar' }); await dormir(25); }
  };
  const esperarFase = (f) => ws.estadoApos((s) => s.estado.fase === f);
  // Recusa ofertas de Bloqueio pendentes (para não travar o avanço) e continua.
  const seguir = async () => {
    for (const g of ws.ultimo.estado.grupos) if (g.oferta) await ws.acao('decidirOferta', g.cor, null);
    await ws.acao('continuar');
  };
  // Uma rodada rápida (sem capturas) para avançar o jogo: quem aperta, e como cada um responde.
  const rodadaRapida = async (ordem, respostas) => {
    await ws.acao('mostrarAlternativas');
    await ws.acao('abrirJanela');
    await clicar(ordem);
    await ws.acao('encerrarJanela');
    if (ordem.length) {
      await ws.acao('mostrarResposta');
      for (const r of respostas) {
        if (r === 'certa') await ws.acao('responder', certa());
        else if (r === 'errada') await ws.acao('responder', errada());
        else if (r === 'desq') await ws.acao('desqualificar');
        else if (r === 'sem') await ws.acao('semResposta');
      }
    }
    if (['explicacao', 'so_correta'].includes(ws.ultimo.estado.fase)) await seguir();
  };

  // ---------- rodada 1: fluxo completo com capturas ----------
  await host.click('.hs-comecar');
  await tela.waitForSelector('.q-texto');
  await par('01-pergunta');

  await host.keyboard.press('Space'); // atalho: mostrar alternativas
  await tela.waitForSelector('.alts');
  await par('02-alternativas');

  await host.keyboard.press('Space'); // abrir janela
  await tela.waitForSelector('.contagem-numero');
  await par('03-janela-vazia', 1200);

  await clicar(['azul', 'vermelho', 'verde', 'roxo']);
  await foto(host, '1366x768-jogo-04-janela-fila.png', 300);

  await ws.acao('encerrarJanela');
  await tela.waitForSelector('.ordem-grade');
  await par('05-ordem');

  await host.click('.hj-grande');
  await tela.waitForSelector('.ordem-linha');
  await par('06-resposta-1o');

  await host.keyboard.press(['A', 'B', 'C', 'D'][errada(0)]); // errada: continua na mesma tela
  await tela.waitForSelector('.alt.errada');
  await par('07-errada-segundo-responde');

  await host.keyboard.press(['A', 'B', 'C', 'D'][certa()]);
  await tela.waitForSelector('.explicacao');
  await par('08-explicacao');

  // ---------- rodada 2: ninguém aperta (só a correta) ----------
  await host.keyboard.press('Space');
  await tela.waitForSelector('.q-texto');
  await ws.acao('mostrarAlternativas');
  await ws.acao('abrirJanela');
  await par('09-pausa-antes', 300);
  await host.keyboard.press('p');
  await tela.waitForSelector('.pausado');
  await par('10-pausado');
  await host.keyboard.press('p');
  await tela.waitForSelector('.contagem-numero');
  await ws.acao('encerrarJanela');
  await tela.waitForSelector('.alt.certa');
  await par('11-so-correta-ninguem');
  await ws.acao('continuar');

  // ---------- rodadas 3 a 5: vermelho acerta tudo e ganha a oferta de Bloqueio ----------
  await rodadaRapida(['vermelho', 'azul'], ['certa']);
  await ws.acao('mostrarAlternativas');
  await ws.acao('abrirJanela');
  await clicar(['vermelho', 'amarelo']);
  await ws.acao('encerrarJanela');
  await ws.acao('mostrarResposta');
  await ws.acao('responder', certa());
  await host.waitForSelector('.hj-modal');
  await par('12-oferta-bloqueio');
  await host.click('.hj-modal .hj-opcao:has-text("Bloqueio")');
  await host.waitForSelector('.hj-grande:not([disabled])');
  await ws.acao('continuar');

  // ---------- rodada 6: ativar o Bloqueio (antes da janela) ----------
  await host.waitForSelector('.hg-ativar');
  await foto(host, '1366x768-jogo-13-habilidade-ativar.png', 300);
  await host.click('.hg-ativar');
  await host.waitForSelector('.hj-alvos');
  await foto(host, '1366x768-jogo-14-escolher-alvo.png', 200);
  await host.click('.hj-alvo:has-text("Azul")');
  await tela.waitForSelector('.aviso');
  await par('15-aviso-bloqueio');
  await rodadaRapida(['vermelho', 'azul', 'verde'], ['desq', 'errada']);

  // ---------- avança até a rodada final (respondidas = 13) ----------
  while (ws.ultimo.estado.respondidas < 13) {
    await rodadaRapida(['azul', 'verde'], ['certa']);
  }
  await esperarFase('pergunta');
  await par('16-rodada-final-pergunta');
  await ws.acao('mostrarAlternativas');
  await par('17-rodada-final-alternativas');
  await ws.acao('abrirJanela');
  await clicar(['verde', 'azul']);
  await ws.acao('encerrarJanela');
  await ws.acao('mostrarResposta');
  await ws.acao('responder', certa());
  await par('18-rodada-final-explicacao');
  await seguir();

  // ---------- ranking e final ----------
  await tela.waitForSelector('.rank');
  await par('19-ranking');
  await host.keyboard.press('Space');
  await tela.waitForSelector('.integrantes');
  await par('20-final');

  // regras (cena auxiliar) em cima de qualquer fase
  await ws.acao('regras', true);
  await tela.waitForSelector('.regras-grade');
  await par('21-regras');
  await ws.acao('regras', false);

  await host.keyboard.press('Space'); // volta à capa
  await tela.waitForSelector('.capa');

  ws.fechar();
  Object.values(fones).forEach((c) => c.fechar());
  await browser.close();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) {
    console.log('Erros no navegador:\n' + erros.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Capturas gravadas em capturas/ (prefixo jogo-). Sem erros no console.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
