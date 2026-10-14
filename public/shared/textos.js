// Textos das habilidades e da Aposta, escritos uma vez e usados na janela de oferta, no estoque, na cena Regras
// e nos celulares. Módulo puro (sem DOM): o Node também o importa nos testes. Os números vêm da configuração.
// Fonte da verdade das regras: docs/regras-habilidades.md.

const plural = (n, um, varios) => (n === 1 ? um : varios);

// Resumo da escada de acertos seguidos (Etapa 8f), para a cena Regras e telas de ajuda: os acertos viram moeda.
export function resumoEscada(c = {}) {
  const b = c.seqBloqueio ?? 3;
  const d = c.seqDobro ?? 5;
  const k = c.seqDica ?? 7;
  return `Cada acerto seguido vale uma marca, até ${k}. Com ${b} marcas já dá para trocar por Bloqueio, Escudo ou Passe. Com ${d}, também pelo Dobro. Com ${k}, também pela Dica 50/50. Trocar zera as marcas e só vale antes da janela de 30 s.`;
}

export function descricoes(c = {}) {
  const segundo = c.pontosSegundo ?? 5;
  return {
    bloqueio: 'Tira um grupo da disputa: ele não poderá responder 1 rodada.',
    escudo: 'Protege contra Bloqueio. Se alguém bloquear o grupo, ele decide se usa o Escudo para anular.',
    passe: `Se for o primeiro a responder e não souber, passa a vez ao segundo, sem perder a sequência. O segundo recebe ${segundo} pontos.`,
    dobro: 'Pontos em dobro por 1 rodada.',
    dica5050: 'Retira uma alternativa errada, deixando só duas opções. Vale apenas para o segundo a responder.',
    aposta: 'O grupo arrisca para ganhar mais. Só é cobrada se o grupo responder.',
  };
}

export function textosAposta(c = {}) {
  const qtd = c.apostaTrocaQtd ?? 2;
  const bonus = c.apostaTrocaBonus ?? 10;
  const penal = c.apostaTrocaPenal ?? 5;
  const custo = c.apostaCusto ?? 10;
  const mult = c.apostaMult ?? 3;
  const primeiro = c.pontosPrimeiro ?? 10;
  return {
    introducao: 'O grupo arrisca para ganhar mais. Só é cobrada se o grupo responder; se não apertar, nada é cobrado. Errar, ser desqualificado ou dizer ‘Sem resposta’ conta como erro. Escolha como pagar:',
    habilidades: `O grupo entrega ${qtd} ${plural(qtd, 'habilidade guardada', 'habilidades guardadas')}. Se acertar, ganha +${bonus} pontos de bônus além dos pontos da rodada. Se errar, perde ${penal} pontos.`,
    pontos: `O grupo paga ${custo} pontos. Se acertar, os pontos da rodada valem ${mult} vezes. Exemplo: o primeiro acerta, ${primeiro} × ${mult} = ${primeiro * mult}, menos os ${custo} pagos = +${primeiro * mult - custo}. Se errar, perde os ${custo} pontos pagos. Não vale na rodada final.`,
  };
}

// Pontos com sinal legível, com o sinal de menos de verdade: "+10", "−5" e "0". `comMais` omite o "+" se falso.
export function pontosComSinal(n, comMais = true) {
  if (n < 0) return `−${Math.abs(n)}`;
  return n > 0 && comMais ? `+${n}` : String(n);
}

// Placar sem "+" (o total do grupo): "12", "0", "−5".
export const pontosTotal = (n) => pontosComSinal(n, false);

// O que será cobrado numa Aposta, linha a linha: o mesmo texto no painel e no celular.
// `entrega` = nomes das habilidades escolhidas (modo "habilidades"); `saldo` = pontos do grupo.
export function cobrancaAposta(modo, c = {}, { saldo = 0, entrega = [] } = {}) {
  const bonus = c.apostaTrocaBonus ?? 10;
  const penal = c.apostaTrocaPenal ?? 5;
  const custo = c.apostaCusto ?? 10;
  const m = c.apostaMult ?? 3;
  const p1 = c.pontosPrimeiro ?? 10;
  const p2 = c.pontosSegundo ?? 5;
  if (modo === 'habilidades') {
    return [
      entrega.length ? `Entrega: ${entrega.join(' e ')} (saem do estoque só quando a aposta for cobrada).` : 'Entrega: escolha as habilidades acima.',
      `Acertando: ${pontosComSinal(bonus)} pontos de bônus além dos pontos da rodada.`,
      `Errando, sendo desqualificado ou ‘Sem resposta’: ${pontosComSinal(-penal)} pontos.`,
      'Se o grupo não apertar, nada é cobrado e as habilidades continuam guardadas.',
    ];
  }
  return [
    `O grupo paga ${custo} pontos. Saldo atual: ${pontosTotal(saldo)}.`,
    `Acertando como 1º: ${pontosComSinal(p1 * m - custo)} pontos (${p1} × ${m} − ${custo}).`,
    `Acertando como 2º: ${pontosComSinal(p2 * m - custo)} pontos (${p2} × ${m} − ${custo}).`,
    `Errando, sendo desqualificado ou ‘Sem resposta’: ${pontosComSinal(-custo)} pontos.`,
    'Se o grupo não apertar, nada é cobrado.',
  ];
}

