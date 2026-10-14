'use strict';
// Quizer: aplicativo desktop (Electron) da oficina. Sobe o servidor no próprio processo e abre duas janelas:
// o painel do responsável (/host) no monitor principal e a /tela em tela cheia no projetor.
// Funciona offline e sem terminal. Dados em data/ e logs/ ao lado do Quizer.exe.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, powerSaveBlocker, screen, session, shell } = require('electron');
const D = require('./src/desktop');

app.setName('Quizer');

const E = { log: () => {}, servidor: null, porta: null, painel: null, tela: null, bloqueio: null, encerrando: false, timerTela: null };
const ICONE = path.join(__dirname, 'build', 'icon.ico');

// ---------- janelas ----------
function opcoesJanela(extra) {
  return {
    show: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    ...(app.isPackaged ? {} : { icon: ICONE }), // empacotado, o ícone já está dentro do .exe
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
      backgroundThrottling: false, // a /tela no projetor não pode congelar o cronômetro
    },
    ...extra,
  };
}

// Nada de navegar para fora do servidor local, abrir janelas novas ou embutir páginas.
function blindar(win, titulo) {
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  const barrar = (ev, url) => {
    if (!D.navegacaoPermitida(url, E.porta)) {
      ev.preventDefault();
      E.log(`Navegação bloqueada: ${url}`);
    }
  };
  wc.on('will-navigate', barrar);
  wc.on('will-redirect', barrar);
  wc.on('will-attach-webview', (ev) => ev.preventDefault());
  wc.on('page-title-updated', (ev) => { ev.preventDefault(); win.setTitle(titulo); });
}

const displaysAtuais = () => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea }));
const planoAtual = () => D.planoJanelas(displaysAtuais(), screen.getPrimaryDisplay().id);

function criarPainel(plano) {
  const titulo = `Quizer: painel (porta ${E.porta})`;
  const win = new BrowserWindow(opcoesJanela({ ...plano.painel.bounds, title: titulo }));
  blindar(win, titulo);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // Fechar o painel encerra o programa; pergunta antes, para um clique sem querer não derrubar a aula.
  win.on('close', (ev) => {
    if (E.encerrando) return;
    ev.preventDefault();
    const r = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Cancelar', 'Encerrar'], defaultId: 0, cancelId: 0, title: 'Quizer',
      message: 'Encerrar o Quizer?', detail: 'O jogo fica salvo e pode ser retomado depois.',
    });
    if (r === 1) encerrar();
  });
  win.on('closed', () => { E.painel = null; });
  win.loadURL(`http://127.0.0.1:${E.porta}/host`);
  return win;
}

function criarTela(plano) {
  const titulo = 'Quizer: projetor';
  const cheia = plano.tela.modo === 'tela-cheia';
  const win = new BrowserWindow(opcoesJanela({ ...plano.tela.bounds, title: titulo, fullscreen: cheia, ...(cheia ? { frame: false } : {}) }));
  blindar(win, titulo);
  win.once('ready-to-show', () => { win.show(); if (cheia) win.setFullScreen(true); });
  win.on('closed', () => { E.tela = null; });
  win.loadURL(`http://127.0.0.1:${E.porta}/tela`);
  return win;
}

// Projetor ligado ou desligado com o programa aberto (Win+P): move a /tela para o lugar certo.
function reposicionarTela() {
  clearTimeout(E.timerTela);
  E.timerTela = setTimeout(() => {
    const win = E.tela;
    if (!win || win.isDestroyed()) return;
    const t = planoAtual().tela;
    win.setFullScreen(false);
    win.setBounds(t.bounds);
    if (t.modo === 'tela-cheia') win.setFullScreen(true);
    E.log(`Projetor: /tela em modo ${t.modo}`);
  }, 500);
}

function abrirTela() {
  if (E.tela && !E.tela.isDestroyed()) { E.tela.show(); E.tela.focus(); return; }
  E.tela = criarTela(planoAtual());
}

// ---------- encerrar ----------
async function encerrar() {
  if (E.encerrando) return;
  E.encerrando = true;
  E.log('Encerrando');
  try { await E.servidor?.fechar(); } catch (e) { E.log(`Erro ao fechar o servidor: ${e.message}`); }
  if (E.bloqueio !== null && powerSaveBlocker.isStarted(E.bloqueio)) powerSaveBlocker.stop(E.bloqueio);
  for (const w of [E.tela, E.painel]) if (w && !w.isDestroyed()) w.destroy();
  app.quit();
}

