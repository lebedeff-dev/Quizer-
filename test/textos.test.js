'use strict';
// Textos da interface (8b-2): os do pedido, palavra por palavra, com os números padrão.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const carregar = () => import(pathToFileURL(path.join(__dirname, '..', 'public', 'shared', 'textos.js')).href);

test('textos padrão das habilidades, da troca de acertos e da Aposta batem com o pedido', async () => {
  const T = await carregar();
  assert.equal(T.resumoEscada({}), 'Cada acerto seguido vale uma marca, até 7. Com 3 marcas já dá para trocar por Bloqueio, Escudo ou Passe. Com 5, também pelo Dobro. Com 7, também pela Dica 50/50. Trocar zera as marcas e só vale antes da janela de 30 s.');
  assert.equal(T.CELULAR.acertos(5, 7), 'Acertos seguidos: 5 de 7');
  assert.equal(T.CELULAR.trocarBotao, 'Trocar acertos por habilidade');
  assert.equal(T.CELULAR.trocarConfirma(5, 'Dobro'), 'Trocar 5 acertos por Dobro? A sequência volta a zero.');
  assert.equal(T.CELULAR.estoqueCheio, 'O estoque está cheio. Qual habilidade guardada será trocada?');
  assert.equal(T.textoOferta, undefined, 'não existe mais oferta');
  const d = T.descricoes({ pontosSegundo: 5 });
  assert.equal(d.bloqueio, 'Tira um grupo da disputa: ele não poderá responder 1 rodada.');
  assert.equal(d.escudo, 'Protege contra Bloqueio. Se alguém bloquear o grupo, ele decide se usa o Escudo para anular.');
  assert.equal(d.passe, 'Se for o primeiro a responder e não souber, passa a vez ao segundo, sem perder a sequência. O segundo recebe 5 pontos.');
  assert.equal(d.dobro, 'Pontos em dobro por 1 rodada.');
  assert.equal(d.dica5050, 'Retira uma alternativa errada, deixando só duas opções. Vale apenas para o segundo a responder.');
  const a = T.textosAposta({});
  assert.equal(a.introducao, 'O grupo arrisca para ganhar mais. Só é cobrada se o grupo responder; se não apertar, nada é cobrado. Errar, ser desqualificado ou dizer ‘Sem resposta’ conta como erro. Escolha como pagar:');
  assert.equal(a.habilidades, 'O grupo entrega 2 habilidades guardadas. Se acertar, ganha +10 pontos de bônus além dos pontos da rodada. Se errar, perde 5 pontos.');
  assert.equal(a.pontos, 'O grupo paga 10 pontos. Se acertar, os pontos da rodada valem 3 vezes. Exemplo: o primeiro acerta, 10 × 3 = 30, menos os 10 pagos = +20. Se errar, perde os 10 pontos pagos. Não vale na rodada final.');
});

test('os textos acompanham a configuração e o sinal de menos é o legível', async () => {
  const T = await carregar();
  const a = T.textosAposta({ apostaCusto: 4, apostaMult: 2, apostaTrocaQtd: 1, apostaTrocaBonus: 7, apostaTrocaPenal: 3, pontosPrimeiro: 8 });
  assert.match(a.pontos, /paga 4 pontos.*valem 2 vezes.*8 × 2 = 16, menos os 4 pagos = \+12/);
  assert.match(a.habilidades, /entrega 1 habilidade guardada.*\+7 pontos.*perde 3 pontos/);
  assert.equal(T.descricoes({ pontosSegundo: 4 }).passe.includes('recebe 4 pontos'), true);
  assert.equal(T.pontosComSinal(-5), '−5');
  assert.equal(T.pontosComSinal(5), '+5');
  assert.equal(T.pontosComSinal(0), '0');
  assert.equal(T.pontosTotal(-12), '−12');
  assert.equal(T.pontosTotal(12), '12');
  assert.equal('−'.charCodeAt(0), 0x2212);
});
