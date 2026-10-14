'use strict';
// Etapa 8k-1b: ícones próprios e sempre inteiros, seleção salva nas Configurações, Aleatorizar ordem várias vezes,
// nome do grupo no lugar do nome da cor. As partes de tela usam um Chrome/Edge de verdade (pulam sem navegador).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const G = require('../src/game');
const { nomesDosGrupos } = require('../src/nomes');
const R = require('../src/registro');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, autenticar, PIN, nomeDaCor } = require('./ajuda');

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
const TODAS = G.CORES;
const BASE = { meta: 14, janela: 30, pontosPrimeiro: 10, pontosSegundo: 5, seqBloqueio: 3, seqDobro: 5 };

async function servidor(t, { config, local = true, dir: dirDado } = {}) {
  const dir = dirDado || fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8kb-'));
  if (!fs.existsSync(path.join(dir, 'perguntas.json'))) fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  if (config) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: config }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => local });
  const auth = await autenticar(srv.porta, PIN);
  const host = new Cliente(srv.porta, 'papel=host', auth.cookie);
  const abertos = [host];
  t.after(async () => { abertos.forEach((x) => x.fechar()); await srv.fechar().catch(() => {}); if (!dirDado) fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  return { dir, srv, host, abertos, ok, base: `http://127.0.0.1:${srv.porta}` };
}

async function navegador(t) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  return browser;
}

// ---------- ícones ----------
test('relógio (Preto) e olho (Cinza) são os desenhos combinados, e os 10 ícones são todos diferentes', async () => {
  const { DESENHOS } = await esm('shared/imagens-times-dados.js');
  assert.equal(DESENHOS.preto, '<circle cx="32" cy="32" r="22"/><path d="M32 18v14l9 6"/>');
  assert.equal(DESENHOS.cinza, '<path d="M4 32C12 18 22 12 32 12s20 6 28 20C52 46 42 52 32 52S12 46 4 32z"/><circle cx="32" cy="32" r="8"/>');
  assert.equal(new Set(Object.values(DESENHOS)).size, 10);
  assert.deepEqual(Object.keys(DESENHOS).sort(), [...TODAS].sort());
});

// Mede, num navegador, o ícone de cada caixa: inteiro dentro da tela e da caixa, sem cruzar nenhum texto.
const MEDIR = (seletor) => {
  const textosDe = (raiz) => {
    const saida = [];
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (!n.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) if (q.width > 0) saida.push({ x: q.left, y: q.top, r: q.right, b: q.bottom, t: n.textContent.trim().slice(0, 20) });
    }
    return saida;
  };
  return [...document.querySelectorAll(seletor)].map((caixa) => {
    const ic = caixa.querySelector('.time-img');
    const C = caixa.getBoundingClientRect();
    const base = { id: caixa.dataset.cor || caixa.className, caixa: [C.left, C.top, C.right, C.bottom].map(Math.round) };
    if (!ic || getComputedStyle(ic).display === 'none') return { ...base, escondido: true };
    const r = ic.getBoundingClientRect();
    const cruza = textosDe(caixa).filter((q) => q.x < r.right - 0.5 && q.r > r.left + 0.5 && q.y < r.bottom - 0.5 && q.b > r.top + 0.5).map((q) => q.t);
    return {
      ...base,
      icone: [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 10) / 10),
      naTela: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
      naCaixa: r.left >= C.left - 0.5 && r.top >= C.top - 0.5 && r.right <= C.right + 0.5 && r.bottom <= C.bottom + 0.5,
      cruza,
      largura: Math.round(r.width),
    };
  });
};

