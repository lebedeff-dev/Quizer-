'use strict';
// Gera capturas de tela para conferir o visual: node scripts/capturas.js
// Usa o Chrome instalado (playwright-core, sem baixar navegador) e um servidor temporário
// com as perguntas provisórias de data/perguntas.json.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const WebSocket = require('ws');
const { iniciarServidor } = require('../server');
const { TEMA, pastaCapturas, temaInicial } = require('./util-tema');

const PIN = '1234';
const SAIDA = pastaCapturas;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const TAMANHOS = [
  { w: 1920, h: 1080 },
  { w: 1366, h: 768 },
];

async function entrarGrupo(porta, cor, nome) {
  const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws?papel=g&cor=${cor}`);
  await new Promise((ok) => ws.once('open', ok));
  ws.send(JSON.stringify({ t: 'entrar', nome }));
  await new Promise((ok) => ws.on('message', (m) => JSON.parse(m).t === 'entrou' && ok()));
  return ws;
}

// Arquivo de importação com problemas de propósito, para a tela de resumo.
function arquivoComErros(dir) {
  const ok = (n) => ({ id: n, tipo: 'facil', enunciado: `Pergunta de teste ${n}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, explicacao: 'x', reserva: false });
  const lista = [
    ok(1),
    { ...ok(2), enunciado: '' },
    { ...ok(3), alternativas: ['a', 'b', '', 'd'], correta: null },
    ok(4),
    { id: 5, tipo: 'atencao', enunciado: 'Só o enunciado', alternativas: ['a', '', '', ''], correta: 0 },
    ok(6),
  ];
  const caminho = path.join(dir, 'importar-com-erros.json');
  fs.writeFileSync(caminho, JSON.stringify({ perguntas: lista }, null, 2));
  return caminho;
}

