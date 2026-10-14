// Painel do jogo no /host: botão principal gigante por fase, fila de cliques, prévia da
// pergunta (só para o responsável), painel dos grupos, ranking e desempate.
// Mostra só o que é da fase atual.
import { el, botaoTema } from '/shared/ui.js';
import { fundoDiscreto } from '/shared/decoracao.js';
import { CORES, estiloCor } from '/shared/cores.js';
import { nomeDoGrupo } from '/shared/nomes.js';
import { NOMES, descricoes, selo } from '/shared/habilidades.js';
import { textosAposta, cobrancaAposta, pontosComSinal, pontosTotal, CELULAR as TXT } from '/shared/textos.js';

const LETRAS = ['A', 'B', 'C', 'D'];
const NOME_FASE = {
  pergunta: 'Pergunta',
  alternativas: 'Alternativas',
  janela: 'Janela de cliques',
  ordem: 'Ordem dos cliques',
  resposta: 'Resposta',
  explicacao: 'Explicação',
  so_correta: 'Resposta correta',
  ranking: 'Ranking',
  final: 'Tela final',
  placar: 'Placar parcial',
};
const TENTATIVA = { certa: 'acertou', errada: 'errou', desqualificado: 'desqualificado', sem_resposta: 'sem resposta' };

export function criarJogoHost({ acao, aoMenu, redesenhar, alternarTema }) {
  const S = { erro: '', alvo: null, confirmarNovo: false, trava: false, compra: null, aposta: null, dicaDispensada: null };
  let ultimo = null;
  let viva = false;
  let ultimoRecebidoEm = Date.now();

  async function executar(nome, ...args) {
    document.activeElement?.blur?.();
    const r = await acao(nome, ...args);
    const erro = r.t === 'erro' ? r.msg : '';
    if (erro !== S.erro) { S.erro = erro; redesenhar(); }
    return r;
  }

  // ---------- botão principal (por fase) ----------
  function principal(e) {
    const s = e.estado;
    const r = s.rodada;
    const escudoPendente = !!r?.escudos?.length;
    const pedidoPendente = !!(e.pedidos && e.pedidos.length);
    switch (s.fase) {
      case 'pergunta': return { rotulo: 'Mostrar alternativas', nome: 'mostrarAlternativas' };
      case 'alternativas': return { rotulo: `Abrir janela de ${s.config.janela} s`, nome: 'abrirJanela', motivo: escudoPendente ? 'Aguardando a decisão do grupo sobre o Escudo' : pedidoPendente ? 'Há pedido de Bloqueio aguardando: confirme ou recuse' : null };
      case 'janela': return { rotulo: 'Encerrar janela', nome: 'encerrarJanela' };
      case 'ordem': return { rotulo: 'Começar as respostas', nome: 'mostrarResposta' };
      case 'explicacao':
      case 'so_correta': {
        const ranking = r.desempate || s.respondidas >= s.config.meta || s.indice >= e.totalBanco;
        return { rotulo: ranking ? 'Ver ranking' : 'Próxima pergunta', nome: 'continuar' };
      }
      case 'ranking': {
        const empate = e.empatados.length > 1 && !e.vencedor;
        if (e.comemoracao?.banner) return { rotulo: 'Voltar ao ranking', nome: 'proximo' }; // fecha o banner de parabéns do projetor
        return empate
          ? { rotulo: 'Iniciar desempate', nome: 'iniciarDesempate' }
          : { rotulo: 'Ir para a tela final', nome: 'proximo' };
      }
      case 'placar': return { rotulo: 'Próxima pergunta', nome: 'continuar' };
      case 'final': return { rotulo: 'Voltar à capa', nome: 'proximo' };
      default: return null;
    }
  }

  function disparar(p) {
    if (!p || p.motivo || S.trava) return;
    S.trava = true; // evita dois avanços seguidos por um toque duplo na barra de espaço
    setTimeout(() => { S.trava = false; }, 350);
    executar(p.nome);
  }

  function botaoPrincipal(e) {
    const p = principal(e);
    if (!p) return null;
    // No ranking e na tela final o botão não precisa acompanhar a rolagem (cobriria o primeiro cartão).
    const estatico = ['ranking', 'final', 'placar'].includes(e.estado.fase);
    return el('div', { class: `hj-principal${estatico ? ' estatico' : ''}` },
      el('button', {
        class: `hj-grande${p.motivo ? ' desabilitado' : ''}`,
        disabled: !!p.motivo,
        onclick: () => disparar(p),
      }, p.rotulo, el('span', { class: 'hj-atalho' }, 'Espaço')),
      p.motivo ? el('p', { class: 'hj-motivo' }, p.motivo) : null);
  }

  // Na fase de resposta o botão principal vira as quatro alternativas.
  function botoesAlternativas(e) {
    const s = e.estado;
    const erradas = s.rodada.erradas;
    const atual = e.atual;
    return el('div', { class: 'hj-principal' },
      el('div', { class: 'hj-abcd' }, LETRAS.map((L, i) => {
        const errada = erradas.includes(i);
        const eliminada = (s.rodada.eliminadas || []).includes(i); // retirada pela Dica 50/50
        return el('button', {
          class: `hj-alt${errada ? ' errada' : ''}${eliminada ? ' eliminada' : ''}`,
          disabled: errada || eliminada || !atual,
          onclick: () => executar('responder', i),
          'aria-label': `Alternativa ${L}${errada ? ', já descartada' : ''}${eliminada ? ', eliminada pela Dica 50/50' : ''}`,
        },
        el('span', { class: 'hj-alt-letra' }, L),
        el('span', { class: 'hj-alt-texto' }, errada ? 'errada' : eliminada ? 'eliminada' : (e.pergunta.alternativas[i] || '')));
      })));
  }

  // ---------- barra superior ----------
  function barra(e) {
    const s = e.estado;
    const fase = s.fase;
    const emRodada = !['ranking', 'final', 'placar'].includes(fase);
    const regrasAbertas = e.ui.regras;
    const rotuloFase = s.rodada?.desempate && emRodada ? `Desempate · ${NOME_FASE[fase]}` : NOME_FASE[fase];
    return el('header', { class: 'hj-barra' },
      el('button', { class: 'hj-menu', onclick: aoMenu }, 'Menu'),
      el('span', { class: 'hj-fase' }, rotuloFase),
      emRodada && !s.rodada?.desempate ? el('span', { class: 'hj-info' }, `Rodada ${s.rodadaNum}`) : null,
      el('span', { class: 'hj-info' }, `Respondidas ${s.respondidas}/${s.config.meta}`),
      s.rodada?.final && emRodada ? el('span', { class: 'hj-selo' }, 'Rodada final: pontos em dobro') : null,
      fase === 'janela' ? el('span', { id: 'hj-tempo', class: 'hj-tempo' }, '') : null,
      el('span', { class: 'hj-espaco' }),
      el('span', { class: 'hj-quebra' }),
      s.pausado ? el('span', { class: 'hj-pausado' }, 'Pausado') : null,
      el('button', { class: 'hj-btn', onclick: () => executar('pausar', !s.pausado) }, s.pausado ? 'Retomar' : 'Pausar', el('span', { class: 'hj-tecla' }, ' (P)')),
      el('button', { class: `hj-btn${regrasAbertas ? ' ligado' : ''}`, onclick: () => executar('regras', !regrasAbertas) }, regrasAbertas ? 'Fechar regras' : 'Regras'),
      regrasAbertas ? el('button', { class: 'hj-btn', onclick: () => executar('regras', (Number(regrasAbertas) % 3) + 1) }, `Próxima página (${Number(regrasAbertas)}/3)`) : null,
      el('button', { class: 'hj-btn', disabled: !e.podeDesfazer, onclick: () => executar('desfazer') }, 'Desfazer'),
      botaoTema(e.ui.tema, (t) => alternarTema(t)));
  }

  // Habilidades guardadas e livres: as reservadas por uma Aposta não podem ser usadas.
  function livres(g, r, tipo) {
    const a = r?.apostas?.[g.cor];
    const reservadas = a && a.estado === 'ativa' && a.modo === 'habilidades' ? a.reservadas.filter((x) => x === tipo).length : 0;
    return g.habilidades.filter((h) => h.tipo === tipo).length - reservadas;
  }

  // O Passe é só do 1º respondente, uma vez, com o Passe livre e sem outra habilidade usada na rodada.
  // Sem 2º respondente o botão aparece desabilitado, dizendo por quê.
  function infoPasse(e) {
    const r = e.estado.rodada;
    const g = e.estado.grupos.find((x) => x.cor === r.ordem[0]);
    const vale = !r.desempate && r.tentativas.length === 0 && r.pulos === 0 && !!g && livres(g, r, 'passe') > 0 && !r.usou[g.cor];
    if (!vale) return null;
    return { motivo: r.ordem[1] ? null : 'Não há 2º respondente para receber a vez' };
  }

  // A Dica 50/50 é só do 2º respondente, no momento em que ele vira o respondente atual.
  function infoDica(e) {
    const s = e.estado;
    const r = s.rodada;
    if (s.fase !== 'resposta' || r.desempate || r.tentativas.length + r.pulos !== 1) return null;
    const cor = r.ordem[1];
    const g = s.grupos.find((x) => x.cor === cor);
    if (!g || livres(g, r, 'dica5050') < 1 || r.usou[cor]) return null;
    return { cor, tirar: 2 - r.erradas.length }; // sem erro anterior elimina 2; com 1 errada, elimina 1
  }

  // ---------- fila de cliques ----------
  // Nomes dos grupos da visão atual (o que cada grupo digitou); a cor vem do fundo da etiqueta.
  let NOMES = {};
  const nomeG = (cor) => nomeDoGrupo(NOMES, cor);
  function etiquetaGrupo(cor) {
    return el('span', { class: 'hj-cor', style: estiloCor(cor), title: CORES[cor].nome }, nomeG(cor));
  }

  function fila(e) {
    const s = e.estado;
    const r = s.rodada;
    const antes = ['pergunta', 'alternativas'].includes(s.fase);
    const aptos = s.grupos.filter((g) => g.conectado && !r.bloqueios[g.cor] && (!r.participantes || r.participantes.includes(g.cor)));
    let corpo;
    if (antes) {
      corpo = el('p', { class: 'hj-nota' }, 'A janela ainda não abriu.');
    } else if (!r.ordem.length) {
      corpo = el('p', { class: 'hj-nota' }, s.fase === 'janela' ? 'Ninguém apertou ainda.' : 'Ninguém apertou.');
    } else {
      corpo = el('ol', { class: 'hj-fila' }, r.ordem.map((cor, i) => {
        const t = r.tentativas.find((x) => x.cor === cor);
        const agora = s.fase === 'resposta' && e.atual === cor;
        return el('li', { class: `hj-linha${agora ? ' agora' : ''}` },
          el('span', { class: 'hj-pos' }, `${i + 1}º`),
          el('span', { class: 'hj-nome' }, etiquetaGrupo(cor)),
          agora ? el('span', { class: 'hj-tag forte' }, 'responde agora') : null,
          r.passes.includes(cor) ? el('span', { class: 'hj-tag' }, 'passou a vez') : null,
          t ? el('span', { class: `hj-tag ${t.tipo === 'certa' ? 'certo' : 'errado'}` }, `${TENTATIVA[t.tipo]}${t.pontos ? ` ${pontosComSinal(t.pontos)}` : ''}`) : null);
      }));
    }
    const bloqueados = Object.keys(r.bloqueios);
    const passe = s.fase === 'resposta' ? infoPasse(e) : null;
    const dica = infoDica(e);
    return el('div', { class: 'cartao leve hj-cartao hj-fila-cartao' },
      el('h2', {}, 'Fila de cliques', s.fase === 'janela' ? el('small', {}, `${r.ordem.length} de ${aptos.length} apertaram`) : null),
      corpo,
      bloqueados.length
        ? el('p', { class: 'hj-nota' }, `Bloqueados nesta rodada: ${bloqueados.map(nomeG).join(', ')}`)
        : null,
      s.fase === 'resposta' && passe
        ? el('div', { class: 'hj-passe' },
          el('button', { class: 'btn-secundario hj-passe-btn', disabled: !!passe.motivo, onclick: () => executar('usarPasse') }, 'Registrar no lugar do grupo: Passou (usa o Passe)'),
          el('p', { class: 'hj-nota' }, passe.motivo || `Registre a decisão do grupo: o 1º respondente passa a vez ao 2º, que ganha ${s.config.pontosSegundo} se acertar.`))
        : null,
      dica
        ? el('div', { class: 'hj-passe' },
          el('button', { class: 'btn-secundario hj-passe-btn', onclick: () => executar('usarDica5050') }, 'Registrar no lugar do grupo: usar Dica 50/50'),
          el('p', { class: 'hj-nota' }, `Só vale para o 2º a responder (${nomeG(dica.cor)}). Elimina ${dica.tirar} alternativa${dica.tirar > 1 ? 's' : ''} errada${dica.tirar > 1 ? 's' : ''}.`))
        : null,
      s.fase === 'resposta'
        ? el('div', { class: 'hj-linha-botoes' },
          el('button', { class: 'btn-secundario', onclick: () => executar('desqualificar') }, 'Desqualificar jogador'),
          el('button', { class: 'btn-secundario', onclick: () => executar('semResposta') }, 'Sem resposta'))
        : null);
  }

  // ---------- prévia (só para o responsável) ----------
  function previa(e) {
    const s = e.estado;
    const p = e.pergunta;
    const r = s.rodada;
    const mostrarErros = ['resposta', 'explicacao', 'so_correta'].includes(s.fase);
    return el('div', { class: 'cartao leve hj-cartao hj-previa' },
      el('h2', {}, 'Prévia', el('small', {}, 'só você vê')),
      el('p', { class: 'hj-enunciado' }, p.enunciado),
      el('ol', { class: 'hj-alts' }, p.alternativas.map((t, i) => {
        const certa = p.correta === i;
        const errada = mostrarErros && r.erradas.includes(i);
        return el('li', { class: `hj-pa${certa ? ' certa' : ''}${errada ? ' errada' : ''}` },
          el('span', { class: 'hj-pa-letra' }, LETRAS[i]),
          el('span', { class: 'hj-pa-texto' }, t),
          certa ? el('span', { class: 'hj-pa-rotulo' }, 'correta') : errada ? el('span', { class: 'hj-pa-rotulo' }, 'errada') : null);
      })),
      p.explicacao ? el('p', { class: 'hj-explicacao' }, el('strong', {}, 'Explicação: '), p.explicacao) : null);
  }

  // ---------- grupos ----------

  function bolinhas(e, g) {
    const max = e.estado.config.seqDica;
    return el('span', { class: 'hg-bolas', title: `Sequência: ${g.sequencia}` },
      Array.from({ length: max }, (_, i) => el('i', { class: i < g.sequencia ? 'cheia' : '' })));
  }

  // Estoque (até 2) e situação da rodada: Bloqueio e Dobro se ativam antes da janela; Escudo, Passe e Dica 50/50
  // têm vez própria; a Aposta (que não é do estoque) tem o botão "Apostar".
  function habilidade(e, g) {
    const s = e.estado;
    const r = s.rodada;
    const c = s.config;
    const D = descricoes(c);
    const preparando = ['pergunta', 'alternativas'].includes(s.fase) && r && !r.desempate;
    const usou = r?.usou?.[g.cor];
    const itens = [];
    if (r?.bloqueios?.[g.cor]) itens.push(el('span', { class: 'hg-tag bloqueado' }, 'Bloqueado'));
    const ativa = r?.ativacoes?.[g.cor];
    const ap = r?.apostas?.[g.cor];
    if (ativa?.tipo === 'bloqueio') itens.push(el('span', { class: 'hg-tag ativa' }, `Bloqueia ${nomeG(ativa.alvo)}`));
    else if (ativa?.tipo === 'dobro') itens.push(el('span', { class: 'hg-tag ativa' }, 'Dobro ativo'));
    else if (ap) {
      const quanto = ap.modo === 'pontos' ? `${ap.custo} pontos` : `${ap.reservadas.length} habilidades`;
      const txt = ap.estado === 'cobrada' ? `Aposta cobrada: ${pontosComSinal(ap.delta)}` : ap.estado === 'devolvida' ? 'Aposta não cobrada' : `Aposta: ${quanto}`;
      itens.push(el('span', { class: 'hg-tag ativa' }, txt));
    } else if (usou === 'passe') itens.push(el('span', { class: 'hg-tag ativa' }, 'Passe usado'));
    else if (usou === 'dica5050') itens.push(el('span', { class: 'hg-tag ativa' }, 'Dica 50/50 usada'));
    const reservar = ap && ap.estado === 'ativa' && ap.modo === 'habilidades' ? [...ap.reservadas] : [];
    for (const h of g.habilidades) {
      const k = reservar.indexOf(h.tipo);
      const reservada = k >= 0;
      if (reservada) reservar.splice(k, 1);
      const podeAtivar = preparando && !usou && !reservada && ['bloqueio', 'dobro'].includes(h.tipo);
      itens.push(el('span', { class: `hg-item${reservada ? ' reservada' : ''}`, title: D[h.tipo] },
        selo(h.tipo, 'hg-selo'),
        NOMES[h.tipo],
        reservada ? el('small', {}, ' (na aposta)') : null,
        podeAtivar
          ? el('button', {
            class: 'hg-ativar',
            onclick: () => (h.tipo === 'bloqueio' ? (S.alvo = g.cor, redesenhar()) : executar('ativarHabilidade', g.cor, 'dobro')),
          }, 'Ativar')
          : null));
    }
    // Indicador discreto (só informativo): tem habilidade e ainda não usou nada nesta rodada.
    if (r && !r.desempate && ['pergunta', 'alternativas', 'janela', 'ordem', 'resposta'].includes(s.fase) && !usou && g.habilidades.length) {
      itens.unshift(el('span', { class: 'hg-tag discreto', title: 'Tem habilidade e ainda não usou nada nesta rodada' }, 'pode usar'));
    }
    if (preparando && !usou && (g.apostas < c.apostaMax || g.habilidades.some((h) => ['bloqueio', 'dobro'].includes(h.tipo)))) {
      itens.push(el('small', { class: 'hg-reserva' }, 'No lugar do grupo:'));
    }
    if (g.rodadasSemPontos >= 3) itens.push(el('span', { class: 'hg-tag', title: 'Rodadas seguidas sem ganhar ponto' }, TXT.semPontuar(g.rodadasSemPontos)));
    if (r && g.trocas > 0) itens.push(el('span', { class: 'hg-tag', title: 'Trocas de acertos por habilidade neste jogo' }, `Trocas ${g.trocas}/${c.compraMax}`));
    if (podeComprar(e, g)) {
      const comprar = el('button', { class: 'hg-ativar hg-comprar', onclick: () => { S.compra = { cor: g.cor, escolha: null }; redesenhar(); } }, 'No lugar do grupo: Comprar habilidade');
      const rotulo = itens.findIndex((x) => x.classList?.contains('hg-reserva'));
      if (rotulo >= 0) itens.splice(rotulo, 0, comprar); else itens.push(comprar); // o botão já diz "No lugar do grupo": vai antes do rótulo, que fica só para a Aposta
    }
    // Aposta: qualquer grupo, até o limite do jogo. Só antes da janela, uma habilidade por rodada.
    if (g.apostas > 0) itens.push(el('span', { class: 'hg-tag', title: 'Apostas cobradas neste jogo' }, `Apostas ${g.apostas}/${c.apostaMax}`));
    if (preparando && !usou && g.apostas < c.apostaMax) {
      itens.push(el('button', { class: 'hg-ativar hg-apostar', onclick: () => { S.aposta = { cor: g.cor, modo: null, sel: [] }; redesenhar(); } },
        selo('aposta', 'hg-selo'), 'Apostar'));
    }
    return itens.length ? el('div', { class: 'hg-hab' }, itens) : null;
  }

  function cartaoGrupo(e, g) {
    return el('div', { class: `hg-cartao${g.conectado ? '' : ' fora'}` },
      el('div', { class: 'hg-topo' },
        etiquetaGrupo(g.cor),
        el('span', { class: `hg-conexao${g.conectado ? ' on' : ''}`, title: g.conectado ? 'Conectado' : 'Sem conexão' }, g.conectado ? 'conectado' : 'sem conexão')),
      el('div', { class: 'hg-meio' },
        el('span', { class: `hg-pontos${g.pontos < 0 ? ' neg' : ''}` }, pontosTotal(g.pontos), el('small', {}, ' pts')),
        bolinhas(e, g)),
      habilidade(e, g));
  }

  function grupos(e) {
    const gs = e.estado.grupos;
    return el('div', { class: 'hg-grade', style: `--cols:${gs.length > 8 ? 5 : 4}` }, gs.map((g) => cartaoGrupo(e, g)));
  }

  // ---------- ranking e desempate ----------
  function rankingCartao(e) {
    const empate = e.empatados.length > 1 && !e.vencedor;
    const linhas = e.ranking.map((r, i) => {
      const g = e.estado.grupos.find((x) => x.cor === r.cor);
      const caixa = el('input', { type: 'checkbox', id: `elg-${r.cor}`, checked: r.elegivel });
      caixa.addEventListener('change', () => executar('definirElegivel', r.cor, caixa.checked));
      return el('li', { class: `hr-linha${e.vencedor === r.cor ? ' vence' : ''}` },
        el('span', { class: 'hr-pos' }, `${i + 1}º`),
        el('span', { class: 'hr-cor' }, etiquetaGrupo(r.cor), (e.lideres || []).includes(r.cor) ? el('img', { class: 'hr-trofeu', src: '/assets/trofeu.webp', alt: 'Vencedor', title: 'Vencedor' }) : null,
          !r.elegivel ? el('small', { class: 'hr-inelegivel' }, TXT.naoElegivel) : null),
        el('span', { class: `hr-pontos${r.pontos < 0 ? ' neg' : ''}` }, pontosTotal(r.pontos)),
        el('label', { class: 'hr-elegivel', for: `elg-${r.cor}` }, caixa, 'Elegível ao prêmio'),
        el('span', {}, e.vencedor === r.cor ? el('span', { class: 'hj-tag forte' }, 'vencedor') : null));
    });
    const vencedor = e.vencedor && e.ranking.find((r) => r.cor === e.vencedor);
    let resumo = '';
    if (empate) resumo = `Empate na primeira colocação entre ${e.empatados.map(nomeG).join(', ')}. Inicie o desempate.`;
    else if (vencedor) resumo = `Vencedor: ${nomeG(vencedor.cor)}.`;
    else resumo = 'Nenhum grupo elegível ao prêmio.';
    // Botão Comemorar: só com vencedor definido (a regra de sempre). Sem vencedor, desabilitado e com o motivo ao lado.
    const pc = e.podeComemorar || { pode: false, motivo: 'Defina o vencedor antes de comemorar.' };
    const comemorar = el('div', { class: 'hr-comemorar' },
      el('button', {
        class: 'btn-secundario forte hr-comemorar-btn', id: 'hr-comemorar', disabled: !pc.pode, 'aria-describedby': pc.pode ? null : 'hr-comemorar-motivo',
        onclick: () => executar('comemorar'),
      }, el('img', { src: '/assets/trofeu.webp', alt: '' }), 'Comemorar'),
      pc.pode ? null : el('p', { class: 'hr-motivo', id: 'hr-comemorar-motivo' }, pc.motivo));
    return el('div', { class: 'cartao leve hj-cartao hr-cartao' },
      el('h2', {}, 'Ranking', el('small', {}, resumo)),
      comemorar,
      el('ol', { class: 'hr-lista' }, linhas));
  }

  function rodape(e) {
    const s = e.estado;
    if (!['ranking', 'final'].includes(s.fase)) return null;
    return el('div', { class: 'hj-rodape' },
      el('button', { class: 'btn-secundario', onclick: () => { S.confirmarNovo = true; redesenhar(); } }, 'Novo jogo'));
  }

  // ---------- janelas de decisão dentro da página ----------
  function veu(...filhos) {
    return el('div', { class: 'hj-veu', role: 'dialog' }, ...filhos);
  }

  // ---------- troca de acertos por habilidade, no lugar do grupo (reserva; mesmas regras e fases do celular) ----------
  const FASES_TROCA = ['explicacao', 'so_correta', 'placar', 'pergunta', 'alternativas'];
  const TIPOS_FAIXA = ['bloqueio', 'escudo', 'passe', 'dobro', 'dica5050'];
  function faixa(c, n) {
    if (n >= c.seqDica) return TIPOS_FAIXA;
    if (n >= c.seqDobro) return TIPOS_FAIXA.slice(0, 4);
    if (n >= c.seqBloqueio) return TIPOS_FAIXA.slice(0, 3);
    return [];
  }
  const podeComprar = (e, g) => FASES_TROCA.includes(e.estado.fase) && !e.estado.rodada?.desempate
    && e.estado.respondidas < e.estado.config.meta && g.sequencia >= e.estado.config.seqBloqueio
    && g.trocas < e.estado.config.compraMax;

  function modalCompra(e) {
    const C = S.compra;
    if (!C) return null;
    const g = e.estado.grupos.find((x) => x.cor === C.cor);
    if (!g || !podeComprar(e, g)) { S.compra = null; return null; } // o jogo andou
    const c = e.estado.config;
    const D = descricoes(c);
    const cheio = g.habilidades.length >= c.estoqueMax;
    const sair = () => { S.compra = null; S.erro = ''; redesenhar(); };
    const confirmar = async () => {
      const r = await executar('trocarAcertos', g.cor, C.escolha, C.indice);
      if (r.t === 'ok') { S.compra = null; redesenhar(); }
    };
    const cabeca = [el('h2', {}, 'Comprar habilidade'), el('p', { class: 'hj-modal-grupo' }, etiquetaGrupo(g.cor)),
      el('p', { class: 'hj-nota' }, 'Registrar no lugar do grupo (reserva; o grupo troca no celular):'), el('p', {}, TXT.acertos(g.sequencia, c.seqDica))];
    const erro = S.erro ? el('p', { class: 'msg-erro', role: 'alert' }, S.erro) : null;
    if (!C.escolha) {
      return veu(el('div', { class: 'cartao hj-modal' }, ...cabeca, el('p', {}, TXT.trocarEscolha),
        el('div', { class: 'hj-opcoes' }, faixa(c, g.sequencia).map((tipo) => el('button', {
          class: 'hj-opcao', onclick: () => { C.escolha = tipo; C.indice = undefined; C.passo = cheio ? 'subst' : 'ok'; redesenhar(); },
        }, selo(tipo, 'hj-opcao-selo'), el('span', {}, el('strong', {}, NOMES[tipo]), D[tipo])))),
        el('div', { class: 'hj-linha-botoes' }, el('button', { class: 'btn-secundario', onclick: sair }, 'Cancelar'))));
    }
    const voltar = el('button', { class: 'btn-secundario', onclick: () => { C.escolha = null; C.indice = undefined; S.erro = ''; redesenhar(); } }, 'Voltar');
    if (C.passo === 'subst' && C.indice === undefined) {
      return veu(el('div', { class: 'cartao hj-modal' }, ...cabeca, el('p', {}, TXT.estoqueCheio),
        el('div', { class: 'hj-opcoes' }, g.habilidades.map((h, i) => el('button', { class: 'hj-opcao', onclick: () => { C.indice = i; redesenhar(); } },
          selo(h.tipo, 'hj-opcao-selo'), el('span', {}, el('strong', {}, `Trocar ${NOMES[h.tipo]}`))))),
        el('div', { class: 'hj-linha-botoes' }, voltar)));
    }
    const sai = C.indice !== undefined ? ` ${TXT.saiDoEstoque(NOMES[g.habilidades[C.indice].tipo])}` : '';
    return veu(el('div', { class: 'cartao hj-modal' }, ...cabeca,
      el('p', {}, TXT.trocarConfirma(g.sequencia, NOMES[C.escolha]) + sai), erro,
      el('div', { class: 'hj-linha-botoes' }, voltar, el('button', { class: 'btn-pilula pequeno', onclick: confirmar }, 'Confirmar'))));
  }

  // Bloqueio contra quem tem Escudo: o grupo decide antes da janela.
  function modalEscudo(e) {
    const r = e.estado.rodada;
    if (!['pergunta', 'alternativas'].includes(e.estado.fase) || !r?.escudos?.length) return null;
    const { alvo, atacante } = r.escudos[0];
    return veu(el('div', { class: 'cartao hj-modal' },
      el('h2', {}, 'Decisão sobre o Escudo'),
      el('p', { class: 'hj-modal-grupo' }, etiquetaGrupo(atacante), ' ativou o Bloqueio sobre ', etiquetaGrupo(alvo)),
      el('p', {}, `Registre a decisão do grupo ${nomeG(alvo)}: usar o Escudo, ou aceitar o bloqueio e guardar o Escudo.`),
      el('div', { class: 'hj-opcoes' },
        el('button', { class: 'hj-opcao', onclick: () => executar('decidirEscudo', alvo, atacante, true) },
          selo('escudo', 'hj-opcao-selo'), el('span', {}, el('strong', {}, 'Usar o Escudo'), 'Anula o Bloqueio. Os dois são consumidos.')),
        el('button', { class: 'hj-opcao', onclick: () => executar('decidirEscudo', alvo, atacante, false) },
          selo('bloqueio', 'hj-opcao-selo'), el('span', {}, el('strong', {}, 'Aceitar o bloqueio e guardar o Escudo'), `${nomeG(alvo)} não aperta nesta rodada; o Escudo continua guardado.`)))));
  }

  // Aposta: dois modos de pagamento, com o que será cobrado antes de confirmar.
  function modalAposta(e) {
    const A = S.aposta;
    if (!A) return null;
    const s = e.estado;
    const r = s.rodada;
    const c = s.config;
    const g = s.grupos.find((x) => x.cor === A.cor);
    if (!g || !r || !['pergunta', 'alternativas'].includes(s.fase) || r.usou[g.cor]) { S.aposta = null; return null; } // o jogo andou
    const T = textosAposta(c);
    const sair = () => { S.aposta = null; S.erro = ''; redesenhar(); };
    const confirmar = async () => {
      const resp = await executar('apostar', g.cor, A.modo, A.modo === 'habilidades' ? A.sel : undefined);
      if (resp.t === 'ok') { S.aposta = null; redesenhar(); }
    };
    const cabeca = [el('h2', {}, 'Aposta'), el('p', { class: 'hj-modal-grupo' }, etiquetaGrupo(g.cor))];
    const erro = S.erro ? el('p', { class: 'msg-erro', role: 'alert' }, S.erro) : null;

    if (!A.modo) {
      const motivoHab = g.habilidades.length < c.apostaTrocaQtd ? `O grupo tem ${g.habilidades.length} habilidade(s) guardada(s) e precisa de ${c.apostaTrocaQtd}.` : null;
      const motivoPts = r.final ? 'Não vale na rodada final.'
        : g.pontos - c.apostaCusto < -c.apostaDivida ? `O saldo ficaria abaixo de −${c.apostaDivida} pontos.` : null;
      const opcao = (modo, titulo, texto, motivo) => el('button', {
        class: `hj-opcao${motivo ? ' desab' : ''}`,
        disabled: !!motivo,
        onclick: () => { A.modo = modo; A.sel = modo === 'habilidades' && g.habilidades.length === c.apostaTrocaQtd ? g.habilidades.map((_, i) => i) : []; S.erro = ''; redesenhar(); },
      }, selo('aposta', 'hj-opcao-selo'), el('span', {}, el('strong', {}, titulo), texto, motivo ? el('em', { class: 'hj-opcao-motivo' }, motivo) : null));
      return veu(el('div', { class: 'cartao hj-modal hj-modal-largo' }, ...cabeca,
        el('p', { class: 'hj-nota' }, 'Registrar no lugar do grupo (reserva; o grupo decide no celular):'),
        el('p', {}, T.introducao),
        el('div', { class: 'hj-opcoes' },
          opcao('habilidades', `Trocar ${c.apostaTrocaQtd} habilidades`, T.habilidades, motivoHab),
          opcao('pontos', `Pagar ${c.apostaCusto} pontos`, T.pontos, motivoPts)),
        el('div', { class: 'hj-linha-botoes' }, el('button', { class: 'btn-secundario', onclick: sair }, 'Cancelar'))));
    }

    const voltar = el('button', { class: 'btn-secundario', onclick: () => { A.modo = null; S.erro = ''; redesenhar(); } }, 'Voltar');
    if (A.modo === 'habilidades') {
      const escolhidas = A.sel.map((i) => NOMES[g.habilidades[i].tipo]);
      const pronto = A.sel.length === c.apostaTrocaQtd;
      return veu(el('div', { class: 'cartao hj-modal hj-modal-largo' }, ...cabeca,
        el('p', {}, `Escolha ${c.apostaTrocaQtd} habilidades para o grupo entregar:`),
        el('div', { class: 'hj-opcoes' }, g.habilidades.map((h, i) => {
          const marcada = A.sel.includes(i);
          return el('button', {
            class: `hj-opcao${marcada ? ' marcada' : ''}`, 'aria-pressed': marcada ? 'true' : 'false',
            onclick: () => { A.sel = marcada ? A.sel.filter((x) => x !== i) : [...A.sel, i]; redesenhar(); },
          }, selo(h.tipo, 'hj-opcao-selo'), el('span', {}, el('strong', {}, NOMES[h.tipo]), marcada ? 'Será entregue se a aposta for cobrada' : 'Toque para entregar'));
        })),
        el('div', { class: 'hj-cobranca' },
          el('h3', {}, 'O que será cobrado'),
          el('ul', {}, cobrancaAposta('habilidades', c, { entrega: pronto ? escolhidas : [] }).map((l) => el('li', {}, l)))),
        erro,
        el('div', { class: 'hj-linha-botoes' }, voltar,
          el('button', { class: 'btn-pilula pequeno', disabled: !pronto, onclick: confirmar }, 'Confirmar Aposta'))));
    }
    const m = c.apostaMult;
    return veu(el('div', { class: 'cartao hj-modal hj-modal-largo' }, ...cabeca,
      el('div', { class: 'hj-cobranca' },
        el('h3', {}, 'O que será cobrado'),
        el('ul', {}, cobrancaAposta('pontos', c, { saldo: g.pontos }).map((l) => el('li', {}, l)))),
      erro,
      el('div', { class: 'hj-linha-botoes' }, voltar,
        el('button', { class: 'btn-pilula pequeno', onclick: confirmar }, 'Confirmar Aposta'))));
  }

  // Dica 50/50: aparece quando o 2º respondente vira o respondente atual e ele tem a Dica guardada.
  function modalDica(e) {
    const d = infoDica(e);
    if (!d || S.dicaDispensada === e.estado.rodadaNum) return null;
    const g = e.estado.grupos.find((x) => x.cor === d.cor);
    const D = descricoes(e.estado.config);
    return veu(el('div', { class: 'cartao hj-modal' },
      el('h2', {}, 'Dica 50/50'),
      el('p', { class: 'hj-modal-grupo' }, etiquetaGrupo(g.cor)),
      el('p', { class: 'hj-nota' }, 'Registrar no lugar do grupo (reserva; o grupo decide no celular):'),
      el('p', {}, 'Usar a Dica 50/50?'),
      el('p', { class: 'hj-nota' }, D.dica5050),
      S.erro ? el('p', { class: 'msg-erro', role: 'alert' }, S.erro) : null,
      el('div', { class: 'hj-linha-botoes' },
        el('button', { class: 'btn-secundario', onclick: () => { S.dicaDispensada = e.estado.rodadaNum; redesenhar(); } }, 'Não usar'),
        el('button', { class: 'btn-pilula pequeno', onclick: () => executar('usarDica5050') }, 'Usar a Dica 50/50'))));
  }

  // Pedido de Bloqueio feito no celular: só ao confirmar a habilidade é gasta e o Bloqueio vale.
  function modalPedido(e) {
    const p = (e.pedidos || [])[0];
    if (!p || !['pergunta', 'alternativas'].includes(e.estado.fase)) return null;
    return veu(el('div', { class: 'cartao hj-modal' },
      el('h2', {}, 'Pedido de Bloqueio'),
      el('p', { class: 'hj-modal-grupo' }, etiquetaGrupo(p.cor), ' quer bloquear ', etiquetaGrupo(p.alvo)),
      el('p', { class: 'hj-nota' }, 'Pedido feito no celular do grupo. Só ao confirmar a habilidade é gasta e o Bloqueio vale; ao recusar, nada é gasto.'),
      S.erro ? el('p', { class: 'msg-erro', role: 'alert' }, S.erro) : null,
      el('div', { class: 'hj-linha-botoes' },
        el('button', { class: 'btn-secundario', onclick: () => executar('recusarBloqueio', p.cor) }, 'Recusar'),
        el('button', { class: 'btn-pilula pequeno', onclick: () => executar('confirmarBloqueio', p.cor) }, 'Confirmar'))));
  }

  function modalAlvo(e) {
    if (!S.alvo) return null;
    const cor = S.alvo;
    const outros = e.estado.grupos.filter((g) => g.cor !== cor);
    return veu(el('div', { class: 'cartao hj-modal' },
      el('h2', {}, 'Quem será bloqueado?'),
      el('p', {}, `${nomeG(cor)} usa o Bloqueio. O grupo escolhido não consegue apertar nesta rodada.`),
      el('div', { class: 'hj-alvos' }, outros.map((g) =>
        el('button', {
          class: 'hj-alvo',
          style: estiloCor(g.cor),
          onclick: async () => { S.alvo = null; await executar('ativarHabilidade', cor, 'bloqueio', g.cor); redesenhar(); },
        }, nomeG(g.cor)))),
      el('div', { class: 'hj-linha-botoes' },
        el('button', { class: 'btn-secundario', onclick: () => { S.alvo = null; redesenhar(); } }, 'Cancelar'))));
  }

  function modalNovo() {
    if (!S.confirmarNovo) return null;
    return veu(el('div', { class: 'cartao hj-modal' },
      el('h2', {}, 'Começar um novo jogo?'),
      el('p', {}, 'Zera pontos, sequências, habilidades e histórico. As perguntas, as configurações e os grupos conectados continuam.'),
      el('div', { class: 'hj-linha-botoes' },
        el('button', { class: 'btn-secundario', onclick: () => { S.confirmarNovo = false; redesenhar(); } }, 'Cancelar'),
        el('button', { class: 'btn-pilula pequeno', onclick: async () => { S.confirmarNovo = false; await executar('zerarJogo'); redesenhar(); } }, 'Novo jogo'))));
  }

  // ---------- montagem ----------
  function render(e) {
    NOMES = e.nomes || {};
    viva = true;
    ultimo = e;
    ultimoRecebidoEm = Date.now();
    const s = e.estado;
    const fase = s.fase;
    const noRanking = fase === 'ranking';
    const noFinal = fase === 'final';

    let centro;
    if (noRanking) {
      centro = el('div', { class: 'hj-unico' }, rankingCartao(e));
    } else if (fase === 'placar') {
      centro = el('div', { class: 'hj-unico' },
        el('div', { class: 'cartao leve hj-cartao' },
          el('h2', {}, 'Placar na tela'),
          el('p', {}, 'O placar parcial está no projetor. Use o botão acima (ou a seta amarela na tela) para seguir para a próxima pergunta.')));
    } else if (noFinal) {
      centro = el('div', { class: 'hj-unico' },
        el('div', { class: 'cartao leve hj-cartao' },
          el('h2', {}, 'Tela final no projetor'),
          el('p', {}, 'Os integrantes e o agradecimento estão na tela. Use o botão acima para voltar à capa.')));
    } else {
      centro = el('div', { class: 'hj-meio' }, fila(e), previa(e));
    }

    return el('section', { class: 'cena hj-jogo' },
      el('div', { class: 'fundo', html: fundoDiscreto() }),
      el('div', { class: 'conteudo hj-corpo' },
        barra(e),
        fase === 'resposta' ? botoesAlternativas(e) : botaoPrincipal(e),
        S.erro ? el('p', { class: 'msg-erro hj-erro', role: 'alert' }, S.erro) : null,
        centro,
        noRanking || noFinal ? rodape(e) : grupos(e)),
      modalCompra(e) || modalEscudo(e) || modalPedido(e) || modalAlvo(e) || modalAposta(e) || modalDica(e) || modalNovo());
  }

  function sair() { viva = false; }

  // Contagem da janela: atualiza só o número, sem refazer o painel.
  setInterval(() => {
    const n = document.getElementById('hj-tempo');
    if (!n || !ultimo || ultimo.estado.fase !== 'janela') return;
    const j = ultimo.janela;
    if (!j) return;
    const agora = Date.now() + (ultimo.agora - ultimoRecebidoEm);
    const resta = ultimo.estado.pausado || j.fimEm == null ? j.restanteMs ?? 0 : Math.max(0, j.fimEm - agora);
    n.textContent = `${Math.ceil(resta / 1000)} s`;
  }, 200);

  // ---------- atalhos de teclado ----------
  window.addEventListener('keydown', (ev) => {
    if (!viva || !ultimo || ev.ctrlKey || ev.altKey || ev.metaKey || ev.repeat) return;
    const alvo = ev.target;
    if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT')) return;
    if (S.alvo || S.aposta || S.compra || S.confirmarNovo || ultimo.estado.rodada?.escudos?.length || (ultimo.pedidos || []).length) return;
    if (infoDica(ultimo) && S.dicaDispensada !== ultimo.estado.rodadaNum) return;
    const s = ultimo.estado;
    const tecla = ev.key.toLowerCase();
    if (ev.key === ' ') {
      ev.preventDefault();
      if (s.fase !== 'resposta') disparar(principal(ultimo));
    } else if (tecla === 'p') {
      executar('pausar', !s.pausado);
    } else if (s.fase === 'resposta' && ['a', 'b', 'c', 'd'].includes(tecla)) {
      const i = tecla.charCodeAt(0) - 97;
      if (!s.rodada.erradas.includes(i) && ultimo.atual) executar('responder', i);
    }
  });

  return { render, sair };
}