test('banners da seleção (/tela em 1366x768 e 1920x1080, /host, QR): ícone inteiro, dentro do banner e sem cruzar nome nem "Livre"', { skip: SEM_NAVEGADOR, timeout: 180000 }, async (t) => {
  const S = await servidor(t);
  const browser = await navegador(t);
  await S.ok('novoJogo', {});
  // 4 cores ocupadas (uma delas com nome longo) e 6 livres
  const nomes = { vermelho: 'Ana', azul: 'Maria Aparecida de Albuquerque Nasciment', preto: 'Bia', cinza: 'Clara' };
  for (const [cor, nome] of Object.entries(nomes)) S.abertos.push((await entrarGrupo(S.srv.porta, cor, nome)).c);
  await S.host.estadoApos((s) => s.estado.grupos.length === 4);
  for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    const tela = await (await browser.newContext({ viewport: vp })).newPage();
    await tela.goto(`${S.base}/tela`);
    await tela.waitForSelector('.bloco');
    const medidas = await tela.evaluate(MEDIR, '.bloco');
    assert.equal(medidas.length, 10);
    for (const m of medidas) {
      assert.ok(!m.escondido, `${vp.width}: ${m.id} sem ícone`);
      assert.ok(m.naTela && m.naCaixa, `${vp.width}: ${m.id} fora da tela ou do banner ${JSON.stringify(m)}`);
      assert.deepEqual(m.cruza, [], `${vp.width}: ${m.id} cruza o texto`);
    }
    // QR de cada cor livre: o ícone fica dentro da faixa
    for (const cor of TODAS.filter((c) => !nomes[c])) {
      await S.ok('selecionarCor', cor);
      await tela.waitForSelector('.qr-faixa .time-img');
      const [q] = await tela.evaluate(MEDIR, '.qr-faixa');
      assert.ok(q.naTela && q.naCaixa, `${vp.width}: QR ${cor} ${JSON.stringify(q)}`);
      assert.deepEqual(q.cruza, [], `${vp.width}: QR ${cor} cruza o nome`);
    }
    await S.ok('selecionarCor', null);
    await tela.context().close();
  }
  const painel = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await painel.goto(`${S.base}/host`);
  await painel.waitForSelector('.hs-ficha');
  for (const m of await painel.evaluate(MEDIR, '.hs-ficha')) {
    if (m.escondido) continue;
    assert.ok(m.naTela && m.naCaixa, `painel ${JSON.stringify(m)}`);
    assert.deepEqual(m.cruza, [], `painel: ${m.id} cruza ${m.cruza}`);
  }
});

test('celular: os 10 ícones ficam inteiros na tela (390x844, 360x640 e 320x568), sem rolagem horizontal, nome longo não corta', { skip: SEM_NAVEGADOR, timeout: 240000 }, async (t) => {
  const S = await servidor(t);
  const browser = await navegador(t);
  await S.ok('novoJogo', {});
  const longo = 'Maria Aparecida de Albuquerque Nasciment';
  for (const cor of TODAS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    await pg.goto(`${S.base}/g/${cor}`);
    await pg.waitForSelector('#g-nome');
    await pg.fill('#g-nome', cor === 'azul' ? longo : `Time ${nomeDaCor(cor)}`);
    await pg.click('.g-entrar');
    await pg.waitForSelector('.g-nome-grupo');
    for (const [w, h] of [[390, 844], [360, 640], [320, 568]]) {
      await pg.setViewportSize({ width: w, height: h });
      await pg.waitForTimeout(120);
      const m = await pg.evaluate(() => {
        const ic = document.querySelector('.g .time-img');
        const r = ic.getBoundingClientRect();
        const nome = document.querySelector('.g-nome-grupo');
        return {
          dentro: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          margem: [r.top, innerWidth - r.right],
          largura: r.width,
          rolagem: document.documentElement.scrollWidth > innerWidth,
          nomeCortado: nome.scrollWidth > nome.clientWidth + 1,
          texto: nome.textContent,
          aria: nome.getAttribute('aria-label'),
          semNomeDeCor: !/^(Vermelho|Azul|Verde|Amarelo|Laranja|Roxo|Rosa|Ciano|Preto|Cinza)$/.test(nome.textContent),
        };
      });
      assert.ok(m.dentro, `${cor} ${w}x${h}: ícone fora da tela`);
      assert.ok(m.margem[0] >= 11.5 && m.margem[1] >= 11.5, `${cor} ${w}x${h}: margem ${m.margem}`);
      assert.ok(m.largura <= 110.5 && m.largura >= 55, `${cor} ${w}x${h}: largura ${m.largura}`);
      assert.ok(!m.rolagem, `${cor} ${w}x${h}: rolagem horizontal`);
      assert.ok(!m.nomeCortado, `${cor} ${w}x${h}: nome cortado`);
      assert.ok(m.semNomeDeCor && m.aria.includes(`cor ${nomeDaCor(cor)}`), `${cor}: topo mostra só o nome do grupo e a cor só no aria-label (${m.texto} / ${m.aria})`);
    }
    await ctx.close();
  }
});

