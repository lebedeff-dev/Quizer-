'use strict';
// Peças puras do aplicativo desktop (Quizer.exe) e o que o painel recebe sobre rede e PIN.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const D = require('../src/desktop');
const { iniciarServidor } = require('../server');
const { Cliente, PIN } = require('./ajuda');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-d-'));
const limpar = (d) => fs.rmSync(d, { recursive: true, force: true });

test('pastas: data/ e logs/ ficam ao lado do exe portátil, nunca na pasta temporária', () => {
  const p = D.pastasApp({ portableDir: 'D:\\Oficina', execPath: 'C:\\Temp\\abc\\Quizer.exe', empacotado: true, appDir: 'C:\\Temp\\abc\\resources\\app' });
  assert.equal(p.base, 'D:\\Oficina');
  assert.equal(p.data, path.join('D:\\Oficina', 'data'));
  assert.equal(p.logs, path.join('D:\\Oficina', 'logs'));
  // empacotado sem PORTABLE_EXECUTABLE_DIR (pasta win-unpacked): ao lado do executável
  assert.equal(D.pastasApp({ execPath: path.join('E:', 'x', 'Quizer.exe'), empacotado: true, appDir: 'zzz' }).base, path.join('E:', 'x'));
  // desenvolvimento: pasta do projeto
  assert.equal(D.pastasApp({ execPath: 'electron.exe', empacotado: false, appDir: 'C:\\proj' }).data, path.join('C:\\proj', 'data'));
});

test('perguntas provisórias entram só na primeira execução e nunca sobrescrevem as do usuário', () => {
  const dir = tmp();
  t_after(() => limpar(dir));
  const origem = path.join(__dirname, '..', 'data', 'perguntas.json');
  const dados = path.join(dir, 'data');
  assert.equal(D.semearPerguntas(dados, origem), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dados, 'perguntas.json'), 'utf8')).perguntas.length, 26);
  fs.writeFileSync(path.join(dados, 'perguntas.json'), JSON.stringify({ perguntas: [] }));
  assert.equal(D.semearPerguntas(dados, origem), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dados, 'perguntas.json'), 'utf8')).perguntas, []);
  assert.equal(D.semearPerguntas(path.join(dir, 'outra'), path.join(dir, 'nao-existe.json')), false);
});
// t.after fora do contexto do teste: limpeza simples ao final do processo
function t_after(fn) { process.once('exit', fn); }

test('porta: usa a preferida se livre; senão a próxima livre', async () => {
  // Outros testes rodam em paralelo e também pegam portas do sistema: a porta "seguinte" pode ser tomada entre a
  // busca e a conferência. Por isso a conferência é uma tentativa real de abrir a porta achada, repetida se perder a corrida.
  let ultimo = null;
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const ocupa = net.createServer();
    await new Promise((ok) => ocupa.listen(0, '0.0.0.0', ok));
    const ocupada = ocupa.address().port;
    try {
      assert.equal(await D.portaLivre(ocupada), false, 'a porta ocupada não está livre');
      const livre = await D.acharPorta(ocupada);
      assert.ok(livre > ocupada && livre < ocupada + 50, `porta ${livre}`);
      const prova = net.createServer();
      const abriu = await new Promise((ok) => { prova.once('error', () => ok(false)); prova.listen(livre, '0.0.0.0', () => ok(true)); });
      if (abriu) await new Promise((ok) => prova.close(ok));
      if (abriu) { ultimo = livre; break; }
    } finally {
      await new Promise((ok) => ocupa.close(ok));
    }
  }
  assert.ok(ultimo, 'achou uma porta que realmente abre');
  assert.equal(D.PORTA_PADRAO, 3100);
});

test('navegação: só o servidor local, na porta do programa; nada sai da máquina', () => {
  const ok = (u) => D.navegacaoPermitida(u, 3101);
  assert.equal(ok('http://127.0.0.1:3101/host'), true);
  assert.equal(ok('http://localhost:3101/tela'), true);
  assert.equal(ok('about:blank'), true);
  for (const ruim of [
    'https://example.com/', 'http://example.com:3101/', 'http://127.0.0.1:3100/host', 'http://127.0.0.1/host',
    'http://192.168.0.6:3101/host', 'http://127.0.0.1.evil.com:3101/', 'file:///C:/Windows/win.ini', 'ftp://127.0.0.1:3101/',
    'javascript:alert(1)', 'ms-settings:network-mobilehotspot', 'não é url', '',
  ]) assert.equal(ok(ruim), false, ruim);
  // pedidos de rede: http(s) e WebSocket só para o servidor local
  assert.equal(D.requisicaoPermitida('ws://127.0.0.1:3101/ws?papel=host', 3101), true);
  assert.equal(D.requisicaoPermitida('wss://127.0.0.1:3101/ws', 3101), false);
  assert.equal(D.requisicaoPermitida('https://fonts.googleapis.com/css', 3101), false);
  assert.equal(D.requisicaoPermitida('http://169.254.169.254/latest/meta-data', 3101), false);
  // a única coisa que o painel pode abrir fora do programa
  assert.equal(D.uriExternaPermitida('ms-settings:network-mobilehotspot'), true);
  for (const u of ['ms-settings:network', 'https://example.com', 'file:///C:/Windows/System32/cmd.exe', 'cmd.exe', '']) assert.equal(D.uriExternaPermitida(u), false, u);
});

