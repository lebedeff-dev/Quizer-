'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../src/perguntas');

const REAIS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'perguntas.json'), 'utf8')).perguntas.map(P.sanitizar);

const nova = (id, extra = {}) => ({
  id, tipo: 'facil', enunciado: `Pergunta ${id}`, alternativas: ['a', 'b', 'c', 'd'], correta: 1, explicacao: 'e', reserva: false, ...extra,
});

test('validação: enunciado, 4 alternativas e uma correta', () => {
  assert.deepEqual(P.problemas(P.sanitizar(nova(1))), []);
  assert.deepEqual(P.problemas(P.sanitizar(nova(1, { enunciado: '  ' }))), ['Falta o enunciado']);
  assert.deepEqual(P.problemas(P.sanitizar(nova(1, { alternativas: ['a', 'b', '', 'd'] }))), ['Falta a alternativa C']);
  assert.deepEqual(P.problemas(P.sanitizar(nova(1, { correta: null }))), ['Marque a alternativa correta']);
  assert.deepEqual(P.problemas(P.sanitizar(nova(1, { correta: 7 }))), ['Marque a alternativa correta']);
  assert.ok(P.problemas(P.sanitizar(nova(1, { tipo: 'dificil' }))).some((x) => /Tipo/.test(x)));
  const r = P.resumoLista([P.sanitizar(nova(1)), P.sanitizar(nova(2, { enunciado: '' })), P.sanitizar(nova(3, { reserva: true }))]);
  assert.deepEqual(r, { total: 3, validas: 2, invalidas: 1, doBanco: 2, temReserva: true });
});

test('as 26 perguntas provisórias são válidas, com 25 no banco e 1 reserva', () => {
  const r = P.resumoLista(REAIS);
  assert.equal(r.total, 26);
  assert.equal(r.invalidas, 0);
  assert.equal(r.doBanco, 25);
  assert.equal(r.temReserva, true);
});

test('exportar e importar de volta devolve as mesmas perguntas', () => {
  const texto = JSON.stringify(P.exportar(REAIS), null, 2);
  const a = P.analisarImportacao(texto);
  assert.equal(a.ok, true);
  assert.equal(a.total, 26);
  assert.equal(a.validas, 26);
  assert.deepEqual(a.perguntas, REAIS);
  const r = P.aplicarImportacao([nova(900), nova(901)], a, 'substituir');
  assert.deepEqual(r.lista, REAIS); // inclusive ids e ordem
});

test('arquivo inválido mostra erros e não aplica nada', () => {
  const casos = [
    'isto não é json',
    '{}',
    '[]',
    '{"perguntas": "x"}',
    '{"perguntas": []}',
    '{"perguntas": [1, "a"]}',
    JSON.stringify({ perguntas: [nova(1, { reserva: true }), nova(2, { reserva: true })] }),
  ];
  for (const c of casos) {
    const a = P.analisarImportacao(c);
    assert.equal(a.ok, false, c);
    assert.ok(a.erros.length > 0, c);
    assert.deepEqual(P.aplicarImportacao([nova(1)], a, 'substituir'), { erro: 'Arquivo inválido.' });
  }
});

test('perguntas incompletas entram como rascunho, com os problemas de cada uma', () => {
  const a = P.analisarImportacao(JSON.stringify({ perguntas: [nova(1), { id: 2, enunciado: 'Só o enunciado' }, nova(3, { correta: null })] }));
  assert.equal(a.ok, true);
  assert.equal(a.total, 3);
  assert.equal(a.validas, 1);
  assert.equal(a.itens[1].posicao, 2);
  assert.ok(a.itens[1].problemas.length >= 4);
  assert.deepEqual(a.itens[2].problemas, ['Marque a alternativa correta']);
});

test('Substituir troca tudo; ids repetidos no arquivo são renumerados', () => {
  const a = P.analisarImportacao(JSON.stringify({ perguntas: [nova(5), nova(5), nova(9)] }));
  const r = P.aplicarImportacao([nova(1), nova(2)], a, 'substituir');
  assert.deepEqual(r.lista.map((p) => p.id), [1, 2, 3]);
  assert.equal(r.lista.length, 3);
});

test('Acrescentar mantém as atuais e põe as novas no fim, com ids novos', () => {
  const atuais = [nova(1), nova(2, { reserva: true })];
  const a = P.analisarImportacao(JSON.stringify({ perguntas: [nova(1), nova(7)] }));
  const r = P.aplicarImportacao(atuais, a, 'acrescentar');
  assert.deepEqual(r.lista.map((p) => p.id), [1, 2, 3, 4]);
  assert.deepEqual(r.lista.slice(0, 2), atuais);
  assert.equal(r.lista[2].enunciado, 'Pergunta 1');
});

test('apenas uma reserva: acrescentar rebaixa a reserva do arquivo; a lista do editor é recusada com duas', () => {
  const atuais = [nova(1, { reserva: true })];
  const a = P.analisarImportacao(JSON.stringify({ perguntas: [nova(2, { reserva: true })] }));
  const r = P.aplicarImportacao(atuais, a, 'acrescentar');
  assert.equal(r.lista.filter((p) => p.reserva).length, 1);
  assert.equal(r.avisos.length, 1);
  // sem reserva atual, a do arquivo entra como reserva
  const r2 = P.aplicarImportacao([nova(1)], a, 'acrescentar');
  assert.equal(r2.lista.filter((p) => p.reserva).length, 1);
  assert.ok(P.validarLista([nova(1, { reserva: true }), nova(2, { reserva: true })]).erro);
});

test('lista do editor: ids obrigatórios e únicos', () => {
  assert.ok(P.validarLista('x').erro);
  assert.ok(P.validarLista([nova(1), nova(1)]).erro);
  assert.ok(P.validarLista([{ ...nova(1), id: null }]).erro);
  const ok = P.validarLista([nova(1), nova(2, { enunciado: '' })]); // rascunho é permitido
  assert.equal(ok.lista.length, 2);
});
