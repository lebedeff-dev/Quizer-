'use strict';
// Etapa 8l: o time "preto" é Preto no tema claro e Branco no noturno (mesmo id, mesmo grupo, mesma pontuação) e o celular não
// tem tema próprio: segue o tema global do servidor. Os testes de tela usam um Chrome/Edge de verdade (pulam sem navegador).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const R = require('../src/registro');
const { nomesDosGrupos, MARCA_PRETO } = require('../src/nomes');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, autenticar, PIN } = require('./ajuda');

const PUBLIC = path.join(__dirname, '..', 'public');
const esm = (rel) => import(pathToFileURL(path.join(PUBLIC, rel)).href);
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));
let chromium = null;
try { ({ chromium } = require('playwright-core')); } catch { /* sem playwright */ }
const SEM_NAVEGADOR = !CHROME || !chromium ? 'sem navegador instalado' : false;

async function montar(t, { nomes, local = true, config = { meta: 2, placarModo: 'desligado' }, dir: dirDado, manter = false } = {}) {
  const dir = dirDado || fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8l-'));
  if (!fs.existsSync(path.join(dir, 'perguntas.json'))) fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  if (config) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: config }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => local });
  const auth = await autenticar(srv.porta, PIN);
  const host = new Cliente(srv.porta, 'papel=host', auth.cookie);
  const abertos = [host];
  t.after(async () => { abertos.forEach((x) => x.fechar()); await srv.fechar().catch(() => {}); if (!manter) fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  const fones = {};
  if (nomes) {
    await ok('novoJogo', {});
    for (const [cor, nome] of Object.entries(nomes)) { const r = await entrarGrupo(srv.porta, cor, nome); fones[cor] = r.c; abertos.push(r.c); }
    await host.estadoApos((s) => s.estado.grupos.length === Object.keys(nomes).length && s.estado.grupos.every((g) => g.conectado));
  }
  const rodada = async (cor) => {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    fones[cor].enviar({ t: 'apertar' });
    await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta');
    await ok('responder', host.ultimo.pergunta.correta);
    await ok('continuar');
  };
  return { dir, srv, host, abertos, fones, ok, rodada, auth, base: `http://127.0.0.1:${srv.porta}` };
}

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

// ---------- cores por tema ----------
test('o time de id "preto" é Preto no claro (#212121, texto branco) e Branco no noturno (#F2F2F2, texto preto), com bom contraste e distinto do Cinza', async () => {
  const C = await esm('shared/cores.js');
  try {
    C.definirTemaDasCores('claro');
    assert.deepEqual({ ...C.CORES.preto }, { nome: 'Preto', hex: '#212121', contorno: '#616161' });
    assert.equal(C.textoSobre(C.CORES.preto.hex), '#FFFFFF');
    assert.ok(C.contraste('#212121', '#FFFFFF') >= 4.5);
    assert.match(C.estiloCor('preto'), /background:#212121;color:#FFFFFF;box-shadow:inset 0 0 0 2px #616161/);
    C.definirTemaDasCores('noturno');
    assert.deepEqual({ ...C.CORES.preto }, { nome: 'Branco', hex: '#F2F2F2', contorno: '#000000', sombra: '#9E9E9E' });
    assert.equal(C.textoSobre(C.CORES.preto.hex), '#000000');
    assert.ok(C.contraste('#F2F2F2', '#000000') >= 4.5, 'texto preto sobre #F2F2F2');
    assert.match(C.estiloCor('preto'), /background:#F2F2F2;color:#000000;box-shadow:inset 0 0 0 2px #000000/);
    assert.ok(C.contraste('#F2F2F2', '#90A4AE') >= 2, `Branco bem distinto do Cinza (contraste ${C.contraste('#F2F2F2', '#90A4AE').toFixed(2)})`);
    assert.ok(C.contraste('#F2F2F2', '#0F0F10') >= 4.5, 'contorno/cartão visível sobre o fundo noturno');
    assert.equal(C.CORES.preto.contorno, '#000000', 'contorno do Branco no noturno');
    assert.equal(C.CORES.preto.sombra, '#9E9E9E', 'a sombra do Branco continua cinza');
    assert.ok(C.contraste('#000000', '#F2F2F2') >= 4.5, 'o contorno preto aparece sobre o Branco');
    // as outras 9 cores não mudam com o tema
    for (const cor of Object.keys(C.CORES).filter((c) => c !== 'preto')) assert.ok(C.CORES[cor].hex && C.CORES[cor].nome);
    assert.equal(C.CORES.cinza.hex, '#90A4AE');
    // só o Branco no noturno mudou de contorno: as outras 9 cores não têm contorno
    for (const cor of Object.keys(C.CORES).filter((c) => c !== 'preto')) assert.equal(C.CORES[cor].contorno, undefined, cor);
    C.definirTemaDasCores('claro');
    assert.equal(C.CORES.preto.contorno, '#616161', 'Preto no claro continua com contorno #616161');
    C.definirTemaDasCores('noturno');
    assert.equal(Object.keys(C.CORES).length, 10, 'continuam 10 times');
    assert.equal(C.ORDEM_CORES.includes('preto'), true, 'o id continua preto');
    // ícone: traço escuro no Branco e claro no Preto (pela cor de texto calculada)
    const { svgDoTime, DESENHOS } = await esm('shared/imagens-times-dados.js');
    assert.match(svgDoTime('preto'), /stroke="currentColor"/);
    assert.equal(DESENHOS.preto, '<circle cx="32" cy="32" r="22"/><path d="M32 18v14l9 6"/>', 'o relógio é o mesmo nos dois temas');
  } finally {
    C.definirTemaDasCores('claro');
  }
});

test('nome de reserva do grupo vazio e linhas do Registro usam o nome do tema na hora de mostrar (marca no texto gravado)', () => {
  const g = [{ cor: 'preto', representante: '' }, { cor: 'azul', representante: 'Ana' }];
  assert.equal(nomesDosGrupos(g, 'claro').preto, 'Grupo Preto');
  assert.equal(nomesDosGrupos(g, 'noturno').preto, 'Grupo Branco');
  assert.equal(nomesDosGrupos(g, 'marcador').preto, `Grupo ${MARCA_PRETO}`);
  // nome digitado nunca muda com o tema
  assert.equal(nomesDosGrupos([{ cor: 'preto', representante: 'Preto Ltda' }], 'noturno').preto, 'Preto Ltda');
  const estado = { grupos: g, rodada: null };
  const item = R.linha(estado, 'conexao', (n) => `${n('preto')} conectado`);
  assert.equal(item.msg.includes(MARCA_PRETO), true, 'o texto gravado leva a marca, não o nome fixo');
  assert.equal(/Preto|Branco/.test(item.msg.replace(MARCA_PRETO, '')), false);
  assert.equal(R.exibir(item.msg, 'claro'), 'Grupo Preto conectado');
  assert.equal(R.exibir(item.msg, 'noturno'), 'Grupo Branco conectado');
  assert.equal(item.cor, 'preto');
});

test('/g/branco abre /g/preto (e a rota antiga /g/marrom também)', async (t) => {
  const S = await montar(t);
  for (const velha of ['branco', 'marrom']) {
    const r = await fetch(`${S.base}/g/${velha}`, { redirect: 'manual' });
    assert.equal(r.status, 302, velha);
    assert.equal(r.headers.get('location'), '/g/preto');
  }
  assert.equal((await fetch(`${S.base}/g/preto`)).status, 200);
});

test('visões e Registro seguem o tema: nome de reserva e linhas do Registro mudam na hora; o texto gravado em disco não tem o nome fixo', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8l-reg-'));
  let S = await montar(t, { nomes: { preto: 'Ana', azul: 'Bia' }, dir, manter: true });
  S.abertos.forEach((x) => x.fechar());
  await S.srv.fechar();
  // jogo salvo (ou migrado) em que o grupo Preto está sem nome: o nome de reserva depende do tema
  const arq = path.join(dir, 'jogo.json');
  const j = JSON.parse(fs.readFileSync(arq, 'utf8'));
  j.estado.grupos.find((g) => g.cor === 'preto').representante = '';
  fs.writeFileSync(arq, JSON.stringify(j));
  S = await montar(t, { dir });
  const tela = new Cliente(S.srv.porta, 'papel=tela');
  S.abertos.push(tela);
  await tela.aberto;
  await S.host.estadoApos((s) => !!s.nomes);
  assert.equal(S.host.ultimo.nomes.preto, 'Grupo Preto');
  await S.ok('liberarGrupo', 'preto'); // grava "O grupo <nome de reserva> foi liberado" no Registro
  const pegar = async (fim = 'json') => {
    const r = await fetch(`${S.base}/api/registro${fim === 'txt' ? '.txt' : ''}`, { headers: { Cookie: S.auth.cookie } });
    return fim === 'txt' ? r.text() : (await r.json()).itens.map((i) => i.msg);
  };
  assert.ok((await pegar()).includes('O grupo Grupo Preto foi liberado'), (await pegar()).join('|'));
  assert.match(await pegar('txt'), /O grupo Grupo Preto foi liberado/);
  const gravado = fs.readFileSync(path.join(dir, 'registro.json'), 'utf8');
  await new Promise((r) => setTimeout(r, 600)); // a gravação do Registro é adiada
  const emDisco = fs.readFileSync(path.join(dir, 'registro.json'), 'utf8');
  void gravado;
  assert.ok(emDisco.includes('\\u2063PRETO\\u2063') || emDisco.includes(MARCA_PRETO), 'o disco guarda a marca');
  assert.equal(/Grupo Preto|Grupo Branco/.test(emDisco), false, 'nunca o nome fixo gravado');
  // trocar o tema: tudo muda na hora
  await S.ok('definirTema', 'noturno');
  assert.ok((await pegar()).includes('O grupo Grupo Branco foi liberado'));
  assert.match(await pegar('txt'), /O grupo Grupo Branco foi liberado/);
  await S.ok('definirTema', 'claro');
  assert.ok((await pegar()).includes('O grupo Grupo Preto foi liberado'));
});

test('ao trocar o tema com jogo em andamento, a /tela e o painel recebem o nome de reserva novo e o mesmo grupo (id preto, mesma pontuação)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8l-vis-'));
  let S = await montar(t, { nomes: { preto: 'Ana', azul: 'Bia' }, dir, manter: true });
  S.abertos.forEach((x) => x.fechar());
  await S.srv.fechar();
  const arq = path.join(dir, 'jogo.json');
  const j = JSON.parse(fs.readFileSync(arq, 'utf8'));
  j.estado.grupos.find((g) => g.cor === 'preto').representante = '';
  j.estado.grupos.find((g) => g.cor === 'preto').pontos = 25;
  fs.writeFileSync(arq, JSON.stringify(j));
  S = await montar(t, { dir });
  const tela = new Cliente(S.srv.porta, 'papel=tela');
  S.abertos.push(tela);
  await tela.aberto;
  await tela.estadoApos((s) => !!s.nomes);
  assert.equal(tela.ultimo.nomes.preto, 'Grupo Preto');
  await S.ok('definirTema', 'noturno');
  const depois = await tela.estadoApos((s) => s.tema === 'noturno');
  assert.equal(depois.nomes.preto, 'Grupo Branco');
  assert.equal((await S.host.estadoApos((s) => s.ui.tema === 'noturno')).nomes.preto, 'Grupo Branco');
  const g = S.host.ultimo.estado.grupos.find((x) => x.cor === 'preto');
  assert.equal(g.pontos, 25, 'a pontuação é a mesma');
});

