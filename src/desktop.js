'use strict';
// Peças puras do aplicativo desktop (Quizer.exe, Electron): escolha de pastas, porta livre, regras de
// navegação, posição das janelas e registro em arquivo. Nada aqui depende do Electron, para poder
// ser testado com node:test.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const PORTA_PADRAO = 3100;
const URI_HOTSPOT = 'ms-settings:network-mobilehotspot';

// ---------- pastas ----------
// data/ e logs/ ficam ao lado do exe portátil (electron-builder define PORTABLE_EXECUTABLE_DIR), nunca na
// pasta temporária onde o exe se descompacta. Sem isso: ao lado do executável (build já descompactado) ou,
// em desenvolvimento (`npm run app`), na pasta do projeto.
function pastasApp({ portableDir, execPath, empacotado, appDir }) {
  const base = portableDir || (empacotado ? path.dirname(execPath) : appDir);
  return { base, data: path.join(base, 'data'), logs: path.join(base, 'logs') };
}

// Na primeira execução (sem data/perguntas.json) entram as perguntas provisórias que vão junto do programa.
function semearPerguntas(dataDir, origem) {
  const destino = path.join(dataDir, 'perguntas.json');
  if (fs.existsSync(destino) || !fs.existsSync(origem)) return false;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(origem, destino);
  return true;
}

// ---------- porta ----------
function portaLivre(porta, host = '0.0.0.0') {
  return new Promise((ok) => {
    const s = net.createServer();
    s.once('error', () => ok(false));
    s.listen(porta, host, () => s.close(() => ok(true)));
  });
}

// A porta padrão (3100) se estiver livre; senão a próxima livre.
async function acharPorta(preferida = PORTA_PADRAO, tentativas = 50, host = '0.0.0.0') {
  for (let p = preferida; p < preferida + tentativas; p += 1) {
    if (await portaLivre(p, host)) return p;
  }
  throw new Error(`Nenhuma porta livre entre ${preferida} e ${preferida + tentativas - 1}`);
}

// ---------- navegação ----------
// As janelas só falam com o servidor do próprio programa (127.0.0.1 ou localhost, na porta escolhida).
function urlLocal(url, porta) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!['http:', 'ws:'].includes(u.protocol)) return false;
  return ['127.0.0.1', 'localhost'].includes(u.hostname) && Number(u.port || 80) === Number(porta);
}

// Navegação do painel e da /tela: só o servidor local (e about:blank).
function navegacaoPermitida(url, porta) {
  return url === 'about:blank' || urlLocal(url, porta);
}

// Pedidos de rede: nada sai da máquina. (data: e blob: não passam por aqui, só http(s) e ws(s).)
function requisicaoPermitida(url, porta) {
  return urlLocal(url, porta);
}

// Única coisa que o painel pode pedir para abrir fora do programa.
function uriExternaPermitida(uri) {
  return uri === URI_HOTSPOT;
}

// ---------- janelas ----------
// displays: [{ id, bounds, workArea }]. O painel fica no monitor principal; a /tela, em tela cheia no outro
// monitor (projetor em modo estendido). Com um monitor só, a /tela abre em janela normal, para o responsável
// poder arrastá-la depois.
function planoJanelas(displays, primarioId) {
  const principal = displays.find((d) => d.id === primarioId) || displays[0];
  const outro = displays.filter((d) => d.id !== principal.id).sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)[0];
  const area = principal.workArea;
  const largura = Math.min(1280, Math.round(area.width * 0.7));
  const altura = Math.min(720, Math.round(area.height * 0.7));
  return {
    painel: { bounds: { ...area }, maximizada: true },
    tela: outro
      ? { modo: 'tela-cheia', bounds: { ...outro.bounds } }
      : {
        modo: 'janela',
        bounds: { x: area.x + Math.round((area.width - largura) / 2) + 40, y: area.y + Math.round((area.height - altura) / 2) + 40, width: largura, height: altura },
      },
  };
}

// ---------- registro em arquivo ----------
const p2 = (n) => String(n).padStart(2, '0');
const dataArquivo = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

// logs/quizer-AAAA-MM-DD.log, uma linha por evento; mantém os 14 arquivos mais recentes.
function criarLog(dir, relogio = () => new Date()) {
  fs.mkdirSync(dir, { recursive: true });
  function limpar() {
    const arquivos = fs.readdirSync(dir).filter((n) => /^quizer-\d{4}-\d{2}-\d{2}\.log$/.test(n)).sort();
    for (const velho of arquivos.slice(0, Math.max(0, arquivos.length - 14))) fs.unlinkSync(path.join(dir, velho));
  }
  limpar();
  return (msg) => {
    const d = relogio();
    const linha = `[${d.toISOString()}] ${msg}\r\n`;
    const arquivo = path.join(dir, `quizer-${dataArquivo(d)}.log`);
    const novo = !fs.existsSync(arquivo);
    try {
      // BOM no arquivo novo: o Bloco de Notas mostra os acentos corretamente
      fs.appendFileSync(arquivo, (novo ? '﻿' : '') + linha);
      if (novo) limpar(); // dia novo: mantém só os 14 mais recentes
    } catch { /* disco indisponível: segue sem log */ }
  };
}

module.exports = {
  PORTA_PADRAO,
  URI_HOTSPOT,
  pastasApp,
  semearPerguntas,
  portaLivre,
  acharPorta,
  navegacaoPermitida,
  requisicaoPermitida,
  uriExternaPermitida,
  planoJanelas,
  criarLog,
};
