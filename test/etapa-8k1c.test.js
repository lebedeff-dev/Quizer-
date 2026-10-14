'use strict';
// Etapa 8k-1c: a grade de 10 cores (5 colunas x 2 linhas) da seleção cabe inteira e centralizada na /tela e no /host
// (1024x768, 1366x768 e 1920x1080), com 0 a 10 grupos já escolhidos, com o QR aberto e com nomes longos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const G = require('../src/game');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, autenticar, PIN } = require('./ajuda');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));
let chromium = null;
try { ({ chromium } = require('playwright-core')); } catch { /* sem playwright */ }

const TELAS = [{ width: 1024, height: 768 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 1092, height: 614 }, { width: 1366, height: 650 }, { width: 1280, height: 720 }];
// Nomes variados: curto, médio, longo com espaços e uma palavra enorme sem espaços (o pior caso para a grade).
const NOMES = ['Ana', 'Laranjeiras', 'Maria Aparecida de Albuquerque Nasciment', 'Bia', 'Supercalifragilisticexpialidocious1234', 'Time Azul', 'Clara', 'Os Roxos Unidos', 'Gabi', 'Fátima'];

// Mede, na página aberta, cada banner: dentro da tela, margem lateral, texto dentro do banner, ícone inteiro sem cruzar texto.
const MEDIR = (seletor) => {
  const textos = (raiz) => {
    const saida = [];
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (!n.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) if (q.width > 0) saida.push({ x: q.left, y: q.top, r: q.right, b: q.bottom, t: n.textContent.trim().slice(0, 18) });
    }
    return saida;
  };
  const caixas = [...document.querySelectorAll(seletor)];
  const rects = caixas.map((c) => c.getBoundingClientRect());
  const esquerda = Math.min(...rects.map((r) => r.left));
  const direita = Math.max(...rects.map((r) => r.right));
  const linhas = [...new Set(rects.map((r) => Math.round(r.top)))].length;
  // Nome de COR (cor livre) nunca quebra: ocupa exatamente uma linha e cabe inteiro no banner. Nome de grupo digitado pode quebrar.
  const NOMES_COR = ['Vermelho', 'Azul', 'Verde', 'Amarelo', 'Laranja', 'Roxo', 'Rosa', 'Ciano', 'Preto', 'Cinza'];
  const soTexto = (n) => [...n.childNodes].find((c) => c.nodeType === 3) || n;
  const linhasDe = (n) => { const rg = document.createRange(); rg.selectNodeContents(soTexto(n)); return new Set([...rg.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size; };
  const nomesCor = [...document.querySelectorAll(seletor + ' .bloco-nome, ' + seletor + ' .hs-nome, .qr-faixa')].filter((n) => NOMES_COR.includes(n.textContent.trim())).map((n) => {
    const b = n.closest('.bloco, .hs-ficha, .qr-faixa').getBoundingClientRect();
    const rg = document.createRange();
    rg.selectNodeContents(soTexto(n));
    const q = rg.getBoundingClientRect();
    return { t: n.textContent.trim(), linhas: linhasDe(n), cabe: q.left >= b.left - 0.5 && q.right <= b.right + 0.5 };
  });
  const itens = caixas.map((caixa, i) => {
    const C = rects[i];
    const ic = caixa.querySelector('.time-img');
    const tx = textos(caixa);
    const foraDoBloco = tx.filter((q) => q.x < C.left - 0.5 || q.r > C.right + 0.5 || q.y < C.top - 0.5 || q.b > C.bottom + 0.5).map((q) => q.t);
    const base = { id: caixa.dataset.cor || caixa.className, foraDoBloco, dentro: C.left >= 0 && C.right <= innerWidth && C.top >= 0 };
    if (!ic || getComputedStyle(ic).display === 'none') return { ...base, escondido: true };
    const r = ic.getBoundingClientRect();
    return {
      ...base,
      iconeInteiro: r.left >= C.left - 0.5 && r.top >= C.top - 0.5 && r.right <= C.right + 0.5 && r.bottom <= C.bottom + 0.5 && r.right <= innerWidth && r.bottom <= innerHeight,
      cruza: tx.filter((q) => q.x < r.right - 0.5 && q.r > r.left + 0.5 && q.y < r.bottom - 0.5 && q.b > r.top + 0.5).map((q) => q.t),
    };
  });
  return {
    n: caixas.length, linhas, esquerda: Math.round(esquerda), margemDireita: Math.round(innerWidth - direita),
    rolagemH: document.documentElement.scrollWidth - innerWidth,
    rolagemV: document.documentElement.scrollHeight - innerHeight,
    fundo: Math.round(Math.max(...rects.map((r) => r.bottom))),
    itens,
    nomesCor,
  };
};

test('seleção de cores: 10 banners dentro da tela, centralizados e sem cruzar texto, em 1024x768, 1366x768 e 1920x1080, com 0 a 10 grupos', { skip: !CHROME || !chromium ? 'sem navegador instalado' : false, timeout: 400000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8kc-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => true });
  const auth = await autenticar(srv.porta, PIN);
  const host = new Cliente(srv.porta, 'papel=host', auth.cookie);
  const fones = [];
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(async () => { fones.forEach((f) => f.fechar()); host.fechar(); await browser.close(); await srv.fechar().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  await ok('novoJogo', {});
  const base = `http://127.0.0.1:${srv.porta}`;
  const telas = [];
  const paineis = [];
  for (const vp of TELAS) {
    const tela = await (await browser.newContext({ viewport: vp })).newPage();
    const painel = await (await browser.newContext({ viewport: vp })).newPage();
    await tela.goto(`${base}/tela`);
    await painel.goto(`${base}/host`);
    await tela.waitForSelector('.bloco');
    await painel.waitForSelector('.hs-ficha');
    telas.push(tela);
    paineis.push(painel);
  }

  const conferir = async (rotulo, pg, vp, seletor, { tela = true } = {}) => {
    // espera a animação de entrada da cena terminar (medir no meio dela dá retângulos deslocados e o teste oscilava sob carga)
    await pg.evaluate(() => Promise.all(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished.catch(() => null))));
    const m = await pg.evaluate(MEDIR, seletor);
    const onde = `${rotulo} ${vp.width}x${vp.height}`;
    assert.equal(m.n, 10, `${onde}: banners`);
    assert.equal(m.linhas, 2, `${onde}: a grade tem 2 linhas`);
    assert.ok(m.esquerda >= 24 && m.margemDireita >= 24, `${onde}: margens ${m.esquerda}/${m.margemDireita} (mínimo 24 px)`);
    assert.ok(Math.abs(m.esquerda - m.margemDireita) <= 2, `${onde}: grade descentralizada ${m.esquerda}/${m.margemDireita}`);
    assert.ok(m.rolagemH <= 0, `${onde}: rolagem horizontal ${m.rolagemH}`);
    if (tela) {
      assert.ok(m.rolagemV <= 0, `${onde}: rolagem vertical ${m.rolagemV}`);
      assert.ok(m.fundo <= vp.height, `${onde}: a 2ª linha termina em ${m.fundo}, abaixo de ${vp.height}`);
    }
    for (const n of m.nomesCor) {
      assert.equal(n.linhas, 1, `${onde}: o nome da cor "${n.t}" ocupa ${n.linhas} linhas`);
      assert.ok(n.cabe, `${onde}: o nome da cor "${n.t}" passa do banner`);
    }
    for (const i of m.itens) {
      assert.ok(i.dentro, `${onde}: ${i.id} fora da tela`);
      assert.deepEqual(i.foraDoBloco, [], `${onde}: ${i.id} texto fora do banner`);
      if (!i.escondido) {
        assert.ok(i.iconeInteiro, `${onde}: ${i.id} ícone fora do banner ou da tela`);
        assert.deepEqual(i.cruza, [], `${onde}: ${i.id} ícone cruza o texto ${i.cruza}`);
      }
    }
  };
  const tudo = async (rotulo) => {
    for (let k = 0; k < TELAS.length; k += 1) {
      await conferir(`/tela ${rotulo}`, telas[k], TELAS[k], '.bloco');
      await conferir(`/host ${rotulo}`, paineis[k], TELAS[k], '.hs-ficha', { tela: false });
    }
  };

  await tudo('0 grupos');
  const cores = G.CORES;
  for (let n = 1; n <= 10; n += 1) {
    const cor = cores[n - 1];
    fones.push((await entrarGrupo(srv.porta, cor, NOMES[n - 1])).c);
    await host.estadoApos((s) => s.estado.grupos.length === n);
    for (const p of telas) await p.waitForFunction((k) => document.querySelectorAll('.bloco[data-cor] .bloco-nome').length === 10 && [...document.querySelectorAll('.bloco-estado')].filter((e) => e.textContent === 'Livre').length === 10 - k, n);
    await tudo(`${n} grupo${n > 1 ? 's' : ''}`);
    // QR aberto de uma cor ainda livre: a grade por trás continua inteira e o cartão cabe na tela
    if (n < 10) {
      await ok('selecionarCor', cores[9]);
      for (let k = 0; k < TELAS.length; k += 1) {
        await telas[k].waitForSelector('.qr-cartao');
        const q = await telas[k].evaluate(() => {
          const c = document.querySelector('.qr-cartao').getBoundingClientRect();
          const f = document.querySelector('.qr-faixa .time-img')?.getBoundingClientRect();
          const F = document.querySelector('.qr-faixa').getBoundingClientRect();
          return { dentro: c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight, icone: !f || (f.left >= F.left && f.right <= F.right && f.top >= F.top && f.bottom <= F.bottom) };
        });
        assert.ok(q.dentro && q.icone, `QR com ${n} grupos em ${TELAS[k].width}x${TELAS[k].height}: ${JSON.stringify(q)}`);
        await conferir(`/tela com QR, ${n} grupos`, telas[k], TELAS[k], '.bloco');
        const faixa = await telas[k].evaluate(() => { const n = document.querySelector('.qr-faixa'); const rg = document.createRange(); rg.selectNodeContents([...n.childNodes].find((c) => c.nodeType === 3)); const q = rg.getBoundingClientRect(); const b = n.getBoundingClientRect(); return { linhas: new Set([...rg.getClientRects()].map((r) => Math.round(r.top))).size, cabe: q.left >= b.left && q.right <= b.right }; });
        assert.equal(faixa.linhas, 1, `faixa do QR em ${TELAS[k].width}x${TELAS[k].height} quebrou em ${faixa.linhas} linhas`);
        assert.ok(faixa.cabe);
      }
      await ok('selecionarCor', null);
      for (const p of telas) await p.waitForSelector('.qr-cartao', { state: 'detached' });
    }
  }
});
