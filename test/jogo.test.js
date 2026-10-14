'use strict';
// O jogo de ponta a ponta pela API real: responsável, /tela e celulares simulados por WebSocket.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { iniciarServidor } = require('../server');
const { Cliente, autenticar, entrarGrupo, dormir, PIN, ajustarPontosNoServidor, nomeDaCor } = require('./ajuda');

const ORIGINAL = path.join(__dirname, '..', 'data', 'perguntas.json');
const CORES8 = ['vermelho', 'azul', 'verde', 'amarelo', 'laranja', 'roxo', 'rosa', 'ciano'];

// Sobe o servidor, conecta o responsável, uma /tela sem cookie, uma /tela do responsável e os celulares.
async function preparar(t, cores = CORES8) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oficina-j-'));
  fs.copyFileSync(ORIGINAL, path.join(dir, 'perguntas.json'));
  const c = { dir, abertos: [], fones: {} };
  if (!fs.existsSync(path.join(dir, 'config.json'))) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ jogo: { placarModo: 'desligado' } })); // placar parcial tem testes próprios
  c.srv = await iniciarServidor({ port: 0, dataDir: dir, pin: PIN, ehLocal: () => false });
  t.after(async () => {
    c.abertos.forEach((x) => x.fechar());
    await c.srv.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  c.auth = await autenticar(c.srv.porta, PIN);
  c.host = new Cliente(c.srv.porta, 'papel=host', c.auth.cookie);
  c.tela = new Cliente(c.srv.porta, 'papel=tela');
  c.telaResp = new Cliente(c.srv.porta, 'papel=tela', c.auth.cookie);
  c.abertos.push(c.host, c.tela, c.telaResp);
  await Promise.all([c.host.aberto, c.tela.aberto, c.telaResp.aberto]);
  assert.equal((await c.host.acao('novoJogo', {})).t, 'ok');
  for (const cor of cores) {
    const { c: fone, entrou } = await entrarGrupo(c.srv.porta, cor, nomeDaCor(cor));
    assert.equal(entrou.t, 'entrou');
    c.fones[cor] = fone;
    c.abertos.push(fone);
  }
  await c.host.estadoApos((s) => s.estado.grupos.length === cores.length && s.estado.grupos.every((g) => g.conectado));
  assert.equal((await c.host.acao('iniciar')).t, 'ok');
  return c;
}

const fase = (c) => c.host.ultimo.estado.fase;
const estado = (c) => c.host.ultimo.estado;
const certa = (c) => c.host.ultimo.pergunta.correta;
const errada = (c, n = 0) => [0, 1, 2, 3].filter((i) => i !== certa(c))[n];
const grupo = (c, cor) => estado(c).grupos.find((g) => g.cor === cor);
const ok = async (c, nome, ...args) => {
  const r = await c.host.acao(nome, ...args);
  assert.equal(r.t, 'ok', `${nome}: ${r.msg}`);
};

// Clique de um celular, esperando o servidor registrar antes do próximo (a ordem vira a de chegada).
async function apertar(c, cor) {
  const antes = estado(c).rodada.ordem.length;
  c.fones[cor].enviar({ t: 'apertar' });
  await c.host.estadoApos((s) => s.estado.rodada.ordem.length > antes || s.estado.fase !== 'janela');
}

// Avança para a próxima pergunta (não há mais ofertas: os acertos viram moeda, trocados com `trocarAcertos`).
async function seguir(c) {
  await ok(c, 'continuar');
}

// Joga uma rodada completa: quem aperta (em ordem) e como cada respondente responde.
async function rodada(c, ordem, respostas, opcoes = {}) {
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  for (const cor of ordem) await apertar(c, cor);
  if (fase(c) === 'janela') await ok(c, 'encerrarJanela');
  if (ordem.length) {
    await ok(c, 'mostrarResposta');
    for (const r of respostas) {
      if (r === 'certa') await ok(c, 'responder', certa(c));
      else if (r === 'errada') await ok(c, 'responder', errada(c));
      else if (r === 'desq') await ok(c, 'desqualificar');
      else if (r === 'sem') await ok(c, 'semResposta');
    }
  }
  if (opcoes.parar) return;
  await seguir(c, opcoes);
}

test('partida completa com 8 grupos: 14 respondidas, rodada final em dobro, ranking, final e capa', async (t) => {
  const c = await preparar(t);
  const proibidosNaTela = ['correta', 'explicacao'];

  // Rodada 1: a ordem segue a chegada; o 1º erra e o 2º acerta (5 pontos).
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await apertar(c, 'azul');
  await apertar(c, 'verde');
  await apertar(c, 'vermelho');
  c.fones.azul.enviar({ t: 'apertar' }); // clique duplicado do mesmo grupo é ignorado
  await c.fones.azul.esperar((m) => m.t === 'ignorado');
  assert.deepEqual(estado(c).rodada.ordem, ['azul', 'verde', 'vermelho']);
  await ok(c, 'encerrarJanela');

  // A /tela não recebe a resposta nem a explicação antes do desfecho, em nenhuma fase.
  const naTela = await c.tela.estadoApos((s) => s.fase === 'ordem');
  assert.deepEqual(naTela.ordem.map((o) => o.cor), ['azul', 'verde', 'vermelho']);
  for (const k of proibidosNaTela) assert.equal(k in naTela, false, `a /tela recebeu "${k}" na ordem`);
  await ok(c, 'mostrarResposta');
  await ok(c, 'responder', errada(c));
  const apos = await c.tela.estadoApos((s) => s.fase === 'resposta' && s.erradas?.length === 1);
  assert.equal(apos.atual, 'verde'); // errada: a tela continua e o próximo da ordem responde
  for (const k of proibidosNaTela) assert.equal(k in apos, false, `a /tela recebeu "${k}" depois do erro`);
  await assert.rejects(ok(c, 'responder', apos.erradas[0])); // alternativa descartada não volta
  await ok(c, 'responder', certa(c));
  assert.equal(grupo(c, 'verde').pontos, 5);
  assert.equal(grupo(c, 'azul').pontos, 0);
  const expl = await c.tela.estadoApos((s) => s.fase === 'explicacao');
  assert.equal(expl.correta, certa(c));
  assert.ok(expl.explicacao);
  assert.deepEqual(expl.erradas, apos.erradas);
  await seguir(c);

  // Celulares nunca recebem pergunta, alternativas nem resposta.
  const visaoCel = c.fones.azul.ultimo;
  for (const k of ['enunciado', 'alternativas', 'correta', 'explicacao']) assert.equal(k in visaoCel, false);

  // Rodadas seguintes: o primeiro a apertar acerta, girando entre os grupos, até a rodada final.
  let i = 0;
  while (estado(c).respondidas < 13) {
    const cor = CORES8[i % 8];
    await rodada(c, [cor], ['certa']);
    i += 1;
  }
  assert.equal(estado(c).respondidas, 13);

  // A rodada final é marcada desde a pergunta e vale o dobro.
  const final = await c.tela.estadoApos((s) => s.fase === 'pergunta' && s.respondidas === 13);
  assert.equal(final.rodadaFinal, true);
  const antes = grupo(c, 'ciano').pontos;
  await rodada(c, ['ciano'], ['certa'], { parar: true });
  assert.equal(grupo(c, 'ciano').pontos - antes, 20);
  await seguir(c);

  // 14 respondidas: ranking, com a /tela do responsável podendo avançar.
  assert.equal(fase(c), 'ranking');
  const rk = await c.tela.estadoApos((s) => s.fase === 'ranking');
  assert.equal(rk.ranking.length, 8);
  assert.equal(rk.ranking[0].cor, c.host.ultimo.ranking[0].cor);
  assert.equal(rk.autenticado, false);
  assert.match((await c.tela.acao('proximo')).msg, /permiss/i);
  if (!c.host.ultimo.vencedor) await ok(c, 'definirElegivel', c.host.ultimo.empatados[1], false);
  assert.equal((await c.telaResp.acao('proximo')).t, 'ok');
  const fin = await c.tela.estadoApos((s) => s.fase === 'final');
  assert.match(fin.final.professor, /Itacir/);
  assert.ok(fin.final.integrantes.length >= 6);
  assert.equal((await c.telaResp.acao('proximo')).t, 'ok');
  assert.equal((await c.tela.estadoApos((s) => s.cena === 'capa')).cena, 'capa');
});

test('habilidades: troca de acertos, ativação antes da janela, alvo bloqueado e consumo', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul', 'verde']);

  // 3 acertos seguidos: o contador vale 3, nada trava o avanço e o grupo troca quando quiser.
  await rodada(c, ['vermelho'], ['certa']);
  await rodada(c, ['vermelho'], ['certa']);
  await rodada(c, ['vermelho'], ['certa'], { parar: true });
  assert.equal(grupo(c, 'vermelho').sequencia, 3);
  assert.equal((await c.host.acao('trocarAcertos', 'vermelho', 'dobro')).t, 'erro'); // o Dobro só a partir de 5
  await ok(c, 'trocarAcertos', 'vermelho', 'bloqueio');
  assert.equal(grupo(c, 'vermelho').sequencia, 0);
  assert.deepEqual(grupo(c, 'vermelho').habilidades, [{ tipo: 'bloqueio' }]);
  await ok(c, 'continuar');

  // Ativa o Bloqueio sobre o azul antes da janela: a /tela avisa e o celular fica bloqueado.
  await assert.rejects(ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'vermelho')); // não pode ser o próprio grupo
  await ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  const aviso = await c.tela.estadoApos((s) => s.avisos?.length === 1);
  assert.deepEqual(aviso.avisos[0], { cor: 'vermelho', tipo: 'bloqueio', alvo: 'azul', anulado: false });
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await assert.rejects(ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'verde')); // depois da janela, travado
  const celAzul = await c.fones.azul.esperar((m) => m.t === 'estado' && m.botao === 'bloqueado', 3000, true);
  assert.equal(celAzul.botao, 'bloqueado');
  c.fones.azul.enviar({ t: 'apertar' });
  await c.fones.azul.esperar((m) => m.t === 'ignorado');
  await apertar(c, 'verde');
  await apertar(c, 'vermelho'); // todos os não bloqueados já apertaram: a janela fecha sozinha
  assert.equal(fase(c), 'ordem');
  assert.deepEqual(estado(c).rodada.ordem, ['verde', 'vermelho']);
  await ok(c, 'mostrarResposta');
  await ok(c, 'responder', certa(c));
  await seguir(c);

  // Habilidade consumida na ativação: nada sobra no estoque.
  assert.deepEqual(grupo(c, 'vermelho').habilidades, []);
});

