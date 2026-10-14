'use strict';
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const express = require('express');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const G = require('./src/game');
const { criarStore } = require('./src/store');
const { listarIps } = require('./src/network');
const { visaoTela, visaoHost, visaoGrupo, emAndamento } = require('./src/visoes');
const P = require('./src/perguntas');
const R = require('./src/registro');
const CFG = require('./src/config-campos');
const { FINAL_PADRAO } = require('./src/store');

const PUBLIC = path.join(__dirname, 'public');
const COOKIE = 'oficina_auth';

function lerCookies(req) {
  const out = {};
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return out;
}

function iguais(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Endereços deste computador: loopback e todos os IPs das interfaces de rede.
function enderecosLocais() {
  const todos = new Set(['127.0.0.1', '::1']);
  for (const lista of Object.values(os.networkInterfaces())) for (const i of lista || []) todos.add(i.address);
  return todos;
}
const normalizar = (a = '') => String(a).replace(/^::ffff:/i, '').replace(/%.*$/, '').toLowerCase();
// Padrão: a requisição veio do próprio notebook (quem abre /host e /tela nele é o responsável).
function ehLocalPadrao(req) {
  return enderecosLocais().has(normalizar(req.socket?.remoteAddress));
}

const TEMAS = ['claro', 'noturno'];

// Etapa 8k: a cor Marrom virou Preto. Converte só os campos de cor (chaves e valores de cor, como grupos, ordem, alvos,
// tokens e pedidos) e as linhas geradas pelo jogo no Registro. O nome que o grupo digitou ("representante") e o que vem
// entre parênteses ou aspas nas linhas do Registro nunca são alterados.
function migrarMarrom(dado) {
  if (dado == null || !/marrom|Marrom/.test(JSON.stringify(dado))) return dado;
  // Parênteses e aspas guardam o que o grupo digitou, exceto uma lista só de nomes de cor ("Jogo iniciado com 2 grupos (Azul, Marrom)").
  const soCores = /^\(\s*(?:(?:Vermelho|Azul|Verde|Amarelo|Laranja|Roxo|Rosa|Ciano|Marrom|Preto|Cinza)\s*(?:,\s*|\)$))+$/;
  const trocar = (p) => p.replace(/\bmarrom\b/g, 'preto').replace(/\bMarrom\b/g, 'Preto');
  const linha = (t) => t.split(/(\([^)]*\)|"[^"]*")/).map((p, k) => (k % 2 && !soCores.test(p) ? p : trocar(p))).join('');
  const andar = (v, chave) => {
    if (Array.isArray(v)) return v.map((x) => andar(x, chave));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k === 'marrom' ? 'preto' : k, andar(x, k)]));
    if (typeof v !== 'string' || chave === 'representante') return v;
    if (chave === 'msg') return linha(v);
    return v === 'marrom' ? 'preto' : v;
  };
  return andar(dado, null);
}

function uiInicial() {
  return { cena: 'capa', tema: 'claro', corSelecionada: null, ip: null, regras: false, teste: { ativo: false, ordem: [], ultimo: null, nonce: 0 } };
}

