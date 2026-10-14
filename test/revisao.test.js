'use strict';
const { ajustarPontosTeste } = require('./ajuda');
// Revisão final (Etapa 8): casos de borda das seções 5 e 6 que cruzam regras, e os critérios de aceite
// "sem som" e "sem chamadas de rede para fora" no front-end.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../src/game.js');

function banco(n = 20) {
  const ps = [];
  for (let i = 1; i <= n; i += 1) ps.push({ id: i, tipo: 'facil', enunciado: `P${i}`, alternativas: ['a', 'b', 'c', 'd'], correta: 0, explicacao: 'x', reserva: false });
  ps.push({ id: 99, tipo: 'atencao', enunciado: 'R', alternativas: ['a', 'b', 'c', 'd'], correta: 3, explicacao: 'x', reserva: true });
  return ps;
}
function novo(cores = ['vermelho', 'azul', 'verde'], config = {}) {
  let s = G.criarJogo({ config: { placarModo: 'desligado', ...config }, perguntas: banco() });
  for (const c of cores) s = G.registrarGrupo(s, c, `rep-${c}`);
  return G.iniciar(s);
}
const grp = (s, cor) => s.grupos.find((g) => g.cor === cor);
const correta = (s) => s.perguntas.find((p) => p.id === s.rodada.perguntaId).correta;
// Abre a janela, aplica os cliques e responde. respostas: 'c' certa, 'e' errada.
function rodada(s, cliques, respostas = []) {
  if (s.fase === 'pergunta') s = G.mostrarAlternativas(s);
  s = G.abrirJanela(s);
  for (const c of cliques) s = G.clicar(s, c);
  if (s.fase === 'janela') s = G.encerrarJanela(s);
  if (s.fase !== 'ordem') return s;
  s = G.mostrarResposta(s);
  for (const r of respostas) {
    if (s.fase !== 'resposta') break;
    s = G.responder(s, r === 'c' ? correta(s) : [1, 2, 3].find((i) => !s.rodada.erradas.includes(i)));
  }
  return s;
}
const fechar = (s) => {
  return G.continuar(s);
};

test('5.3: perguntas na ordem da lista; a janela fecha quando todos os aptos apertaram (e não antes)', () => {
  let s = novo();
  assert.equal(s.rodada.perguntaId, 1);
  s = G.abrirJanela(G.mostrarAlternativas(s));
  s = G.clicar(s, 'vermelho');
  s = G.clicar(s, 'azul');
  assert.equal(s.fase, 'janela'); // verde ainda pode apertar
  s = G.clicar(s, 'verde');
  assert.equal(s.fase, 'ordem');
  s = G.mostrarResposta(s);
  s = G.responder(s, 0);
  s = G.continuar(s);
  assert.equal(s.rodada.perguntaId, 2);
});

test('6: sequência só zera com erro; bloqueado e 3º colocado mantêm', () => {
  let s = novo(['vermelho', 'azul', 'verde']);
  s = rodada(s, ['azul'], ['c']); // azul: 1
  s = fechar(s);
  s = rodada(s, ['azul'], ['c']); // azul: 2
  s = fechar(s);
  assert.equal(grp(s, 'azul').sequencia, 2);

  // Rodada 3: vermelho bloqueia... precisa de habilidade; usa o ganho natural em jogo separado abaixo.
  // Aqui: azul não aperta (fica fora) e mantém; verde chega em 3º e não responde (só 2 tentativas) e mantém.
  s = G.abrirJanela(G.mostrarAlternativas(s));
  for (const c of ['vermelho', 'verde', 'azul']) s = G.clicar(s, c);
  s = G.mostrarResposta(s);
  s = G.responder(s, correta(s)); // vermelho 1º acerta
  assert.equal(grp(s, 'azul').sequencia, 2, 'azul em 3º: não respondeu, mantém');
  assert.equal(grp(s, 'verde').sequencia, 0);
  assert.equal(grp(s, 'vermelho').sequencia, 1);
});

test('6: bloqueado não zera a sequência (mantém) e o alvo não pode ser o próprio grupo', () => {
  // vermelho acerta 3 seguidas e aceita o Bloqueio; azul tinha 2 acertos antes (sequência 2)
  let s = novo(['vermelho', 'azul']);
  s = rodada(s, ['azul'], ['c']); s = fechar(s); // azul 1
  s = rodada(s, ['azul'], ['c']); s = fechar(s); // azul 2
  for (let i = 0; i < 3; i += 1) { s = rodada(s, ['vermelho'], ['c']); if (i < 2) s = fechar(s); }
  s = G.trocarAcertos(s, 'vermelho', 'bloqueio');
  s = G.continuar(s);
  assert.throws(() => G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'vermelho'), G.ErroJogo);
  s = G.ativarHabilidade(s, 'vermelho', 'bloqueio', 'azul');
  s = rodada(s, ['azul', 'vermelho'], ['c']); // azul tenta apertar, mas está bloqueado
  assert.deepEqual(s.rodada.ordem, ['vermelho']);
  assert.equal(grp(s, 'azul').sequencia, 3 - 1 + 0, 'azul já tinha 2 e fica com 2 (mantém, sem erro)');
});