test('Dobro: troca aos 5 acertos, guardado no estoque, ativado antes da janela, vale 20', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  for (let i = 0; i < 4; i += 1) await rodada(c, ['vermelho'], ['certa']);
  await rodada(c, ['vermelho'], ['certa'], { parar: true });
  assert.equal(grupo(c, 'vermelho').sequencia, 5);
  assert.deepEqual(grupo(c, 'vermelho').habilidades, []);
  await ok(c, 'trocarAcertos', 'vermelho', 'dobro');
  await seguir(c);
  assert.deepEqual(grupo(c, 'vermelho').habilidades, [{ tipo: 'dobro' }]);
  assert.equal(grupo(c, 'vermelho').sequencia, 0);
  const antes = grupo(c, 'vermelho').pontos;
  await ok(c, 'ativarHabilidade', 'vermelho', 'dobro');
  await rodada(c, ['vermelho'], ['certa'], { parar: true });
  assert.equal(grupo(c, 'vermelho').pontos - antes, 20);
});

test('pausa congela a janela e ignora cliques; retomar volta a valer', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul', 'verde']);
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await ok(c, 'pausar', true);
  const pausada = await c.tela.estadoApos((s) => s.fase === 'janela' && s.pausado === true);
  const resta = pausada.janela.restanteMs;
  assert.ok(resta > 0 && resta <= 30000);
  c.fones.vermelho.enviar({ t: 'apertar' });
  await c.fones.vermelho.esperar((m) => m.t === 'ignorado');
  await dormir(300);
  assert.equal(c.tela.ultimo.janela.restanteMs, resta); // o relógio parou
  await ok(c, 'pausar', false);
  const retomada = await c.tela.estadoApos((s) => s.pausado === false && s.fase === 'janela');
  assert.ok(retomada.janela.fimEm > Date.now() - 1000);
  await apertar(c, 'vermelho');
  assert.deepEqual(estado(c).rodada.ordem, ['vermelho']);
});

