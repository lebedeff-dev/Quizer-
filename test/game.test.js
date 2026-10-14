'use strict';
const { ajustarPontosTeste } = require('./ajuda');
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/game.js');

// Perguntas: correta = 0 (A) em todas; a última é a reserva.
function banco(n = 20) {
  const ps = [];
  for (let i = 1; i <= n; i++) {
    ps.push({ id: i, tipo: 'facil', enunciado: `P${i}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, explicacao: 'x', reserva: false });
  }
  ps.push({ id: 99, tipo: 'atencao', enunciado: 'R', alternativas: ['a', 'b', 'c', 'd'], correta: 3, explicacao: 'x', reserva: true });
  return ps;
}

function novo(cores = ['vermelho', 'azul', 'verde'], config = {}, n = 20) {
  let s = G.criarJogo({ config: { placarModo: 'desligado', ...config }, perguntas: banco(n) });
  for (const c of cores) s = G.registrarGrupo(s, c, `rep-${c}`);
  return G.iniciar(s);
}

const correta = (s) => s.perguntas.find((p) => p.id === s.rodada.perguntaId).correta;
const pts = (s, cor) => s.grupos.find((g) => g.cor === cor).pontos;
const grp = (s, cor) => s.grupos.find((g) => g.cor === cor);

// Percorre a rodada: cliques na ordem dada e respostas: 'c' certa, 'e' errada, 'd' desq., 's' sem resposta.
// Ativações devem ser feitas antes, na fase 'pergunta'.
function jogar(s, cliques, respostas = []) {
  if (s.fase === 'pergunta') s = G.mostrarAlternativas(s);
  s = G.abrirJanela(s);
  for (const c of cliques) s = G.clicar(s, c);
  if (s.fase === 'janela') s = G.encerrarJanela(s);
  if (s.fase !== 'ordem') return s; // ninguém clicou
  s = G.mostrarResposta(s);
  let errada = 1;
  for (const r of respostas) {
    if (s.fase !== 'resposta') break;
    if (r === 'c') s = G.responder(s, s.perguntas.find((p) => p.id === s.rodada.perguntaId).correta);
    else if (r === 'e') s = G.responder(s, s.rodada.erradas.includes(errada) ? ++errada : errada);
    else if (r === 'd') s = G.desqualificar(s);
    else if (r === 's') s = G.semResposta(s);
  }
  return s;
}
// Dá habilidades ao estoque de um grupo (atalho de teste; o jogo as ganha pela escada de ofertas).
function dar(s, cor, ...tipos) {
  for (const tipo of tipos) grp(s, cor).habilidades.push({ tipo });
  return s;
}
const estoque = (s, cor) => grp(s, cor).habilidades.map((h) => h.tipo);

// Fecha a rodada e segue para a próxima (não há mais ofertas: os acertos viram moeda, ver troca-acertos.test.js).
function fechar(s) {
  return G.continuar(s);
}

test('pontuação: 10 para o 1º e 5 para o 2º', () => {
  let s = jogar(novo(), ['azul', 'verde'], ['e', 'c']);
  assert.equal(pts(s, 'azul'), 0);
  assert.equal(pts(s, 'verde'), 5);
  s = jogar(fechar(s), ['azul', 'verde'], ['c']);
  assert.equal(pts(s, 'azul'), 10);
});

test('pontuação com Dobro: 20 e 10', () => {
  let s = novo();
  dar(s, 'vermelho', 'dobro');
  dar(s, 'azul', 'dobro');
  s = G.ativarHabilidade(s, 'vermelho', 'dobro');
  s = G.ativarHabilidade(s, 'azul', 'dobro');
  s = jogar(s, ['vermelho', 'azul'], ['c']);
  assert.equal(pts(s, 'vermelho'), 20);
  let t = novo();
  dar(t, 'azul', 'dobro');
  t = G.ativarHabilidade(t, 'azul', 'dobro');
  t = jogar(t, ['vermelho', 'azul'], ['e', 'c']);
  assert.equal(pts(t, 'azul'), 10);
});

// Joga `n` rodadas em que `cor` aperta sozinha e acerta (para na última, na explicação).
function acertos(s, cor, n) {
  for (let i = 0; i < n; i++) {
    s = jogar(s, [cor], ['c']);
    if (i < n - 1) s = fechar(s);
  }
  return s;
}

test('só erro ou desqualificação zeram a sequência; quem não respondeu mantém', () => {
  let s = novo(['vermelho', 'azul', 'verde']);
  for (const g of s.grupos) g.sequencia = 2;
  dar(s, 'vermelho', 'bloqueio');
  s = G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'verde'); // verde bloqueado
  s = jogar(s, ['vermelho', 'verde', 'azul'], ['e', 'e']);
  assert.equal(grp(s, 'vermelho').sequencia, 0);
  assert.equal(grp(s, 'azul').sequencia, 0);
  assert.equal(grp(s, 'verde').sequencia, 2); // bloqueado: manteve
  // rodada vazia: ninguém perde sequência
  let t = novo();
  for (const g of t.grupos) g.sequencia = 2;
  t = jogar(t, []);
  assert.ok(t.grupos.every((g) => g.sequencia === 2));
  // clicou mas ficou fora dos dois primeiros: mantém
  let u = novo();
  u.grupos[2].sequencia = 2;
  u = jogar(u, ['vermelho', 'azul', 'verde'], ['e', 'e']);
  assert.equal(grp(u, 'verde').sequencia, 2);
});

test('estoque: a habilidade fica guardada (sem validade de uma rodada) até ser usada, mas não na rodada em que foi ganha', () => {
  let s = novo();
  dar(s, 'vermelho', 'dobro');
  for (let i = 0; i < 3; i++) s = fechar(jogar(s, ['azul'], ['c'])); // 3 rodadas sem ativar
  assert.deepEqual(estoque(s, 'vermelho'), ['dobro']);
  s = G.ativarHabilidade(s, 'vermelho', 'dobro'); // ainda vale na rodada 4
  assert.deepEqual(estoque(s, 'vermelho'), []);
  assert.throws(() => G.ativarHabilidade(novo(), 'vermelho', 'dobro'), /não tem/);
});

test('habilidade ativada é consumida mesmo sem pontos; uma por grupo por rodada', () => {
  let s = novo();
  dar(s, 'vermelho', 'dobro', 'bloqueio');
  s = G.ativarHabilidade(s, 'vermelho', 'dobro');
  assert.deepEqual(estoque(s, 'vermelho'), ['bloqueio']);
  assert.equal(s.rodada.usou.vermelho, 'dobro');
  assert.throws(() => G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'azul'), /Uma habilidade por grupo/);
  s = jogar(s, []);
  assert.deepEqual(estoque(s, 'vermelho'), ['bloqueio']); // o Dobro foi consumido sem pontos; o Bloqueio segue guardado
  assert.throws(() => G.ativarHabilidade(s, 'vermelho', 'escudo'), G.ErroJogo); // Escudo e Passe não se ativam antes da janela
});

test('ativações travam depois que a janela abre', () => {
  let s = novo();
  dar(s, 'vermelho', 'dobro');
  s = G.mostrarAlternativas(s);
  s = G.abrirJanela(s);
  assert.throws(() => G.ativarHabilidade(s, 'vermelho', 'dobro'), G.ErroJogo);
});

test('Bloqueio impede o clique do alvo; dois bloqueios no mesmo alvo não acumulam', () => {
  let s = novo();
  dar(s, 'vermelho', 'bloqueio');
  dar(s, 'azul', 'bloqueio');
  s = G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'verde');
  s = G.ativarHabilidade(s, 'azul', 'bloqueio', 'verde');
  s = G.abrirJanela(G.mostrarAlternativas(s));
  const antes = s;
  s = G.clicar(s, 'verde');
  assert.equal(s, antes);
  s = G.clicar(s, 'azul');
  s = G.clicar(s, 'vermelho'); // todos os não bloqueados clicaram: fecha sozinha
  assert.equal(s.fase, 'ordem');
  assert.deepEqual(s.rodada.ordem, ['azul', 'vermelho']);
  assert.throws(() => G.ativarHabilidade(dar(novo(), 'vermelho', 'bloqueio'), 'vermelho', 'bloqueio', 'vermelho'), G.ErroJogo);
});

// ---------- Escudo ----------
function bloquearComEscudo() {
  let s = novo(['vermelho', 'azul', 'verde']);
  dar(s, 'vermelho', 'bloqueio');
  dar(s, 'azul', 'escudo');
  return G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'azul');
}

test('Escudo: Bloqueio contra quem tem Escudo abre a decisão do grupo e trava a janela até decidir', () => {
  let s = bloquearComEscudo();
  assert.deepEqual(s.rodada.escudos, [{ atacante: 'vermelho', alvo: 'azul' }]);
  s = G.mostrarAlternativas(s);
  assert.throws(() => G.abrirJanela(s), /Escudo/);
  assert.throws(() => G.decidirEscudo(s, 'verde', 'vermelho', true), /pendente/); // sem decisão pendente para esse grupo
  // sem Escudo guardado, não há pergunta
  let t = novo();
  dar(t, 'vermelho', 'bloqueio');
  t = G.ativarHabilidade(t, 'vermelho', 'bloqueio', 'azul');
  assert.deepEqual(t.rodada.escudos, []);
});

test('Escudo usado: anula o Bloqueio e os dois são consumidos; o atacante gasta o uso da rodada; a sequência não muda', () => {
  let s = bloquearComEscudo();
  grp(s, 'azul').sequencia = 2;
  s = G.decidirEscudo(s, 'azul', 'vermelho', true);
  assert.deepEqual(estoque(s, 'azul'), []);
  assert.deepEqual(estoque(s, 'vermelho'), []);
  assert.equal(s.rodada.bloqueios.azul, undefined);
  assert.deepEqual(s.rodada.anulacoes, [{ atacante: 'vermelho', alvo: 'azul' }]);
  assert.equal(s.rodada.usou.vermelho, 'bloqueio'); // o uso conta para o atacante
  assert.equal(grp(s, 'azul').sequencia, 2);
  // azul consegue apertar
  s = G.abrirJanela(G.mostrarAlternativas(s));
  s = G.clicar(s, 'azul');
  assert.deepEqual(s.rodada.ordem, ['azul']);
});

test('Escudo guardado: o Bloqueio vale e o Escudo continua no estoque', () => {
  let s = bloquearComEscudo();
  s = G.decidirEscudo(s, 'azul', 'vermelho', false);
  assert.deepEqual(estoque(s, 'azul'), ['escudo']);
  assert.deepEqual(s.rodada.bloqueios.azul, ['vermelho']);
  s = G.abrirJanela(G.mostrarAlternativas(s));
  const antes = s;
  assert.equal(G.clicar(s, 'azul'), antes); // continua bloqueado
});

test('Escudo não altera a sequência: erro zera como sempre e o Escudo guardado não muda isso', () => {
  let s = novo(['vermelho', 'azul']);
  dar(s, 'azul', 'escudo');
  grp(s, 'azul').sequencia = 2;
  s = jogar(s, ['azul'], ['e']); // erra com o Escudo guardado
  assert.equal(grp(s, 'azul').sequencia, 0);
  assert.deepEqual(estoque(s, 'azul'), ['escudo']);
  // e acerto continua contando normalmente (o Escudo não é "uso")
  let t = novo(['vermelho', 'azul']);
  dar(t, 'azul', 'escudo');
  t = jogar(t, ['azul'], ['c']);
  assert.equal(grp(t, 'azul').sequencia, 1);
});

test('Escudo: dois Bloqueios no mesmo alvo continuam sem acumular; usar anula só o escolhido', () => {
  let s = novo(['vermelho', 'azul', 'verde']);
  dar(s, 'vermelho', 'bloqueio');
  dar(s, 'verde', 'bloqueio');
  dar(s, 'azul', 'escudo', 'escudo');
  s = G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'azul');
  s = G.ativarHabilidade(s, 'verde', 'bloqueio', 'azul');
  assert.equal(s.rodada.escudos.length, 2);
  s = G.decidirEscudo(s, 'azul', 'vermelho', true); // anula só o de vermelho
  assert.deepEqual(s.rodada.bloqueios.azul, ['verde']);
  s = G.decidirEscudo(s, 'azul', 'verde', false); // o de verde vale
  assert.deepEqual(s.rodada.bloqueios.azul, ['verde']);
  assert.deepEqual(estoque(s, 'azul'), ['escudo']);
});

test('Escudo: ao usar o único Escudo, os outros Bloqueios sobre o mesmo alvo são resolvidos sozinhos como "aceitou, sem Escudo"', () => {
  let s = novo(['vermelho', 'azul', 'verde']);
  dar(s, 'vermelho', 'bloqueio');
  dar(s, 'verde', 'bloqueio');
  dar(s, 'azul', 'escudo');
  s = G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'azul');
  s = G.ativarHabilidade(s, 'verde', 'bloqueio', 'azul');
  assert.equal(s.rodada.escudos.length, 2);
  s = G.decidirEscudo(s, 'azul', 'vermelho', true);
  assert.deepEqual(s.rodada.escudos, [], 'a decisão pendente contra verde foi resolvida sozinha');
  assert.deepEqual(s.rodada.bloqueios.azul, ['verde'], 'o Bloqueio de verde vale');
  assert.deepEqual(estoque(s, 'azul'), []);
  assert.ok(s.log.some((l) => /azul aceitou o Bloqueio de verde, sem Escudo/.test(l.msg)));
  s = G.mostrarAlternativas(s);
  assert.equal(G.abrirJanela(s).fase, 'janela', 'a janela não espera mais decisão');
});

test('Escudo: com dois Escudos, usar um ainda pergunta pelos outros Bloqueios sobre o mesmo alvo', () => {
  let s = novo(['vermelho', 'azul', 'verde']);
  dar(s, 'vermelho', 'bloqueio');
  dar(s, 'verde', 'bloqueio');
  dar(s, 'azul', 'escudo', 'escudo');
  s = G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'azul');
  s = G.ativarHabilidade(s, 'verde', 'bloqueio', 'azul');
  s = G.decidirEscudo(s, 'azul', 'vermelho', true);
  assert.deepEqual(s.rodada.escudos, [{ atacante: 'verde', alvo: 'azul' }]);
});

// ---------- Passe ----------
test('Passe: só o 1º respondente usa; não é erro nem tentativa; o 2º responde com as 4 alternativas e ganha 5', () => {
  let s = novo(['vermelho', 'azul', 'verde']);
  dar(s, 'vermelho', 'passe');
  grp(s, 'vermelho').sequencia = 2;
  s = G.abrirJanela(G.mostrarAlternativas(s));
  for (const c of ['vermelho', 'azul']) s = G.clicar(s, c);
  s = G.encerrarJanela(s);
  s = G.mostrarResposta(s);
  assert.equal(G.respondenteAtual(s), 'vermelho');
  assert.throws(() => G.usarPasse(dar(novo(), 'azul', 'passe')), G.ErroJogo); // fora da fase de resposta
  s = G.usarPasse(s);
  assert.deepEqual(estoque(s, 'vermelho'), []);
  assert.equal(s.rodada.usou.vermelho, 'passe');
  assert.equal(s.rodada.tentativas.length, 0, 'o Passe não é tentativa');
  assert.deepEqual(s.rodada.erradas, [], 'as 4 alternativas continuam disponíveis');
  assert.equal(G.respondenteAtual(s), 'azul');
  assert.throws(() => G.usarPasse(s), G.ErroJogo); // o 2º não pode usar (e não há mais Passe)
  s = G.responder(s, correta(s));
  assert.equal(pts(s, 'azul'), 5, 'o 2º ganha 5, não 10');
  assert.equal(grp(s, 'vermelho').sequencia, 2, 'quem passou mantém a sequência');
  assert.equal(s.respondidas, 1);
  assert.equal(s.fase, 'explicacao');
});

test('Passe: depois do 2º a rodada acaba (não chama o 3º); o 2º errando encerra só com a correta', () => {
  let s = novo(['vermelho', 'azul', 'verde']);
  dar(s, 'vermelho', 'passe');
  s = jogar(s, ['vermelho', 'azul', 'verde'], []);
  s = G.usarPasse(s);
  s = G.responder(s, correta(s) === 1 ? 2 : 1); // o 2º erra
  assert.equal(s.fase, 'so_correta'); // só um tentou e errou: só a alternativa correta
  assert.equal(s.respondidas, 1);
  assert.equal(grp(s, 'verde').sequencia, 0);
  assert.equal(pts(s, 'verde'), 0);
});

test('Passe sem 2º respondente: usarPasse falha, o Passe não é consumido e o 1º ainda responde', () => {
  let s = novo(['vermelho', 'azul']);
  dar(s, 'vermelho', 'passe');
  s = jogar(s, ['vermelho'], []); // só vermelho apertou
  assert.equal(s.fase, 'resposta');
  assert.throws(() => G.usarPasse(s), /Não há 2º respondente para receber a vez/);
  assert.deepEqual(estoque(s, 'vermelho'), ['passe'], 'o Passe continua guardado');
  assert.equal(s.rodada.usou.vermelho, undefined);
  s = G.semResposta(s); // o 1º ainda pode responder (ou ficar sem resposta)
  assert.equal(s.fase, 'so_correta');
  assert.equal(s.respondidas, 1);
});

test('Passe: uma habilidade por rodada (não combina com Dobro ou Bloqueio ativados) e some do estoque', () => {
  let s = novo(['vermelho', 'azul']);
  dar(s, 'vermelho', 'dobro', 'passe');
  s = G.ativarHabilidade(s, 'vermelho', 'dobro');
  s = jogar(s, ['vermelho', 'azul'], []);
  assert.throws(() => G.usarPasse(s), /Uma habilidade por grupo/);
  // sem o Passe guardado
  let t = jogar(novo(['vermelho', 'azul']), ['vermelho', 'azul'], []);
  assert.throws(() => G.usarPasse(t), /não tem o Passe/);
  // desqualificação do 1º continua dando 10 ao 2º (sem Passe)
  t = G.desqualificar(t);
  t = G.responder(t, correta(t));
  assert.equal(pts(t, 'azul'), 10);
});

test('Passe: o Escudo não conta como uso da rodada (pode usar o Passe depois de usar o Escudo)', () => {
  let s = novo(['vermelho', 'azul', 'verde']);
  dar(s, 'vermelho', 'bloqueio');
  dar(s, 'azul', 'escudo', 'passe');
  s = G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'azul');
  s = G.decidirEscudo(s, 'azul', 'vermelho', true);
  assert.equal(s.rodada.usou.azul, undefined);
  s = jogar(s, ['azul', 'verde'], []);
  s = G.usarPasse(s);
  assert.equal(G.respondenteAtual(s), 'verde');
});

test('nenhuma habilidade vale no desempate', () => {
  let s = novo(['vermelho', 'azul'], { meta: 1 });
  s = jogar(s, ['vermelho'], ['c']);
  s = fechar(s);
  assert.equal(s.fase, 'ranking');
  s = ajustarPontosTeste(s, 'azul', grp(s, 'vermelho').pontos); // empata (a rodada final dobrou os pontos de vermelho)
  dar(s, 'vermelho', 'dobro', 'passe');
  dar(s, 'azul', 'bloqueio');
  s = G.iniciarDesempate(s);
  assert.throws(() => G.ativarHabilidade(s, 'azul', 'bloqueio', 'vermelho'), /desempate/);
  s = jogar(s, ['vermelho', 'azul'], []);
  assert.throws(() => G.usarPasse(s), /desempate/);
});

// ---------- jogo salvo na versão anterior ----------
test('migrarEstado: jogo salvo da versão anterior (uma habilidade, ofertaBloqueio) vira estoque, sem oferta, e segue funcionando', () => {
  let s = novo(['vermelho', 'azul']);
  const antigo = JSON.parse(JSON.stringify(s));
  for (const e of [antigo]) {
    for (const g of e.grupos) { delete g.habilidades; delete g.oferta; g.habilidade = null; g.ofertaBloqueio = false; }
    delete e.versao;
    delete e.config.estoqueMax;
    delete e.rodada.usou; delete e.rodada.escudos; delete e.rodada.anulacoes; delete e.rodada.pulos; delete e.rodada.passes; delete e.rodada.ganhos;
  }
  antigo.grupos[0].habilidade = { tipo: 'dobro', validaNaRodada: 1 };
  antigo.grupos[1].ofertaBloqueio = true;
  antigo.grupos[1].sequencia = 3;
  antigo.rodada.ativacoes = { azul: { tipo: 'bloqueio', alvo: 'vermelho' } };
  antigo._undo = [JSON.parse(JSON.stringify(antigo))];
  const m = G.migrarEstado(antigo);
  assert.equal(m.versao, G.VERSAO);
  assert.deepEqual(estoque(m, 'vermelho'), ['dobro']);
  assert.deepEqual(grp(m, 'azul').habilidades, []);
  assert.equal(grp(m, 'azul').oferta, undefined, 'não há mais oferta');
  assert.equal(grp(m, 'azul').sequencia, 3, 'a sequência é mantida');
  assert.equal(m.rodada.usou.azul, 'bloqueio');
  assert.equal(m.config.estoqueMax, 2);
  assert.ok(m.grupos.every((g) => !('habilidade' in g) && !('ofertaBloqueio' in g)));
  assert.ok(m._undo.every((u) => Array.isArray(u.grupos[0].habilidades)), 'o histórico de desfazer também é convertido');
  // continua funcionando: trocar os 3 acertos, ativar o Dobro guardado e jogar
  let t = G.trocarAcertos(m, 'azul', 'bloqueio');
  assert.deepEqual(estoque(t, 'azul'), ['bloqueio']);
  t = G.ativarHabilidade(t, 'vermelho', 'dobro');
  t = jogar(t, ['vermelho'], ['c']);
  assert.equal(pts(t, 'vermelho'), 20);
  // idempotente
  assert.deepEqual(G.migrarEstado(m), m);
});

test('clique duplicado, fora da janela e em pausa são ignorados', () => {
  let s = novo();
  assert.equal(G.clicar(s, 'azul'), s);
  s = G.abrirJanela(G.mostrarAlternativas(s));
  s = G.pausar(s);
  assert.equal(G.clicar(s, 'azul'), s);
  s = G.pausar(s, false);
  s = G.clicar(s, 'azul');
  assert.equal(G.clicar(s, 'azul'), s);
  assert.deepEqual(s.rodada.ordem, ['azul']);
});

test('rodada sem tentativas não conta; jogo termina na meta ou ao esgotar perguntas', () => {
  let s = novo(['vermelho', 'azul'], { meta: 2 });
  s = jogar(s, []);
  assert.equal(s.respondidas, 0);
  assert.equal(s.rodada.desfecho, 'so_correta');
  s = G.continuar(s);
  s = jogar(s, ['vermelho'], ['c']);
  assert.equal(s.respondidas, 1);
  s = G.continuar(s);
  assert.equal(s.fase, 'pergunta');
  s = jogar(s, ['vermelho'], ['e']);
  assert.equal(s.respondidas, 2);
  assert.equal(G.continuar(s).fase, 'ranking');
  // esgotar perguntas
  let t = novo(['vermelho', 'azul'], { meta: 14 }, 2);
  t = G.continuar(jogar(t, []));
  t = G.continuar(jogar(t, []));
  assert.equal(t.fase, 'ranking');
});

test('desfecho: explicação só com acerto ou duas tentativas erradas', () => {
  assert.equal(jogar(novo(), ['vermelho'], ['c']).fase, 'explicacao');
  assert.equal(jogar(novo(), ['vermelho', 'azul'], ['e', 'e']).fase, 'explicacao');
  assert.equal(jogar(novo(), []).fase, 'so_correta');
  assert.equal(jogar(novo(), ['vermelho'], ['e']).fase, 'so_correta');
  assert.equal(jogar(novo(), ['vermelho'], ['d']).fase, 'so_correta');
});

test('rodada final em dobro: marcada com 13 respondidas, mantida sem tentativa, multiplica com Dobro', () => {
  let s = novo(['vermelho', 'azul']);
  for (let i = 0; i < 12; i++) s = G.continuar(jogar(s, ['vermelho'], ['e']));
  assert.equal(s.respondidas, 12);
  assert.equal(s.rodada.final, false);
  s = G.continuar(jogar(s, ['vermelho'], ['e']));
  assert.equal(s.respondidas, 13);
  assert.equal(s.rodada.final, true);
  s = G.continuar(jogar(s, [])); // ninguém tentou: continua final
  assert.equal(s.respondidas, 13);
  assert.equal(s.rodada.final, true);
  assert.equal(pts(s, 'vermelho'), 0);
  dar(s, 'vermelho', 'dobro');
  s = G.ativarHabilidade(s, 'vermelho', 'dobro');
  s = jogar(s, ['vermelho', 'azul'], ['c']);
  assert.equal(pts(s, 'vermelho'), 40);
});

test('rodada final: 20 e 10 sem Dobro', () => {
  let t = G.criarJogo({ perguntas: banco() });
  t = G.registrarGrupo(G.registrarGrupo(t, 'vermelho', 'a'), 'azul', 'b');
  t = G.iniciar(t);
  t.respondidas = 13;
  t = G.continuar(jogar(t, []));
  assert.equal(t.rodada.final, true);
  t = jogar(t, ['vermelho', 'azul'], ['e', 'c']);
  assert.equal(pts(t, 'azul'), 10);
  let u = G.criarJogo({ perguntas: banco() });
  u = G.iniciar(G.registrarGrupo(G.registrarGrupo(u, 'vermelho', 'a'), 'azul', 'b'));
  u.respondidas = 13;
  u = G.continuar(jogar(u, []));
  u = jogar(u, ['vermelho', 'azul'], ['c']);
  assert.equal(pts(u, 'vermelho'), 20);
});

test('desempate: vence o primeiro a acertar, só entre empatados, sem pontos nem dobro', () => {
  let s = novo(['vermelho', 'azul', 'verde'], { meta: 1 });
  s = jogar(s, ['vermelho'], ['c']);
  s = ajustarPontosTeste(s, 'azul', 20); // vermelho fez 20 na rodada final
  s = ajustarPontosTeste(s, 'verde', 3);
  s = G.continuar(s);
  assert.equal(s.fase, 'ranking');
  assert.deepEqual(G.empatadosNoTopo(s), ['vermelho', 'azul']);
  assert.equal(G.vencedor(s), null);
  assert.throws(() => G.proximo(s), G.ErroJogo);
  s = G.iniciarDesempate(s);
  assert.equal(s.rodada.perguntaId, 99); // reserva
  assert.equal(s.rodada.final, false);
  s = G.mostrarAlternativas(s);
  s = G.abrirJanela(s);
  assert.equal(G.clicar(s, 'verde'), s); // fora do desempate
  s = G.clicar(s, 'azul');
  s = G.clicar(s, 'vermelho');
  s = G.mostrarResposta(s);
  s = G.responder(s, 0); // errada (correta é 3)
  s = G.responder(s, 3);
  assert.equal(G.vencedor(s), 'vermelho');
  assert.equal(pts(s, 'vermelho'), 20);
  assert.equal(pts(s, 'azul'), 20);
  s = G.continuar(s);
  assert.equal(s.fase, 'ranking');
  assert.equal(G.proximo(s).fase, 'final');
});

test('desempate sem acerto permite repetir com outra pergunta', () => {
  let s = novo(['vermelho', 'azul'], { meta: 1 });
  s = jogar(s, [], []);
  s = G.continuar(s);
  s = jogar(s, [], []);
  s = G.continuar(s);
  // meta 1 e ninguém respondeu: segue até acabar o banco; força ranking
  s.fase = 'ranking';
  s.rodada.desempate = false;
  s = G.iniciarDesempate(s);
  const primeira = s.rodada.perguntaId;
  s = G.continuar(jogar(s, ['vermelho', 'azul'], ['e', 'e']));
  assert.equal(G.vencedor(s), null);
  s = G.iniciarDesempate(s);
  assert.notEqual(s.rodada.perguntaId, primeira);
});

test('desfazer restaura o estado anterior', () => {
  const s0 = novo();
  const s1 = G.mostrarAlternativas(s0);
  const s2 = G.abrirJanela(s1);
  const volta = G.desfazer(s2);
  assert.equal(volta.fase, 'alternativas');
  assert.equal(G.desfazer(volta).fase, 'pergunta');
  let s = s0;
  for (let i = 0; i < 25; i++) s = G.pausar(s, i % 2 === 0);
  assert.equal(s._undo.length, 20);
  assert.throws(() => G.desfazer(G.criarJogo()), G.ErroJogo);
});

test('começar exige 2 grupos conectados; desconectados ficam de fora', () => {
  let s = G.criarJogo({ perguntas: banco() });
  s = G.registrarGrupo(s, 'vermelho', 'a');
  assert.throws(() => G.iniciar(s), G.ErroJogo);
  s = G.registrarGrupo(G.registrarGrupo(s, 'azul', 'b'), 'verde', 'c');
  s = G.definirConectado(s, 'verde', false);
  s = G.iniciar(s);
  assert.deepEqual(s.grupos.map((g) => g.cor), ['vermelho', 'azul']);
});

test('estado anterior nunca é mutado e novoJogo zera tudo', () => {
  const s0 = novo();
  const s1 = G.mostrarAlternativas(s0);
  assert.equal(s0.fase, 'pergunta');
  assert.equal(s1.fase, 'alternativas');
  let s = jogar(s0, ['vermelho'], ['c']);
  const n = G.novoJogo(s);
  assert.equal(n.fase, 'espera');
  assert.equal(pts(n, 'vermelho'), 0);
  assert.equal(n.grupos.length, 3);
});