// ---------- ponte com o painel ----------
function remetenteLocal(ev) {
  return D.navegacaoPermitida(ev.senderFrame?.url || '', E.porta);
}
function dosPainel(ev) {
  return E.painel && !E.painel.isDestroyed() && ev.sender === E.painel.webContents && remetenteLocal(ev);
}

function registrarIpc() {
  ipcMain.handle('quizer:copiar', (ev, texto) => {
    if (!remetenteLocal(ev)) return false;
    clipboard.writeText(String(texto).slice(0, 500));
    return true;
  });
  ipcMain.handle('quizer:abrir-hotspot', async (ev) => {
    if (!dosPainel(ev) || !D.uriExternaPermitida(D.URI_HOTSPOT)) return false;
    try { await shell.openExternal(D.URI_HOTSPOT); return true; } catch (e) { E.log(`Hotspot: ${e.message}`); return false; }
  });
  ipcMain.handle('quizer:reabrir-tela', (ev) => { if (!dosPainel(ev)) return false; abrirTela(); return true; });
  ipcMain.handle('quizer:encerrar', (ev) => { if (!dosPainel(ev)) return false; setImmediate(encerrar); return true; });
}

// ---------- início ----------
async function iniciar() {
  const pastas = D.pastasApp({ portableDir: process.env.PORTABLE_EXECUTABLE_DIR, execPath: process.execPath, empacotado: app.isPackaged, appDir: __dirname });
  fs.mkdirSync(pastas.data, { recursive: true });
  E.log = D.criarLog(pastas.logs);
  E.log(`Quizer ${app.getVersion()} iniciando. Pasta: ${pastas.base}`);
  process.on('uncaughtException', (e) => E.log(`Erro não tratado: ${e.stack || e}`));
  process.on('unhandledRejection', (e) => E.log(`Promessa rejeitada: ${e?.stack || e}`));

  if (D.semearPerguntas(pastas.data, path.join(__dirname, 'data', 'perguntas.json'))) E.log('Primeira execução: perguntas provisórias copiadas para data/');

  E.porta = await D.acharPorta();
  if (E.porta !== D.PORTA_PADRAO) E.log(`Porta ${D.PORTA_PADRAO} ocupada: usando ${E.porta}`);
  const { iniciarServidor } = require('./server');
  E.servidor = await iniciarServidor({ port: E.porta, dataDir: pastas.data });
  E.log(`Servidor no ar na porta ${E.porta}`);

  // Nada sai da máquina: só o servidor local responde; permissões do navegador (câmera, local...) negadas.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (detalhes, cb) => {
    const ok = D.requisicaoPermitida(detalhes.url, E.porta);
    if (!ok) E.log(`Pedido de rede bloqueado: ${detalhes.url}`);
    cb({ cancel: !ok });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  // O notebook não pode suspender no meio da oficina.
  E.bloqueio = powerSaveBlocker.start('prevent-display-sleep');

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Quizer', submenu: [
      { label: 'Reabrir a tela do projetor', click: abrirTela },
      { type: 'separator' },
      { label: 'Encerrar', click: encerrar },
    ] },
  ]));
  registrarIpc();

  const plano = planoAtual();
  E.painel = criarPainel(plano);
  E.tela = criarTela(plano);
  E.log(`Janelas abertas (projetor: ${plano.tela.modo})`);
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, reposicionarTela);
}

if (!app.requestSingleInstanceLock()) {
  app.quit(); // já há um Quizer aberto: o outro recebe o aviso e vem para a frente
} else {
  app.on('second-instance', () => {
    const w = E.painel;
    if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
  });
  app.on('window-all-closed', () => { if (!E.encerrando) encerrar(); });
  app.on('before-quit', (ev) => { if (!E.encerrando) { ev.preventDefault(); encerrar(); } });
  app.whenReady().then(iniciar).catch((e) => {
    E.log(`Falha ao iniciar: ${e.stack || e}`);
    dialog.showErrorBox('Quizer', `Não foi possível iniciar.\n\n${e.message}\n\nVeja a pasta logs ao lado do Quizer.exe.`);
    app.exit(1);
  });
}
