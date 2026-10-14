'use strict';
// Etapa 8k-2: botão Comemorar no Ranking, fogos e pop-up nos celulares, fogos e banner de parabéns no projetor,
// mensagem de parabenização nas Configurações. Os testes de tela usam um Chrome/Edge de verdade (pulam sem navegador).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');
const { FINAL_PADRAO } = require('../src/store');
const { Cliente, entrarGrupo, autenticar, PIN, ajustarPontosNoServidor } = require('./ajuda');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find((p) => fs.existsSync(p));
let chromium = null;
try { ({ chromium } = require('playwright-core')); } catch { /* sem playwright */ }
const SEM_NAVEGADOR = !CHROME || !chromium ? 'sem navegador instalado' : false;

const PADRAO = FINAL_PADRAO.parabens;

async function montar(t, { nomes, local = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8k2-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { meta: 2, placarModo: 'desligado' } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => local });
  const auth = await autenticar(srv.porta, PIN);
  const host = new Cliente(srv.porta, 'papel=host', auth.cookie);
  const tela = new Cliente(srv.porta, 'papel=tela', auth.cookie);
  const abertos = [host, tela];
  t.after(async () => { abertos.forEach((x) => x.fechar()); await srv.fechar().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  await tela.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  await ok('novoJogo', {});
  const fones = {};
  for (const [cor, nome] of Object.entries(nomes)) { const r = await entrarGrupo(srv.porta, cor, nome); fones[cor] = r.c; abertos.push(r.c); }
  await host.estadoApos((s) => s.estado.grupos.length === Object.keys(nomes).length && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  // Uma rodada: `cor` aperta primeiro e acerta (10 pontos); `outra`, se houver, aperta depois.
  const rodada = async (cor) => {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    fones[cor].enviar({ t: 'apertar' });
    await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta');
    await ok('responder', host.ultimo.pergunta.correta);
    await ok('continuar');
  };
  const celular = (cor) => fones[cor].esperar((m) => m.t === 'estado' && m.registrado, 3000, true);
  return { dir, srv, host, tela, abertos, fones, ok, rodada, celular, base: `http://127.0.0.1:${srv.porta}`, auth };
}

const estadoCel = async (S, cor, pred) => {
  if (S.fones[cor].ultimo && pred(S.fones[cor].ultimo)) return S.fones[cor].ultimo;
  return S.fones[cor].esperar((m) => m.t === 'estado' && pred(m), 3000);
};

test('Comemorar: desabilitado sem vencedor (empate), habilitado com vencedor; a ação recusa sem vencedor e fora do Ranking', async (t) => {
  const S = await montar(t, { nomes: { vermelho: 'Ana', azul: 'Bia' } });
  assert.equal(S.host.ultimo.podeComemorar.pode, false);
  assert.match(S.host.ultimo.podeComemorar.motivo, /Ranking/);
  assert.equal((await S.host.acao('comemorar')).t, 'erro', 'fora do Ranking');
  await S.rodada('vermelho');
  await S.rodada('vermelho');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking');
  await ajustarPontosNoServidor(S, 'azul', 30); // 30 a 30: empate no topo, sem vencedor
  assert.equal(S.host.ultimo.vencedor, null);
  assert.deepEqual(S.host.ultimo.podeComemorar, { pode: false, motivo: 'Defina o vencedor antes de comemorar.' });
  const r = await S.host.acao('comemorar');
  assert.equal(r.t, 'erro');
  assert.equal(r.msg, 'Defina o vencedor antes de comemorar.');
  assert.equal(S.tela.ultimo.comemoracao, undefined, 'sem vencedor o projetor não muda');
  assert.equal(S.host.ultimo.comemoracao, null);
  // desempate decidido: agora há vencedor e o botão habilita
  await S.ok('iniciarDesempate');
  await S.ok('mostrarAlternativas'); await S.ok('abrirJanela');
  S.fones.azul.enviar({ t: 'apertar' });
  await S.host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
  await S.ok('encerrarJanela'); await S.ok('mostrarResposta');
  await S.ok('responder', S.host.ultimo.pergunta.correta);
  await S.ok('continuar');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking' && !!s.vencedor);
  assert.deepEqual(S.host.ultimo.podeComemorar, { pode: true, motivo: null });
});

test('Comemorar: só o grupo vencedor recebe a marca de fogos; todos recebem a mensagem; o celular não vê pontos nem outros nomes', async (t) => {
  const S = await montar(t, { nomes: { vermelho: 'Ana', azul: 'Bia Segredo', verde: 'Clara Oculta' } });
  await S.rodada('vermelho');
  await S.rodada('vermelho');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking' && s.vencedor === 'vermelho');
  await S.ok('comemorar');
  const por = {};
  for (const cor of ['vermelho', 'azul', 'verde']) por[cor] = await estadoCel(S, cor, (m) => !!m.comemoracao);
  assert.equal(por.vermelho.comemoracao.vencedor, true);
  assert.equal(por.azul.comemoracao.vencedor, false);
  assert.equal(por.verde.comemoracao.vencedor, false);
  for (const v of Object.values(por)) {
    assert.equal(v.comemoracao.mensagem, PADRAO);
    assert.equal(v.comemoracao.id, por.vermelho.comemoracao.id);
    assert.deepEqual(Object.keys(v.comemoracao).sort(), ['id', 'mensagem', 'vencedor']);
  }
  // privacidade: nada de pontuação e nada de nomes de outros grupos
  const txtAzul = JSON.stringify(por.azul);
  assert.equal(txtAzul.includes('Ana'), false);
  assert.equal(txtAzul.includes('Clara'), false);
  assert.equal(JSON.stringify(por.verde).includes('Bia'), false);
  assert.equal('ranking' in por.azul || 'placar' in por.azul || 'grupos' in por.azul, false, 'sem pontuação dos grupos no celular');
  // o projetor recebe o vencedor
  const tv = await S.tela.estadoApos((s) => !!s.comemoracao);
  assert.deepEqual({ cor: tv.comemoracao.cor, nome: tv.comemoracao.nome, pontos: tv.comemoracao.pontos, banner: tv.comemoracao.banner }, { cor: 'vermelho', nome: 'Ana', pontos: 30, banner: true });
});

test('Comemorar: não vai para o estado do jogo, nem para o Desfazer, nem para o disco; Desfazer e novo jogo encerram; Registro anota', async (t) => {
  const S = await montar(t, { nomes: { vermelho: 'Ana', azul: 'Bia' } });
  await S.rodada('vermelho');
  await S.rodada('vermelho');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking');
  const antes = JSON.stringify(S.srv.estado());
  await S.ok('comemorar');
  assert.equal(JSON.stringify(S.srv.estado()), antes, 'o estado do jogo não muda com a comemoração');
  assert.equal(/comemor/i.test(antes), false);
  await S.host.estadoApos((s) => !!s.comemoracao);
  const arquivo = fs.readFileSync(path.join(S.dir, 'jogo.json'), 'utf8');
  assert.equal(/comemor/i.test(arquivo), false, 'nada de comemoração em jogo.json');
  const reg = await (await fetch(`${S.base}/api/registro`, { headers: { Cookie: S.auth.cookie } })).json();
  const linha = reg.itens.find((i) => i.msg === 'Comemoração acionada');
  assert.ok(linha, 'Registro: "Comemoração acionada"');
  assert.equal(linha.cor, 'vermelho');
  // Desfazer sai do Ranking e encerra a comemoração (nos celulares e no projetor)
  await S.ok('desfazer');
  await S.host.estadoApos((s) => s.estado.fase !== 'ranking');
  assert.equal(S.host.ultimo.comemoracao, null);
  assert.equal((await estadoCel(S, 'vermelho', (m) => !m.comemoracao)).comemoracao, undefined);
  assert.equal(S.tela.ultimo.comemoracao, undefined);
});

test('Comemorar: só o painel do responsável aciona (projetor e celular recebem erro e nada acontece)', async (t) => {
  const S = await montar(t, { nomes: { vermelho: 'Ana', azul: 'Bia' } });
  await S.rodada('vermelho');
  await S.rodada('vermelho');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking');
  assert.equal((await S.tela.acao('comemorar')).t, 'erro', 'a /tela, mesmo com cookie, não aciona');
  S.fones.azul.enviar({ t: 'acao', id: 'x1', nome: 'comemorar', args: [] });
  const resp = await S.fones.azul.esperar((m) => m.id === 'x1', 3000);
  assert.equal(resp.t, 'erro');
  const semCookie = new Cliente(S.srv.porta, 'papel=tela');
  S.abertos.push(semCookie);
  await semCookie.aberto;
  assert.equal((await semCookie.acao('comemorar')).t, 'erro');
  assert.equal(S.host.ultimo.comemoracao, null, 'nenhuma comemoração começou');
  await S.ok('comemorar');
  assert.ok(S.host.ultimo.comemoracao);
});

test('Projetor: avançar fecha só o banner e volta ao Ranking; repetir gera um id novo e o banner volta; o segundo avanço vai à tela final', async (t) => {
  const S = await montar(t, { nomes: { vermelho: 'Ana', azul: 'Bia' } });
  await S.rodada('vermelho');
  await S.rodada('vermelho');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking');
  await S.ok('comemorar');
  const primeiro = (await S.tela.estadoApos((s) => !!s.comemoracao)).comemoracao;
  assert.equal(primeiro.banner, true);
  assert.equal(S.host.ultimo.comemoracao.banner, true);
  // o botão do painel vira "Voltar ao ranking" e, como a seta da /tela, só fecha o banner
  assert.equal((await S.tela.acao('proximo')).t, 'ok');
  const sem = await S.tela.estadoApos((s) => s.comemoracao && s.comemoracao.banner === false);
  assert.equal(sem.fase, 'ranking');
  assert.equal(S.host.ultimo.estado.fase, 'ranking', 'continua no Ranking');
  // repetir
  await new Promise((r) => setTimeout(r, 5));
  await S.ok('comemorar');
  const repetido = (await S.tela.estadoApos((s) => s.comemoracao?.banner === true)).comemoracao;
  assert.notEqual(repetido.id, primeiro.id);
  // celulares recebem o id novo (o pop-up volta a aparecer para quem fechou)
  assert.equal((await estadoCel(S, 'vermelho', (m) => m.comemoracao?.id === repetido.id)).comemoracao.id, repetido.id);
  await S.ok('proximo'); // fecha o banner (painel)
  await S.tela.estadoApos((s) => s.comemoracao?.banner === false);
  await S.ok('proximo'); // agora sim, tela final
  await S.host.estadoApos((s) => s.estado.fase === 'final');
  assert.equal((await S.tela.estadoApos((s) => s.fase === 'final')).comemoracao, undefined);
});

test('Mensagem de parabenização: padrão, até 300 caracteres, vazio volta ao padrão, e vale nos celulares na hora', async (t) => {
  const S = await montar(t, { nomes: { vermelho: 'Ana', azul: 'Bia' } });
  assert.equal(S.host.ultimo.final.parabens, PADRAO);
  assert.equal(S.host.ultimo.padroes.final.parabens, PADRAO);
  assert.ok(PADRAO.length <= 300);
  assert.match(PADRAO, /^Parabéns a todos os grupos! Combater a misoginia na área da saúde começa por ouvir/);
  const base = { disciplina: 'D', professor: 'P', mensagem: 'M', integrantes: ['A'] };
  const longa = 'x'.repeat(300);
  assert.equal((await S.host.acao('salvarTextos', { ...base, parabens: longa })).t, 'ok');
  assert.equal(S.host.ultimo.final.parabens.length, 300);
  const r = await S.host.acao('salvarTextos', { ...base, parabens: 'y'.repeat(301) });
  assert.equal(r.t, 'erro');
  assert.match(r.msg, /até 300 caracteres/);
  assert.equal(S.host.ultimo.final.parabens.length, 300, 'a mensagem recusada não altera nada');
  assert.equal((await S.host.acao('salvarTextos', { ...base, parabens: '   ' })).t, 'ok');
  assert.equal(S.host.ultimo.final.parabens, PADRAO, 'vazio volta ao texto original');
  assert.equal((await S.host.acao('salvarTextos', { ...base, parabens: 'Boa, turma!' })).t, 'ok');
  assert.equal((await S.host.acao('salvarTextos', base)).t, 'ok');
  assert.equal(S.host.ultimo.final.parabens, 'Boa, turma!', 'quem não envia a mensagem mantém a atual');
  const salvo = JSON.parse(fs.readFileSync(path.join(S.dir, 'config.json'), 'utf8'));
  assert.equal(salvo.final.parabens, 'Boa, turma!');
  await S.rodada('vermelho');
  await S.rodada('vermelho');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking');
  await S.ok('comemorar');
  assert.equal((await estadoCel(S, 'azul', (m) => !!m.comemoracao)).comemoracao.mensagem, 'Boa, turma!');
});

// ---------- telas (navegador de verdade) ----------
const abrirCelular = async (browser, S, cor, nome, opcoes = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...opcoes });
  const pg = await ctx.newPage();
  await pg.goto(`${S.base}/g/${cor}`);
  await pg.waitForSelector('#g-nome');
  await pg.fill('#g-nome', nome);
  await pg.click('.g-entrar');
  await pg.waitForSelector('.g-nome-grupo');
  return { ctx, pg };
};