// ---------- Configurações: modo do placar ----------
test('Configurações: cada modo salvo do placar parcial aparece selecionado ao reabrir (cada, toda, desligado)', { skip: SEM_NAVEGADOR, timeout: 120000 }, async (t) => {
  const S = await servidor(t);
  const browser = await navegador(t);
  const pg = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await pg.goto(`${S.base}/host`);
  const abrir = async () => {
    await S.ok('irMenu');
    await pg.waitForSelector('.opcao');
    await pg.click('.menu-extra >> text=Configurações');
    await pg.waitForSelector('#cfg-placarModo');
  };
  const lido = () => pg.evaluate(() => { const s = document.getElementById('cfg-placarModo'); return { valor: s.value, marcada: [...s.options].filter((o) => o.selected).map((o) => o.value), texto: s.selectedOptions[0].textContent }; });
  await abrir();
  assert.deepEqual((await lido()).marcada, ['cada'], 'padrão: de tantas em tantas perguntas');
  assert.equal(S.host.ultimo.configJogo.placarModo, 'cada');
  for (const modo of ['toda', 'desligado', 'cada']) {
    assert.equal((await S.host.acao('salvarConfigJogo', { ...BASE, placarModo: modo })).t, 'ok');
    await abrir();
    const l = await lido();
    assert.equal(l.valor, modo, `salvo pelo servidor: ${modo}`);
    assert.deepEqual(l.marcada, [modo]);
  }
  // salvar pela própria tela: escolhe "toda", salva, sai e volta
  await pg.selectOption('#cfg-placarModo', 'toda');
  await pg.click('button:has-text("Salvar")');
  await pg.waitForSelector('.pg-status:has-text("Salvo às")');
  await abrir();
  assert.equal((await lido()).valor, 'toda');
  // restaurar os valores padrão volta para "cada"
  await pg.click('button:has-text("Restaurar valores padrão")');
  assert.equal((await lido()).valor, 'cada');
  // o outro campo de seleção do painel (endereço dos QR) também mostra o valor salvo
  await S.ok('irMenu');
  await pg.waitForSelector('.opcao');
  await S.ok('novoJogo', {});
  await pg.waitForSelector('.hs-select');
  const ip = await pg.evaluate(() => document.querySelector('.hs-select').value);
  assert.equal(ip, S.host.ultimo.ui.ip);
});

