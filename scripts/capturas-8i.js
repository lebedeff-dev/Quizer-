'use strict';
// Capturas da 8i: node scripts/capturas-8i.js   (TEMA=claro|noturno)
// (a) troféu só para quem realmente vence + marca "não elegível" (projetor, painel no notebook e no celular, tela final);
// (b) barra do Tigrinho no celular (sobre a espera, sobre as alternativas, com a Aposta aberta, dispensada e com a foto
//     ausente) e a marca "3 sem pontuar" no cartão do painel. Em toda foto de celular confere null/undefined e rolagem horizontal.
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

async function iniciar(meta) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8i-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { placarModo: 'desligado', meta } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const ws = new Cliente(srv.porta, 'papel=host');
  await ws.aberto;
  const ok = async (nome, ...a) => { const r = await ws.acao(nome, ...a); if (r.t !== 'ok') throw new Error(`${nome}: ${r.msg}`); };
  await ws.acao('novoJogo', {});
  return { dir, srv, ws, ok, base: `http://127.0.0.1:${srv.porta}` };
}

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const nova = async (w, h, mobile = false) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => erros.push(`${w}x${h}: ${e}`));
    pg.on('console', (m) => m.type() === 'error' && !/ERR_CONNECTION|401|ERR_FAILED/.test(m.text()) && erros.push(`${w}x${h}: ${m.text()}`));
    return pg;
  };
  const salvar = async (pg, nome, cheia = false) => { await pg.waitForTimeout(350); await pg.screenshot({ path: path.join(pastaCapturas, `${nome}.png`), fullPage: cheia }); };

  // ================= (a) troféu do elegível =================
  {
    const J = await iniciar(2);
    const fones = {};
    for (const cor of ['vermelho', 'azul', 'verde']) fones[cor] = (await entrarGrupo(J.srv.porta, cor, `Rep ${cor}`)).c;
    await J.ws.estadoApos((s) => s.estado.grupos.length === 3 && s.estado.grupos.every((g) => g.conectado));
    await J.ok('iniciar');
    const tela = await nova(1366, 768); await tela.goto(`${J.base}/tela`);
    const host = await nova(1366, 768); await host.goto(`${J.base}/host`);
    const hostM = await nova(390, 844, true); await hostM.goto(`${J.base}/host`);
    const certa = () => J.ws.ultimo.pergunta.correta;
    for (const cor of ['vermelho', 'azul']) {
      await J.ok('mostrarAlternativas'); await J.ok('abrirJanela');
      fones[cor].enviar({ t: 'apertar' });
      await J.ws.estadoApos((s) => s.estado.rodada.ordem.length === 1);
      await J.ok('encerrarJanela'); await J.ok('mostrarResposta'); await J.ok('responder', certa());
      await J.ok('continuar');
    }
    await ajustarPontosNoServidor({ srv: J.srv, host: J.ws }, 'vermelho', 40); // vermelho 50 (1º), azul 20 (2º), verde 0 (3º)
    await tela.waitForSelector('.rank');
    const dois = async (nome) => {
      await salvar(tela, `1366x768-8i-projetor-${nome}`);
      await salvar(host, `1366x768-8i-painel-${nome}`);
      await salvar(hostM, `390x844-8i-host-${nome}`, true);
      const sw = await hostM.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      if (sw[0] > sw[1]) erros.push(`painel no celular ${nome}: rolagem horizontal`);
      await conferirBotaoTema(hostM, `painel no celular ${nome}`, erros);
    };
    const trofeus = (pg, sel) => pg.$$eval(sel, (x) => x.length);
    await host.waitForSelector('.hr-lista');
    await dois('01-todos-elegiveis');
    if ((await trofeus(tela, '.rank-trofeu')) !== 1) erros.push('todos elegíveis: esperava 1 troféu');
    await J.ok('definirElegivel', 'vermelho', false);
    await tela.waitForSelector('.rank-inelegivel');
    await dois('02-primeiro-inelegivel-troféu-no-segundo');
    const donoTrofeu = await tela.$eval('.rank-linha:has(.rank-trofeu) .rank-nome', (n) => n.textContent);
    if (donoTrofeu !== 'Azul') erros.push(`primeiro inelegível: o troféu devia estar no Azul e está em ${donoTrofeu}`);
    await J.ok('definirElegivel', 'azul', false);
    await dois('03-primeiro-e-segundo-inelegiveis-troféu-no-terceiro');
    await J.ok('definirElegivel', 'verde', false);
    await dois('04-ninguem-elegivel-sem-troféu');
    if ((await trofeus(tela, '.rank-trofeu')) !== 0) erros.push('ninguém elegível: não devia haver troféu');
    await J.ok('definirElegivel', 'vermelho', true);
    await J.ok('definirElegivel', 'azul', true);
    await J.ok('definirElegivel', 'verde', true);
    await J.ok('definirElegivel', 'vermelho', false);
    await J.ok('definirElegivel', 'azul', false);
    await J.ok('definirElegivel', 'verde', true);
    await ajustarPontosNoServidor({ srv: J.srv, host: J.ws }, 'azul', 30); // azul 50 empata com... vermelho inelegível: verde é o único elegível
    await J.ok('definirElegivel', 'azul', true);
    await J.ok('definirElegivel', 'vermelho', true); // vermelho 50 e azul 50: empate no topo, desempate pendente
    await tela.waitForSelector('.legenda-cena:has-text("Empate")');
    await dois('05-empate-desempate-pendente-sem-troféu');
    if ((await trofeus(tela, '.rank-trofeu')) !== 0) erros.push('empate pendente: não devia haver troféu');
    await ajustarPontosNoServidor({ srv: J.srv, host: J.ws }, 'azul', -10);
    await J.ok('definirElegivel', 'vermelho', false);
    await J.ok('proximo');
    await tela.waitForSelector('.final-vencedor');
    await salvar(tela, '1366x768-8i-projetor-06-tela-final-com-vencedor');
    await J.ok('desfazer');
    Object.values(fones).forEach((c) => c.fechar());
    J.ws.fechar();
    await J.srv.fechar();
    fs.rmSync(J.dir, { recursive: true, force: true });
  }

  // ================= (b) Tigrinho =================
  {
    const J = await iniciar(30);
    const cel = await nova(390, 844, true);
    await cel.clock.install({ time: Date.now() }); // o relógio da barra (10 s) só anda quando o script manda: fotos estáveis
    await cel.goto(`${J.base}/g/azul`);
    await cel.waitForSelector('#g-nome');
    await cel.fill('#g-nome', 'Teste');
    await cel.click('.g-entrar');
    await cel.waitForSelector('.g-msg h2:has-text("Aguarde")');
    const outro = await entrarGrupo(J.srv.porta, 'vermelho', 'Rep vermelho');
    await J.ws.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
    await J.ok('iniciar');
    const host = await nova(1366, 768); await host.goto(`${J.base}/host`);
    const hostM = await nova(390, 844, true); await hostM.goto(`${J.base}/host`);
    const tela = await nova(1366, 768); await tela.goto(`${J.base}/tela`);
    const certa = () => J.ws.ultimo.pergunta.correta;
    const foto = async (nome, pg = cel) => {
      await pg.waitForTimeout(500);
      const texto = await pg.evaluate(() => document.body.innerText);
      if (/\bnull\b|\bundefined\b/i.test(texto)) erros.push(`${nome}: null/undefined na página`);
      const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      if (sw[0] > sw[1]) erros.push(`${nome}: rolagem horizontal ${sw[0]} > ${sw[1]}`);
      await pg.screenshot({ path: path.join(pastaCapturas, `390x844-8i-cel-${nome}.png`) });
    };
    const rodadaVermelho = async () => {
      await J.ok('mostrarAlternativas'); await J.ok('abrirJanela');
      outro.c.enviar({ t: 'apertar' });
      await J.ws.estadoApos((s) => s.estado.rodada.ordem.length === 1);
      await J.ok('encerrarJanela'); await J.ok('mostrarResposta'); await J.ok('responder', certa()); await J.ok('continuar');
    };
    for (let i = 0; i < 3; i += 1) await rodadaVermelho();
    await cel.waitForSelector('.g-tig');
    await foto('01-tigrinho-sobre-a-espera');
    await J.ok('mostrarAlternativas');
    await cel.waitForSelector('.g-tig');
    await foto('02-tigrinho-sobre-as-alternativas');
    // painel: a marca pequena no cartão; o projetor não mostra nada
    await host.waitForSelector('.hg-tag:has-text("3 sem pontuar")');
    await salvar(host, '1366x768-8i-painel-marca-3-sem-pontuar');
    await hostM.waitForSelector('.hg-tag:has-text("3 sem pontuar")');
    await salvar(hostM, '390x844-8i-host-marca-3-sem-pontuar', true);
    const sw = await hostM.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (sw[0] > sw[1]) erros.push('painel no celular com a marca: rolagem horizontal');
    await conferirBotaoTema(hostM, 'painel no celular com a marca', erros);
    await tela.waitForTimeout(400);
    const textoTela = await tela.evaluate(() => document.body.innerText);
    if (/tigrinho|sem pontuar/i.test(textoTela)) erros.push('o projetor mostra algo do Tigrinho');
    await salvar(tela, '1366x768-8i-projetor-sem-nada-do-tigrinho');
    // tocar abre a Aposta (a folha fica por cima) e a barra some e não volta nesta contagem
    await cel.click('.g-tig-corpo');
    await cel.waitForSelector('.g-folha:has-text("Aposta")');
    await foto('03-aposta-aberta-pela-barra');
    await cel.click('.g-fbtn:has-text("Voltar")');
    await cel.waitForTimeout(600);
    if (await cel.$('.g-tig')) erros.push('a barra voltou depois de abrir a Aposta');
    await foto('03b-depois-da-aposta-a-barra-nao-volta');
    // 6 sem pontuar: volta (com "há 6 rodadas"); o X dispensa
    await J.ok('abrirJanela');
    await J.ok('encerrarJanela'); // ninguém aperta: só a correta (conta como sem pontuar para os dois)
    await J.ok('continuar');
    for (let i = 0; i < 2; i += 1) await rodadaVermelho();
    await cel.waitForSelector('.g-tig');
    await foto('04-tigrinho-seis-rodadas');
    await cel.click('.g-tig-x');
    await cel.clock.runFor(600);
    await cel.waitForSelector('.g-tig', { state: 'detached' });
    await foto('05-tigrinho-dispensada');
    // 9 sem pontuar: foto ausente (círculo com a inicial T) e, depois, a janela aberta sem a barra
    for (let i = 0; i < 3; i += 1) await rodadaVermelho();
    await cel.waitForSelector('.g-tig');
    await J.ok('mostrarAlternativas');
    const cel2 = await nova(390, 844, true);
    await cel2.clock.install({ time: Date.now() });
    const token = await cel.evaluate(() => localStorage.getItem('oficina_token_azul')); // o mesmo grupo, em outra aba
    await cel2.addInitScript((tk) => { try { localStorage.setItem('oficina_token_azul', tk); } catch { /* sem armazenamento */ } }, token);
    await cel2.route('**/shared/tigrinho.png', (r) => r.abort());
    await cel2.goto(`${J.base}/g/azul`);
    await cel2.waitForSelector('.g-tig', { timeout: 15000 });
    await cel2.waitForSelector('.g-tig-inicial');
    await foto('06-foto-ausente-inicial-T', cel2);
    await J.ok('abrirJanela');
    await cel.waitForSelector('.g-botao:has-text("APERTE")');
    await cel.waitForSelector('.g-tig', { state: 'detached' });
    await foto('07-janela-aberta-sem-a-barra');

    await browser.close();
    outro.c.fechar();
    J.ws.fechar();
    await J.srv.fechar();
    fs.rmSync(J.dir, { recursive: true, force: true });
  }
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}. Sem null, sem rolagem horizontal e sem erros.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
