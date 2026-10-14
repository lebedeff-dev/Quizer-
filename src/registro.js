'use strict';
// Registro de eventos (aba Registro do /host): texto em português para cada ação do responsável,
// escrito a partir do estado antes e depois. Puro: sem rede, disco ou relógio.
const { nomesDosGrupos, nomeDaCor, MARCA_PRETO, NOMES_COR: NOMES } = require('./nomes');
const LETRAS = ['A', 'B', 'C', 'D'];
const HAB = { bloqueio: 'Bloqueio', dobro: 'Dobro', escudo: 'Escudo', passe: 'Passe', dica5050: 'Dica 50/50', aposta: 'Aposta' };
const TENT = { certa: 'acertou', errada: 'errou', desqualificado: 'foi desqualificado', sem_resposta: 'ficou sem resposta' };

// Nomes dos grupos do momento (o que o grupo digitou; ver nomes.js). O Registro é escrito de forma síncrona, então um
// contexto de módulo basta: cada função pública define os nomes a partir dos estados que recebe.
let ATUAIS = {};
let CITADAS = [];
function contexto(...estados) {
  ATUAIS = {};
  CITADAS = [];
  for (const s of estados) if (s?.grupos) Object.assign(ATUAIS, nomesDosGrupos(s.grupos, 'marcador')); // o último estado vale
}
const nome = (cor) => {
  CITADAS.push(cor);
  return ATUAIS[cor] || nomeDaCor(cor, 'marcador');
};
// Marca cada linha com a cor do primeiro grupo citado (a bolinha colorida do Registro); o texto fala só do nome do grupo.
const marcar = (r) => {
  const cor = CITADAS.find((c) => NOMES[c]) || null;
  const um = (i) => (i ? { ...i, ...(cor ? { cor } : {}) } : i);
  return Array.isArray(r) ? r.map(um) : um(r);
};
// Pontos com sinal legível: "+10", "−5" (sinal de menos de verdade) e "0".
const sinal = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const rodadaTxt = (s) => (s.rodada?.desempate ? 'Desempate' : `Rodada ${s.rodadaNum}`);

// Devolve { tipo, msg } ou null (ações que não merecem registro).
function descrever(acao, args, antes, depois) {
  contexto(antes, depois);
  return marcar(descreverInterno(acao, args, antes, depois));
}