// ---------- Aleatorizar ordem ----------
test('Aleatorizar ordem 5 vezes seguidas num navegador: com e sem "Desfazer ordem", em espera e depois de Começar novo jogo', { skip: SEM_NAVEGADOR, timeout: 180000 }, async (t) => {
  const S = await servidor(t);
  const browser = await navegador(t);
  const pg = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const erros = [];
  pg.on('pageerror', (e) => erros.push(String(e)));
  await pg.goto(`${S.base}/host`);
  const abrirEditor = async () => {
    await S.ok('irMenu');
    await pg.waitForSelector('.opcao');
    await pg.click('.opcao:has-text("editar perguntas")');
    await pg.waitForSelector('#ed-aleatorizar');
  };
  const ordem = () => pg.evaluate(() => [...document.querySelectorAll('.ed-lista li, .ed-item')].map((n) => n.textContent.slice(0, 40)).join('|'));
  const posicao = () => pg.evaluate(() => { const r = document.getElementById('ed-aleatorizar').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; });
  const uma = async (rotulo) => {
    assert.equal(await pg.locator('#ed-aleatorizar').isDisabled(), false, `${rotulo}: botão desabilitado`);
    const antes = await ordem();
    await pg.click('#ed-aleatorizar', { timeout: 4000 });
    const modal = await pg.locator('.sobreposicao').innerText();
    assert.match(modal, /próximo jogo iniciado/);
    assert.match(modal, /jogo em andamento mantém a ordem antiga/);
    await pg.click('.sobreposicao button:has-text("Aleatorizar")', { timeout: 4000 });
    await pg.waitForSelector('.sobreposicao', { state: 'detached', timeout: 4000 });
    await pg.waitForFunction((o) => [...document.querySelectorAll('.ed-lista li, .ed-item')].map((n) => n.textContent.slice(0, 40)).join('|') !== o, antes, { timeout: 4000 });
  };
  const cinco = async (rotulo, { desfazendo = false } = {}) => {
    await abrirEditor();
    const p0 = await posicao();
    for (let i = 1; i <= 5; i += 1) {
      await uma(`${rotulo} #${i}`);
      assert.deepEqual(await posicao(), p0, `${rotulo} #${i}: o botão Aleatorizar mudou de lugar`);
      if (desfazendo && i % 2 === 0) {
        const antes = await ordem();
        await pg.click('#ed-desfazer-ordem');
        await pg.waitForFunction((o) => [...document.querySelectorAll('.ed-lista li, .ed-item')].map((n) => n.textContent.slice(0, 40)).join('|') !== o, antes, { timeout: 4000 });
        assert.deepEqual(await posicao(), p0, `${rotulo}: Desfazer ordem mudou o botão de lugar`);
      }
    }
  };
  await cinco('sem Desfazer');
  await cinco('com Desfazer', { desfazendo: true });
  // jogo em espera com grupos, depois "Começar novo jogo" substituindo um jogo em andamento
  await S.ok('novoJogo', {});
  S.abertos.push((await entrarGrupo(S.srv.porta, 'azul', 'Azul')).c, (await entrarGrupo(S.srv.porta, 'verde', 'Verde')).c);
  await S.host.estadoApos((s) => s.estado.grupos.length === 2);
  await cinco('jogo em espera com grupos');
  await S.ok('iniciar');
  await S.ok('irMenu');
  await pg.waitForSelector('.opcao');
  await pg.click('.opcao:has-text("editar perguntas")');
  await pg.waitForSelector('#ed-aleatorizar');
  assert.equal(await pg.locator('#ed-aleatorizar').isDisabled(), true, 'com partida em andamento o botão fica bloqueado');
  await S.ok('novoJogo', { substituir: true });
  await cinco('depois de Começar novo jogo');
  assert.deepEqual(erros, []);
});

// ---------- nome do grupo ----------
test('nomesDosGrupos: o nome digitado, vazio vira "Grupo Cor", repetido vira "Nome (2)", sem diferenciar maiúsculas', () => {
  const g = (cor, representante) => ({ cor, representante });
  assert.deepEqual(nomesDosGrupos([g('azul', 'Ana'), g('verde', 'Bia')]), { azul: 'Ana', verde: 'Bia' });
  assert.deepEqual(nomesDosGrupos([g('azul', ''), g('verde', '   '), g('preto', undefined)]), { azul: 'Grupo Azul', verde: 'Grupo Verde', preto: 'Grupo Preto' });
  assert.deepEqual(nomesDosGrupos([g('azul', 'Ana'), g('verde', 'ana'), g('rosa', ' Ana  ')]), { azul: 'Ana', verde: 'ana (2)', rosa: 'Ana (3)' });
  assert.deepEqual(nomesDosGrupos([g('azul', 'Grupo Verde'), g('verde', '')]), { azul: 'Grupo Verde', verde: 'Grupo Verde (2)' });
  const longo = 'Maria Aparecida de Albuquerque Nasciment';
  assert.equal(nomesDosGrupos([g('azul', longo)]).azul, longo);
  assert.deepEqual(nomesDosGrupos([]), {});
});

