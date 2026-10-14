'use strict';
// Etapa 8d pelo servidor real: o grupo decide as habilidades no celular; o responsável confirma o alvo do Bloqueio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const G = require('../src/game');
const { iniciarServidor } = require('../server');
const { Cliente, entrarGrupo, PIN, ajustarPontosNoServidor, nomeDaCor } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');

async function preparar(t, cores, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-b2-')), { iniciar = true } = {}) {
  if (!fs.existsSync(path.join(dir, 'perguntas.json'))) fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const c = { dir, abertos: [], fones: {}, tokens: {} };
  if (!fs.existsSync(path.join(dir, 'config.json'))) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { placarModo: 'desligado' } })); // placar parcial tem testes próprios
  c.srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  t.after(async () => {
    c.abertos.forEach((x) => x.fechar());
    await c.srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const auth = await (await fetch(`http://127.0.0.1:${c.srv.porta}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: PIN }) })).headers.get('set-cookie');
  const cookie = auth.split(';')[0];
  c.registro = async () => (await (await fetch(`http://127.0.0.1:${c.srv.porta}/api/registro`, { headers: { Cookie: cookie } })).json()).itens.map((i) => i.msg);
  c.host = new Cliente(c.srv.porta, 'papel=host', cookie);
  c.tela = new Cliente(c.srv.porta, 'papel=tela');
  c.abertos.push(c.host, c.tela);
  await Promise.all([c.host.aberto, c.tela.aberto]);
  if (iniciar) {
    await c.host.acao('novoJogo', {});
    for (const cor of cores) {
      const r = await entrarGrupo(c.srv.porta, cor, nomeDaCor(cor));
      c.fones[cor] = r.c;
      c.tokens[cor] = r.entrou.token;
      c.abertos.push(r.c);
    }
    await c.host.estadoApos((s) => s.estado.grupos.length === cores.length && s.estado.grupos.every((g) => g.conectado));
    assert.equal((await c.host.acao('iniciar')).t, 'ok');
  }
  return c;
}

const estado = (c) => c.host.ultimo.estado;
const grupo = (c, cor) => estado(c).grupos.find((g) => g.cor === cor);
const estoque = (c, cor) => grupo(c, cor).habilidades.map((h) => h.tipo);
const certa = (c) => c.host.ultimo.pergunta.correta;
const errada = (c) => [0, 1, 2, 3].find((i) => i !== certa(c) && !estado(c).rodada.erradas.includes(i) && !estado(c).rodada.eliminadas.includes(i));
const ok = async (c, nome, ...a) => { const r = await c.host.acao(nome, ...a); assert.equal(r.t, 'ok', `${nome}: ${r.msg}`); };
async function apertar(c, cor) {
  const antes = estado(c).rodada.ordem.length;
  c.fones[cor].enviar({ t: 'apertar' });
  await c.host.estadoApos((s) => s.estado.rodada.ordem.length > antes || s.estado.fase !== 'janela');
}
// Rodada com `ordem` apertando e as respostas ('c' certa, 'e' errada); depois recusa as ofertas e continua.
async function rodada(c, ordem, respostas, { parar = false, escolhas = {} } = {}) {
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  for (const cor of ordem) await apertar(c, cor);
  if (estado(c).fase === 'janela') await ok(c, 'encerrarJanela');
  if (ordem.length) {
    await ok(c, 'mostrarResposta');
    for (const r of respostas) await ok(c, 'responder', r === 'c' ? certa(c) : errada(c));
  }
  if (parar) return;
  await ok(c, 'continuar');
}
async function ganhar(c, cor, n, escolha) {
  for (let i = 1; i <= n; i += 1) await rodada(c, [cor], ['c']);
  if (escolha) await ok(c, 'trocarAcertos', cor, escolha); // os acertos viram moeda: troca por uma habilidade da faixa
}

const cel = (c, cor, nome, ...a) => c.fones[cor].acao(nome, ...a);
const celOk = async (c, cor, nome, ...a) => { const r = await cel(c, cor, nome, ...a); assert.equal(r.t, 'ok', `${cor}.${nome}: ${r.msg}`); };
const visaoCel = (c, cor, pred = () => true) => c.fones[cor].estadoApos(pred);

test('troca de acertos pelo celular: só o grupo troca por si; toque duplo não repete; abaixo de 3 acertos e fora da faixa falha', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  for (let i = 1; i <= 3; i += 1) await rodada(c, ['vermelho'], ['c'], { parar: i === 3 });
  const v = await visaoCel(c, 'vermelho', (s) => s.acoes?.troca?.sequencia === 3);
  assert.deepEqual(v.acoes.troca, { sequencia: 3, max: 7, usadas: 0, limite: 3, pode: true, motivo: null, opcoes: ['bloqueio', 'escudo', 'passe'], cheio: false });
  const va = await visaoCel(c, 'azul', (s) => /Faltam/.test(s.acoes?.troca?.motivo || ''));
  assert.equal(va.acoes.troca.pode, false);
  assert.match(va.acoes.troca.motivo, /Faltam 3 acertos/);
  assert.match((await cel(c, 'azul', 'trocarAcertos', 'escudo')).msg, /Faltam 3 acertos/); // outro grupo não troca pelos acertos de vermelho
  assert.equal(grupo(c, 'vermelho').sequencia, 3, 'os acertos de vermelho continuam');
  assert.match((await cel(c, 'vermelho', 'trocarAcertos', 'dobro')).msg, /faixa/); // o Dobro só a partir de 5
  assert.equal((await cel(c, 'vermelho', 'trocarAcertos', 5)).t, 'erro'); // argumento inválido
  const [a, b] = await Promise.all([cel(c, 'vermelho', 'trocarAcertos', 'escudo'), cel(c, 'vermelho', 'trocarAcertos', 'escudo')]);
  assert.deepEqual([a.t, b.t].sort(), ['erro', 'ok']);
  assert.deepEqual(estoque(c, 'vermelho'), ['escudo'], 'a habilidade entrou uma única vez');
  assert.equal(grupo(c, 'vermelho').sequencia, 0);
  const reg = await c.registro();
  assert.ok(reg.some((m) => m.includes('Decisão do grupo: Vermelho trocou 3 acertos por Escudo') && m.endsWith('(pelo celular)')));
  await ok(c, 'continuar');
  assert.match((await cel(c, 'vermelho', 'trocarAcertos', 'escudo')).msg, /Faltam 3 acertos/);
});

test('troca pelo celular com estoque cheio exige escolher qual guardada sai; o painel (reserva) continua valendo e fica "pelo painel"', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'vermelho', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, 'passe');
  for (let i = 1; i <= 3; i += 1) await rodada(c, ['vermelho'], ['c']);
  const v = await visaoCel(c, 'vermelho', (s) => s.acoes?.troca?.cheio);
  assert.deepEqual(v.acoes.estoque, ['escudo', 'passe']);
  assert.match((await cel(c, 'vermelho', 'trocarAcertos', 'bloqueio')).msg, /Estoque cheio/);
  await celOk(c, 'vermelho', 'trocarAcertos', 'bloqueio', 1); // troca o Passe
  assert.deepEqual(estoque(c, 'vermelho'), ['escudo', 'bloqueio']);
  await ok(c, 'apostar', 'vermelho', 'pontos'); // reserva: o painel registra no lugar do grupo
  const reg = await c.registro();
  assert.ok(reg.some((m) => m.includes('trocou 3 acertos por Bloqueio no lugar de Passe') && m.endsWith('(pelo celular)')));
  assert.ok(reg.some((m) => m.includes('Vermelho ativou a Aposta') && m.endsWith('(pelo painel)')));
});