test('desfecho sem tentativa mostra só a correta; "sem resposta" e desqualificação zeram a sequência', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul', 'verde']);

  // Ninguém aperta: só a alternativa correta, e a rodada não conta.
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await ok(c, 'encerrarJanela');
  const so = await c.tela.estadoApos((s) => s.fase === 'so_correta');
  assert.equal(so.tentativas.length, 0);
  assert.equal(so.correta, certa(c));
  assert.equal('explicacao' in so, false);
  assert.equal(estado(c).respondidas, 0);
  await seguir(c);

  // Vermelho acerta, depois "sem resposta" zera; azul sem apertar mantém.
  await rodada(c, ['vermelho'], ['certa']);
  assert.equal(grupo(c, 'vermelho').sequencia, 1);
  await rodada(c, ['vermelho', 'verde'], ['sem', 'desq']);
  assert.equal(grupo(c, 'vermelho').sequencia, 0);
  assert.equal(estado(c).respondidas, 2);

  // Só um respondeu e errou, ninguém mais apertou: só a correta, e a rodada conta.
  await rodada(c, ['verde'], ['errada'], { parar: true });
  assert.equal(fase(c), 'so_correta');
  assert.equal(estado(c).respondidas, 3);
});

test('desfazer restaura o estado anterior; novo jogo zera pontos e mantém os grupos', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await apertar(c, 'azul');
  await ok(c, 'encerrarJanela');
  await ok(c, 'mostrarResposta');
  await ok(c, 'responder', certa(c));
  assert.equal(grupo(c, 'azul').pontos, 10);
  await ok(c, 'desfazer');
  assert.equal(fase(c), 'resposta');
  assert.equal(grupo(c, 'azul').pontos, 0);
  await ajustarPontosNoServidor(c, 'azul', 5);
  assert.equal(grupo(c, 'azul').pontos, 5);

  await ok(c, 'zerarJogo');
  assert.equal(fase(c), 'espera');
  assert.equal(estado(c).grupos.length, 2);
  assert.ok(estado(c).grupos.every((g) => g.pontos === 0 && g.sequencia === 0 && g.habilidades.length === 0 && !g.oferta));
  assert.equal(estado(c).respondidas, 0);
});

