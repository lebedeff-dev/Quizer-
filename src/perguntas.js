'use strict';
// Regras do banco de perguntas: validação, exportação e importação. Sem acesso a disco ou rede.

const TIPOS = ['facil', 'atencao'];
const LETRAS = ['A', 'B', 'C', 'D'];
const META_BANCO = 25; // perguntas do banco, fora a reserva
const META_TOTAL = META_BANCO + 1;
const LIMITES = { enunciado: 400, alternativa: 200, explicacao: 1000 };

const texto = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);

// Normaliza uma pergunta (rascunhos incompletos são aceitos: campos vazios e correta nula).
function sanitizar(p) {
  const alts = Array.isArray(p?.alternativas) ? p.alternativas : [];
  const correta = Number.isInteger(p?.correta) && p.correta >= 0 && p.correta <= 3 ? p.correta : null;
  return {
    id: Number.isInteger(p?.id) ? p.id : null,
    tipo: TIPOS.includes(p?.tipo) ? p.tipo : p?.tipo == null ? 'facil' : String(p.tipo),
    enunciado: texto(p?.enunciado, LIMITES.enunciado),
    alternativas: [0, 1, 2, 3].map((i) => texto(alts[i], LIMITES.alternativa)),
    correta,
    explicacao: texto(p?.explicacao, LIMITES.explicacao),
    reserva: p?.reserva === true,
  };
}

// Lista de problemas (em português) que impedem a pergunta de ser usada no jogo.
function problemas(p) {
  const out = [];
  if (!p.enunciado.trim()) out.push('Falta o enunciado');
  p.alternativas.forEach((a, i) => {
    if (!a.trim()) out.push(`Falta a alternativa ${LETRAS[i]}`);
  });
  if (p.correta === null) out.push('Marque a alternativa correta');
  else if (!p.alternativas[p.correta]?.trim()) out.push('A alternativa marcada como correta está vazia');
  if (!TIPOS.includes(p.tipo)) out.push('Tipo inválido (use fácil ou atenção)');
  return out;
}

const valida = (p) => problemas(p).length === 0;

function resumoLista(lista) {
  const validas = lista.filter(valida).length;
  return {
    total: lista.length,
    validas,
    invalidas: lista.length - validas,
    doBanco: lista.filter((p) => !p.reserva).length,
    temReserva: lista.some((p) => p.reserva),
  };
}

function exportar(lista) {
  return {
    perguntas: lista.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      enunciado: p.enunciado,
      alternativas: [...p.alternativas],
      correta: p.correta,
      explicacao: p.explicacao,
      reserva: p.reserva,
    })),
  };
}

// Valida a lista inteira recebida do editor (salvamento automático).
function validarLista(entrada) {
  if (!Array.isArray(entrada)) return { erro: 'Lista de perguntas inválida.' };
  if (entrada.length > 200) return { erro: 'Perguntas demais (máximo 200).' };
  const lista = entrada.map(sanitizar);
  const ids = new Set();
  for (const p of lista) {
    if (p.id === null || p.id < 1) return { erro: 'Toda pergunta precisa de um número de identificação.' };
    if (ids.has(p.id)) return { erro: 'Há perguntas com o mesmo identificador.' };
    ids.add(p.id);
  }
  if (lista.filter((p) => p.reserva).length > 1) return { erro: 'Só pode haver uma pergunta reserva.' };
  return { lista };
}