test('Registro, painel, projetor e celular usam o nome do grupo; o celular não recebe nomes de outros além dos citados', async (t) => {
  const S = await servidor(t, { config: { placarModo: 'desligado', meta: 3 }, local: false });
  const tela = new Cliente(S.srv.porta, 'papel=tela');
  S.abertos.push(tela);
  await S.ok('novoJogo', {});
  const nomes = { vermelho: 'Ana', azul: 'Bia', verde: 'Zélia Segredo' };
  const fones = {};
  for (const [cor, nome] of Object.entries(nomes)) { const r = await entrarGrupo(S.srv.porta, cor, nome); fones[cor] = r.c; S.abertos.push(r.c); }
  await S.host.estadoApos((s) => s.estado.grupos.length === 3 && s.estado.grupos.every((g) => g.conectado));
  assert.deepEqual(S.host.ultimo.nomes, nomes);
  await tela.estadoApos((s) => s.nomes?.verde === 'Zélia Segredo');
  assert.deepEqual(tela.ultimo.nomes, nomes);
  assert.equal(JSON.stringify(tela.ultimo).includes('representante'), false, 'a /tela não recebe o campo antigo');

  // o celular de Ana: só o nome dela. Os de Bia e Zélia não aparecem (nem em nenhuma outra parte da visão).
  await S.ok('iniciar');
  const ana = await fones.vermelho.esperar((m) => m.t === 'estado' && m.registrado && m.nome === 'Ana', 3000, true);
  assert.equal(ana.nome, 'Ana');
  const texto = JSON.stringify(ana);
  assert.equal(texto.includes('Bia'), false);
  assert.equal(texto.includes('Zélia'), false);

  // Registro com nome do grupo e a cor só como campo
  await S.ok('mostrarAlternativas');
  await S.ok('abrirJanela');
  fones.azul.enviar({ t: 'apertar' });
  await S.host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
  fones.vermelho.enviar({ t: 'apertar' });
  await S.host.estadoApos((s) => s.estado.rodada.ordem.length === 2);
  await S.ok('encerrarJanela');
  await S.ok('mostrarResposta');
  await S.ok('responder', S.host.ultimo.pergunta.correta);
  await S.ok('renomearGrupo', 'verde', 'Zélia');
  const r = await fetch(`${S.base}/api/registro`, { headers: { Cookie: (await autenticar(S.srv.porta, PIN)).cookie } });
  const itens = (await r.json()).itens;
  const msgs = itens.map((i) => i.msg);
  assert.ok(msgs.some((m) => /^Rodada 1: Bia apertou \(1º\)$/.test(m)), msgs.join('\n'));
  assert.ok(msgs.some((m) => /Ana apertou \(2º\)/.test(m)));
  assert.ok(msgs.some((m) => /Bia respondeu [A-D] e acertou \(\+10 pontos\)/.test(m)));
  assert.ok(msgs.some((m) => /^O grupo Zélia Segredo passou a se chamar "Zélia"$/.test(m)));
  assert.ok(msgs.some((m) => /^Ana conectado$/.test(m)), 'conexão pelo nome do grupo');
  assert.ok(!msgs.some((m) => /\b(Vermelho|Azul|Verde) (apertou|conectado|respondeu)/.test(m)), 'nenhuma linha fala pelo nome da cor');
  assert.equal(itens.find((i) => /Bia apertou/.test(i.msg)).cor, 'azul');
  assert.equal(itens.find((i) => /^Ana conectado/.test(i.msg)).cor, 'vermelho');
  assert.ok(itens.every((i) => 'cor' in i), 'toda linha nova traz o campo cor (ou null)');
});