test('Dobro e Aposta pelo celular: efeito imediato, uma habilidade por rodada, toque duplo e motivos de regra', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'vermelho', 5, 'dobro'); // recusa no 3º e aceita o Dobro no 5º
  assert.deepEqual(estoque(c, 'vermelho'), ['dobro']);
  const v = await visaoCel(c, 'vermelho', (s) => s.acoes?.preparo && s.acoes.usaveis?.includes('dobro'));
  assert.deepEqual(v.acoes.usaveis, ['dobro']);
  assert.equal(v.acoes.aposta.pontos, null);
  assert.match(v.acoes.aposta.habilidades, /precisa de 2/);
  const [a, b] = await Promise.all([cel(c, 'vermelho', 'ativarDobro'), cel(c, 'vermelho', 'ativarDobro')]);
  assert.deepEqual([a.t, b.t].sort(), ['erro', 'ok']);
  assert.deepEqual(estado(c).rodada.dobros, ['vermelho']);
  assert.equal((await cel(c, 'vermelho', 'apostar', 'pontos')).t, 'erro', 'uma habilidade por rodada');
  const depois = await visaoCel(c, 'vermelho', (s) => s.ativa === 'dobro');
  assert.equal(depois.acoes.usaveis, undefined);
  assert.ok(!depois.acoes.aposta);
  await ajustarPontosNoServidor(c, 'azul', -15); // outro grupo aposta pelo celular dele, com motivo de dívida
  const va = await visaoCel(c, 'azul', (s) => s.acoes?.aposta?.pontos);
  assert.match(va.acoes.aposta.pontos, /abaixo de −20/);
  assert.equal((await cel(c, 'azul', 'apostar', 'pontos')).t, 'erro');
  await ajustarPontosNoServidor(c, 'azul', 5);
  await celOk(c, 'azul', 'apostar', 'pontos');
  assert.equal(estado(c).rodada.apostas.azul.modo, 'pontos');
  assert.ok((await c.registro()).some((m) => m.includes('Vermelho ativou Dobro') && m.endsWith('(pelo celular)')));
});

