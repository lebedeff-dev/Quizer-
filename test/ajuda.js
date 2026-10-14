'use strict';
// Ajudantes dos testes de integração: cliente WebSocket, login por PIN e entrada de celulares.
const WebSocket = require('ws');

class Cliente {
  constructor(base, query, cookie) {
    this.ultimo = null;
    this.mensagens = [];
    this.esperas = [];
    this.ws = new WebSocket(`ws://127.0.0.1:${base}/ws?${query}`, cookie ? { headers: { Cookie: cookie } } : {});
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      this.mensagens.push(m);
      if (m.t === 'estado') this.ultimo = m;
      this.esperas = this.esperas.filter((e) => !e(m));
    });
    this.aberto = new Promise((ok, falha) => {
      this.ws.once('open', ok);
      this.ws.once('error', falha);
      this.ws.once('unexpected-response', (_, res) => falha(new Error(`HTTP ${res.statusCode}`)));
    });
  }

  // Espera uma mensagem que satisfaça o predicado (ou uma que já chegou antes, se `incluirPassado`).
  esperar(pred, ms = 3000, incluirPassado = false) {
    return new Promise((ok, falha) => {
      if (incluirPassado) {
        const achada = this.mensagens.find(pred);
        if (achada) return ok(achada);
      }
      const t = setTimeout(() => falha(new Error('tempo esgotado esperando mensagem')), ms);
      this.esperas.push((m) => {
        if (!pred(m)) return false;
        clearTimeout(t);
        ok(m);
        return true;
      });
    });
  }

  enviar(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  // Dispara uma ação do responsável e espera a resposta ok ou erro.
  async acao(nome, ...args) {
    const id = `${nome}-${Math.random()}`;
    const p = this.esperar((m) => m.id === id);
    this.enviar({ t: 'acao', id, nome, args });
    return p;
  }

  async estadoApos(pred) {
    if (this.ultimo && pred(this.ultimo)) return this.ultimo;
    return this.esperar((m) => m.t === 'estado' && pred(m));
  }

  fechar() {
    this.ws.close();
  }
}

async function autenticar(porta, pin) {
  const r = await fetch(`http://127.0.0.1:${porta}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function entrarGrupo(porta, cor, nome, token) {
  const c = new Cliente(porta, `papel=g&cor=${cor}`);
  await c.aberto;
  c.enviar({ t: 'entrar', nome, token });
  const entrou = await c.esperar((m) => m.t === 'entrou' || m.t === 'erro');
  return { c, entrou };
}

const PIN = '4321';
// Monta situações de teste com uma pontuação específica. O ajuste manual saiu do jogo (Etapa 8k): isto só existe aqui.
function ajustarPontosTeste(state, cor, delta) {
  const novo = structuredClone(state);
  const g = novo.grupos.find((x) => x.cor === cor);
  if (!g) throw new Error(`Grupo inexistente: ${cor}`);
  g.pontos += delta;
  return novo;
}

// Igual, mas no servidor em execução (gancho interno de testes); espera o painel enxergar o novo total.
async function ajustarPontosNoServidor(c, cor, delta) {
  const atual = c.host.ultimo.estado.grupos.find((x) => x.cor === cor).pontos;
  const erro = c.srv.aplicarNoEstadoParaTeste((s) => ajustarPontosTeste(s, cor, delta));
  if (erro) throw new Error(erro);
  await c.host.estadoApos((m) => m.estado.grupos.find((x) => x.cor === cor).pontos === atual + delta);
}

// Nome que os testes dão aos grupos: o nome da cor com inicial maiúscula ("Azul"), para o Registro dizer "Azul usou...".
// Os testes de nome de grupo (vazio, repetido, longo) usam nomes próprios.
const nomeDaCor = (cor) => cor.charAt(0).toUpperCase() + cor.slice(1);

module.exports = {
  nomeDaCor,
  ajustarPontosTeste,
  ajustarPontosNoServidor, Cliente, autenticar, entrarGrupo, dormir, PIN };