test('nome vazio ou repetido ganha nome único em todas as visões e no Registro', async (t) => {
  const S = await servidor(t, { local: false });
  const tela = new Cliente(S.srv.porta, 'papel=tela');
  S.abertos.push(tela);
  await S.ok('novoJogo', {});
  for (const [cor, nome] of [['vermelho', 'Ana'], ['azul', 'ana'], ['verde', 'Ana']]) S.abertos.push((await entrarGrupo(S.srv.porta, cor, nome)).c);
  await S.host.estadoApos((s) => s.estado.grupos.length === 3);
  assert.deepEqual(S.host.ultimo.nomes, { vermelho: 'Ana', azul: 'ana (2)', verde: 'Ana (3)' });
  assert.equal((await S.host.acao('renomearGrupo', 'azul', '   ')).t, 'erro', 'o painel não deixa o nome ficar vazio');
  assert.equal((await S.host.acao('renomearGrupo', 'azul', 'x'.repeat(60))).t, 'ok');
  assert.equal((await S.host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'azul').representante.length === 40)).estado.grupos.find((g) => g.cor === 'azul').representante.length, 40, 'o nome do grupo tem no máximo 40 letras também pelo painel');
  // registro de um estado com nome vazio (jogo salvo antigo ou migrado): "Grupo Cor"
  const estado = S.srv.estado();
  const vazio = structuredClone(estado);
  vazio.grupos.find((g) => g.cor === 'azul').representante = '';
  assert.equal(R.nomeGrupo(vazio, 'azul'), 'Grupo Azul');
  assert.equal(R.nomeGrupo(estado, 'verde'), 'Ana (2)', 'o repetido sobe de número quando o outro nome muda');
  const linha = R.linha(vazio, 'conexao', (n) => `${n('azul')} conectado`);
  assert.deepEqual(linha, { tipo: 'conexao', msg: 'Grupo Azul conectado', cor: 'azul' });
});

test('migração do Marrom: troca só os campos de cor e as linhas do jogo; o nome digitado pelo grupo nunca muda', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8kb-mig-'));
  let S = await servidor(t, { dir });
  await S.ok('novoJogo', {});
  const r = await entrarGrupo(S.srv.porta, 'cinza', 'Maria Marrom');
  const token = r.entrou.token;
  await S.host.estadoApos((s) => s.estado.grupos.length === 1);
  r.c.fechar();
  S.host.fechar();
  await S.srv.fechar();
  // arquivo da versão antiga: cor "marrom" no lugar de "cinza"; registro com linhas antigas
  const arq = path.join(dir, 'jogo.json');
  const j = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const velho = JSON.parse(JSON.stringify(j).replace(/"cinza"/g, '"marrom"'));
  velho.estado.log = [{ tipo: 'jogo', msg: 'marrom: +5 pontos (manual)' }];
  fs.writeFileSync(arq, JSON.stringify(velho));
  fs.writeFileSync(path.join(dir, 'registro.json'), JSON.stringify([
    { t: 1, tipo: 'conexao', msg: 'Marrom conectado (Maria Marrom)' },
    { t: 2, tipo: 'sistema', msg: 'Marrom: representante agora é "Marrom Pereira"' },
    { t: 3, tipo: 'jogo', msg: 'Jogo iniciado com 2 grupos (Azul, Marrom)' },
  ]));
  S = await servidor(t, { dir });
  const grupos = S.host.ultimo ? S.host.ultimo.estado.grupos : (await S.host.estadoApos(() => true)).estado.grupos;
  assert.deepEqual(grupos.map((g) => [g.cor, g.representante]), [['preto', 'Maria Marrom']]);
  assert.equal(S.host.ultimo.nomes.preto, 'Maria Marrom');
  const volta = await entrarGrupo(S.srv.porta, 'preto', '', token);
  S.abertos.push(volta.c);
  assert.equal(volta.entrou.t, 'entrou', 'o token do celular continua valendo');
  const reg = await (await fetch(`${S.base}/api/registro`, { headers: { Cookie: (await autenticar(S.srv.porta, PIN)).cookie } })).json();
  const msgs = reg.itens.map((i) => i.msg);
  assert.ok(msgs.includes('Preto conectado (Maria Marrom)'), msgs.join('|'));
  assert.ok(msgs.includes('Preto: representante agora é "Marrom Pereira"'));
  assert.ok(msgs.includes('Jogo iniciado com 2 grupos (Azul, Preto)'));
});