test('pedido de Bloqueio: o painel confirma (gasta e vale) ou recusa (nada gasto), o grupo cancela, e a janela espera o pedido', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul', 'verde']);
  await ganhar(c, 'azul', 3, 'bloqueio');
  const v0 = await visaoCel(c, 'azul', (s) => s.acoes?.alvos);
  assert.deepEqual(v0.acoes.alvos.sort(), ['verde', 'vermelho']);
  assert.equal((await cel(c, 'azul', 'pedirBloqueio', 'azul')).t, 'erro');
  assert.equal((await cel(c, 'azul', 'pedirBloqueio', 'cinza')).t, 'erro');
  await celOk(c, 'azul', 'pedirBloqueio', 'verde');
  await celOk(c, 'azul', 'pedirBloqueio', 'verde'); // toque duplo
  assert.deepEqual(c.host.ultimo.pedidos, [{ cor: 'azul', alvo: 'verde' }]);
  assert.match((await cel(c, 'azul', 'pedirBloqueio', 'vermelho')).msg, /Cancele-o/);
  assert.deepEqual(estoque(c, 'azul'), ['bloqueio'], 'nada é gasto antes da confirmação');
  assert.deepEqual(estado(c).rodada.bloqueios, {});
  await ok(c, 'mostrarAlternativas');
  assert.match((await c.host.acao('abrirJanela')).msg, /pedido de Bloqueio/);
  const pend = await visaoCel(c, 'azul', (s) => s.acoes?.pedido === 'verde');
  assert.equal(pend.acoes.usaveis, undefined);
  await celOk(c, 'azul', 'cancelarBloqueio');
  assert.deepEqual(c.host.ultimo.pedidos, []);
  await celOk(c, 'azul', 'cancelarBloqueio'); // idempotente
  await celOk(c, 'azul', 'pedirBloqueio', 'verde');
  await ok(c, 'recusarBloqueio', 'azul');
  assert.deepEqual(estoque(c, 'azul'), ['bloqueio']);
  assert.equal((await visaoCel(c, 'azul', (s) => s.pedidoRecusado === 'verde')).pedidoRecusado, 'verde');
  await celOk(c, 'azul', 'pedirBloqueio', 'verde');
  await ok(c, 'confirmarBloqueio', 'azul');
  assert.deepEqual(estoque(c, 'azul'), []);
  assert.deepEqual(estado(c).rodada.bloqueios, { verde: ['azul'] });
  await ok(c, 'abrirJanela');
  assert.equal((await c.fones.verde.estadoApos((s) => s.botao === 'bloqueado')).botao, 'bloqueado');
  const reg = await c.registro();
  assert.ok(reg.some((m) => m.includes('Azul pediu o Bloqueio sobre Verde (pelo celular)')));
  assert.ok(reg.some((m) => m.includes('Azul cancelou o pedido de Bloqueio sobre Verde')));
  assert.ok(reg.some((m) => m.includes('recusou o pedido de Bloqueio de Azul sobre Verde. Nada foi gasto')));
  assert.ok(reg.some((m) => m.includes('Azul ativou Bloqueio sobre Verde') && m.includes('pedido pelo celular, confirmado no painel')));
});

test('pedido de Bloqueio: confirmar vale com Desfazer; só o responsável confirma', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'azul', 3, 'bloqueio');
  await celOk(c, 'azul', 'pedirBloqueio', 'vermelho');
  assert.equal((await cel(c, 'azul', 'confirmarBloqueio', 'azul')).t, 'erro', 'o celular não confirma o próprio pedido');
  assert.equal(c.host.ultimo.pedidos.length, 1);
  await ok(c, 'confirmarBloqueio', 'azul');
  assert.deepEqual(estoque(c, 'azul'), []);
  await ok(c, 'desfazer');
  assert.deepEqual(estoque(c, 'azul'), ['bloqueio'], 'Desfazer devolve o Bloqueio');
  assert.deepEqual(estado(c).rodada.bloqueios, {});
  assert.match((await c.host.acao('confirmarBloqueio', 'azul')).msg, /Não há pedido/);
});