// Lê e analisa um arquivo de importação, sem alterar nada.
// Devolve { ok, erros (do arquivo), perguntas, itens: [{ posicao, problemas, avisos }], total, validas }.
function analisarImportacao(entrada) {
  let dados = entrada;
  if (typeof entrada === 'string') {
    try {
      dados = JSON.parse(entrada.replace(/^﻿/, ''));
    } catch (e) {
      return { ok: false, erros: [`O arquivo não é um JSON válido (${e.message}).`], perguntas: [], itens: [], total: 0, validas: 0 };
    }
  }
  const falha = (msg) => ({ ok: false, erros: msg, perguntas: [], itens: [], total: 0, validas: 0 });
  if (!dados || typeof dados !== 'object' || Array.isArray(dados) || !Array.isArray(dados.perguntas)) {
    return falha(['O arquivo precisa ter o formato {"perguntas": [ ... ]}.']);
  }
  if (dados.perguntas.length === 0) return falha(['O arquivo não tem nenhuma pergunta.']);
  if (dados.perguntas.length > 200) return falha(['O arquivo tem perguntas demais (máximo 200).']);

  const erros = [];
  dados.perguntas.forEach((p, i) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) erros.push(`Pergunta ${i + 1}: não é um objeto.`);
  });
  const reservas = dados.perguntas.filter((p) => p && p.reserva === true).length;
  if (reservas > 1) erros.push(`O arquivo marca ${reservas} perguntas como reserva; só pode haver uma.`);
  if (erros.length) return falha(erros);

  const perguntas = dados.perguntas.map(sanitizar);
  const itens = perguntas.map((p, i) => ({ posicao: i + 1, problemas: problemas(p), avisos: [] }));
  return { ok: true, erros: [], perguntas, itens, total: perguntas.length, validas: itens.filter((x) => x.problemas.length === 0).length };
}

// Aplica a importação sobre a lista atual. Mantém os ids do arquivo quando são únicos
// (assim exportar e importar devolve exatamente as mesmas perguntas); caso contrário renumera.
function aplicarImportacao(atuais, analise, modo) {
  if (!analise.ok) return { erro: 'Arquivo inválido.' };
  if (modo !== 'substituir' && modo !== 'acrescentar') return { erro: 'Escolha Substituir tudo ou Acrescentar.' };
  const novas = analise.perguntas.map((p) => ({ ...p, alternativas: [...p.alternativas] }));
  const avisos = [];

  if (modo === 'substituir') {
    const ids = novas.map((p) => p.id);
    const unicos = ids.every((id) => Number.isInteger(id) && id > 0) && new Set(ids).size === ids.length;
    novas.forEach((p, i) => { p.id = unicos ? p.id : i + 1; });
    return { lista: novas, avisos };
  }

  let proximo = atuais.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const jaTemReserva = atuais.some((p) => p.reserva);
  for (const p of novas) {
    p.id = proximo++;
    if (p.reserva && jaTemReserva) {
      p.reserva = false;
      avisos.push('Já existe uma pergunta reserva; a do arquivo foi importada como pergunta comum.');
    }
  }
  return { lista: [...atuais, ...novas], avisos };
}

// Embaralha só a ordem das perguntas (alternativas e `correta` ficam intactas); a reserva vai sempre para o fim.
// Os ids não mudam: o jogo usa a posição na lista para a ordem e o id só para identificar a pergunta.
// Garante que a ordem mude quando há mais de uma pergunta fora da reserva.
function aleatorizarOrdem(lista, aleatorio = Math.random) {
  const normais = lista.filter((p) => !p.reserva);
  const reservas = lista.filter((p) => p.reserva);
  const antes = normais.map((p) => p.id).join();
  let novas = normais;
  for (let tentativa = 0; tentativa < 20 && normais.length > 1; tentativa += 1) {
    novas = normais.slice();
    for (let i = novas.length - 1; i > 0; i -= 1) {
      const j = Math.floor(aleatorio() * (i + 1));
      [novas[i], novas[j]] = [novas[j], novas[i]];
    }
    if (novas.map((p) => p.id).join() !== antes) break;
  }
  if (normais.length > 1 && novas.map((p) => p.id).join() === antes) novas = [...normais.slice(1), normais[0]]; // sorte rara: gira
  return structuredClone([...novas, ...reservas]);
}

module.exports = {
  aleatorizarOrdem,
  TIPOS,
  LETRAS,
  META_BANCO,
  META_TOTAL,
  sanitizar,
  problemas,
  valida,
  resumoLista,
  exportar,
  validarLista,
  analisarImportacao,
  aplicarImportacao,
};
