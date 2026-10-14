// Folha de habilidades do celular do grupo (Etapa 8d): o grupo decide aqui, com confirmação, e o efeito é imediato.
// Tudo vem de `v.acoes` (o que ESTE grupo pode fazer agora) e `v.regras`; o servidor valida de novo cada ação.
import { el } from '/shared/ui.js';
import { CORES, textoSobre } from '/shared/cores.js';
import { classeTam } from '/shared/nomes.js';
import { ICONES, NOMES, descricoes, selo } from '/shared/habilidades.js';
import { textosAposta, cobrancaAposta, CELULAR as T } from '/shared/textos.js';

// Passo em que a folha abre sozinha quando algo exige decisão (Escudo e Dica 50/50).
export function passoAutomatico(v) {
  const a = v?.acoes;
  if (a?.escudo) return { chave: `escudo|${v.rodada}|${a.escudo.atacante}`, passo: 'escudo' };
  if (a?.dica) return { chave: `dica|${v.rodada}`, passo: 'dicaOk' };
  return null;
}

// Verifica se o passo atual ainda faz sentido com a visão nova (o painel pode ter registrado no lugar do grupo).
export function passoValido(v, F) {
  const a = v?.acoes;
  if (!F || !a) return false;
  const p = F.passo;
  if (p.startsWith('trocar')) return !!a.troca?.pode;
  if (p.startsWith('escudo')) return !!a.escudo;
  if (p === 'alvo' || p === 'bloqueioOk') return !!a.alvos?.length && !a.pedido && !a.usou;
  if (p.startsWith('aposta')) return !!a.aposta && !!a.preparo && !a.usou && !a.pedido;
  if (p === 'dobroOk') return !!a.usaveis?.includes('dobro');
  if (p === 'passeOk') return !!a.passe;
  if (p === 'dicaOk') return !!a.dica;
  if (p === 'pedido') return !!a.pedido;
  return false;
}