function descreverInterno(acao, args, antes, depois) {
  const r = depois.rodada;
  switch (acao) {
    case 'iniciar':
      return { tipo: 'jogo', msg: `Jogo iniciado com ${depois.grupos.length} grupos (${depois.grupos.map((g) => nome(g.cor)).join(', ')})` };
    case 'mostrarAlternativas':
      return { tipo: 'rodada', msg: `${rodadaTxt(depois)}: alternativas na tela` };
    case 'abrirJanela':
      return { tipo: 'rodada', msg: `${rodadaTxt(depois)}: janela de ${depois.config.janela} s aberta` };
    case 'encerrarJanela':
      return { tipo: 'rodada', msg: janelaEncerrada(depois, 'pelo responsável') };
    case 'mostrarResposta':
      return { tipo: 'rodada', msg: `${rodadaTxt(depois)}: respostas começam, responde ${nome(r.ordem[0])}` };
    case 'responder': case 'desqualificar': case 'semResposta': {
      const t = r.tentativas[r.tentativas.length - 1];
      let msg = `${rodadaTxt(depois)}: ${nome(t.cor)} ${TENT[t.tipo]}`;
      if (t.alternativa != null) msg = `${rodadaTxt(depois)}: ${nome(t.cor)} respondeu ${LETRAS[t.alternativa]} e ${TENT[t.tipo]}`;
      if (t.pontos || t.aposta) msg += ` (${sinal(t.pontos)} pontos${t.aposta ? ', com a Aposta' : ''})`;
      if (['explicacao', 'so_correta'].includes(depois.fase)) {
        msg += `. Rodada encerrada, respondidas ${depois.respondidas}/${depois.config.meta}`;
      }
      else if (depois.fase === 'resposta') msg += `. Agora responde ${nome(r.ordem[r.tentativas.length])}`;
      return { tipo: 'resposta', msg };
    }
    case 'ativarHabilidade': {
      const a = r.ativacoes[args[0]];
      const espera = r.escudos.length ? '. Aguarda a decisão do grupo sobre o Escudo' : '';
      return { tipo: 'habilidade', msg: `${rodadaTxt(depois)}: ${nome(args[0])} ativou ${HAB[a.tipo]}${a.alvo ? ` sobre ${nome(a.alvo)}` : ''}${espera}` };
    }
    case 'decidirEscudo': {
      const principal = { tipo: 'habilidade', msg: args[2]
        ? `${rodadaTxt(depois)}: decisão do grupo: ${nome(args[0])} usou o Escudo e anulou o Bloqueio de ${nome(args[1])} (os dois foram consumidos)`
        : `${rodadaTxt(depois)}: decisão do grupo: ${nome(args[0])} guardou o Escudo e aceitou o Bloqueio de ${nome(args[1])}` };
      // Sem outro Escudo, os demais Bloqueios sobre o mesmo alvo foram resolvidos sozinhos.
      const sozinhos = antes.rodada.escudos
        .filter((e) => e.alvo === args[0] && e.atacante !== args[1] && !depois.rodada.escudos.some((x) => x.alvo === e.alvo && x.atacante === e.atacante))
        .map((e) => ({ tipo: 'habilidade', msg: `${rodadaTxt(depois)}: ${nome(e.alvo)} aceitou o Bloqueio de ${nome(e.atacante)}, sem Escudo (resolvido sozinho: o Escudo já foi usado)` }));
      return [principal, ...sozinhos];
    }
    case 'usarPasse':
      return { tipo: 'habilidade', msg: `${rodadaTxt(depois)}: decisão do grupo: ${nome(r.passes[r.passes.length - 1])} usou o Passe. Agora responde ${nome(r.ordem[1])}` };
    case 'usarDica5050': {
      const cor = r.dicas[r.dicas.length - 1];
      return { tipo: 'habilidade', msg: `${rodadaTxt(depois)}: decisão do grupo: ${nome(cor)} usou a Dica 50/50 e eliminou ${r.eliminadas.map((i) => LETRAS[i]).join(' e ')}` };
    }
    case 'apostar': {
      const a = r.apostas[args[0]];
      const quanto = a.modo === 'habilidades'
        ? `entrega ${a.reservadas.map((x) => HAB[x]).join(' e ')}; acertando ${sinal(a.bonus)}, errando ${sinal(-a.penal)}`
        : `paga ${a.custo} pontos; os pontos da rodada valem ${a.mult} vezes (1º que acerta ${sinal(depois.config.pontosPrimeiro * a.mult - a.custo)}, errando ${sinal(-a.custo)})`;
      return { tipo: 'habilidade', msg: `${rodadaTxt(depois)}: decisão do grupo: ${nome(args[0])} ativou a Aposta (${quanto}). Só é cobrada se o grupo responder` };
    }
    case 'trocarAcertos': {
      const [cor, tipo, subst] = args;
      const antes0 = antes.grupos.find((g) => g.cor === cor);
      const saiu = Number.isInteger(subst) ? antes0.habilidades[subst]?.tipo : null;
      const n = antes0.sequencia;
      return { tipo: 'habilidade', msg: `Decisão do grupo: ${nome(cor)} trocou ${n} ${n === 1 ? 'acerto' : 'acertos'} por ${HAB[tipo]}${saiu ? ` no lugar de ${HAB[saiu]}` : ''} (a sequência volta a zero)` };
    }
    case 'continuar':
      if (depois.fase === 'ranking') return { tipo: 'jogo', msg: 'Ranking na tela' };
      if (depois.fase === 'placar') return { tipo: 'jogo', msg: `Placar parcial na tela (respondidas ${depois.respondidas}/${depois.config.meta}): ${depois.grupos.slice().sort((a, b) => b.pontos - a.pontos).map((g) => `${nome(g.cor)} ${sinal(g.pontos) === '0' ? 0 : g.pontos < 0 ? sinal(g.pontos) : g.pontos}`).join(', ')}` };
      return { tipo: 'rodada', msg: `${rodadaTxt(depois)} iniciada (pergunta ${r.perguntaId})${r.final ? ', RODADA FINAL em dobro' : ''}` };
    case 'proximo':
      return { tipo: 'jogo', msg: depois.fase === 'final' ? 'Tela final' : 'Voltou à capa' };
    case 'pausar':
      return { tipo: 'sistema', msg: depois.pausado ? 'Jogo pausado' : 'Jogo retomado' };
    case 'desfazer':
      return { tipo: 'sistema', msg: `Desfazer: voltou para "${depois.fase}"${depois.rodadaNum ? `, rodada ${depois.rodadaNum}` : ''}` };
    case 'definirElegivel':
      return { tipo: 'pontos', msg: `${nome(args[0])} ${args[1] ? 'elegível' : 'não elegível'} ao prêmio` };
    case 'iniciarDesempate':
      return { tipo: 'jogo', msg: `Desempate entre ${depois.desempate.participantes.map(nome).join(', ')}` };
    case 'zerarJogo':
      return { tipo: 'jogo', msg: 'Novo jogo: pontos, sequências e habilidades zerados' };
    case 'renomearGrupo':
      return { tipo: 'sistema', msg: `O grupo ${(nomesDosGrupos(antes.grupos, 'marcador')[args[0]]) || nomeDaCor(args[0], 'marcador')} passou a se chamar "${nome(args[0])}"` };
    default:
      return null;
  }
}