test('janelas: painel no monitor principal; /tela em tela cheia no outro, ou em janela normal com um monitor só', () => {
  const um = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }];
  const p1 = D.planoJanelas(um, 1);
  assert.equal(p1.painel.maximizada, true);
  assert.deepEqual(p1.painel.bounds, um[0].workArea);
  assert.equal(p1.tela.modo, 'janela');
  assert.ok(p1.tela.bounds.width <= 1280 && p1.tela.bounds.x >= 0 && p1.tela.bounds.x + p1.tela.bounds.width <= 1920);
  const dois = [
    um[0],
    { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 }, workArea: { x: 1920, y: 0, width: 1280, height: 720 } },
  ];
  const p2 = D.planoJanelas(dois, 1);
  assert.equal(p2.tela.modo, 'tela-cheia');
  assert.deepEqual(p2.tela.bounds, dois[1].bounds);
  assert.deepEqual(p2.painel.bounds, dois[0].workArea);
  // o principal pode não ser o primeiro da lista, nem o da esquerda
  const p3 = D.planoJanelas([dois[1], dois[0]], 2);
  assert.deepEqual(p3.painel.bounds, dois[1].workArea);
  assert.deepEqual(p3.tela.bounds, dois[0].bounds);
  // projetor desligado: volta à janela normal
  assert.equal(D.planoJanelas([dois[0]], 1).tela.modo, 'janela');
});

test('log em arquivo: uma linha por evento, BOM no arquivo novo, mantém os 14 mais recentes', () => {
  const dir = path.join(tmp(), 'logs');
  process.once('exit', () => limpar(path.dirname(dir)));
  for (let i = 1; i <= 20; i += 1) fs.mkdirSync(dir, { recursive: true }), fs.writeFileSync(path.join(dir, `quizer-2026-09-${String(i).padStart(2, '0')}.log`), 'x');
  fs.writeFileSync(path.join(dir, 'outro.txt'), 'não é log');
  const log = D.criarLog(dir, () => new Date(2026, 9, 23, 8, 5, 9));
  log('Primeira execução: perguntas');
  log('Segunda linha');
  const arquivos = fs.readdirSync(dir).filter((n) => n.endsWith('.log')).sort();
  assert.equal(arquivos.length, 14);
  assert.ok(fs.existsSync(path.join(dir, 'outro.txt')), 'não apaga o que não é log');
  const texto = fs.readFileSync(path.join(dir, 'quizer-2026-10-23.log'), 'utf8');
  assert.equal(texto.charCodeAt(0), 0xFEFF);
  assert.match(texto, /\[2026-10-2\dT[\d:.]+Z\] Primeira execução: perguntas\r\n.*Segunda linha\r\n$/s);
  assert.equal(texto.split('\uFEFF').length, 2, 'só um BOM');
  assert.ok(arquivos.includes('quizer-2026-10-23.log') && !arquivos.includes('quizer-2026-09-01.log'));
});

// ---------- o que o painel recebe: PIN, endereço e rede ----------
async function subir(t, opcoes = {}) {
  const dir = tmp();
  fs.copyFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), path.join(dir, 'perguntas.json'));
  const srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ...opcoes });
  const host = new Cliente(srv.porta, 'papel=host');
  t.after(async () => { host.fechar(); await srv.fechar(); limpar(dir); });
  await host.aberto;
  return { srv, host };
}

test('painel: endereço do /host (IP escolhido) e PIN na visão; aviso de sem rede quando não há IP', async (t) => {
  const { srv, host } = await subir(t, { descobrirIps: () => [{ ip: '192.168.0.6', nome: 'Wi-Fi', provavel: true }, { ip: '10.0.0.9', nome: 'Ethernet', provavel: false }] });
  const v = await host.estadoApos(() => true);
  assert.equal(v.pin, PIN);
  assert.equal(v.semRede, false);
  assert.equal(v.enderecoPainel, `http://192.168.0.6:${srv.porta}/host`);
  await host.acao('escolherIp', '10.0.0.9');
  assert.equal(host.ultimo.enderecoPainel, `http://10.0.0.9:${srv.porta}/host`);

  const sem = await subir(t, { descobrirIps: () => [] });
  const vs = await sem.host.estadoApos(() => true);
  assert.equal(vs.semRede, true);
  assert.equal(vs.enderecoPainel, null);
  assert.equal(vs.pin, PIN); // o PIN aparece mesmo sem rede
});

test('rede que aparece ou some com o programa aberto: o painel é avisado sozinho', async (t) => {
  let ips = [];
  const { srv, host } = await subir(t, { descobrirIps: () => ips, intervaloRedeMs: 100 });
  assert.equal((await host.estadoApos(() => true)).semRede, true);
  ips = [{ ip: '192.168.1.20', nome: 'Wi-Fi', provavel: true }];
  const v = await host.esperar((m) => m.t === 'estado' && m.semRede === false, 4000);
  assert.equal(v.enderecoPainel, `http://192.168.1.20:${srv.porta}/host`); // o IP escolhido acompanha a rede nova
  ips = [];
  assert.equal((await host.esperar((m) => m.t === 'estado' && m.semRede === true, 4000)).enderecoPainel, null);
});