test('celulares: fogos só no vencedor (limite de partículas, sem tocar e abaixo do pop-up), pop-up em todos, fecha e não volta, reaparece uma vez ao recarregar, e de novo ao repetir', { skip: SEM_NAVEGADOR, timeout: 180000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8k2n-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { meta: 2, placarModo: 'desligado' } }));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => true });
  const host = new Cliente(srv.porta, 'papel=host');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(async () => { host.fechar(); await browser.close(); await srv.fechar().catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }); });
  await host.aberto;
  const ok = async (n, ...a) => { const r = await host.acao(n, ...a); assert.equal(r.t, 'ok', `${n}: ${r.msg}`); };
  const S = { base: `http://127.0.0.1:${srv.porta}` };
  await ok('novoJogo', {});
  const ana = await abrirCelular(browser, S, 'amarelo', 'Ana');
  const bia = await abrirCelular(browser, S, 'preto', 'Bia');
  await host.estadoApos((s) => s.estado.grupos.length === 2 && s.estado.grupos.every((g) => g.conectado));
  await ok('iniciar');
  for (let i = 0; i < 2; i += 1) {
    await ok('mostrarAlternativas'); await ok('abrirJanela');
    await ana.pg.waitForSelector('.g-botao:has-text("APERTE")');
    await ana.pg.click('.g-botao');
    await host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await ok('encerrarJanela'); await ok('mostrarResposta');
    await ok('responder', host.ultimo.pergunta.correta);
    await ok('continuar');
  }
  await host.estadoApos((s) => s.estado.fase === 'ranking' && s.vencedor === 'amarelo');
  assert.equal(await ana.pg.locator('.g-parabens').count(), 0);
  await ok('comemorar');

  // vencedor: fogos ao vivo e pop-up com "Vocês venceram!"
  await ana.pg.waitForSelector('.g-parabens');
  await ana.pg.waitForSelector('canvas.g-fogos[data-fogos="ativo"]');
  assert.match(await ana.pg.locator('.g-parabens').innerText(), /Vocês venceram!/);
  assert.match(await ana.pg.locator('.g-parabens').innerText(), /Combater a misoginia na área da saúde/);
  await ana.pg.waitForTimeout(1500);
  const f = await ana.pg.evaluate(() => {
    const c = document.querySelector('canvas.g-fogos');
    const p = document.querySelector('.g-parabens');
    return { pico: Number(c.dataset.pico), modo: c.dataset.modo, evento: getComputedStyle(c).pointerEvents, zFogos: Number(getComputedStyle(c).zIndex), zPopup: Number(getComputedStyle(p).zIndex), seg: document.documentElement.scrollWidth <= innerWidth };
  });
  assert.equal(f.modo, 'fogos');
  assert.ok(f.pico > 0 && f.pico <= 160, `partículas: ${f.pico}`);
  assert.equal(f.evento, 'none', 'os fogos não recebem toque');
  assert.ok(f.zFogos < f.zPopup, 'os fogos ficam abaixo do pop-up');
  const fundo = await ana.pg.evaluate(() => { const s = getComputedStyle(document.querySelector('.g-fogos-fundo')); return { cor: s.backgroundColor, evento: s.pointerEvents, z: Number(s.zIndex), zFogos: Number(getComputedStyle(document.querySelector('canvas.g-fogos')).zIndex), zPopup: Number(getComputedStyle(document.querySelector('.g-parabens')).zIndex) }; });
  assert.equal(fundo.cor, 'rgba(15, 20, 35, 0.42)', 'fundo levemente escurecido no celular do vencedor');
  assert.equal(fundo.evento, 'none');
  assert.ok(fundo.z < fundo.zFogos && fundo.zFogos < fundo.zPopup, 'fundo escuro abaixo dos fogos e do pop-up (o pop-up fica nítido)');
  assert.ok(f.seg);
  // perdedor: só o pop-up, sem a frase de vitória e sem fogos
  await bia.pg.waitForSelector('.g-parabens');
  assert.doesNotMatch(await bia.pg.locator('.g-parabens').innerText(), /Vocês venceram/);
  assert.match(await bia.pg.locator('.g-parabens').innerText(), /Parabéns a todos os grupos/);
  assert.equal(await bia.pg.locator('canvas.g-fogos').count(), 0);
  assert.equal(await bia.pg.locator('.g-fogos-fundo').count(), 0, 'quem não venceu não tem fundo escurecido');
  // os fogos terminam sozinhos (~6 s) e o pop-up fica até ser fechado
  await ana.pg.waitForSelector('canvas.g-fogos', { state: 'detached', timeout: 9000 });
  await ana.pg.waitForSelector('.g-fogos-fundo', { state: 'detached', timeout: 3000 }); // o fundo some com os fogos
  assert.equal(await ana.pg.locator('.g-parabens').count(), 1);
  // fechar: o pop-up some e não volta para a mesma comemoração, nem com o celular reconectando
  await ana.pg.click('.g-parabens-fechar');
  assert.equal(await ana.pg.locator('.g-parabens').count(), 0);
  await ana.pg.reload();
  await ana.pg.waitForSelector('.g-nome-grupo');
  await ana.pg.waitForTimeout(800);
  assert.equal(await ana.pg.locator('.g-parabens').count(), 0, 'fechado, não volta para a mesma comemoração');
  // Bia não fechou: ao recarregar o pop-up reaparece (uma vez), sem fogos (não é o vencedor e a página não estava aberta)
  await bia.pg.reload();
  await bia.pg.waitForSelector('.g-parabens');
  assert.equal(await bia.pg.locator('.g-parabens').count(), 1, 'reaparece uma única vez');
  await bia.pg.click('.g-parabens-fechar');
  // repetir: id novo, fogos de novo no vencedor e o pop-up volta para todos
  await ok('comemorar');
  await ana.pg.waitForSelector('.g-parabens');
  await ana.pg.waitForSelector('canvas.g-fogos[data-fogos="ativo"]');
  await bia.pg.waitForSelector('.g-parabens');
  // o botão do pop-up é clicável com os fogos por cima do conteúdo (fogos não tapam os botões)
  await ana.pg.click('.g-parabens-fechar');
  assert.equal(await ana.pg.locator('.g-parabens').count(), 0);
  // sai do Ranking: nada fica na tela
  await ok('desfazer');
  await bia.pg.waitForSelector('.g-parabens', { state: 'detached' });
});