// Cobranças e devoluções de Aposta que aconteceram entre dois estados (qualquer ação, clique ou cronômetro).
function efeitos(antes, depois) {
  contexto(antes, depois);
  return marcar(efeitosInterno(antes, depois));
}

function efeitosInterno(antes, depois) {
  const itens = [];
  const ra = antes.rodada;
  const rd = depois.rodada;
  if (!rd || !ra || ra.numero !== rd.numero) return itens;
  for (const [cor, a] of Object.entries(rd.apostas || {})) {
    const era = ra.apostas?.[cor]?.estado;
    if (era !== 'ativa' || a.estado === 'ativa') continue;
    if (a.estado === 'cobrada') {
      const pagou = a.modo === 'habilidades' ? `entregou ${a.reservadas.map((x) => HAB[x]).join(' e ')}` : `pagou ${a.custo} pontos`;
      itens.push({ tipo: 'habilidade', msg: `${rodadaTxt(depois)}: Aposta de ${nome(cor)} cobrada (${pagou}): ${sinal(a.delta)} pontos no total da rodada` });
    } else {
      itens.push({ tipo: 'habilidade', msg: `${rodadaTxt(depois)}: Aposta de ${nome(cor)} não cobrada, o grupo não respondeu${a.modo === 'habilidades' ? ' (as habilidades continuam guardadas)' : ''}` });
    }
  }
  return itens;
}

// Janela encerrada (pelo responsável, pelo tempo ou porque todos apertaram).
function janelaEncerrada(depois, motivo) {
  contexto(depois);
  return janelaEncerradaInterno(depois, motivo);
}

// A mesma linha, já como item do Registro (com a cor do primeiro grupo citado).
function janelaEncerradaItem(depois, motivo) {
  contexto(depois);
  return marcar({ tipo: 'rodada', msg: janelaEncerradaInterno(depois, motivo) });
}

function janelaEncerradaInterno(depois, motivo) {
  const r = depois.rodada;
  const ordem = r.ordem.length ? `ordem: ${r.ordem.map(nome).join(', ')}` : 'ninguém apertou';
  return `${rodadaTxt(depois)}: janela encerrada ${motivo}, ${ordem}`;
}

function clique(depois, cor) {
  contexto(depois);
  const r = depois.rodada;
  return marcar({ tipo: 'clique', msg: `${rodadaTxt(depois)}: ${nome(cor)} apertou (${r.ordem.indexOf(cor) + 1}º)` });
}

function hora(ms) {
  const d = new Date(ms);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

// Texto do arquivo baixável (.txt), do mais antigo para o mais novo.
function emTexto(itens) {
  return itens.map((i) => `${hora(i.t)}  [${i.tipo}]  ${i.msg}`).join('\r\n') + '\r\n';
}

// Nome do grupo no estado dado (o que o grupo digitou, ou o nome de reserva).
function nomeGrupo(estado, cor) {
  return nomesDosGrupos(estado.grupos, 'marcador')[cor] || nomeDaCor(cor, 'marcador');
}

// Linha do Registro escrita pelo servidor fora das ações do painel (conexão, pedidos de Bloqueio...).
function linha(estado, tipo, fazer) {
  contexto(estado);
  return marcar({ tipo, msg: fazer(nome) });
}

// Troca a marca do time Preto/Branco pelo nome do tema atual (o texto gravado guarda só a marca).
function exibir(msg, tema = 'claro') {
  return String(msg).split(MARCA_PRETO).join(nomeDaCor('preto', tema));
}
const exibirItens = (itens, tema) => itens.map((i) => ({ ...i, msg: exibir(i.msg, tema) }));

module.exports = { exibir, exibirItens, nomeGrupo, linha, rodadaTxt, sinal, efeitos, descrever, janelaEncerrada, janelaEncerradaItem, clique, hora, emTexto };