test('5: desqualificar o 1º e o 2º errar encerra com explicação; as duas tentativas contam como respondida', () => {
  let s = novo(['vermelho', 'azul']);
  s = G.abrirJanela(G.mostrarAlternativas(s));
  s = G.clicar(s, 'vermelho'); s = G.clicar(s, 'azul');
  s = G.mostrarResposta(s);
  s = G.desqualificar(s);
  s = G.responder(s, 1);
  assert.equal(s.fase, 'explicacao');
  assert.equal(s.respondidas, 1);
  assert.equal(grp(s, 'vermelho').pontos + grp(s, 'azul').pontos, 0);
});

test('6: os limites de sequência vêm da configuração', () => {
  let s = novo(['vermelho', 'azul'], { seqBloqueio: 2, seqDobro: 4 });
  s = rodada(s, ['vermelho'], ['c']); s = fechar(s);
  s = rodada(s, ['vermelho'], ['c']);
  assert.equal(grp(s, 'vermelho').sequencia, 2); // 2 acertos já permitem trocar por Bloqueio, Escudo ou Passe
  assert.deepEqual(G.opcoesDaSequencia(s.config, 2), ['bloqueio', 'escudo', 'passe']);
  assert.equal(G.trocarAcertos(s, 'vermelho', 'escudo').grupos[0].habilidades[0].tipo, 'escudo');
});

test('7: o vencedor é o de maior pontuação entre os ELEGÍVEIS; empate só entre elegíveis', () => {
  let s = novo(['vermelho', 'azul', 'verde'], { meta: 2 });
  s = rodada(s, ['vermelho'], ['c']); s = fechar(s);
  s = rodada(s, ['azul'], ['c']); s = fechar(s); // 2 respondidas: ranking
  assert.equal(s.fase, 'ranking'); // a 2ª rodada era a final (em dobro): azul tem 20 e vermelho 10
  assert.equal(grp(s, 'azul').pontos, 20);
  s = ajustarPontosTeste(s, 'vermelho', 15); // vermelho 25, azul 20
  assert.equal(G.vencedor(s), 'vermelho');
  s = G.definirElegivel(s, 'vermelho', false);
  assert.equal(G.vencedor(s), 'azul', 'o grupo não elegível não leva o prêmio');
  s = G.definirElegivel(s, 'verde', true);
  s = ajustarPontosTeste(s, 'verde', 20); // verde 20, azul 20
  assert.deepEqual([...G.empatadosNoTopo(s)].sort(), ['azul', 'verde']);
  assert.equal(G.vencedor(s), null);
  assert.throws(() => G.proximo(s), G.ErroJogo, 'empate pendente exige desempate');
});

// ---------- critérios de aceite do front-end ----------
function arquivos(dir, exts) {
  const out = [];
  for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, nome.name);
    if (nome.isDirectory()) out.push(...arquivos(p, exts));
    else if (exts.includes(path.extname(nome.name))) out.push(p);
  }
  return out;
}
const PUBLIC = path.join(__dirname, '..', 'public');

test('aceite: nenhuma chamada de rede para fora e nenhuma API de som no front-end', () => {
  for (const f of arquivos(PUBLIC, ['.js', '.html', '.css'])) {
    const texto = fs.readFileSync(f, 'utf8');
    const rel = path.relative(PUBLIC, f);
    // http(s):// só como namespace SVG ou como o endereço local montado em tempo de execução
    const externos = (texto.match(/https?:\/\/[^\s'"`)<>]+/g) || []).filter((u) => !/^http:\/\/www\.w3\.org\//.test(u) && !/^http:\/\/\$\{/.test(u));
    assert.deepEqual(externos, [], `${rel}: endereço externo`);
    assert.doesNotMatch(texto, /\bAudioContext\b|new Audio\(|<audio|\.play\(\)|speechSynthesis/, `${rel}: som`);
    assert.doesNotMatch(texto, /@import\s+url|fonts\.googleapis|fonts\.gstatic|\/\/cdn\./i, `${rel}: recurso externo`);
  }
  // as fontes e imagens são servidas pelo próprio servidor
  for (const png of ['proximo.png', 'bloqueio.png', 'dobro-x2.png']) assert.ok(fs.existsSync(path.join(PUBLIC, 'assets', png)), png);
});