async function iniciarServidor({
  port = 3100,
  dataDir = path.join(__dirname, 'data'),
  pin: pinFixo,
  ehLocal = ehLocalPadrao, // injetável nos testes: (req) => boolean
  semPin = process.env.SEM_PIN === '1', // desliga o PIN para todos os aparelhos (testes e ensaios)
  descobrirIps = listarIps, // injetável nos testes: () => [{ ip, nome, provavel }]
  intervaloRedeMs = 5000, // de quanto em quanto tempo confere se a rede mudou
} = {}) {
  const store = criarStore(dataDir);

  // ---------- segurança: PIN do responsável ----------
  let seg = store.ler('seguranca.json');
  if (!seg || !seg.segredo) {
    seg = { pin: String(crypto.randomInt(1000, 10000)), segredo: crypto.randomBytes(24).toString('hex') };
    store.gravar('seguranca.json', seg);
  }
  const pin = String(pinFixo || process.env.PIN || seg.pin);
  const tokenAuth = crypto.createHmac('sha256', seg.segredo).update(pin).digest('hex');
  // Responsável = o próprio notebook (sem PIN), qualquer aparelho com SEM_PIN, ou quem digitou o PIN (cookie).
  const autenticado = (req) => semPin || ehLocal(req) || iguais(lerCookies(req)[COOKIE] || '', tokenAuth);

  // ---------- estado ----------
  const config = store.lerConfig();
  let lista = store.lerPerguntas(); // banco de perguntas (editável no /host, salvo em data/perguntas.json)
  let salvoEm = store.dataArquivo('perguntas.json');
  // Jogo salvo antes da 8k usava a cor "marrom": vira "preto" (grupo, token e histórico), sem perder nada.
  const salvo = migrarMarrom(store.ler('jogo.json'));

  // Jogo salvo na versão anterior (Dobro automático, uma habilidade por grupo) é convertido ao carregar.
  let estado = salvo?.estado ? G.migrarEstado(salvo.estado) : G.criarJogo({ config: config.jogo, perguntas: lista });
  let tokens = salvo?.tokens || {}; // cor -> token do celular
  // Etapa 8d: pedidos de Bloqueio feitos no celular, aguardando o responsável (cor -> alvo), e os recusados (aviso no celular).
  let pedidos = salvo?.pedidos || {};
  let recusados = {};
  // Comemoração (Etapa 8k-2): evento transitório. Não faz parte do estado do jogo, não entra no Desfazer nem em jogo.json.
  // { id, cor, banner }: `cor` é o vencedor no momento do botão; `banner` é o banner do projetor (some ao avançar).
  let comemoracao = null;
  // Registro de eventos (aba Registro): salvo em data/registro.json, no máximo 3000 linhas.
  let registro = migrarMarrom(store.ler('registro.json', []));
  if (!Array.isArray(registro)) registro = [];
  let registroPendente = null;
  function gravarRegistro() {
    if (registroPendente) clearTimeout(registroPendente);
    registroPendente = null;
    try {
      store.gravar('registro.json', registro);
    } catch {
      /* disco cheio ou pasta indisponível: o jogo segue; o registro continua na memória */
    }
  }
  function anotar(item) {
    if (!item) return;
    if (Array.isArray(item)) { item.forEach(anotar); return; }
    registro.push({ t: Date.now(), cor: null, ...item });
    if (registro.length > 3000) registro.splice(0, registro.length - 3000);
    if (!registroPendente) registroPendente = setTimeout(gravarRegistro, 400); // agrupa gravações em sequência
    difundir();
  }
  const configEfetiva = () => G.normalizarConfig(config.jogo);

  let ui = { ...uiInicial(), ...(salvo?.ui || {}), teste: uiInicial().teste };
  if (!TEMAS.includes(ui.tema)) ui.tema = 'claro';
  let janela = { fimEm: null, restanteMs: salvo?.janelaRestanteMs ?? null };
  let timer = null;
  let ips = descobrirIps();
  const escolherIp = () => ips.find((i) => i.provavel)?.ip || ips[0]?.ip || '127.0.0.1';
  if (!ui.ip || !ips.some((i) => i.ip === ui.ip)) ui.ip = escolherIp();

  // A rede pode aparecer ou sumir com o programa aberto (roteador ligado depois, Wi-Fi caiu):
  // confere a cada ciclo e avisa o painel, que mostra o aviso "sem rede" ou o endereço certo.
  function atualizarIps() {
    const novos = descobrirIps();
    if (JSON.stringify(novos) === JSON.stringify(ips)) return;
    ips = novos;
    if (!ips.some((i) => i.ip === ui.ip)) { ui.ip = escolherIp(); salvar(); }
    difundir();
  }

  const sockets = new Set(); // todos os clientes
  const celulares = new Map(); // cor -> Set<ws> ligados ao grupo

  function coresConectadas() {
    return new Set([...celulares].filter(([, set]) => set.size > 0).map(([cor]) => cor));
  }

  function restanteAgora() {
    if (estado.fase !== 'janela') return null;
    if (estado.pausado || !timer) return janela.restanteMs;
    return Math.max(0, janela.fimEm - Date.now());
  }

  function salvar() {
    store.gravar('jogo.json', { estado, tokens, pedidos, ui: { ...ui, teste: undefined }, janelaRestanteMs: restanteAgora() });
  }

  function limparTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  // Cuida do cronômetro da janela de cliques: inicia, pausa, retoma e cancela conforme o estado.
  function ajustarTimer() {
    if (estado.fase !== 'janela') {
      limparTimer();
      janela = { fimEm: null, restanteMs: null };
      return;
    }
    if (estado.pausado) {
      if (timer) {
        janela.restanteMs = Math.max(0, janela.fimEm - Date.now());
        limparTimer();
      }
      return;
    }
    if (!timer) {
      const resta = janela.restanteMs ?? estado.config.janela * 1000;
      janela = { fimEm: Date.now() + resta, restanteMs: null };
      timer = setTimeout(() => {
        timer = null;
        const antes = estado;
        aplicar((s) => G.encerrarJanela(s));
        if (antes !== estado) { anotar(R.janelaEncerradaItem(estado, 'pelo tempo')); anotar(R.efeitos(antes, estado)); }
      }, resta);
    }
  }

  // Situação do banco de perguntas para o painel: contagens, partida ativa e pergunta em uso.
  const FASES_RODADA = ['pergunta', 'alternativas', 'janela', 'ordem', 'resposta', 'explicacao', 'so_correta'];
  function infoPerguntas() {
    const emRodada = FASES_RODADA.includes(estado.fase);
    return {
      ...P.resumoLista(lista),
      metaBanco: P.META_BANCO,
      metaTotal: P.META_TOTAL,
      partidaAtiva: emRodada || estado.fase === 'ranking' || estado.fase === 'placar',
      emUso: emRodada ? estado.rodada?.perguntaId ?? null : null,
      salvoEm,
    };
  }

  function ctx(extra = {}) {
    return {
      estado, ui, janela, ips, porta: servidorPorta, final: config.final, perguntasInfo: infoPerguntas(),
      pedidos, recusados, comemoracao, pin, registroTotal: registro.length, configJogo: configEfetiva(), padroes: { jogo: G.CONFIG_PADRAO, final: FINAL_PADRAO },
      ...extra,
    };
  }

  function enviar(ws, obj) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  function enviarView(ws) {
    if (ws.papel === 'host') enviar(ws, { t: 'estado', ...visaoHost(ctx()) });
    else if (ws.papel === 'tela') enviar(ws, { t: 'estado', ...visaoTela(ctx({ autenticado: ws.autenticado })) });
    else if (ws.papel === 'g') enviar(ws, { t: 'estado', ...visaoGrupo(ctx(), ws.cor, ws.ligado) });
  }

  function difundir() {
    for (const ws of sockets) enviarView(ws);
  }

  function sincronizar() {
    estado = G.sincronizarConexoes(estado, coresConectadas());
  }

  // Aplica uma transição do jogo. Devolve null se deu certo, ou a mensagem de erro.
  function aplicar(fn) {
    let novo;
    try {
      novo = fn(estado);
    } catch (e) {
      if (e instanceof G.ErroJogo) return e.message;
      throw e;
    }
    if (novo === estado) return null;
    estado = novo;
    // A comemoração só vale no Ranking e para o mesmo vencedor (Desfazer, elegibilidade e novo jogo a encerram).
    if (comemoracao && (estado.fase !== 'ranking' || G.vencedor(estado) !== comemoracao.cor)) comemoracao = null;
    sincronizar();
    podarPedidos();
    if (estado.fase === 'capa') ui.cena = 'capa';
    ajustarTimer();
    salvar();
    difundir();
    return null;
  }

  // Um pedido de Bloqueio só vive na preparação da rodada, e só enquanto a regra ainda o permite (Desfazer, por exemplo).
  function podarPedidos() {
    const r = estado.rodada;
    const preparo = ['pergunta', 'alternativas'].includes(estado.fase) && r && !r.desempate;
    for (const [cor, alvo] of Object.entries(pedidos)) {
      let valido = !!preparo;
      if (valido) {
        try { G.ativarHabilidade(estado, cor, 'bloqueio', alvo); } catch { valido = false; }
      }
      if (!valido) delete pedidos[cor];
    }
    if (!preparo) recusados = {};
  }

  function mudarUi(fn) {
    fn();
    salvar();
    difundir();
    return null;
  }

  // ---------- ações do responsável ----------
  const ACOES_JOGO = {
    // O jogo só começa com todas as perguntas válidas; usa o banco mais recente do editor.
    iniciar: () => (s) => {
      const r = P.resumoLista(lista);
      if (r.invalidas > 0) throw new G.ErroJogo(`Há ${r.invalidas} pergunta(s) incompleta(s). Corrija no editor de perguntas.`);
      if (r.doBanco < 1) throw new G.ErroJogo('Não há perguntas para jogar.');
      return G.iniciar(G.definirPerguntas(s, lista));
    },
    mostrarAlternativas: () => (s) => G.mostrarAlternativas(s),
    abrirJanela: () => (s) => {
      if (Object.keys(pedidos).length) throw new G.ErroJogo('Há pedido de Bloqueio aguardando o responsável: confirme ou recuse');
      return G.abrirJanela(s);
    },
    encerrarJanela: () => (s) => G.encerrarJanela(s),
    mostrarResposta: () => (s) => G.mostrarResposta(s),
    responder: (i) => (s) => G.responder(s, i),
    desqualificar: () => (s) => G.desqualificar(s),
    semResposta: () => (s) => G.semResposta(s),
    ativarHabilidade: (cor, tipo, alvo) => (s) => G.ativarHabilidade(s, cor, tipo, alvo),
    trocarAcertos: (cor, tipo, substituir) => (s) => G.trocarAcertos(s, cor, tipo, substituir),
    decidirEscudo: (alvo, atacante, usar) => (s) => G.decidirEscudo(s, alvo, atacante, !!usar),
    usarPasse: () => (s) => G.usarPasse(s),
    usarDica5050: () => (s) => G.usarDica5050(s),
    apostar: (cor, modo, trocar) => (s) => G.apostar(s, cor, modo, trocar),
    continuar: () => (s) => G.continuar(s),
    proximo: () => (s) => G.proximo(s),
    pausar: (b) => (s) => G.pausar(s, b),
    desfazer: () => (s) => G.desfazer(s),
    definirElegivel: (cor, b) => (s) => G.definirElegivel(s, cor, b),
    iniciarDesempate: () => (s) => G.iniciarDesempate(s),
    zerarJogo: () => (s) => G.novoJogo({ ...s, config: { ...s.config, ...configEfetiva() } }),
    renomearGrupo: (cor, nome) => (s) => G.renomearGrupo(s, cor, String(nome ?? '').trim().slice(0, 40)), // o celular já limita a 40 letras; o painel também
  };
  // Ações que a /tela autenticada (janela do projetor no mesmo notebook) pode disparar.
  const ACOES_TELA = new Set(['continuar', 'proximo']);

  function acaoUi(nome, args) {
    const [a, b] = args;
    switch (nome) {
      case 'irCapa':
        return mudarUi(() => { ui.cena = 'capa'; ui.regras = false; ui.teste = uiInicial().teste; });
      case 'irMenu':
        return mudarUi(() => { ui.cena = 'menu'; ui.regras = false; ui.teste = uiInicial().teste; });
      case 'irConfig':
        return mudarUi(() => { ui.cena = 'config'; ui.regras = false; });
      case 'irRegistro':
        return mudarUi(() => { ui.cena = 'registro'; ui.regras = false; });
      case 'irEditor':
        return mudarUi(() => { ui.cena = 'editor'; ui.regras = false; });
      case 'novoJogo': {
        if (emAndamento(estado) && !(a && a.substituir)) return 'Há um jogo em andamento. Confirme para substituir.';
        limparTimer();
        celulares.forEach((set) => set.forEach((ws) => { ws.ligado = false; }));
        tokens = {};
        comemoracao = null;
        estado = G.criarJogo({ config: config.jogo, perguntas: lista });
        pedidos = {};
        recusados = {};
        janela = { fimEm: null, restanteMs: null };
        ui = { ...uiInicial(), ip: ui.ip, tema: ui.tema, cena: 'jogo' };
        registro = [];
        salvar();
        anotar({ tipo: 'jogo', msg: 'Novo jogo criado: sala de espera aberta' });
        return null;
      }
      case 'continuarJogo':
        if (!emAndamento(estado)) return 'Não há jogo em andamento.';
        return mudarUi(() => { ui.cena = 'jogo'; });
      case 'selecionarCor':
        if (a != null && !G.CORES.includes(a)) return 'Cor inválida.';
        return mudarUi(() => { ui.corSelecionada = a || null; });
      case 'escolherIp':
        if (!ips.some((i) => i.ip === a)) return 'IP desconhecido.';
        return mudarUi(() => { ui.ip = a; });
      case 'salvarTextos': {
        const t = a || {};
        const txt = (v, max) => String(v ?? '').trim().slice(0, max);
        const disciplina = txt(t.disciplina, 120);
        const professor = txt(t.professor, 120);
        const mensagem = txt(t.mensagem, 200);
        if (t.parabens !== undefined && String(t.parabens).length > 300) return 'A mensagem de parabenização pode ter até 300 caracteres.';
        const parabens = t.parabens === undefined ? config.final.parabens : txt(t.parabens, 300) || FINAL_PADRAO.parabens;
        const integrantes = Array.isArray(t.integrantes) ? t.integrantes.map((n) => txt(n, 80)).filter(Boolean).slice(0, 20) : null;
        if (!disciplina || !professor || !mensagem || !integrantes) return 'Preencha disciplina, professor, mensagem e ao menos um integrante.';
        config.final = { disciplina, professor, mensagem, integrantes, parabens };
        store.gravar('config.json', { jogo: config.jogo, final: config.final });
        anotar({ tipo: 'sistema', msg: 'Configurações salvas: capa e tela final' });
        return null;
      }
      case 'salvarConfigJogo': {
        const t = a || {};
        if (t.placarModo !== undefined && !['desligado', 'cada', 'toda'].includes(t.placarModo)) return 'Placar parcial: escolha entre desligado, a cada N perguntas ou toda rodada.';
        const atual = configEfetiva();
        const { novo, erro } = CFG.validarNumeros(t);
        if (erro) return erro;
        if (t.placarModo !== undefined) novo.placarModo = t.placarModo;
        if (novo.pontosSegundo > novo.pontosPrimeiro) return 'Os pontos de quem acerta em segundo não podem ser maiores que os de quem acerta primeiro.';
        if (novo.seqBloqueio >= novo.seqDobro) return 'O Dobro precisa de mais acertos seguidos que Bloqueio, Escudo ou Passe.';
        if ((novo.seqDica ?? atual.seqDica) <= novo.seqDobro) return 'A Dica 50/50 precisa de mais acertos seguidos que o Dobro.';
        config.jogo = { ...config.jogo, ...novo };
        store.gravar('config.json', { jogo: config.jogo, final: config.final });
        // Na sala de espera (antes da primeira pergunta) vale já; com o jogo em andamento, no próximo jogo novo.
        if (estado.fase === 'espera') { estado = { ...estado, config: G.normalizarConfig({ ...estado.config, ...novo }) }; salvar(); }
        anotar({ tipo: 'sistema', msg: 'Configurações salvas: regras do jogo' });
        return null;
      }
      case 'definirTema':
        if (!TEMAS.includes(a)) return 'Tema inválido.';
        return mudarUi(() => { ui.tema = a; });
      case 'regras':
        // Regras tem 3 páginas na /tela: jogo (1), habilidades (2) e Aposta (3). `true` abre a primeira.
        return mudarUi(() => { ui.regras = a === true ? 1 : Number.isInteger(a) && a >= 1 && a <= 3 ? a : false; });
      case 'testeZerar':
        if (!ui.teste.ativo) return 'O modo teste está desligado.';
        return mudarUi(() => { ui.teste = { ativo: true, ordem: [], ultimo: null, nonce: 0 }; });
      case 'testeBotoes':
        if (estado.fase !== 'espera') return 'O teste só vale na sala de espera.';
        return mudarUi(() => { ui.teste = { ativo: !!a, ordem: [], ultimo: null, nonce: 0 }; });
      case 'liberarGrupo': {
        const nomeAntes = R.nomeGrupo(estado, a);
        const erro = aplicar((s) => G.liberarGrupo(s, a));
        if (erro) return erro;
        delete tokens[a];
        celulares.get(a)?.forEach((ws) => { ws.ligado = false; });
        celulares.delete(a);
        salvar();
        anotar({ tipo: 'sistema', cor: a, msg: `O grupo ${nomeAntes} foi liberado` });
        return null;
      }
      default:
        return `Ação desconhecida: ${nome}`;
    }
  }

  // Ações de habilidade que o grupo decide no celular e o responsável pode registrar no lugar dele: o Registro diz de onde veio.
  const ACOES_HAB = new Set(['trocarAcertos', 'ativarHabilidade', 'apostar', 'decidirEscudo', 'usarPasse', 'usarDica5050']);
  const comOrigem = (itens, origem) => (Array.isArray(itens) ? itens : [itens]).filter(Boolean).map((i) => ({ ...i, msg: `${i.msg} (${origem})` }));

  function rodarAcaoJogo(nome, args, origem = 'pelo painel') {
    const antes = estado;
    const erro = aplicar(ACOES_JOGO[nome](...args));
    if (!erro && estado !== antes) {
      const descricao = R.descrever(nome, args, antes, estado);
      anotar(ACOES_HAB.has(nome) ? comOrigem(descricao, origem) : descricao);
      if (nome !== 'desfazer') anotar(R.efeitos(antes, estado));
    }
    return erro;
  }

  // ---------- celulares: o grupo decide (Etapa 8d); vale só para o PRÓPRIO grupo ----------
  function tratarAcaoGrupo(ws, msg) {
    if (!ws.ligado) return 'Sem conexão com o grupo.';
    const cor = ws.cor;
    const a = Array.isArray(msg.args) ? msg.args : [];
    const r = estado.rodada;
    switch (msg.nome) {
      case 'trocarAcertos': {
        // O jogo valida fase, faixa de acertos, meta e estoque; aqui só garantimos o tipo dos argumentos.
        if (typeof a[0] !== 'string') return 'Escolha a habilidade.';
        return rodarAcaoJogo('trocarAcertos', [cor, a[0], Number.isInteger(a[1]) ? a[1] : undefined], 'pelo celular');
      }
      case 'dispensarTigrinho': // só da tela do próprio grupo; fora do Desfazer e do Registro
        aplicar((s) => G.dispensarTigrinho(s, cor));
        return null;
      case 'ativarDobro':
        return rodarAcaoJogo('ativarHabilidade', [cor, 'dobro'], 'pelo celular');
      case 'apostar':
        return rodarAcaoJogo('apostar', [cor, a[0], Array.isArray(a[1]) ? a[1] : []], 'pelo celular');
      case 'pedirBloqueio': {
        const alvo = a[0];
        if (pedidos[cor] === alvo) return null; // toque repetido: nada muda
        if (pedidos[cor]) return 'Já há um pedido de Bloqueio aguardando o responsável. Cancele-o antes de pedir outro.';
        try { G.ativarHabilidade(estado, cor, 'bloqueio', alvo); } catch (e) { if (e instanceof G.ErroJogo) return e.message; throw e; }
        pedidos[cor] = alvo;
        delete recusados[cor];
        salvar();
        anotar(R.linha(estado, 'habilidade', (n) => `${R.rodadaTxt(estado)}: ${n(cor)} pediu o Bloqueio sobre ${n(alvo)} (pelo celular). Aguarda a confirmação do responsável`));
        return null;
      }
      case 'cancelarBloqueio': {
        if (!pedidos[cor]) return null;
        const alvo = pedidos[cor];
        delete pedidos[cor];
        salvar();
        anotar(R.linha(estado, 'habilidade', (n) => `${R.rodadaTxt(estado)}: ${n(cor)} cancelou o pedido de Bloqueio sobre ${n(alvo)} (pelo celular)`));
        return null;
      }
      case 'decidirEscudo': {
        const e = r?.escudos.find((x) => x.alvo === cor);
        if (!e) return 'Não há decisão de Escudo pendente para este grupo.';
        return rodarAcaoJogo('decidirEscudo', [cor, e.atacante, !!a[0]], 'pelo celular');
      }
      case 'usarPasse':
        if (estado.fase !== 'resposta' || r?.ordem[0] !== cor) return 'O Passe é só do 1º respondente.';
        return rodarAcaoJogo('usarPasse', [], 'pelo celular');
      case 'usarDica5050':
        if (estado.fase !== 'resposta' || r?.ordem[1] !== cor) return 'A Dica 50/50 é só do 2º respondente.';
        return rodarAcaoJogo('usarDica5050', [], 'pelo celular');
      default:
        return 'Ação desconhecida.';
    }
  }

  // Botão "Comemorar" do Ranking: só com o vencedor definido (a regra de sempre, com desempate e elegíveis).
  function comemorar() {
    if (estado.fase !== 'ranking') return 'A comemoração é feita na tela de Ranking.';
    const cor = G.vencedor(estado);
    if (!cor) return 'Defina o vencedor antes de comemorar.';
    comemoracao = { id: Date.now(), cor, banner: true }; // o id muda a cada toque: repetir refaz fogos e pop-up
    anotar({ tipo: 'jogo', cor, msg: 'Comemoração acionada' });
    difundir();
    return null;
  }

  // O responsável confirma ou recusa o pedido de Bloqueio feito no celular.
  function tratarPedidoBloqueio(nome, cor) {
    const alvo = pedidos[cor];
    if (!alvo) return 'Não há pedido de Bloqueio deste grupo.';
    delete pedidos[cor];
    if (nome === 'confirmarBloqueio') {
      const erro = rodarAcaoJogo('ativarHabilidade', [cor, 'bloqueio', alvo], 'pedido pelo celular, confirmado no painel');
      if (erro) salvar();
      return erro;
    }
    recusados[cor] = alvo;
    salvar();
    anotar(R.linha(estado, 'habilidade', (n) => `${R.rodadaTxt(estado)}: o responsável recusou o pedido de Bloqueio de ${n(cor)} sobre ${n(alvo)}. Nada foi gasto`));
    return null;
  }

  function tratarAcao(ws, msg) {
    const { nome, args = [] } = msg;
    if (ws.papel === 'g') return tratarAcaoGrupo(ws, msg);
    if (ws.papel === 'tela' && !(ws.autenticado && ACOES_TELA.has(nome))) return 'Sem permissão.';
    if (ws.papel === 'host' && (nome === 'confirmarBloqueio' || nome === 'recusarBloqueio')) return tratarPedidoBloqueio(nome, args[0]);
    if (nome === 'comemorar') return ws.papel === 'host' ? comemorar() : 'Sem permissão.'; // só o painel do responsável
    // Com o banner de parabéns no projetor, avançar (Espaço, seta ou o botão do painel) só o fecha e volta ao Ranking.
    if (nome === 'proximo' && comemoracao?.banner && estado.fase === 'ranking') {
      comemoracao = { ...comemoracao, banner: false };
      difundir();
      return null;
    }
    if (ACOES_JOGO[nome]) {
      const erro = rodarAcaoJogo(nome, args);
      if (nome === 'iniciar' && !erro) {
        ui.teste = uiInicial().teste;
        ui.corSelecionada = null;
        for (const cor of Object.keys(tokens)) if (!estado.grupos.some((g) => g.cor === cor)) delete tokens[cor];
        salvar();
        difundir();
      }
      return erro;
    }
    if (ws.papel !== 'host') return 'Sem permissão.';
    return acaoUi(nome, args);
  }

  // ---------- celulares ----------
  function ligar(ws, cor) {
    ws.ligado = true;
    if (!celulares.has(cor)) celulares.set(cor, new Set());
    celulares.get(cor).add(ws);
    sincronizar();
    salvar();
    anotar(R.linha(estado, 'conexao', (n) => `${n(cor)} conectado`));
  }

  function tratarEntrar(ws, msg) {
    const cor = ws.cor;
    const existente = estado.grupos.find((g) => g.cor === cor);
    if (msg.token && existente && tokens[cor] && iguais(tokens[cor], msg.token)) {
      ligar(ws, cor);
      enviar(ws, { t: 'entrou', cor, token: tokens[cor] });
      return;
    }
    const nome = String(msg.nome || '').trim().slice(0, 40);
    if (!nome) {
      enviar(ws, { t: 'precisaNome', cor });
      return;
    }
    if (ui.cena !== 'jogo') {
      enviar(ws, { t: 'erro', codigo: 'fechada', msg: 'O responsável ainda não abriu o jogo.' });
      return;
    }
    if (existente) {
      enviar(ws, { t: 'erro', codigo: 'ocupada', msg: 'Esta cor já está em uso por outro aparelho.' });
      return;
    }
    if (estado.fase !== 'espera') {
      enviar(ws, { t: 'erro', codigo: 'comecou', msg: 'A partida já começou.' });
      return;
    }
    const erro = aplicar((s) => G.registrarGrupo(s, cor, nome));
    if (erro) {
      enviar(ws, { t: 'erro', msg: erro });
      return;
    }
    tokens[cor] = crypto.randomUUID();
    if (ui.corSelecionada === cor) ui.corSelecionada = null; // o QR some quando o grupo conecta
    ligar(ws, cor);
    enviar(ws, { t: 'entrou', cor, token: tokens[cor] });
  }

  function tratarApertar(ws) {
    if (!ws.ligado) return;
    const chegada = process.hrtime.bigint(); // instante de chegada, registrado antes de qualquer outro trabalho
    if (ui.teste.ativo && estado.fase === 'espera') {
      if (!ui.teste.ordem.includes(ws.cor)) ui.teste.ordem.push(ws.cor);
      ui.teste.ultimo = ws.cor;
      ui.teste.nonce += 1;
      difundir();
      return;
    }
    const antes = estado;
    aplicar((s) => G.clicar(s, ws.cor));
    if (antes === estado) enviar(ws, { t: 'ignorado' });
    else {
      registrarChegada(ws.cor, chegada);
      anotar(R.clique(estado, ws.cor));
      if (antes.fase === 'janela' && estado.fase !== 'janela') { anotar(R.janelaEncerradaItem(estado, 'porque todos os aptos apertaram')); anotar(R.efeitos(antes, estado)); }
    }
  }

  const chegadas = [];
  function registrarChegada(cor, ns) {
    chegadas.push({ cor, ns });
    if (chegadas.length > 200) chegadas.shift();
  }

  // ---------- HTTP ----------
  const app = express();
  app.disable('x-powered-by');
  // Corpo pequeno por padrão; as rotas de perguntas (autenticadas) aceitam arquivos maiores.
  const jsonPequeno = express.json({ limit: '64kb' });
  app.use((req, res, next) => (req.path.startsWith('/api/perguntas') ? next() : jsonPequeno(req, res, next)));

  let tentativas = { n: 0, ate: 0 };
  app.post('/api/auth', (req, res) => {
    if (Date.now() < tentativas.ate) return res.status(429).json({ erro: 'Aguarde alguns segundos.' });
    if (iguais(String(req.body?.pin ?? ''), pin)) {
      tentativas = { n: 0, ate: 0 };
      res.setHeader('Set-Cookie', `${COOKIE}=${tokenAuth}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24}`);
      return res.json({ ok: true });
    }
    tentativas.n += 1;
    if (tentativas.n >= 5) tentativas = { n: 0, ate: Date.now() + 30000 };
    res.status(401).json({ erro: 'PIN incorreto.' });
  });
  // Texto da capa é público (a /tela e a capa do /host antes do PIN precisam dele).
  app.get('/api/capa', (req, res) => res.json({ disciplina: config.final.disciplina, tema: ui.tema }));
  // ---------- perguntas (só o responsável) ----------
  const exigirAuth = (req, res, next) => (autenticado(req) ? next() : res.status(401).json({ erro: 'PIN necessário.' }));
  const grande = express.json({ limit: '3mb' });

  app.get('/api/perguntas', exigirAuth, (req, res) => res.json({ perguntas: lista, info: infoPerguntas() }));

  app.put('/api/perguntas', exigirAuth, grande, (req, res) => {
    const v = P.validarLista(req.body?.perguntas);
    if (v.erro) return res.status(400).json({ erro: v.erro });
    const emUso = infoPerguntas().emUso;
    if (emUso != null) {
      const antes = lista.find((p) => p.id === emUso);
      const depois = v.lista.find((p) => p.id === emUso);
      const igual = antes && depois && JSON.stringify(P.exportar([antes])) === JSON.stringify(P.exportar([depois]));
      if (!igual) {
        return res.status(409).json({ erro: 'Esta pergunta está sendo usada na rodada em andamento e não pode ser alterada agora.' });
      }
    }
    const removeu = v.lista.length < lista.length;
    lista = v.lista;
    salvoEm = store.salvarPerguntas(lista, { forcarBackup: removeu });
    difundir();
    res.json({ salvoEm, info: infoPerguntas() });
  });

  // Aleatorizar ordem: bloqueado com partida em andamento; guarda backup do banco atual em data/backup/.
  app.post('/api/perguntas/aleatorizar', exigirAuth, (req, res) => {
    if (infoPerguntas().partidaAtiva) return res.status(409).json({ erro: 'Não é possível mudar a ordem durante uma partida em andamento. Volte ao menu e crie um novo jogo antes.' });
    if (lista.length < 2) return res.status(400).json({ erro: 'Há perguntas de menos para embaralhar.' });
    lista = P.aleatorizarOrdem(lista);
    salvoEm = store.salvarPerguntas(lista, { forcarBackup: true });
    difundir();
    res.json({ perguntas: lista, info: infoPerguntas() });
  });

  app.get('/api/perguntas/exportar', exigirAuth, (req, res) => {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const nome = `perguntas-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.json`;
    res.set('Content-Disposition', `attachment; filename="${nome}"`);
    res.type('application/json').send(JSON.stringify(P.exportar(lista), null, 2));
  });

  const MOTIVO_IMPORTAR = 'Não é possível importar durante uma partida em andamento. Volte ao menu e crie um novo jogo antes.';

  app.post('/api/perguntas/importar/analisar', exigirAuth, grande, (req, res) => {
    const analise = P.analisarImportacao(String(req.body?.texto ?? ''));
    const info = infoPerguntas();
    const avisosAcrescentar = analise.ok ? P.aplicarImportacao(lista, analise, 'acrescentar').avisos : [];
    res.json({
      ok: analise.ok,
      erros: analise.erros,
      total: analise.total,
      validas: analise.validas,
      itens: analise.itens,
      avisosAcrescentar,
      atuais: lista.length,
      bloqueio: info.partidaAtiva ? MOTIVO_IMPORTAR : null,
    });
  });

  app.post('/api/perguntas/importar/aplicar', exigirAuth, grande, (req, res) => {
    if (infoPerguntas().partidaAtiva) return res.status(409).json({ erro: MOTIVO_IMPORTAR });
    const analise = P.analisarImportacao(String(req.body?.texto ?? ''));
    const r = P.aplicarImportacao(lista, analise, req.body?.modo);
    if (r.erro) return res.status(400).json({ erro: r.erro, erros: analise.erros });
    lista = r.lista;
    salvoEm = store.salvarPerguntas(lista, { forcarBackup: true });
    difundir();
    res.json({ perguntas: lista, info: infoPerguntas(), avisos: r.avisos });
  });

  app.get('/api/registro', exigirAuth, (req, res) => res.json({ itens: R.exibirItens(registro, ui.tema) }));
  app.get('/api/registro.txt', exigirAuth, (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="registro-oficina.txt"');
    res.type('text/plain; charset=utf-8').send(R.emTexto(R.exibirItens(registro, ui.tema)));
  });

  app.get('/api/auth/status', (req, res) => res.json({ autenticado: autenticado(req) }));

  app.get('/api/info', (req, res) => {
    if (!autenticado(req)) return res.status(401).json({ erro: 'PIN necessário.' });
    res.json({ ips, ip: ui.ip, porta: servidorPorta });
  });

  app.get('/api/qr/:cor.svg', async (req, res) => {
    if (!G.CORES.includes(req.params.cor)) return res.status(404).end();
    const url = `http://${ui.ip}:${servidorPorta}/g/${req.params.cor}`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  });

  const pagina = (dir) => (req, res) => res.sendFile(path.join(PUBLIC, dir, 'index.html'));
  app.get('/', (req, res) => res.redirect('/host'));
  app.get(['/host', '/host/'], pagina('host'));
  app.get(['/tela', '/tela/'], pagina('tela'));
  app.get(['/g/marrom', '/g/branco'], (req, res) => res.redirect('/g/preto')); // QR antigo (Marrom) e o nome do tema noturno (Branco)
  app.get('/g/:cor', (req, res, next) => {
    if (!G.CORES.includes(req.params.cor)) return next(); // /g/g.js e /g/g.css são arquivos estáticos
    res.sendFile(path.join(PUBLIC, 'g', 'index.html'));
  });
  app.use('/fonts/poppins', express.static(path.join(__dirname, 'node_modules', '@fontsource', 'poppins', 'files'), { maxAge: '7d' }));
  app.use(express.static(PUBLIC, { index: false }));

  // ---------- WebSocket ----------
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    const papel = url.searchParams.get('papel');
    const auth = autenticado(req);
    if (papel === 'host' && !auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    if (!['host', 'tela', 'g'].includes(papel)) return socket.destroy();
    let cor = url.searchParams.get('cor');
    if (cor === 'marrom' || cor === 'branco') cor = 'preto'; // página antiga ainda aberta
    if (papel === 'g' && !G.CORES.includes(cor)) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.papel = papel;
      ws.cor = cor;
      ws.autenticado = auth;
      ws.ligado = false;
      ws.vivo = true;
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.on('pong', () => { ws.vivo = true; });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (ws.papel === 'g') {
        if (msg.t === 'entrar') tratarEntrar(ws, msg);
        else if (msg.t === 'apertar') tratarApertar(ws);
        else if (msg.t === 'acao') {
          const erro = tratarAcao(ws, msg);
          enviar(ws, erro ? { t: 'erro', msg: erro, id: msg.id } : { t: 'ok', id: msg.id });
        }
        return;
      }
      if (msg.t === 'acao') {
        const erro = tratarAcao(ws, msg);
        if (erro) enviar(ws, { t: 'erro', msg: erro, id: msg.id });
        else enviar(ws, { t: 'ok', id: msg.id });
      }
    });
    ws.on('close', () => {
      sockets.delete(ws);
      if (encerrando) return;
      if (ws.papel === 'g' && ws.ligado) {
        const set = celulares.get(ws.cor);
        set?.delete(ws);
        if (set && set.size === 0) celulares.delete(ws.cor);
        const antes = estado;
        sincronizar();
        if (antes !== estado) { ajustarTimer(); salvar(); anotar(R.linha(estado, 'conexao', (n) => `${n(ws.cor)} sem conexão`)); } else difundir();
      }
    });
    ws.on('error', () => {});
    enviarView(ws);
  });

  // Ping/pong a cada 5 s: quem não responde ao ciclo anterior é considerado perdido.
  const pinger = setInterval(() => {
    for (const ws of sockets) {
      if (!ws.vivo) { ws.terminate(); continue; }
      ws.vivo = false;
      try { ws.ping(); } catch { /* fechando */ }
    }
  }, 5000);
  const vigiaRede = setInterval(() => {
    try { atualizarIps(); } catch { /* sem permissão para listar a rede: segue com a lista anterior */ }
  }, intervaloRedeMs);

  let encerrando = false;
  let servidorPorta = port;
  await new Promise((ok, falha) => {
    server.once('error', falha);
    server.listen(port, '0.0.0.0', ok);
  });
  servidorPorta = server.address().port;

  // Retoma o estado salvo: ninguém está conectado ainda.
  sincronizar();
  podarPedidos();
  ajustarTimer();

  async function fechar() {
    encerrando = true;
    clearInterval(pinger);
    clearInterval(vigiaRede);
    limparTimer();
    if (registroPendente) gravarRegistro();
    for (const ws of sockets) ws.terminate();
    wss.close();
    const fim = new Promise((ok) => server.close(ok));
    server.closeAllConnections?.(); // navegadores mantêm conexões HTTP abertas
    await fim;
  }

  return { porta: servidorPorta, pin, semPin, get ips() { return ips; }, fechar, estado: () => estado, chegadas,
    // Só para testes dentro do processo: monta uma situação de jogo sem passar pelas ações do responsável. Não está ligado a nenhuma rota nem mensagem.
    aplicarNoEstadoParaTeste: (fn) => aplicar(fn) };
}