test('empate no topo: exige desempate só entre empatados; vence quem acertar primeiro', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul', 'verde']);
  for (let i = 0; i < 14; i += 1) await rodada(c, ['vermelho'], ['certa']);
  assert.equal(fase(c), 'ranking');
  await ajustarPontosNoServidor(c, 'azul', grupo(c, 'vermelho').pontos);
  assert.deepEqual([...c.host.ultimo.empatados].sort(), ['azul', 'vermelho']);
  assert.equal(c.host.ultimo.vencedor, null);
  assert.match((await c.host.acao('proximo')).msg, /Desempate/);

  await ok(c, 'iniciarDesempate');
  assert.equal(estado(c).rodada.desempate, true);
  assert.equal(estado(c).rodada.final, false); // o desempate nunca vale em dobro
  const pontosAntes = estado(c).grupos.map((g) => g.pontos);
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  c.fones.verde.enviar({ t: 'apertar' }); // quem não empatou não participa
  await c.fones.verde.esperar((m) => m.t === 'ignorado');
  await apertar(c, 'azul');
  await apertar(c, 'vermelho');
  await ok(c, 'mostrarResposta');
  await ok(c, 'responder', certa(c));
  assert.deepEqual(estado(c).grupos.map((g) => g.pontos), pontosAntes); // o desempate não altera pontos
  await ok(c, 'continuar');
  assert.equal(fase(c), 'ranking');
  assert.equal(c.host.ultimo.vencedor, 'azul');
  const tela = await c.tela.estadoApos((s) => s.fase === 'ranking' && s.vencedor === 'azul');
  assert.equal(tela.vencedor, 'azul');
  await ok(c, 'proximo');
  assert.equal(fase(c), 'final');
});