// ---------- telas ----------
const abrirCelular = async (browser, S, cor, nome, opcoes = {}, antes = null) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...opcoes });
  const pg = await ctx.newPage();
  if (antes) await antes(pg);
  await pg.goto(`${S.base}/g/${cor}`);
  await pg.waitForSelector('#g-nome');
  await pg.fill('#g-nome', nome);
  await pg.click('.g-entrar');
  await pg.waitForSelector('.g-nome-grupo');
  return { ctx, pg };
};

// Contraste real, medido na página: cada texto visível contra o fundo opaco mais próximo.
const MEDIR_CONTRASTE = () => {
  const lum = (r, g, b) => { const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cor = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x)); return { r, g, b, a }; };
  const fundoDe = (n) => {
    for (let x = n; x; x = x.parentElement) {
      const c = cor(getComputedStyle(x).backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const semOpacidade = (n) => { for (let x = n; x; x = x.parentElement) if (parseFloat(getComputedStyle(x).opacity) < 0.99) return false; return true; };
  const ruins = [];
  let medidos = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const tx = w.currentNode;
    const n = tx.parentElement;
    if (!tx.textContent.trim() || !n || n.closest('canvas, script, style')) continue;
    const r = n.getBoundingClientRect();
    const s = getComputedStyle(n);
    if (!r.width || !r.height || s.visibility === 'hidden' || s.display === 'none' || !semOpacidade(n)) continue;
    const f = cor(s.color);
    const b = fundoDe(n);
    if (!f) continue;
    const L1 = lum(f.r, f.g, f.b) + 0.05;
    const L2 = lum(b.r, b.g, b.b) + 0.05;
    const c = Math.max(L1, L2) / Math.min(L1, L2);
    medidos += 1;
    if (c < 3) ruins.push(`${tx.textContent.trim().slice(0, 24)} (${c.toFixed(2)})`);
  }
  return { medidos, ruins };
};

test('celular: sem botão nem tecla de tema, nada de tema no armazenamento do aparelho; segue o tema do servidor ao conectar, reconectar e ao alternar (Preto vira Branco)', { skip: SEM_NAVEGADOR, timeout: 240000 }, async (t) => {
  const S = await montar(t);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  await S.ok('novoJogo', {});
  // guarda os WebSockets da página para poder derrubá-los de verdade (reconexão)
  const espiar = (pg) => pg.addInitScript(() => { const W = window.WebSocket; window.__sockets = []; window.WebSocket = function (...a) { const w = new W(...a); window.__sockets.push(w); return w; }; window.WebSocket.prototype = W.prototype; });
  const pre = await abrirCelular(browser, S, 'preto', 'Ana', {}, espiar);
  const ama = await abrirCelular(browser, S, 'amarelo', 'Bia');
  await S.host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  const estilo = (pg) => pg.evaluate(() => {
    const raiz = document.documentElement;
    const h = document.querySelector('.g-nome-grupo');
    return { tema: raiz.dataset.tema, fundo: getComputedStyle(document.body).backgroundColor, texto: getComputedStyle(h).color, aria: h.getAttribute('aria-label'), titulo: document.title, tema_ls: (() => { try { return localStorage.getItem('oficina_tema'); } catch { return 'erro'; } })(), botoes: document.querySelectorAll('.btn-tema').length };
  });
  // claro
  let e = await estilo(pre.pg);
  assert.deepEqual({ tema: e.tema, fundo: e.fundo, texto: e.texto }, { tema: 'claro', fundo: rgb('#212121'), texto: 'rgb(255, 255, 255)' });
  assert.match(e.aria, /cor Preto$/);
  assert.match(e.titulo, /Preto/);
  assert.equal(e.botoes, 0, 'sem botão de tema no celular');
  assert.equal(e.tema_ls, null, 'o celular não grava tema no aparelho');
  await pre.pg.keyboard.press('t');
  await pre.pg.waitForTimeout(150);
  assert.equal((await estilo(pre.pg)).tema, 'claro', 'a tecla T não faz nada no celular');
  // o responsável alterna: o celular muda sem recarregar
  await S.ok('definirTema', 'noturno');
  await pre.pg.waitForFunction(() => document.documentElement.dataset.tema === 'noturno' && getComputedStyle(document.body).backgroundColor === 'rgb(242, 242, 242)');
  e = await estilo(pre.pg);
  assert.deepEqual({ fundo: e.fundo, texto: e.texto }, { fundo: rgb('#F2F2F2'), texto: 'rgb(0, 0, 0)' });
  assert.match(e.aria, /cor Branco$/);
  assert.match(e.titulo, /Branco/);
  assert.equal(e.tema_ls, null);
  const outro = await estilo(ama.pg);
  assert.deepEqual({ tema: outro.tema, fundo: outro.fundo }, { tema: 'noturno', fundo: rgb('#FFEE58') }, 'Amarelo segue o tema e mantém a cor');
  // reconexão: derruba o socket do celular e confere que volta no tema certo (e que o tema mudou no servidor durante a queda)
  await pre.pg.evaluate(() => window.__sockets.forEach((w) => w.close())); // o celular perde a conexão
  await pre.pg.waitForSelector('.g-reconectando', { timeout: 8000 });
  await S.ok('definirTema', 'claro'); // o tema muda no servidor durante a queda
  await pre.pg.waitForSelector('.g-reconectando', { state: 'detached', timeout: 15000 }); // reconectou sozinho
  await pre.pg.waitForFunction(() => document.documentElement.dataset.tema === 'claro' && getComputedStyle(document.body).backgroundColor === 'rgb(33, 33, 33)');
  assert.equal((await estilo(pre.pg)).fundo, rgb('#212121'));
  // recarregar com o tema noturno no servidor: já abre no noturno (usa o tema do servidor antes de desenhar), sem tema no aparelho
  await S.ok('definirTema', 'noturno');
  await pre.pg.reload();
  await pre.pg.waitForSelector('.g-nome-grupo');
  e = await estilo(pre.pg);
  assert.equal(e.tema, 'noturno');
  assert.equal(e.fundo, rgb('#F2F2F2'));
  assert.equal(e.tema_ls, null);
  // servidor não responde (capa bloqueada e sem WebSocket): usa o claro
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.route('**/api/capa', (r) => r.abort());
  await pg.addInitScript(() => { window.WebSocket = class { constructor() { setTimeout(() => this.onerror?.(new Event('error')), 0); } send() {} close() {} }; });
  await pg.goto(`${S.base}/g/azul`);
  await pg.waitForFunction(() => document.documentElement.dataset.tema);
  assert.equal(await pg.evaluate(() => document.documentElement.dataset.tema), 'claro');
  await ctx.close();
});

test('legibilidade nos dois temas: nenhum texto do celular (tela, folhas, chips, pop-up de comemoração, Tigrinho) fica ilegível, com Preto/Branco, Amarelo e Azul', { skip: SEM_NAVEGADOR, timeout: 300000 }, async (t) => {
  const S = await montar(t, { config: { meta: 2, placarModo: 'desligado', compraMax: 3 } });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  await S.ok('novoJogo', {});
  const cels = { preto: await abrirCelular(browser, S, 'preto', 'Ana'), amarelo: await abrirCelular(browser, S, 'amarelo', 'Bia'), azul: await abrirCelular(browser, S, 'azul', 'Clara') };
  await S.host.estadoApos((s) => s.estado.grupos.length === 3 && s.estado.grupos.every((g) => g.conectado));
  await S.ok('iniciar');
  const checar = async (rotulo) => {
    for (const [cor, { pg }] of Object.entries(cels)) {
      await pg.waitForTimeout(450); // transição de cor do tema
      const r = await pg.evaluate(MEDIR_CONTRASTE);
      assert.ok(r.medidos > 0, `${rotulo} ${cor}: nada medido`);
      assert.deepEqual(r.ruins, [], `${rotulo} ${cor}: texto ilegível`);
      assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${rotulo} ${cor}: rolagem horizontal`);
    }
  };
  for (const tema of ['claro', 'noturno']) {
    await S.ok('definirTema', tema);
    for (const { pg } of Object.values(cels)) await pg.waitForFunction((x) => document.documentElement.dataset.tema === x, tema);
    await checar(`${tema}, tela principal`);
    // folha de habilidade aberta pelo chip da Aposta
    for (const [cor, { pg }] of Object.entries(cels)) {
      await pg.click('.g-chip[data-tipo="aposta"]', { force: true });
      await pg.waitForSelector('.g-folha');
      await pg.waitForTimeout(250);
      const r = await pg.evaluate(MEDIR_CONTRASTE);
      assert.deepEqual(r.ruins, [], `${tema} ${cor}: folha ilegível`);
      await pg.click('.g-fbtn:has-text("Voltar")');
      await pg.waitForSelector('.g-folha', { state: 'detached' });
    }
  }
  // Tigrinho (3 rodadas sem pontuar): a barra de conversa também fica legível nos dois temas
  S.srv.aplicarNoEstadoParaTeste((s) => { const n = structuredClone(s); n.grupos.find((g) => g.cor === 'azul').rodadasSemPontos = 3; return n; });
  await cels.azul.pg.waitForSelector('.g-tig');
  for (const tema of ['claro', 'noturno']) {
    await S.ok('definirTema', tema);
    await cels.azul.pg.waitForFunction((x) => document.documentElement.dataset.tema === x, tema);
    await cels.azul.pg.waitForTimeout(500);
    const r = await cels.azul.pg.evaluate(MEDIR_CONTRASTE);
    assert.deepEqual(r.ruins, [], `${tema}: Tigrinho ilegível`);
  }
  await cels.azul.pg.click('.g-tig-x');
  // rodadas até o Ranking com o Preto/Branco vencendo: pop-up de comemoração e Tigrinho nos dois temas
  const rodar = async () => {
    await S.ok('mostrarAlternativas'); await S.ok('abrirJanela');
    await cels.preto.pg.waitForSelector('.g-botao:has-text("APERTE")');
    await cels.preto.pg.click('.g-botao');
    await S.host.estadoApos((s) => s.estado.rodada.ordem.length >= 1);
    await S.ok('encerrarJanela'); await S.ok('mostrarResposta');
    await S.ok('responder', S.host.ultimo.pergunta.correta);
    await S.ok('continuar');
  };
  await rodar();
  await rodar();
  await S.host.estadoApos((s) => s.estado.fase === 'ranking' && s.vencedor === 'preto');
  for (const tema of ['claro', 'noturno']) {
    await S.ok('definirTema', tema);
    await S.ok('comemorar');
    for (const [cor, { pg }] of Object.entries(cels)) {
      await pg.waitForSelector('.g-parabens');
      await pg.waitForTimeout(500);
      const r = await pg.evaluate(MEDIR_CONTRASTE);
      assert.deepEqual(r.ruins, [], `${tema} ${cor}: pop-up de comemoração ilegível`);
      await pg.click('.g-parabens-fechar');
    }
  }
  await S.ok('desfazer');
});

test('painel e projetor: trocar o tema com o jogo em andamento muda o time Preto/Branco na hora (seleção, QR, ranking, banner de parabéns); o aviso do painel aparece uma vez por troca', { skip: SEM_NAVEGADOR, timeout: 300000 }, async (t) => {
  const S = await montar(t);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  await S.ok('novoJogo', {});
  const tela = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const painel = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await tela.goto(`${S.base}/tela`);
  await painel.goto(`${S.base}/host`);
  await tela.waitForSelector('.bloco[data-cor="preto"]');
  await painel.waitForSelector('.hs-ficha');
  const bloco = (pg) => pg.evaluate(() => { const b = document.querySelector('.bloco[data-cor="preto"]'); const s = getComputedStyle(b); return { nome: b.querySelector('.bloco-nome').textContent, fundo: s.backgroundColor, texto: s.color, icone: getComputedStyle(b.querySelector('.time-img')).color }; });
  assert.deepEqual(await bloco(tela), { nome: 'Preto', fundo: rgb('#212121'), texto: 'rgb(255, 255, 255)', icone: 'rgb(255, 255, 255)' });
  assert.equal(await painel.locator('.aviso-tema').count(), 0, 'sem aviso ao abrir');
  // sem grupo Preto em uso: trocar o tema não avisa
  await S.ok('definirTema', 'noturno');
  await tela.waitForFunction(() => document.querySelector('.bloco[data-cor="preto"] .bloco-nome').textContent === 'Branco');
  assert.deepEqual(await bloco(tela), { nome: 'Branco', fundo: rgb('#F2F2F2'), texto: 'rgb(0, 0, 0)', icone: 'rgb(0, 0, 0)' });
  assert.equal(await painel.locator('.hs-ficha:has(.hs-nome:text-is("Branco"))').count(), 1, 'a ficha do painel também');
  // contorno preto no Branco do noturno (bloco da /tela e ficha do painel); o Preto do claro tem o cinza #616161
  assert.equal(await tela.evaluate(() => getComputedStyle(document.querySelector('.bloco[data-cor="preto"]')).boxShadow), 'rgb(0, 0, 0) 0px 0px 0px 2px inset');
  await painel.waitForTimeout(300);
  assert.equal(await painel.locator('.aviso-tema').count(), 0, 'sem time Preto em uso, sem aviso');
  await S.ok('selecionarCor', 'preto');
  await tela.waitForSelector('.qr-faixa');
  assert.equal((await tela.locator('.qr-faixa').innerText()).trim(), 'Branco');
  await S.ok('selecionarCor', null);
  await S.ok('definirTema', 'claro');
  // entram os grupos; o Preto passa a estar em uso
  const f = {};
  for (const [cor, nome] of [['preto', 'Ana'], ['azul', 'Bia']]) { const r = await entrarGrupo(S.srv.porta, cor, nome); f[cor] = r.c; S.abertos.push(r.c); }
  await S.host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await S.ok('iniciar');
  S.fones.preto = f.preto;
  for (let i = 0; i < 2; i += 1) await S.rodada('preto');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking' && s.vencedor === 'preto');
  await tela.waitForSelector('.rank-barra');
  const barra = (pg) => pg.evaluate(() => { const b = document.querySelector('.rank-barra'); const s = getComputedStyle(b); return { nome: b.querySelector('.rank-nome').textContent, fundo: s.backgroundColor, texto: s.color }; });
  assert.deepEqual(await barra(tela), { nome: 'Ana', fundo: rgb('#212121'), texto: 'rgb(255, 255, 255)' });
  await S.ok('comemorar');
  await tela.waitForSelector('.comem-banner');
  const banner = (pg) => pg.evaluate(() => { const b = document.querySelector('.comem-banner'); const s = getComputedStyle(b); return { titulo: b.querySelector('.comem-titulo').textContent, fundo: s.backgroundColor, texto: s.color, icone: getComputedStyle(b.querySelector('.time-img')).color }; });
  assert.deepEqual(await banner(tela), { titulo: 'Parabéns, Ana!', fundo: rgb('#212121'), texto: 'rgb(255, 255, 255)', icone: 'rgb(255, 255, 255)' });
  // troca de tema com tudo na tela: ranking, banner e aviso do painel mudam na hora
  await S.ok('definirTema', 'noturno');
  await tela.waitForFunction(() => getComputedStyle(document.querySelector('.comem-banner')).backgroundColor === 'rgb(242, 242, 242)');
  assert.deepEqual(await banner(tela), { titulo: 'Parabéns, Ana!', fundo: rgb('#F2F2F2'), texto: 'rgb(0, 0, 0)', icone: 'rgb(0, 0, 0)' });
  assert.deepEqual(await barra(tela), { nome: 'Ana', fundo: rgb('#F2F2F2'), texto: 'rgb(0, 0, 0)' });
  assert.equal(await tela.locator('.comem-banner').count(), 1, 'um só banner');
  assert.equal(S.host.ultimo.estado.grupos.find((g) => g.cor === 'preto').pontos, 30, 'a pontuação é a mesma');
  await painel.waitForSelector('.aviso-tema');
  assert.equal((await painel.locator('.aviso-tema').innerText()).replace('×', '').trim(), 'O grupo Preto aparece como Branco no tema noturno.');
  assert.equal(await painel.locator('.aviso-tema').count(), 1, 'uma vez');
  await painel.waitForTimeout(600);
  assert.equal(await painel.locator('.aviso-tema').count(), 1, 'redesenhos do painel não repetem o aviso');
  await painel.click('.aviso-tema-x');
  assert.equal(await painel.locator('.aviso-tema').count(), 0);
  // volta ao claro: é uma nova troca e o aviso aparece de novo
  await S.ok('definirTema', 'claro');
  await painel.waitForSelector('.aviso-tema');
  await tela.waitForFunction(() => getComputedStyle(document.querySelector('.comem-banner')).backgroundColor === 'rgb(33, 33, 33)');
  // o botão do painel e a tecla T continuam alternando o tema global
  await painel.keyboard.press('t');
  await painel.waitForFunction(() => document.documentElement.dataset.tema === 'noturno');
  assert.equal(S.host.ultimo.ui.tema === 'noturno' || (await S.host.estadoApos((s) => s.ui.tema === 'noturno')).ui.tema === 'noturno', true);
});