module.exports = { iniciarServidor };

if (require.main === module) {
  const porta = Number(process.env.PORT) || 3100;
  iniciarServidor({ port: porta })
    .then(({ porta: p, pin, ips, semPin }) => {
      const linha = '─'.repeat(54);
      console.log(`\n${linha}\n  Oficina gamificada no ar (porta ${p})\n${linha}`);
      if (!ips.length) console.log('  Nenhuma rede encontrada. Conecte o notebook ao Wi-Fi ou ligue o hotspot.');
      for (const i of ips) {
        console.log(`  IP: ${i.ip}  (${i.nome})${i.provavel ? '  <- provável rede dos celulares' : ''}`);
      }
      const base = `http://${ips.find((i) => i.provavel)?.ip || 'localhost'}:${p}`;
      console.log(`\n  Painel do responsável: ${base}/host`);
      console.log(`  Tela do projetor:      ${base}/tela`);
      console.log(`  Botão do celular:      ${base}/g/<cor>   (ex.: /g/azul)`);
      if (semPin) {
        console.log('\n  ################################################################');
        console.log('  ##  ATENÇÃO: SEM_PIN=1. QUALQUER aparelho da rede controla o  ##');
        console.log('  ##  jogo, sem PIN. Use só em teste ou ensaio.                 ##');
        console.log('  ################################################################');
      }
      console.log(`\n  Neste notebook não é preciso PIN.\n  PIN para outros aparelhos (ex.: painel no celular): ${pin}\n${linha}\n`);
    })
    .catch((e) => {
      console.error(e.code === 'EADDRINUSE' ? `A porta já está em uso. Use outra: set PORT=3101` : e);
      process.exit(1);
    });
}
