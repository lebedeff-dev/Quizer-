'use strict';
// Nome de exibição de cada grupo (Etapa 8k-1b): o nome que o grupo digitou no celular (guardado em `representante`).
// Nome vazio ou igual ao de outro grupo ganha um nome único de reserva: "Grupo Vermelho" (vazio) ou "Ana (2)" (repetido).
// Puro: o servidor calcula e manda pronto para as telas; o texto do Registro usa a mesma função.
const NOMES_COR = {
  vermelho: 'Vermelho', azul: 'Azul', verde: 'Verde', amarelo: 'Amarelo', laranja: 'Laranja',
  roxo: 'Roxo', rosa: 'Rosa', ciano: 'Ciano', preto: 'Preto', cinza: 'Cinza',
};

// O time de id "preto" aparece como "Branco" no tema noturno. Texto gravado (Registro) leva a MARCA no lugar do nome desse time
// e a troca pelo nome do tema atual só na hora de mostrar (exibir em registro.js); o id nunca muda.
const MARCA_PRETO = '\u2063PRETO\u2063';
function nomeDaCor(cor, tema = 'claro') {
  if (cor === 'preto') return tema === 'noturno' ? 'Branco' : tema === 'marcador' ? MARCA_PRETO : 'Preto';
  return NOMES_COR[cor] || cor;
}

const limpar = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

// { cor: nome } na ordem em que os grupos estão na lista (a ordem de entrada); o 1º a usar um nome fica com ele.
function nomesDosGrupos(grupos = [], tema = 'claro') {
  const usados = new Set();
  const nomes = {};
  for (const g of grupos) {
    const base = limpar(g.representante) || `Grupo ${nomeDaCor(g.cor, tema)}`;
    let nome = base;
    let n = 1;
    while (usados.has(nome.toLowerCase())) {
      n += 1;
      nome = `${base} (${n})`;
    }
    usados.add(nome.toLowerCase());
    nomes[g.cor] = nome;
  }
  return nomes;
}

module.exports = { nomesDosGrupos, nomeDaCor, MARCA_PRETO, NOMES_COR, limpar };