// Frases do celular do grupo (Etapa 8d): curtas e sóbrias, no mesmo tom dos textos acima.
export const CELULAR = {
  titulo: 'Habilidades',
  botao: 'Habilidades',
  botaoEscudo: 'Decidir sobre o Escudo',
  confirmar: 'Confirmar',
  voltar: 'Voltar',
  fechar: 'Fechar',
  nada: 'Nenhuma habilidade disponível agora.',
  dobro: 'Usar o Dobro nesta rodada? Os pontos do grupo valem em dobro.',
  bloqueioEscolha: 'Escolha o grupo que será bloqueado.',
  bloqueioConfirma: (nome) => `Pedir o Bloqueio sobre ${nome}? O responsável precisa confirmar.`,
  bloqueioPendente: (nome) => `Pedido enviado: Bloqueio sobre ${nome}. Aguardando o responsável.`,
  bloqueioCancelar: 'Cancelar pedido',
  bloqueioRecusado: 'O responsável recusou o pedido de Bloqueio. Nada foi gasto.',
  escudoPergunta: (nome) => `${nome} bloqueou vocês. Usar o Escudo ou aceitar o bloqueio?`,
  escudoUsar: 'Usar o Escudo',
  escudoAceitar: 'Aceitar o bloqueio',
  escudoUsarConfirma: 'Usar o Escudo e anular o Bloqueio? Os dois são consumidos.',
  escudoAceitarConfirma: 'Aceitar o bloqueio e guardar o Escudo? O grupo não aperta nesta rodada.',
  passe: (n) => `Passar a vez ao 2º respondente? O grupo não perde a sequência e o 2º recebe ${n} pontos.`,
  dica: (tirar) => `Usar a Dica 50/50? Retira ${tirar === 1 ? '1 alternativa errada' : '2 alternativas erradas'} e deixa só duas opções.`,
  acertos: (n, max) => `Acertos seguidos: ${n} de ${max}`,
  tigrinhoNome: 'Tigrinho',
  tigrinhoFoto: 'Foto de perfil do Tigrinho',
  tigrinhoTexto: (n) => `Oi! Seu grupo está há ${n} rodadas sem pontuar. Que tal uma aposta para virar o jogo?`,
  tigrinhoDispensar: 'Dispensar a mensagem do Tigrinho',
  tigrinhoAbrir: 'Abrir a Aposta',
  semPontuar: (n) => `${n} sem pontuar`,
  naoElegivel: 'não elegível',
  voceTem: 'Você tem:',
  usarHabilidade: (nome) => `Usar ${nome}`,
  usarIndisponivel: (nome, motivo) => `${nome}, indisponível agora. ${motivo}`,
  pedidoPendenteTitulo: 'Pedido de Bloqueio',
  trocasUsadas: (x, n) => `Trocas usadas: ${x} de ${n}`,
  trocarBotao: 'Trocar acertos por habilidade',
  trocarTitulo: 'Trocar acertos',
  trocarEscolha: 'Escolha a habilidade. Aparecem só as da sua faixa de acertos.',
  trocarConfirma: (n, nome) => `Trocar ${n} acertos por ${nome}? A sequência volta a zero.`,
  saiDoEstoque: (nome) => `Sai do estoque: ${nome}.`,
  estoqueCheio: 'O estoque está cheio. Qual habilidade guardada será trocada?',
  trocar: (novo, velho) => `Trocar ${velho} por ${novo}? A sequência volta a zero.`,
  apostaTitulo: 'Aposta',
  apostaEscolher: (qtd) => `Escolha ${qtd} habilidades para o grupo entregar:`,
  apostaConfirmar: 'Confirmar Aposta',
  saldo: (n) => `Saldo do grupo: ${pontosTotal(n)} pontos`,
  feito: 'Pronto.',
};
