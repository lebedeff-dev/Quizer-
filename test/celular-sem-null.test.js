'use strict';
// Celular do grupo em um navegador de verdade: em todas as fases a página não pode mostrar "null" nem "undefined"
// (um replaceChildren(null) escrevia "nullnullnull" na tela de espera), a decisão do Escudo não tem "Fechar" e o
// ícone do Passe é branco sobre o círculo escuro do tema noturno. Pula sozinho se não houver Chrome/Edge instalado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, PIN } = require('./ajuda');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));
let chromium = null;
try { ({ chromium } = require('playwright-core')); } catch { /* sem playwright */ }

test('celular: nenhuma fase mostra "null" ou "undefined"; Escudo sem Fechar; Passe visível no tema noturno', { skip: !CHROME || !chromium ? 'sem navegador instalado' : false, timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-null-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { meta: 10, placarModo: 'toda' } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const host = new Cliente(srv.porta, 'papel=host');
  t.after(async () => { host.fechar(); await browser.close(); await srv.fechar().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  const estado = () => host.ultimo.estado;
  const certa = () => host.ultimo.pergunta.correta;
  const avancar = async () => { await ok('continuar'); if (estado().fase === 'placar') await ok('continuar'); };

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  const vistos = [];
  const limpo = async (rotulo) => {
    await pg.waitForTimeout(250);
    const texto = await pg.evaluate(() => document.body.innerText);
    vistos.push(rotulo);
    assert.doesNotMatch(texto, /\bnull\b|\bundefined\b|nullnull/i, `"${rotulo}" mostra null/undefined: ${JSON.stringify(texto.slice(0, 200))}`);
    // texto solto direto no body, fora do layout (era o caso do "nullnullnull")
    const solto = await pg.evaluate(() => [...document.getElementById('app').childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent));
    assert.deepEqual(solto, [], `"${rotulo}" tem texto solto fora do layout`);
  };

  await ok('novoJogo', {});
  await pg.goto(`http://127.0.0.1:${srv.porta}/g/azul`);
  await pg.waitForSelector('#g-nome');
  await limpo('formulário de entrada');
  await pg.fill('#g-nome', 'Teste');
  await pg.click('.g-entrar');
  await pg.waitForSelector('.g-msg h2:has-text("Aguarde")');
  await limpo('sala de espera (Aguarde)');
  const outro = await entrarGrupo(srv.porta, 'vermelho', 'Vermelho');
  await host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  await pg.waitForSelector('.g-botao');
  await limpo('pergunta');
  await ok('mostrarAlternativas');
  await limpo('alternativas');
  await ok('abrirJanela');
  await pg.waitForSelector('.g-botao:has-text("APERTE")');
  await limpo('janela aberta (só o contador)');
  await pg.click('.g-botao');
  await pg.waitForSelector('.g-botao:has-text("Registrado")');
  await limpo('registrado');
  await ok('pausar', true);
  await limpo('pausado');
  await ok('pausar', false);
  await ok('encerrarJanela');
  await limpo('ordem');
  await ok('mostrarResposta');
  await limpo('resposta (botão de troca desabilitado)');
  await ok('responder', certa());
  await limpo('explicação');
  await ok('continuar');
  await pg.waitForSelector('.g-msg h2:has-text("Placar na tela")');
  await limpo('placar na tela');
  await ok('continuar');

  // 3 acertos seguidos: botão de troca habilitado, lista da faixa (com o Passe) e a folha
  const rodada = async () => {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    await pg.waitForSelector('.g-botao:has-text("APERTE")'); await pg.click('.g-botao');
    await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta'); await ok('responder', certa());
  };
  await rodada(); await avancar(); // 2 acertos
  await rodada();
  await limpo('explicação com 3 acertos');
  await pg.waitForSelector('.g-troca-btn:not([disabled])');
  await pg.click('.g-troca-btn');
  await pg.waitForSelector('.g-folha .g-fitem');
  await limpo('lista de trocas');
  const passe = await pg.$('.g-folha .g-fitem-selo img[data-tipo="passe"]');
  assert.ok(passe, 'a lista mostra o Passe');
  await pg.evaluate(() => { document.documentElement.dataset.tema = 'noturno'; });
  const filtro = await passe.evaluate((i) => getComputedStyle(i).filter);
  assert.match(filtro, /invert\(1\)/, 'no tema noturno o ícone do Passe é invertido (branco) sobre o círculo escuro');
  await pg.evaluate(() => { document.documentElement.dataset.tema = 'claro'; });
  assert.equal(await passe.evaluate((i) => getComputedStyle(i).filter), 'none', 'no tema claro o ícone continua escuro');
  await pg.click('.g-fbtn:has-text("Fechar")');
  await ok('trocarAcertos', 'azul', 'escudo');
  await avancar();
  await limpo('estoque no celular');

  // decisão do Escudo: o outro grupo ganha um Bloqueio e o ativa sobre azul
  for (let i = 0; i < 3; i += 1) {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    outro.c.enviar({ t: 'apertar' });
    await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta'); await ok('responder', certa());
    if (i < 2) await avancar();
  }
  await ok('trocarAcertos', 'vermelho', 'bloqueio');
  await avancar();
  await ok('ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  await pg.waitForSelector('.g-folha:has-text("bloqueou vocês")');
  await limpo('decisão do Escudo');
  const botoes = await pg.$$eval('.g-folha .g-fbtn', (b) => b.map((x) => x.textContent.trim()));
  assert.deepEqual(botoes, ['Usar o Escudo', 'Aceitar o bloqueio'], 'a decisão do Escudo não tem "Fechar"');
  await pg.goBack().catch(() => {});
  await pg.waitForTimeout(300);
  assert.ok(await pg.$('.g-folha:has-text("bloqueou vocês")'), 'o botão Voltar do navegador não tira a decisão pendente da tela');
  await pg.click('.g-fbtn:has-text("Aceitar o bloqueio")');
  await pg.click('.g-fbtn:has-text("Confirmar")');
  await pg.waitForSelector('.g-folha', { state: 'detached' });
  await ok('mostrarAlternativas');
  await ok('abrirJanela');
  await pg.waitForSelector('.g-botao.bloqueado');
  await limpo('bloqueado');
  await ok('encerrarJanela');
  await limpo('só a correta');
  assert.ok(vistos.length >= 17, `fases conferidas: ${vistos.join(', ')}`);
});