test('Escudo pelo celular: só o grupo-alvo decide; a janela espera; usar anula e consome os dois', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul', 'verde']);
  await ganhar(c, 'azul', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, 'bloqueio');
  await ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  const va = await visaoCel(c, 'azul', (s) => s.acoes?.escudo);
  assert.deepEqual(va.acoes.escudo, { atacante: 'vermelho' });
  for (const cor of ['vermelho', 'verde']) assert.match((await cel(c, cor, 'decidirEscudo', true)).msg, /Não há decisão de Escudo/);
  assert.equal(estado(c).rodada.escudos.length, 1);
  assert.equal((await visaoCel(c, 'verde', () => true)).acoes.escudo, undefined);
  await ok(c, 'mostrarAlternativas');
  assert.match((await c.host.acao('abrirJanela')).msg, /Escudo/);
  await celOk(c, 'azul', 'decidirEscudo', true);
  assert.deepEqual(estoque(c, 'azul'), []);
  assert.deepEqual(estoque(c, 'vermelho'), []);
  assert.deepEqual(estado(c).rodada.bloqueios, {});
  assert.equal((await cel(c, 'azul', 'decidirEscudo', true)).t, 'erro', 'toque duplo');
  await ok(c, 'abrirJanela');
  assert.ok((await c.registro()).some((m) => m.includes('Azul usou o Escudo e anulou o Bloqueio de Vermelho') && m.endsWith('(pelo celular)')));
});

test('Escudo: aceitar pelo celular guarda o Escudo; o botão do painel (reserva) também decide', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'azul', 3, 'escudo');
  await ganhar(c, 'vermelho', 3, 'bloqueio');
  await ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  await celOk(c, 'azul', 'decidirEscudo', false);
  assert.deepEqual(estoque(c, 'azul'), ['escudo']);
  assert.deepEqual(estado(c).rodada.bloqueios, { azul: ['vermelho'] });
  await rodada(c, ['vermelho'], ['c']);
  await ganhar(c, 'vermelho', 2, 'bloqueio');
  await ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  await ok(c, 'decidirEscudo', 'azul', 'vermelho', true);
  assert.ok((await c.registro()).some((m) => m.includes('decisão do grupo: Azul usou o Escudo') && m.endsWith('(pelo painel)')));
});

test('Passe só para o 1º respondente e Dica 50/50 só para o 2º, pelo celular', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'vermelho', 3, 'passe');
  for (let i = 1; i <= 7; i += 1) await rodada(c, ['azul'], ['c']);
  await ok(c, 'trocarAcertos', 'azul', 'dica5050');
  await ok(c, 'mostrarAlternativas');
  assert.match((await cel(c, 'vermelho', 'usarPasse')).msg, /1º respondente/, 'fora da fase de resposta');
  await ok(c, 'abrirJanela');
  await apertar(c, 'vermelho');
  await apertar(c, 'azul'); // vermelho 1º, azul 2º
  await ok(c, 'mostrarResposta');
  assert.equal((await visaoCel(c, 'vermelho', (s) => s.acoes?.passe)).acoes.passe, true);
  assert.match((await cel(c, 'azul', 'usarDica5050')).msg, /ainda não|2º|Dica/); // ainda não é a vez dele
  assert.equal((await cel(c, 'azul', 'usarPasse')).t, 'erro', 'o 2º não passa a vez');
  await celOk(c, 'vermelho', 'usarPasse');
  assert.deepEqual(estoque(c, 'vermelho'), []);
  assert.equal((await cel(c, 'vermelho', 'usarPasse')).t, 'erro', 'toque duplo');
  const vd = await visaoCel(c, 'azul', (s) => s.acoes?.dica);
  assert.equal(vd.acoes.dica.tirar, 2);
  assert.match((await cel(c, 'vermelho', 'usarDica5050')).msg, /2º respondente/, 'o 1º não usa a Dica');
  await celOk(c, 'azul', 'usarDica5050');
  const cv = await visaoCel(c, 'azul', (s) => s.eliminadas?.length === 2);
  assert.equal(cv.eliminadas.length, 2);
  const reg = await c.registro();
  assert.ok(reg.some((m) => m.includes('Vermelho usou o Passe') && m.endsWith('(pelo celular)')));
  assert.ok(reg.some((m) => m.includes('Azul usou a Dica 50/50') && m.endsWith('(pelo celular)')));
});