(async () => {
  fs.rmSync(SAIDA, { recursive: true, force: true });
  fs.mkdirSync(SAIDA, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  for (const { w, h } of TAMANHOS) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-cap-'));
    fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
    const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false }); // simula outro aparelho: mostra o cartão de PIN
    await temaInicial(srv, PIN);
    const base = `http://127.0.0.1:${srv.porta}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
    const tela = await ctx.newPage();
    const host = await ctx.newPage();
    const foto = async (pg, nome) => {
      await pg.waitForTimeout(300);
      await pg.screenshot({ path: path.join(SAIDA, `${w}x${h}-${nome}.png`) });
    };
    const erros = [];
    for (const pg of [tela, host]) {
      pg.on('pageerror', (e) => erros.push(String(e)));
      pg.on('console', (m) => m.type() === 'error' && !/401/.test(m.text()) && erros.push(m.text()));
    }

    await tela.goto(`${base}/tela`);
    await tela.waitForLoadState('networkidle');
    await foto(tela, 'tela-capa');

    await host.goto(`${base}/host`);
    await host.waitForLoadState('networkidle');
    await foto(host, 'host-capa');
    await host.click('text=Iniciar');
    await foto(host, 'host-pin');
    await host.fill('input.campo-pin', PIN);
    await host.waitForSelector('.opcao');
    await foto(host, 'host-menu');

    // ---------- editor ----------
    await host.click('text=Criar e editar perguntas');
    await host.waitForSelector('.ed-item');
    await foto(host, 'editor-1-lista-cheia');

    await host.locator('.ed-item-btn').nth(3).click();
    await foto(host, 'editor-2-pergunta-selecionada');

    // pergunta inválida: nova, só com enunciado e uma alternativa
    await host.click('text=+ Nova pergunta');
    await host.fill('#f-enunciado', 'Pergunta ainda incompleta, sem alternativas nem resposta');
    await host.locator('.ed-alt input[type=text]').first().fill('Primeira alternativa');
    await host.waitForSelector('.ed-problemas:not([hidden])');
    await host.locator('.ed-itens').evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await foto(host, 'editor-3-pergunta-invalida');
    await host.waitForSelector('.ed-status:has-text("Salvo às")');

    // explicação longa (aviso acima de 200 caracteres)
    await host.fill('#f-explicacao', 'x'.repeat(230));
    await host.waitForSelector('.ed-longo:not([hidden])');
    await foto(host, 'editor-4-explicacao-longa');
    await host.fill('#f-explicacao', '');

    // exclusão: remove a pergunta nova
    await host.click('.ed-acoes >> text=Excluir');
    await host.waitForSelector('text=/Excluir a pergunta/');
    await foto(host, 'editor-5-confirmar-exclusao');
    await host.click('.painel >> text=Cancelar');

    // prévia no projetor (seleciona uma pergunta completa)
    await host.locator('.ed-item-btn').nth(6).click();
    await host.click('text=Ver no projetor');
    await foto(host, 'editor-6-previa-pergunta');
    await host.click('.ed-aba >> text=Alternativas');
    await foto(host, 'editor-7-previa-alternativas');
    await host.click('.painel >> text=Fechar');

    // importação com erros
    const arquivo = arquivoComErros(dir);
    const [chooser] = await Promise.all([host.waitForEvent('filechooser'), host.click('text=Importar JSON')]);
    await chooser.setFiles(arquivo);
    await host.waitForSelector('text=Resumo da importação');
    await foto(host, 'editor-8-importar-resumo-erros');
    await host.click('.painel >> text=Cancelar');

    // arquivo inválido
    const lixo = path.join(dir, 'invalido.json');
    fs.writeFileSync(lixo, '{"perguntas": "isto não é uma lista"}');
    const [chooser2] = await Promise.all([host.waitForEvent('filechooser'), host.click('text=Importar JSON')]);
    await chooser2.setFiles(lixo);
    await host.waitForSelector('text=Não foi possível importar');
    await foto(host, 'editor-9-importar-arquivo-invalido');
    await host.click('.painel >> text=Fechar');

    // exportar baixa o arquivo no formato esperado
    const [baixado] = await Promise.all([host.waitForEvent('download'), host.click('text=Exportar JSON')]);
    const nomeBaixado = baixado.suggestedFilename();
    const conteudo = JSON.parse(fs.readFileSync(await baixado.path(), 'utf8'));
    console.log(`  ${w}x${h}: exportou ${nomeBaixado} com ${conteudo.perguntas.length} perguntas`);

    // arrastar para reordenar: leva a pergunta 1 para depois da 3
    const antes = await host.locator('.ed-txt').allTextContents();
    await host.locator('.ed-li').nth(0).dragTo(host.locator('.ed-li').nth(2), { targetPosition: { x: 80, y: 40 } });
    await host.waitForTimeout(400);
    const depois = await host.locator('.ed-txt').allTextContents();
    console.log(`  ${w}x${h}: arrastar mudou a ordem? ${antes[0] !== depois[0] ? 'sim' : 'NÃO'}`);
    await foto(host, 'editor-10-apos-arrastar');

    // botão Voltar (também no canto inferior esquerdo nas capturas acima)
    await host.click('.avanco.voltar');
    await host.waitForSelector('.opcao');
    await foto(host, 'host-menu-aviso-ou-normal');

    // ---------- menu com 3 cartões e confirmação ----------
    await host.click('text=Criar novo jogo');
    await host.waitForSelector('text=Sala de espera');
    const ws = await entrarGrupo(srv.porta, 'azul', 'Ana');
    await host.click('.avanco.voltar');
    await host.waitForSelector('text=Continuar jogo');
    await foto(host, 'host-menu-3-opcoes');
    await host.click('text=Criar novo jogo');
    await host.waitForSelector('text=Substituir o jogo salvo?');
    await foto(host, 'host-confirmar');
    await host.click('text=Cancelar');
    ws.close();

    await foto(tela, 'tela-capa-com-host-no-menu');
    if (erros.length) console.log(`Erros no navegador (${w}x${h}):`, erros);
    await ctx.close();
    await srv.fechar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await browser.close();
  console.log('Capturas em', SAIDA);
})().catch((e) => { console.error(e); process.exit(1); });