test('telas com nome do grupo (projetor, painel e celular) em navegador: o nome no lugar da cor, nome longo sem corte, sem null', { skip: SEM_NAVEGADOR, timeout: 240000 }, async (t) => {
  const S = await servidor(t, { config: { placarModo: 'desligado', meta: 2 } });
  const browser = await navegador(t);
  await S.ok('novoJogo', {});
  const longo = 'Maria Aparecida de Albuquerque Nasciment';
  const nomes = { vermelho: 'Ana', azul: longo, preto: 'Bia', amarelo: 'Clara' };
  const fones = {};
  for (const [cor, nome] of Object.entries(nomes)) { const r = await entrarGrupo(S.srv.porta, cor, nome); fones[cor] = r.c; S.abertos.push(r.c); }
  await S.host.estadoApos((s) => s.estado.grupos.length === 4 && s.estado.grupos.every((g) => g.conectado));
  const tela = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const painel = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await tela.goto(`${S.base}/tela`);
  await painel.goto(`${S.base}/host`);
  const limpo = async (pg, rotulo) => {
    const texto = await pg.evaluate(() => document.body.innerText);
    assert.doesNotMatch(texto, /\bnull\b|\bundefined\b/i, rotulo);
    assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${rotulo}: rolagem horizontal`);
    return texto;
  };
  const semCor = (texto, rotulo) => { for (const cor of ['Vermelho', 'Azul', 'Preto', 'Amarelo']) assert.doesNotMatch(texto, new RegExp(`\\b${cor}\\b`), `${rotulo}: aparece o nome da cor ${cor}`); };

  // seleção: blocos ocupados mostram só o nome do grupo
  await tela.waitForSelector('.bloco');
  let texto = await limpo(tela, 'tela seleção');
  assert.match(texto, /Ana/);
  assert.equal(await tela.locator('.bloco[data-cor="vermelho"] .bloco-nome').innerText(), 'Ana');
  assert.equal(await tela.locator('.bloco[data-cor="verde"] .bloco-nome').innerText(), 'Verde', 'cor livre mantém o nome da cor');
  assert.equal(await tela.locator('.bloco[data-cor="azul"] .bloco-nome').evaluate((n) => n.scrollWidth <= n.clientWidth + 1), true, 'nome longo não corta no bloco');
  await painel.waitForSelector('.hs-ficha');
  assert.equal((await painel.locator('.hs-ficha:has-text("Ana") .hs-nome').innerText()), 'Ana');

  // rodadas até o ranking
  await S.ok('iniciar');
  const rodada = async (cor) => {
    await S.ok('mostrarAlternativas'); await S.ok('abrirJanela');
    fones[cor].enviar({ t: 'apertar' });
    await S.host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await S.ok('encerrarJanela'); await S.ok('mostrarResposta');
    await S.ok('responder', S.host.ultimo.pergunta.correta);
    if (cor === 'azul') {
      texto = await limpo(tela, 'tela explicação');
    }
    await S.ok('continuar');
  };
  await rodada('azul');
  // ordem dos cliques: dois grupos
  await S.ok('mostrarAlternativas'); await S.ok('abrirJanela');
  for (const cor of ['preto', 'amarelo', 'vermelho', 'azul']) { const n = S.host.ultimo.estado.rodada.ordem.length; fones[cor].enviar({ t: 'apertar' }); await S.host.estadoApos((s) => s.estado.rodada.ordem.length > n || s.estado.fase !== 'janela'); }
  await S.host.estadoApos((s) => s.estado.fase === 'ordem');
  await tela.waitForSelector('.chip-ordem');
  texto = await limpo(tela, 'tela ordem');
  semCor(texto, 'tela ordem');
  assert.match(texto, /Bia/);
  await painel.waitForSelector('.hj-fila');
  texto = await limpo(painel, 'painel fila');
  assert.equal(await painel.locator('.hj-fila .hj-cor').first().innerText(), 'Bia');
  // a fila não desalinha com nome longo: o 4º (nome longo) cabe na própria linha
  const linha = await painel.locator('.hj-fila li', { hasText: 'Maria Aparecida' }).evaluate((n) => { const r = n.getBoundingClientRect(); const c = n.querySelector('.hj-cor').getBoundingClientRect(); return { dentro: c.left >= r.left && c.right <= r.right + 0.5, pos: n.querySelector('.hj-pos').getBoundingClientRect().left - r.left }; });
  assert.ok(linha.dentro);
  await S.ok('mostrarResposta');
  await S.ok('responder', S.host.ultimo.pergunta.correta);
  await S.ok('continuar');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking');
  await tela.waitForSelector('.rank-barra');
  texto = await limpo(tela, 'tela ranking');
  semCor(texto, 'tela ranking');
  assert.ok((await tela.locator('.rank-nome').allInnerTexts()).includes(longo), 'o nome longo aparece inteiro no ranking');
  assert.equal(await tela.locator('.rank-barra').evaluateAll((bs) => bs.every((b) => b.scrollWidth <= b.clientWidth + 1)), true, 'nada cortado nas barras');
  // o troféu da 1ª barra não pode esticá-la (já aconteceu): nenhuma barra passa de 100 px de altura
  assert.equal(await tela.locator('.rank-barra').evaluateAll((bs) => Math.max(...bs.map((b) => b.getBoundingClientRect().height)) <= 100), true, 'barras do ranking com altura normal');
  await painel.waitForSelector('.hr-linha');
  texto = await limpo(painel, 'painel ranking');
  semCor(texto, 'painel ranking');
});

test('painel no celular (390x844): nenhum cartão da sala passa da largura da tela e o ranking cabe sem cortar', { skip: SEM_NAVEGADOR, timeout: 120000 }, async (t) => {
  const S = await servidor(t);
  const browser = await navegador(t);
  await S.ok('novoJogo', {});
  for (const [cor, nome] of [['vermelho', 'Ana'], ['azul', 'Maria Aparecida de Albuquerque Nasciment']]) S.abertos.push((await entrarGrupo(S.srv.porta, cor, nome)).c);
  await S.host.estadoApos((s) => s.estado.grupos.length === 2);
  const pg = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await pg.goto(`${S.base}/host`);
  await pg.waitForSelector('.hs-ficha');
  const larguras = await pg.evaluate(() => [...document.querySelectorAll('.hs-cartao, .hs-ficha')].map((n) => Math.round(n.getBoundingClientRect().right)));
  assert.ok(larguras.length >= 12 && larguras.every((r) => r <= 390), `elementos da sala passam da tela: ${larguras}`);
});

test('mapa cor → ícone esperado, cor por cor (e só o mapa decide: sem outro lugar com ícone fixo)', async () => {
  const { DESENHOS } = await esm('shared/imagens-times-dados.js');
  const marca = (cor) => ({
    vermelho: /M16 8v14a12 12 0 0 0 24 0V8/, // estetoscópio
    azul: /<rect x="14" y="10" width="36" height="46"/, // prancheta
    amarelo: /M32 10v42M20 54h24M12 18h40/, // balança
    laranja: /M10 12h44a4 4 0 0 1 4 4v24/, // balão de fala com exclamação
    roxo: /M32 36C20 28 18 18 24 14/, // coração em mãos
    verde: /<rect x="27" y="6" width="10" height="26" rx="2" transform="rotate\(20 32 19\)"\/>/, // microscópio
    rosa: /<circle cx="32" cy="24" r="14"\/><path d="M32 38v20M22 48h20"\/>/, // símbolo de Vênus
    ciano: /M32 28C20 10 10 18 16 30/, // laço
    preto: /^<circle cx="32" cy="32" r="22"\/>/, // relógio
    cinza: /M4 32C12 18 22 12 32 12/, // olho
  })[cor];
  for (const cor of G.CORES) assert.match(DESENHOS[cor], marca(cor), cor);
  assert.equal(new Set(Object.values(DESENHOS)).size, 10);
  // nenhum outro arquivo do front escolhe ícone por cor
  for (const f of ['host/sala.js', 'tela/tela.js', 'tela/comemoracao.js', 'g/g.js', 'shared/imagens-times.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(PUBLIC, f), 'utf8'), /Vênus|estetosc|microsc|prancheta/i, f);
  }
});