test('celulares com movimento reduzido: o vencedor vê um brilho suave, sem partículas', { skip: SEM_NAVEGADOR, timeout: 120000 }, async (t) => {
  const S = await montar(t, { nomes: { vermelho: 'Ana', azul: 'Bia' }, local: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  S.fones.vermelho.fechar();
  S.fones.azul.fechar();
  await S.ok('zerarJogo');
  const ana = await abrirCelular(browser, S, 'verde', 'Ana', { reducedMotion: 'reduce' });
  const bia = await abrirCelular(browser, S, 'ciano', 'Bia');
  void bia;
  await S.host.estadoApos((s) => s.estado.grupos.filter((g) => g.conectado).length >= 2);
  // a partida precisa de 2 grupos conectados; reaproveita o fluxo pelo navegador
  await S.ok('iniciar');
  for (let i = 0; i < 2; i += 1) {
    await S.ok('mostrarAlternativas'); await S.ok('abrirJanela');
    await ana.pg.waitForSelector('.g-botao:has-text("APERTE")');
    await ana.pg.click('.g-botao');
    await S.host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
    await S.ok('encerrarJanela'); await S.ok('mostrarResposta');
    await S.ok('responder', S.host.ultimo.pergunta.correta);
    await S.ok('continuar');
  }
  await S.host.estadoApos((s) => s.estado.fase === 'ranking' && s.vencedor === 'verde');
  await S.ok('comemorar');
  await ana.pg.waitForSelector('canvas.g-fogos[data-modo="brilho"]');
  await ana.pg.waitForTimeout(1200);
  assert.equal(await ana.pg.locator('canvas.g-fogos').getAttribute('data-pico'), '0');
});

test('projetor: banner com "Parabéns, nome!" na cor do vencedor, ícone inteiro dentro do banner, fogos com limite, fecha ao avançar e repete (1366x768 e 1920x1080; Preto e Amarelo; nome longo)', { skip: SEM_NAVEGADOR, timeout: 240000 }, async (t) => {
  const longo = 'Maria Aparecida de Albuquerque Nasciment';
  for (const [cor, nome, corTexto] of [['amarelo', 'Ana', 'rgb(0, 0, 0)'], ['preto', longo, 'rgb(255, 255, 255)']]) {
    const S = await montar(t, { nomes: { [cor]: nome, azul: 'Bia' }, local: true });
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    try {
      await S.rodada(cor);
      await S.rodada(cor);
      await S.host.estadoApos((s) => s.estado.fase === 'ranking');
      for (const vp of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
        const pg = await (await browser.newContext({ viewport: vp })).newPage();
        await pg.goto(`${S.base}/tela`);
        await pg.waitForSelector('.rank-barra');
        assert.equal(await pg.locator('.comem-banner').count(), 0, 'sem vencedor acionado, nada muda');
        await S.ok('comemorar');
        await pg.waitForSelector('.comem-banner');
        await pg.waitForSelector('canvas.comem-fogos[data-fogos="ativo"]');
        await pg.waitForTimeout(1200);
        const m = await pg.evaluate(() => {
          const b = document.querySelector('.comem-banner');
          const B = b.getBoundingClientRect();
          const i = b.querySelector('.time-img').getBoundingClientRect();
          const h = b.querySelector('.comem-titulo');
          const c = document.querySelector('canvas.comem-fogos');
          return {
            texto: h.textContent,
            fundo: getComputedStyle(b).backgroundColor,
            cor: getComputedStyle(b).color,
            banner: [B.left, B.top, B.right, B.bottom],
            iconeDentro: i.left >= B.left && i.right <= B.right && i.top >= B.top && i.bottom <= B.bottom,
            bannerNaTela: B.left >= 0 && B.right <= innerWidth && B.top >= 0 && B.bottom <= innerHeight,
            opacidade: getComputedStyle(b.querySelector('.time-img')).opacity,
            tituloCortado: h.scrollWidth > h.clientWidth + 1,
            pico: Number(c.dataset.pico), explosoes: Number(c.dataset.explosoes), modo: c.dataset.modo, evento: getComputedStyle(c).pointerEvents,
            escuro: (() => { const e = document.querySelector('.comem-escuro'); if (!e) return null; const s = getComputedStyle(e); return { cor: s.backgroundColor, z: Number(s.zIndex), op: Number(s.opacity), evento: s.pointerEvents }; })(),
            zFogos: Number(getComputedStyle(c).zIndex), zBanner: Number(getComputedStyle(b).zIndex),
            rolagem: document.documentElement.scrollWidth > innerWidth,
          };
        });
        const onde = `${cor} ${vp.width}x${vp.height}`;
        assert.equal(m.texto, `Parabéns, ${nome}!`, onde);
        assert.equal(m.cor, corTexto, `${onde}: texto pelo contraste calculado`);
        assert.ok(m.iconeDentro, `${onde}: ícone fora do banner`);
        assert.ok(m.bannerNaTela, `${onde}: banner fora da tela`);
        assert.equal(m.opacidade, '0.12', `${onde}: opacidade configurada`);
        assert.ok(!m.tituloCortado && !m.rolagem, onde);
        assert.equal(m.modo, 'fogos');
        assert.ok(m.pico > 0 && m.pico <= 520, `${onde}: partículas ${m.pico}`);
        assert.equal(m.evento, 'none');
        assert.ok(m.zFogos < m.zBanner, 'fogos atrás do banner');
        assert.ok(m.explosoes >= 1 && m.pico >= 60, `explosões grandes (60 a 120 partículas): pico ${m.pico}`);
        assert.ok(m.escuro, `${onde}: falta a camada escura atrás dos fogos`);
        assert.equal(m.escuro.cor, 'rgba(15, 20, 35, 0.72)');
        assert.equal(m.escuro.op, 1, 'a camada já está visível (transição de 400 ms concluída)');
        assert.equal(m.escuro.evento, 'none');
        assert.ok(m.escuro.z < m.zFogos && m.zFogos < m.zBanner, 'ordem: camada escura, fogos, banner (o banner fica nítido)');
        assert.doesNotMatch(await pg.locator('.comem-banner').innerText(), /Vermelho|Azul|Amarelo|Preto/ , `${onde}: o banner usa o nome do grupo, não o da cor`);
        // o banner continua depois dos fogos (8 s)
        await pg.waitForSelector('canvas.comem-fogos', { state: 'detached', timeout: 10000 });
        await pg.waitForSelector('.comem-escuro', { state: 'detached', timeout: 3000 }); // a camada some suave e o banner continua
        assert.equal(await pg.locator('.comem-banner').count(), 1, `${onde}: o banner fica depois dos fogos`);
        // repetir reinicia os fogos
        await S.ok('comemorar');
        await pg.waitForSelector('canvas.comem-fogos[data-fogos="ativo"]');
        // avançar: fecha o banner e volta ao Ranking
        await S.ok('proximo');
        await pg.waitForSelector('.comem-banner', { state: 'detached' });
        await pg.waitForSelector('canvas.comem-fogos', { state: 'detached' }).catch(() => {});
        assert.equal(await pg.locator('.rank-barra').count() >= 2, true, 'volta ao Ranking');
        await pg.context().close();
        if (vp.width === 1366) { await S.ok('comemorar'); await pg.context().close().catch(() => {}); }
        // volta ao estado sem comemoração para o próximo tamanho
        if (S.host.ultimo.comemoracao) await S.ok('proximo');
      }
    } finally {
      await browser.close();
    }
  }
});

test('Configurações: campo da mensagem com contador, limite de 300 e "Restaurar o texto original"', { skip: SEM_NAVEGADOR, timeout: 120000 }, async (t) => {
  const S = await montar(t, { nomes: { vermelho: 'Ana', azul: 'Bia' }, local: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  const pg = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await S.ok('irMenu');
  await pg.goto(`${S.base}/host`);
  await pg.waitForSelector('.opcao');
  await pg.click('.menu-extra >> text=Configurações');
  await pg.waitForSelector('#cfg-parabens');
  assert.equal(await pg.inputValue('#cfg-parabens'), PADRAO);
  assert.equal(await pg.getAttribute('#cfg-parabens', 'maxlength'), '300');
  assert.equal(await pg.textContent('#cfg-parabens-contador'), `${PADRAO.length} de 300 caracteres`);
  await pg.fill('#cfg-parabens', 'Boa, turma!');
  assert.equal(await pg.textContent('#cfg-parabens-contador'), '11 de 300 caracteres');
  await pg.fill('#cfg-parabens', 'z'.repeat(400));
  assert.equal((await pg.inputValue('#cfg-parabens')).length, 300, 'o campo não passa de 300');
  await pg.fill('#cfg-parabens', 'Boa, turma!');
  await pg.click('button:has-text("Salvar")');
  assert.equal((await S.host.estadoApos((s) => s.final.parabens === 'Boa, turma!')).final.parabens, 'Boa, turma!');
  await pg.click('#cfg-parabens-restaurar');
  assert.equal(await pg.inputValue('#cfg-parabens'), PADRAO);
  assert.equal(await pg.textContent('#cfg-parabens-contador'), `${PADRAO.length} de 300 caracteres`);
  await pg.click('button:has-text("Salvar")');
  // o aviso "Salvo às" já estava na tela do 1º salvamento: espera o servidor refletir a mensagem restaurada
  assert.equal((await S.host.estadoApos((s) => s.final.parabens === PADRAO)).final.parabens, PADRAO);
});

test('painel: botão Comemorar desabilitado com o motivo e habilitado com vencedor (notebook e celular)', { skip: SEM_NAVEGADOR, timeout: 150000 }, async (t) => {
  const S = await montar(t, { nomes: { vermelho: 'Ana', azul: 'Bia' }, local: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  await S.rodada('vermelho');
  await S.rodada('vermelho');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking');
  await ajustarPontosNoServidor(S, 'azul', 30); // empate no topo
  for (const [vp, mobile] of [[{ width: 1366, height: 768 }, false], [{ width: 390, height: 844 }, true]]) {
    const pg = await (await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile })).newPage();
    await pg.goto(`${S.base}/host`);
    await pg.waitForSelector('#hr-comemorar');
    assert.equal(await pg.locator('#hr-comemorar').isDisabled(), true);
    assert.equal(await pg.textContent('#hr-comemorar-motivo'), 'Defina o vencedor antes de comemorar.');
    assert.match(await pg.locator('#hr-comemorar').innerText(), /Comemorar/);
    assert.equal(await pg.locator('#hr-comemorar img[src="/assets/trofeu.webp"]').count(), 1);
    assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem horizontal');
    // as etiquetas dos grupos no Ranking do painel nunca ficam espremidas (já aconteceu no celular)
    assert.ok(await pg.evaluate(() => [...document.querySelectorAll('.hr-linha .hj-cor')].every((n) => n.getBoundingClientRect().width >= 50 && n.getBoundingClientRect().height < 50)), 'etiqueta do grupo espremida no Ranking');
    await pg.context().close();
  }
  // desempate decidido: o botão habilita e o toque comemora
  await S.ok('iniciarDesempate');
  await S.ok('mostrarAlternativas'); await S.ok('abrirJanela');
  S.fones.vermelho.enviar({ t: 'apertar' });
  await S.host.estadoApos((s) => s.estado.rodada.ordem.length === 1);
  await S.ok('encerrarJanela'); await S.ok('mostrarResposta');
  await S.ok('responder', S.host.ultimo.pergunta.correta);
  await S.ok('continuar');
  await S.host.estadoApos((s) => s.estado.fase === 'ranking' && !!s.vencedor);
  const pg = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await pg.goto(`${S.base}/host`);
  await pg.waitForSelector('#hr-comemorar:not([disabled])');
  assert.equal(await pg.locator('#hr-comemorar-motivo').count(), 0);
  await pg.click('#hr-comemorar');
  await S.host.estadoApos((s) => !!s.comemoracao);
  await pg.waitForSelector('.hj-grande:has-text("Voltar ao ranking")'); // com o banner no projetor, o botão principal só o fecha
  await pg.click('.hj-grande');
  await S.host.estadoApos((s) => s.comemoracao?.banner === false);
  assert.equal(S.host.ultimo.estado.fase, 'ranking');
  await pg.waitForSelector('.hj-grande:has-text("Ir para a tela final")');
});