// `ctx` = { v, F, ir(passo), fechar(), enviar(nome, ...args) }
export function folha(ctx) {
  const { v, F } = ctx;
  const a = v.acoes;
  const D = descricoes(v.regras);
  // Outros grupos aparecem pelo nome que digitaram (o servidor manda só os nomes dos grupos citados nesta tela).
  const nomeCor = (c) => a.nomes?.[c] || CORES[c]?.nome || c;
  const bloco = (...filhos) => el('div', { class: 'g-folha', role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'g-folha-miolo' }, ...filhos));
  const titulo = (txt) => el('h2', { class: 'g-folha-titulo' }, txt);
  const texto = (txt, classe = '') => el('p', { class: `g-folha-texto ${classe}`.trim() }, txt);
  const botao = (rotulo, aoClicar, { forte = false, desabilitado = false, filhos = [] } = {}) =>
    el('button', { class: `g-fbtn${forte ? ' forte' : ''}`, disabled: desabilitado || !!F.ocupado, onclick: aoClicar }, ...filhos, el('span', {}, rotulo));
  const erro = () => (F.erro ? el('p', { class: 'g-folha-erro', role: 'alert' }, F.erro) : null);
  const itemHab = (tipo, rotulo, aoClicar, desc = D[tipo]) => el('button', { class: 'g-fitem', disabled: !!F.ocupado, onclick: aoClicar },
    selo(tipo, 'g-fitem-selo'), el('span', { class: 'g-fitem-txt' }, el('strong', {}, rotulo), el('small', {}, desc)));

  // confirmação: texto curto e dois botões grandes
  const confirmar = (titulo0, frase, nome, args, voltarPara, rotulo = T.confirmar) => bloco(
    titulo(titulo0), texto(frase, 'grande'), erro(),
    botao(rotulo, () => ctx.enviar(nome, ...args), { forte: true }),
    botao(T.voltar, () => (voltarPara ? ctx.ir(voltarPara) : ctx.fechar())));

  switch (F.passo) {
    case 'trocar': {
      const t = a.troca;
      return bloco(
        titulo(T.trocarTitulo), texto(T.acertos(t.sequencia, t.max), 'aviso'), texto(T.trocarEscolha),
        el('div', { class: 'g-fitens' }, t.opcoes.map((tipo) => itemHab(tipo, NOMES[tipo],
          () => ctx.ir({ passo: t.cheio ? 'trocarSubst' : 'trocarOk', escolha: tipo })))),
        botao(T.fechar, () => ctx.fechar()));
    }
    case 'trocarOk':
      return confirmar(NOMES[F.escolha], T.trocarConfirma(a.troca.sequencia, NOMES[F.escolha]), 'trocarAcertos', [F.escolha], 'trocar');
    case 'trocarSubst':
      return bloco(
        titulo(T.trocarTitulo), texto(T.estoqueCheio, 'grande'), erro(),
        el('div', { class: 'g-fitens' }, a.estoque.map((tipo, i) => itemHab(tipo, `Trocar ${NOMES[tipo]}`,
          () => ctx.ir({ passo: 'trocarSubstOk', escolha: F.escolha, indice: i, saiu: tipo }), ''))),
        botao(T.voltar, () => ctx.ir('trocar')));
    case 'trocarSubstOk':
      return confirmar(NOMES[F.escolha], `${T.trocarConfirma(a.troca.sequencia, NOMES[F.escolha])} ${T.saiDoEstoque(NOMES[F.saiu])}`, 'trocarAcertos', [F.escolha, F.indice], { passo: 'trocarSubst', escolha: F.escolha });
    case 'escudo': {
      const nome = nomeCor(a.escudo.atacante);
      return bloco(
        titulo(NOMES.escudo), texto(T.escudoPergunta(nome), 'grande'),
        botao(T.escudoUsar, () => ctx.ir('escudoUsar'), { forte: true, filhos: [selo('escudo', 'g-fbtn-selo')] }),
        botao(T.escudoAceitar, () => ctx.ir('escudoAceitar'))); // sem "Fechar": a decisão é obrigatória
    }
    case 'escudoUsar':
      return confirmar(NOMES.escudo, T.escudoUsarConfirma, 'decidirEscudo', [true], 'escudo');
    case 'escudoAceitar':
      return confirmar(NOMES.escudo, T.escudoAceitarConfirma, 'decidirEscudo', [false], 'escudo');
    case 'dobroOk':
      return confirmar(NOMES.dobro, T.dobro, 'ativarDobro', [], null);
    case 'alvo':
      return bloco(
        titulo(NOMES.bloqueio), texto(T.bloqueioEscolha, 'grande'),
        el('div', { class: 'g-alvos' }, a.alvos.map((cor) => el('button', {
          class: `g-alvo${classeTam(nomeCor(cor))}`, 'aria-label': `${nomeCor(cor)}, cor ${CORES[cor].nome}`, style: `background:${CORES[cor].hex};color:${textoSobre(CORES[cor].hex)}`, disabled: !!F.ocupado,
          onclick: () => ctx.ir({ passo: 'bloqueioOk', alvo: cor }),
        }, nomeCor(cor)))),
        botao(T.voltar, () => ctx.fechar()));
    case 'bloqueioOk':
      return confirmar(NOMES.bloqueio, T.bloqueioConfirma(nomeCor(F.alvo)), 'pedirBloqueio', [F.alvo], 'alvo');
    case 'passeOk':
      return confirmar(NOMES.passe, T.passe(v.regras.pontosSegundo), 'usarPasse', [], null);
    case 'dicaOk':
      return confirmar(NOMES.dica5050, T.dica(a.dica.tirar), 'usarDica5050', [], null);
    case 'aposta': {
      const txt = textosAposta(v.regras);
      const limite = a.aposta.motivo && !a.aposta.habilidades && !a.aposta.pontos ? a.aposta.motivo : null;
      const modo = (m, rotulo, desc, motivo) => el('button', { class: 'g-fitem', disabled: !!motivo || !!F.ocupado, onclick: () => ctx.ir({ passo: m === 'habilidades' ? 'apostaHab' : 'apostaPts', sel: m === 'habilidades' && a.estoque.length === v.regras.apostaTrocaQtd ? a.estoque.map((_, i) => i) : [] }) },
        selo('aposta', 'g-fitem-selo'), el('span', { class: 'g-fitem-txt' }, el('strong', {}, rotulo), el('small', {}, desc), motivo ? el('em', {}, motivo) : null));
      return bloco(
        titulo(T.apostaTitulo), texto(T.saldo(a.saldo), 'aviso'), texto(txt.introducao),
        limite ? texto(limite, 'aviso') : null,
        el('div', { class: 'g-fitens' },
          modo('habilidades', `Trocar ${v.regras.apostaTrocaQtd} habilidades`, txt.habilidades, a.aposta.habilidades),
          modo('pontos', `Pagar ${v.regras.apostaCusto} pontos`, txt.pontos, a.aposta.pontos)),
        botao(T.voltar, () => ctx.fechar()));
    }
    case 'apostaHab': {
      const qtd = v.regras.apostaTrocaQtd;
      const estoque = a.estoque;
      const sel = F.sel || [];
      const pronto = sel.length === qtd;
      const marcar = (i) => ctx.ir({ ...F, sel: sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i] }, true);
      return bloco(
        titulo(T.apostaTitulo), texto(T.apostaEscolher(qtd)),
        el('div', { class: 'g-fitens' }, estoque.map((tipo, i) => el('button', {
          class: `g-fitem${sel.includes(i) ? ' marcada' : ''}`, 'aria-pressed': sel.includes(i) ? 'true' : 'false', disabled: !!F.ocupado, onclick: () => marcar(i),
        }, selo(tipo, 'g-fitem-selo'), el('span', { class: 'g-fitem-txt' }, el('strong', {}, NOMES[tipo]), el('small', {}, sel.includes(i) ? 'Será entregue se a aposta for cobrada' : 'Toque para entregar'))))),
        el('ul', { class: 'g-cobranca' }, cobrancaAposta('habilidades', v.regras, { saldo: a.saldo, entrega: pronto ? sel.map((i) => NOMES[estoque[i]]) : [] }).map((l) => el('li', {}, l))),
        erro(),
        botao(T.apostaConfirmar, () => ctx.enviar('apostar', 'habilidades', sel), { forte: true, desabilitado: !pronto }),
        botao(T.voltar, () => ctx.ir('aposta')));
    }
    case 'apostaPts':
      return bloco(
        titulo(T.apostaTitulo), texto(T.saldo(a.saldo), 'aviso'),
        el('ul', { class: 'g-cobranca' }, cobrancaAposta('pontos', v.regras, { saldo: a.saldo }).map((l) => el('li', {}, l))),
        erro(),
        botao(T.apostaConfirmar, () => ctx.enviar('apostar', 'pontos'), { forte: true }),
        botao(T.voltar, () => ctx.ir('aposta')));
    default: // 'pedido': o Bloqueio já foi pedido e aguarda o responsável; dá para cancelar
      return bloco(
        titulo(T.pedidoPendenteTitulo), texto(T.bloqueioPendente(nomeCor(a.pedido)), 'grande'), erro(),
        botao(T.bloqueioCancelar, () => ctx.enviar('cancelarBloqueio'), { forte: true }),
        botao(T.fechar, () => ctx.fechar()));
  }
}

export { ICONES };