test('o painel recebe a pergunta com a resposta; o botão principal depende só da fase', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  const h = c.host.ultimo;
  assert.ok(h.pergunta.alternativas.length === 4 && Number.isInteger(h.pergunta.correta) && h.pergunta.explicacao);
  assert.ok(h.totalBanco >= 25);
  // Ações do jogo fora da fase certa são recusadas (o servidor valida tudo).
  assert.match((await c.host.acao('abrirJanela')).msg, /inválida/);
  assert.match((await c.host.acao('mostrarResposta')).msg, /inválida/);
  assert.match((await c.host.acao('responder', 0)).msg, /inválida/);
  assert.match((await c.host.acao('continuar')).msg, /inválida/);
});

test('habilidades nas visões: ganhos na /tela, "ativa" no celular, pontos do Dobro só no desfecho', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  const cel = c.fones.vermelho;
  const aCel = (pred) => cel.estadoApos(pred);

  // 3 acertos: só a troca é ganho; ao trocar, a /tela recebe o ganho e o celular, a habilidade.
  await rodada(c, ['vermelho'], ['certa']);
  await rodada(c, ['vermelho'], ['certa']);
  await rodada(c, ['vermelho'], ['certa'], { parar: true });
  const antes = await c.tela.estadoApos((s) => s.fase === 'explicacao');
  assert.deepEqual(antes.ganhos, []);
  await ok(c, 'trocarAcertos', 'vermelho', 'bloqueio');
  const depois = await c.tela.estadoApos((s) => s.fase === 'explicacao' && s.ganhos.length === 1);
  assert.deepEqual(depois.ganhos, [{ cor: 'vermelho', tipo: 'bloqueio', acertos: 3 }]);
  assert.deepEqual((await aCel((s) => s.habilidades?.includes('bloqueio'))).habilidades, ['bloqueio']);
  await ok(c, 'continuar');

  // Ativar: o celular do dono passa a ter a habilidade "em jogo"; o alvo fica bloqueado.
  await ok(c, 'ativarHabilidade', 'vermelho', 'bloqueio', 'azul');
  const emJogo = await aCel((s) => s.ativa === 'bloqueio');
  assert.deepEqual(emJogo.habilidades, []); // consumida na ativação
  assert.deepEqual((await c.tela.estadoApos((s) => s.avisos?.length === 1)).avisos[0], { cor: 'vermelho', tipo: 'bloqueio', alvo: 'azul', anulado: false });
  await rodada(c, ['vermelho'], ['certa']);
  const proxima = await aCel((s) => s.ativa === null && s.botao !== undefined);
  assert.equal(proxima.ativa, null); // nova rodada: nada em jogo
});

test('Dobro no desfecho: a /tela recebe os pontos da tentativa e a marca de Dobro, nada antes', async (t) => {
  const c = await preparar(t, ['vermelho', 'azul']);
  for (let i = 0; i < 5; i += 1) await rodada(c, ['vermelho'], ['certa'], { parar: i === 4 });
  await ok(c, 'trocarAcertos', 'vermelho', 'dobro');
  const ganho = await c.tela.estadoApos((s) => s.fase === 'explicacao' && s.ganhos?.length === 1);
  assert.deepEqual(ganho.ganhos, [{ cor: 'vermelho', tipo: 'dobro', acertos: 5 }]);
  await ok(c, 'continuar');
  await ok(c, 'ativarHabilidade', 'vermelho', 'dobro');
  await ok(c, 'mostrarAlternativas');
  await ok(c, 'abrirJanela');
  await apertar(c, 'vermelho');
  await ok(c, 'encerrarJanela');
  await ok(c, 'mostrarResposta');
  const resposta = await c.tela.estadoApos((s) => s.fase === 'resposta');
  assert.equal('tentativas' in resposta, false); // pontos só aparecem depois do desfecho
  assert.equal('ganhos' in resposta, false);
  await ok(c, 'responder', certa(c));
  const fim = await c.tela.estadoApos((s) => s.fase === 'explicacao' && s.tentativas?.length === 1 && s.tentativas[0].pontos > 0);
  assert.deepEqual(fim.tentativas[0], { cor: 'vermelho', tipo: 'certa', alternativa: certa(c), pontos: 20, dobro: true });
});