// Todos os valores folha de um objeto, sem os campos que dependem do relógio (um carimbo de tempo pode conter "777").
function folhas(obj, saida = []) {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) if (k !== 'agora') folhas(v, saida);
  } else saida.push(obj);
  return saida;
}
const grupoDe = (c, cor) => c.host.ultimo.estado.grupos.find((g) => g.cor === cor);

test('o celular só recebe o que é dele; a reconexão restaura os botões; quem não é o grupo não age', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ganhar(c, 'azul', 3, 'bloqueio');
  await ajustarPontosNoServidor(c, 'azul', 777);
  await ajustarPontosNoServidor(c, 'vermelho', 1);
  // espera explícita: o painel e o celular de vermelho já refletem os dois ajustes
  await c.host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'azul').pontos >= 777 && s.estado.grupos.find((g) => g.cor === 'vermelho').pontos === 1);
  const vv = await visaoCel(c, 'vermelho', (s) => s.acoes?.saldo === 1);
  const valores = folhas(vv);
  assert.equal(valores.includes(777), false, 'saldo de outro grupo');
  assert.equal(valores.some((x) => typeof x === 'string' && x.includes('bloqueio')), false, 'estoque de outro grupo');
  assert.equal('grupos' in vv, false);
  assert.equal(vv.acoes.saldo, 1);
  assert.equal(vv.acoes.pedido, null);

  await celOk(c, 'azul', 'pedirBloqueio', 'vermelho');
  await c.host.estadoApos((s) => s.pedidos?.length === 1);
  const vv2 = await visaoCel(c, 'vermelho', (s) => s.acoes);
  assert.equal(vv2.acoes.pedido, null, 'vermelho não vê o pedido de azul');

  // reconexão sem corrida: fecha o socket antigo, espera o servidor registrar a queda e só então entra com o token
  const antigo = c.fones.azul;
  const fechou = new Promise((ok2) => antigo.ws.once('close', ok2));
  antigo.fechar();
  await fechou;
  await c.host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'azul').conectado === false);
  const nova = await entrarGrupo(c.srv.porta, 'azul', 'x', c.tokens.azul);
  c.abertos.push(nova.c);
  c.fones.azul = nova.c;
  assert.equal(nova.entrou.t, 'entrou');
  await c.host.estadoApos((s) => s.estado.grupos.find((g) => g.cor === 'azul').conectado === true);
  const volta = await nova.c.estadoApos((s) => s.registrado && s.acoes?.pedido === 'vermelho');
  assert.equal(volta.acoes.pedido, 'vermelho');
  assert.deepEqual(volta.acoes.estoque, ['bloqueio']);

  // quem abre o socket do grupo sem entrar não age
  const intruso = new Cliente(c.srv.porta, 'papel=g&cor=azul');
  c.abertos.push(intruso);
  await intruso.aberto;
  assert.match((await intruso.acao('cancelarBloqueio')).msg, /Sem conexão com o grupo/);
  assert.equal(c.host.ultimo.pedidos.length, 1, 'o pedido não foi cancelado pelo intruso');
  assert.equal(grupoDe(c, 'azul').conectado, true);
});

test('o pedido de Bloqueio salvo volta ao carregar se ainda vale, e some se a rodada já passou', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-8d-'));
  fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const perguntas = JSON.parse(fs.readFileSync(ORIGINAL, 'utf8')).perguntas;
  let e = G.criarJogo({ config: { placarModo: 'desligado' }, perguntas });
  for (const cor of ['vermelho', 'azul']) e = G.registrarGrupo(e, cor, nomeDaCor(cor));
  e = G.iniciar(e);
  e.grupos[0].habilidades = [{ tipo: 'bloqueio' }];
  const guardar = (estadoJogo, pedidos) => fs.writeFileSync(path.join(dir, 'jogo.json'), JSON.stringify({ estado: estadoJogo, tokens: {}, pedidos, ui: { cena: 'jogo', corSelecionada: null, ip: null, regras: false, tema: 'claro' }, janelaRestanteMs: null }));
  guardar(e, { vermelho: 'azul' });
  const c = await preparar(t, [], dir, { iniciar: false });
  assert.deepEqual((await c.host.estadoApos(() => true)).pedidos, [{ cor: 'vermelho', alvo: 'azul' }]);
  await c.srv.fechar();
  guardar(G.abrirJanela(G.mostrarAlternativas(e)), { vermelho: 'azul' }); // a janela abriu: o pedido não vale mais
  const c2 = await preparar(t, [], dir, { iniciar: false });
  assert.deepEqual((await c2.host.estadoApos(() => true)).pedidos, []);
});
