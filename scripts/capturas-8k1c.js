'use strict';
// Capturas da 8k-1c: a grade de 10 cores da seleção em 1024x768, 1366x768 e 1920x1080 (/tela e /host), com 0, 3 e 10 grupos
// e com o QR aberto. node scripts/capturas-8k1c.js   (TEMA=claro|noturno grava em capturas/<tema>/)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo } = require('../test/ajuda');
const { pastaCapturas, temaInicial } = require('./util-tema');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const TELAS = [{ width: 1024, height: 768 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const CORES = ['vermelho', 'azul', 'verde', 'amarelo', 'laranja', 'roxo', 'rosa', 'ciano', 'preto', 'cinza'];
const NOMES = ['Ana', 'Laranjeiras', 'Maria Aparecida de Albuquerque Nasciment', 'Bia', 'Supercalifragilisticexpialidocious1234', 'Time Azul', 'Clara', 'Os Roxos Unidos', 'Gabi', 'Fátima'];
const erros = [];

async function main() {
  fs.mkdirSync(pastaCapturas, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8kc-'));
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: '1234' });
  await temaInicial(srv);
  const host = new Cliente(srv.porta, 'papel=host');
  await host.aberto;
  await host.acao('novoJogo', {});
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const paginas = [];
  for (const vp of TELAS) {
    const tela = await (await browser.newContext({ viewport: vp })).newPage();
    const painel = await (await browser.newContext({ viewport: vp })).newPage();
    await tela.goto(`http://127.0.0.1:${srv.porta}/tela`);
    await painel.goto(`http://127.0.0.1:${srv.porta}/host`);
    await tela.waitForSelector('.bloco');
    await painel.waitForSelector('.hs-ficha');
    paginas.push({ vp, tela, painel });
  }
  const foto = async (nome) => {
    for (const { vp, tela, painel } of paginas) {
      for (const [rotulo, pg] of [['tela', tela], ['host', painel]]) {
        await pg.waitForTimeout(350);
        const [sw, iw, texto] = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.body.innerText]);
        if (sw > iw) erros.push(`${nome} ${vp.width} ${rotulo}: rolagem horizontal`);
        if (/\bnull\b|\bundefined\b/i.test(texto)) erros.push(`${nome} ${vp.width} ${rotulo}: null/undefined`);
        await pg.screenshot({ path: path.join(pastaCapturas, `${vp.width}x${vp.height}-8k1c-${rotulo}-${nome}.png`) });
      }
    }
  };
  const fones = [];
  const entrar = async (n) => {
    while (fones.length < n) {
      const i = fones.length;
      fones.push((await entrarGrupo(srv.porta, CORES[i], NOMES[i])).c);
    }
    await host.estadoApos((s) => s.estado.grupos.length === n);
  };
  await foto('0-grupos');
  await entrar(3);
  await foto('3-grupos');
  await host.acao('selecionarCor', 'cinza');
  await paginas[0].tela.waitForSelector('.qr-cartao');
  await foto('3-grupos-com-qr');
  await host.acao('selecionarCor', null);
  await entrar(10);
  await foto('10-grupos-todas-ocupadas');
  for (const f of fones) f.fechar();
  host.fechar();
  await browser.close();
  await srv.fechar();
  fs.rmSync(dir, { recursive: true, force: true });
  if (erros.length) { console.log('Problemas:\n' + erros.join('\n')); process.exitCode = 1; } else console.log(`Capturas em ${pastaCapturas}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
