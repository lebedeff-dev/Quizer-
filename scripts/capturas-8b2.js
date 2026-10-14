'use strict';
// Capturas da Etapa 8b-2 (Aposta, Dica 50/50 e pontos negativos): node scripts/capturas-8b2.js   (TEMA=claro|noturno)
// Conduz uma partida de 18 rodadas com 3 grupos e fotografa: painel no notebook (1366x768) e no celular (390x844),
// a /tela (1920x1080, 3 quadros determinísticos de cada animação) e os celulares dos grupos (390x844).
// No painel do celular confere rolagem horizontal e se o botão lua/sol cobre algo.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8b2-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const base = `http://127.0.0.1:${srv.porta}`;
  const ws = new Cliente(srv.porta, 'papel=host');
  await ws.aberto;
  const ok = async (nome, ...a) => { const r = await ws.acao(nome, ...a); if (r.t !== 'ok') throw new Error(`${nome}: ${r.msg}`); };
  await ws.acao('novoJogo', {});
  await ok('salvarConfigJogo', { meta: 18, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5 });

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
  const celulares = {};
  for (const [cor, nome] of [['vermelho', 'Vera Lúcia'], ['azul', 'André Luiz']]) {
    const pg = await nova(390, 844, true);
    await pg.goto(`${base}/g/${cor}`);
    await pg.waitForSelector('#g-nome');
    await pg.fill('#g-nome', nome);
    await pg.click('.g-entrar');
    await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
    celulares[cor] = pg;
  }
  const fones = { verde: (await entrarGrupo(srv.porta, 'verde', 'Rep verde')).c };
  await ws.estadoApos((s) => s.estado.grupos.length === 3 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');

  const host = await nova(1366, 768);
  await host.goto(`${base}/host`);
  await host.waitForSelector('.hj-grande');
  const hostM = await nova(390, 844, true);
  await hostM.goto(`${base}/host`);
  await hostM.waitForSelector('.hj-grande');

  const salvar = async (pg, nome, { cheia = false } = {}) => {
    await pg.waitForTimeout(350);
    await pg.screenshot({ path: path.join(pastaCapturas, `${nome}.png`), fullPage: cheia });
  };
  const hostAmbos = async (nome, { cheiaM = false } = {}) => {
    await salvar(host, `1366x768-8b2-${nome}`);
    await salvar(hostM, `390x844-8b2-host-${nome}`, { cheia: cheiaM });
    const sw = await hostM.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (sw[0] > sw[1]) erros.push(`painel no celular ${nome}: rolagem horizontal ${sw[0]} > ${sw[1]}`);
    await conferirBotaoTema(hostM, `painel no celular ${nome}`, erros);
    const sn = await host.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (sn[0] > sn[1]) erros.push(`painel no notebook ${nome}: rolagem horizontal ${sn[0]} > ${sn[1]}`);
  };
  // janelas locais de cada página (Aposta, alvo): o mesmo clique nas duas
  const nasDuas = async (fn) => { await fn(host); await fn(hostM); };
  const quadros = async (pg, nome, tempos, opcoes = {}) => {
    for (let i = 0; i < tempos.length; i += 1) {
      await pg.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), tempos[i]);
      await pg.screenshot({ path: path.join(pastaCapturas, `${nome}-${i + 1}.png`), ...opcoes });
    }
  };

  const estado = () => ws.ultimo.estado;
  const certa = () => ws.ultimo.pergunta.correta;
  const errada = () => [0, 1, 2, 3].find((i) => i !== certa() && !estado().rodada.erradas.includes(i) && !estado().rodada.eliminadas.includes(i));
  const clique = async (cor) => {
    const antes = estado().rodada.ordem.length;
    if (celulares[cor]) { await celulares[cor].waitForSelector('.g-botao:has-text("APERTE")'); await celulares[cor].click('.g-botao'); } else fones[cor].enviar({ t: 'apertar' });
    await ws.estadoApos((s) => s.estado.rodada.ordem.length > antes || s.estado.fase !== 'janela');
  };
  // rodada inteira ('c' certa, 'e' errada). `parar`: deixa na explicação com ofertas pendentes.
  const rodada = async (ordem, respostas, { parar = false, escolhas = {}, aposta = null } = {}) => {
    if (estado().fase === 'pergunta') await ok('mostrarAlternativas');
    await ok('abrirJanela');
    for (const cor of ordem) await clique(cor);
    if (estado().fase === 'janela') await ok('encerrarJanela');
    if (ordem.length) {
      await ok('mostrarResposta');
      for (const r of respostas) await ok('responder', r === 'c' ? certa() : errada());
    }
    if (parar) return;
    for (const g of estado().grupos) if (g.oferta) await ok('decidirOferta', g.cor, escolhas[g.cor] ?? null);
    await ok('continuar');
    void aposta;
  };
  // roda a rodada comum: pergunta -> alternativas -> o resto
  const simples = async (ordem, respostas, opcoes) => { await ok('mostrarAlternativas'); await rodada(ordem, respostas, opcoes); };

  // ---------- R1-R7: azul acerta 7 seguidas (recusa nos marcos 3 e 5) e recebe a oferta da Dica 50/50 ----------
  for (let i = 1; i <= 7; i += 1) await simples(['azul'], ['c'], { parar: i === 7 });
  await host.waitForSelector('.hj-opcao');
  await hostAmbos('01-oferta-dica-7-acertos');
  await host.click('.hj-modal .hj-opcao:has-text("Dica 50/50")');
  await tela.waitForSelector('.hab-pilula');
  await quadros(tela, '1920x1080-8b2-dica-ganhar', [80, 350, 1100]);
  await celulares.azul.waitForSelector('.g-ganho');
  await quadros(celulares.azul, '390x844-8b2-cel-dica-ganhar', [80, 350, 1100]);
  await ok('continuar');

  // ---------- R8-R13: vermelho ganha Escudo (3 acertos) e Passe (mais 3) ----------
  for (let i = 1; i <= 6; i += 1) {
    await simples(['vermelho'], ['c'], { parar: true });
    if (i === 3) {
      await host.waitForSelector('.hj-opcao');
      await hostAmbos('02-oferta-tres-opcoes-novo-texto');
      await ok('decidirOferta', 'vermelho', 'escudo');
    } else if (i === 6) await ok('decidirOferta', 'vermelho', 'passe');
    else for (const g of estado().grupos) if (g.oferta) await ok('decidirOferta', g.cor, null);
    await ok('continuar');
  }
  await celulares.vermelho.waitForSelector('.g-ganho', { state: 'detached' });

  // ---------- R14: Aposta com pontos de quem não aperta (não cobrada) ----------
  await host.waitForSelector('.hg-apostar');
  await hostAmbos('03-cartoes-com-apostar', { cheiaM: true });
  await nasDuas((pg) => pg.click('.hg-cartao:has-text("Vermelho") .hg-apostar'));
  await host.waitForSelector('.hj-modal');
  await hostAmbos('04-aposta-escolher-modo');
  await salvar(hostM, '390x844-8b2-host-04b-aposta-escolher-modo-fim', {});
  await nasDuas((pg) => pg.click('.hj-modal .hj-opcao:has-text("Pagar 10 pontos")'));
  await hostAmbos('05-aposta-confirmar-pontos');
  await host.click('.hj-modal button:has-text("Confirmar Aposta")');
  await tela.waitForSelector('.ativacao.aposta');
  await quadros(tela, '1920x1080-8b2-aposta-ativar', [200, 800, 1500]);
  await tela.waitForSelector('.ativacao', { state: 'detached' });
  await tela.waitForSelector('.aviso');
  await salvar(tela, '1920x1080-8b2-aposta-aviso-na-pergunta');
  await celulares.vermelho.waitForSelector('.g-hab.em-jogo');
  await salvar(celulares.vermelho, '390x844-8b2-cel-aposta-em-jogo');
  await hostAmbos('06-aposta-ativa-no-cartao', { cheiaM: true });
  await rodada(['azul'], ['c'], { parar: true }); // vermelho não apertou
  await tela.waitForSelector('.hab-pilula:has-text("não cobrada")');
  await salvar(tela, '1920x1080-8b2-aposta-nao-cobrada');
  await celulares.vermelho.waitForSelector('.g-hab:has-text("Aposta não cobrada")');
  await salvar(celulares.vermelho, '390x844-8b2-cel-aposta-nao-cobrada');
  await hostAmbos('07-aposta-nao-cobrada', { cheiaM: true });
  await ok('continuar');

  // ---------- R15: vermelho sozinho com o Passe: botão desabilitado ----------
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  await clique('vermelho');
  await ok('encerrarJanela');
  await ok('mostrarResposta');
  await host.waitForSelector('.hj-passe-btn[disabled]');
  await hostAmbos('08-passou-desabilitado');
  await ok('responder', certa());
  await ok('continuar');

  // ---------- R16: Aposta com 2 habilidades (vermelho erra) e Dica 50/50 (azul, 2º) ----------
  await ajustarPontosNoServidor({ srv, host: ws }, 'verde', -15);
  await host.waitForSelector('.hg-apostar');
  await nasDuas((pg) => pg.click('.hg-cartao:has-text("Verde") .hg-apostar'));
  await host.waitForSelector('.hj-modal');
  await hostAmbos('09-aposta-pontos-bloqueada-pela-divida');
  await nasDuas((pg) => pg.click('.hj-modal button:has-text("Cancelar")'));
  await nasDuas((pg) => pg.click('.hg-cartao:has-text("Vermelho") .hg-apostar'));
  await host.waitForSelector('.hj-modal');
  await nasDuas((pg) => pg.click('.hj-modal .hj-opcao:has-text("Trocar 2 habilidades")'));
  await hostAmbos('10-aposta-confirmar-habilidades');
  await host.click('.hj-modal button:has-text("Confirmar Aposta")');
  await tela.waitForSelector('.ativacao.aposta');
  await tela.waitForSelector('.ativacao', { state: 'detached' });
  await celulares.vermelho.waitForSelector('.g-hab.reservada');
  await salvar(celulares.vermelho, '390x844-8b2-cel-habilidades-na-aposta');
  await hostAmbos('11-grupos-negativo-e-reservadas', { cheiaM: true });
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  await clique('vermelho');
  await clique('azul');
  await ok('encerrarJanela');
  await ok('mostrarResposta');
  await ok('responder', errada()); // vermelho erra: -5
  await host.waitForSelector('.hj-modal:has-text("Usar a Dica 50/50?")');
  await nasDuas((pg) => pg.waitForSelector('.hj-modal:has-text("Usar a Dica 50/50?")'));
  await hostAmbos('12-dica-decisao-do-grupo');
  await host.click('.hj-modal button:has-text("Usar a Dica 50/50")');
  await tela.waitForSelector('.ativacao.dica5050');
  await quadros(tela, '1920x1080-8b2-dica-usar', [200, 800, 1500]);
  await tela.waitForSelector('.ativacao', { state: 'detached' });
  await tela.waitForSelector('.alt.eliminada');
  await salvar(tela, '1920x1080-8b2-dica-alternativas-eliminadas');
  await celulares.azul.waitForSelector('.g-dica');
  await salvar(celulares.azul, '390x844-8b2-cel-dica-letras');
  await hostAmbos('13-dica-botoes-eliminadas');
  await ok('responder', certa()); // azul acerta como 2º
  await tela.waitForSelector('.hab-pilula:has-text("apostou")');
  await salvar(tela, '1920x1080-8b2-aposta-cobrada-negativa');
  await celulares.vermelho.waitForSelector('.g-hab:has-text("Aposta cobrada")');
  await salvar(celulares.vermelho, '390x844-8b2-cel-aposta-cobrada');
  await hostAmbos('14-depois-da-aposta', { cheiaM: true });
  await ok('continuar');

  // ---------- R17: verde aposta pontos e erra (saldo negativo) ----------
  await ajustarPontosNoServidor({ srv, host: ws }, 'verde', 5); // -10: ainda dá para pagar 10 sem passar de -20
  await nasDuas((pg) => pg.click('.hg-cartao:has-text("Verde") .hg-apostar'));
  await nasDuas((pg) => pg.click('.hj-modal .hj-opcao:has-text("Pagar 10 pontos")'));
  await host.click('.hj-modal button:has-text("Confirmar Aposta")');
  await tela.waitForSelector('.ativacao.aposta');
  await tela.waitForSelector('.ativacao', { state: 'detached' });
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  await clique('verde');
  await clique('azul');
  await ok('encerrarJanela');
  await ok('mostrarResposta');
  await ok('responder', errada());
  await ok('responder', errada()); // o 2º também erra: a explicação mostra as duas erradas e a correta
  await tela.waitForSelector('.hab-pilula:has-text("Verde apostou")');
  await salvar(tela, '1920x1080-8b2-aposta-erro-pontos-negativos');
  await hostAmbos('15-saldo-negativo', { cheiaM: true });
  await ok('continuar');

  // ---------- R18 (final): Aposta com pontos bloqueada ----------
  await nasDuas((pg) => pg.click('.hg-cartao:has-text("Azul") .hg-apostar'));
  await host.waitForSelector('.hj-modal');
  await hostAmbos('16-aposta-bloqueada-na-rodada-final');
  await nasDuas((pg) => pg.click('.hj-modal button:has-text("Cancelar")'));
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  await clique('azul');
  await ok('encerrarJanela');
  await ok('mostrarResposta');
  await ok('responder', certa());
  await ok('continuar');
  await tela.waitForSelector('.rank');
  await salvar(tela, '1920x1080-8b2-ranking-com-negativos');
  await host.waitForSelector('.hr-lista');
  await hostAmbos('17-ranking-com-negativos', { cheiaM: true });

  // ---------- Regras (3 páginas) ----------
  for (const p of [1, 2, 3]) {
    await ok('regras', p);
    await tela.waitForSelector(`.regras-pagina:has-text("${p} de 3")`);
    await salvar(tela, `1920x1080-8b2-regras-${p}`);
  }
  const tela2 = await nova(1366, 768);
  await tela2.goto(`${base}/tela`);
  await tela2.waitForSelector('.regras-pagina');
  for (const p of [2, 3]) {
    await ok('regras', p);
    await tela2.waitForSelector(`.regras-pagina:has-text("${p} de 3")`);
    await salvar(tela2, `1366x768-8b2-regras-${p}`);
    const estouro = await tela2.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (estouro > 2) erros.push(`regras ${p} em 1366x768 passa ${estouro}px da altura da tela`);
  }
  await ok('regras', false);

  // ---------- Configurações ----------
  await ok('irConfig');
  await host.waitForSelector('#cfg-apostaCusto');
  await hostM.waitForSelector('#cfg-apostaCusto');
  await salvar(host, '1366x768-8b2-config', { cheia: true });
  await salvar(hostM, '390x844-8b2-host-config', { cheia: true });
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
