'use strict';
// Campos editáveis da página Configurações: nome, explicação, unidade e limites. Uma só tabela serve à tela
// (textos) e ao servidor (validação), para as duas dizerem sempre a mesma coisa. Português simples, sem nomes internos.
const { CONFIG_PADRAO: P } = require('./game');

// `obrigatorio`: o servidor recusa o envio sem esse campo (os demais, se vierem vazios, mantêm o valor atual).
const SECOES = [
  {
    id: 'jogo', titulo: 'Jogo e perguntas',
    campos: [
      { chave: 'meta', nome: 'Perguntas respondidas até o fim do jogo', min: 1, max: 50, unidade: 'perguntas', obrigatorio: true,
        efeito: 'O jogo termina quando esse número de perguntas for respondido. Aumentar deixa o jogo mais longo.' },
      { chave: 'janela', nome: 'Tempo para apertar o botão', min: 5, max: 300, unidade: 'segundos', obrigatorio: true,
        efeito: 'Quanto tempo os grupos têm para apertar o botão depois que a janela abre. Aumentar dá mais tempo para decidir.' },
    ],
  },
  {
    id: 'pontos', titulo: 'Pontuação',
    campos: [
      { chave: 'pontosPrimeiro', nome: 'Pontos de quem acerta primeiro', min: 1, max: 100, unidade: 'pontos', obrigatorio: true,
        efeito: 'Pontos do grupo mais rápido que acerta. Aumentar valoriza mais a rapidez.' },
      { chave: 'pontosSegundo', nome: 'Pontos de quem acerta em segundo', min: 1, max: 100, unidade: 'pontos', obrigatorio: true,
        efeito: 'Não pode passar dos pontos de quem acerta primeiro. Se o primeiro for desqualificado, o segundo recebe a pontuação inteira.' },
    ],
  },
  {
    id: 'habilidades', titulo: 'Habilidades',
    campos: [
      { chave: 'seqBloqueio', nome: 'Acertos seguidos para trocar por Bloqueio, Escudo ou Passe', min: 2, max: 10, unidade: 'acertos', obrigatorio: true,
        efeito: 'Com essa quantidade de acertos seguidos, o grupo pode trocar todos os acertos por uma dessas habilidades. Aumentar torna as habilidades mais difíceis de ganhar.' },
      { chave: 'seqDobro', nome: 'Acertos seguidos para incluir o Dobro', min: 3, max: 15, unidade: 'acertos', obrigatorio: true,
        efeito: 'Precisa ser maior que o número anterior. A partir dele, o grupo também pode escolher o Dobro.' },
      { chave: 'seqDica', nome: 'Acertos seguidos para incluir a Dica 50/50', min: 3, max: 20, unidade: 'acertos',
        efeito: 'Precisa ser maior que o número do Dobro. É também o limite do contador de acertos seguidos.' },
      { chave: 'compraMax', nome: 'Trocas por grupo em cada jogo', min: 1, max: 7, unidade: 'trocas',
        efeito: 'Quantas vezes cada grupo pode trocar acertos por uma habilidade durante o jogo.' },
    ],
  },
  {
    id: 'aposta', titulo: 'Aposta',
    campos: [
      { chave: 'apostaCusto', nome: 'Pontos pagos na Aposta com pontos', min: 1, max: 100, unidade: 'pontos',
        efeito: 'Quanto o grupo paga para apostar com pontos. O valor só é cobrado se o grupo responder.' },
      { chave: 'apostaMult', nome: 'Multiplicador da Aposta com pontos', min: 2, max: 10, unidade: 'vezes',
        efeito: 'Quantas vezes os pontos da rodada valem para quem apostou. Os pontos pagos são descontados do resultado.' },
      { chave: 'apostaTrocaQtd', nome: 'Habilidades entregues na Aposta com habilidades', min: 1, max: 2, unidade: 'habilidades',
        efeito: 'Quantas habilidades o grupo guarda como garantia da aposta.' },
      { chave: 'apostaTrocaBonus', nome: 'Bônus por acertar na Aposta com habilidades', min: 1, max: 100, unidade: 'pontos',
        efeito: 'Pontos extras somados aos da rodada quando o grupo acerta.' },
      { chave: 'apostaTrocaPenal', nome: 'Pontos perdidos na Aposta com habilidades', min: 0, max: 100, unidade: 'pontos',
        efeito: 'Pontos tirados quando o grupo erra, é desqualificado ou fica sem resposta.' },
      { chave: 'apostaDivida', nome: 'Dívida máxima permitida', min: 0, max: 200, unidade: 'pontos',
        efeito: 'A Aposta com pontos não pode deixar o grupo com menos do que este valor abaixo de zero.' },
      { chave: 'apostaMax', nome: 'Apostas por grupo em cada jogo', min: 0, max: 10, unidade: 'apostas',
        efeito: 'Soma dos dois tipos de Aposta que cada grupo pode ter cobrada. Com zero, a Aposta fica desligada.' },
    ],
  },
  {
    id: 'placar', titulo: 'Placar parcial',
    campos: [
      { chave: 'placarN', nome: 'Mostrar o placar a cada quantas perguntas', min: 1, max: 50, unidade: 'perguntas',
        efeito: 'Vale quando o placar parcial está no modo “De tantas em tantas perguntas”. Aumentar mostra o placar com menos frequência.' },
      { chave: 'placarOcultar', nome: 'Esconder o placar nas últimas perguntas', min: 0, max: 50, unidade: 'perguntas',
        efeito: 'Não mostra o placar nas últimas perguntas do jogo, para manter o suspense. Com zero, o placar aparece sempre.' },
    ],
  },
  {
    id: 'aparencia', titulo: 'Aparência',
    campos: [
      { chave: 'imagensOpacidade', nome: 'Opacidade das imagens dos times', min: 0, max: 30, unidade: 'por cento',
        efeito: 'Força do desenho de fundo de cada cor, no painel, no projetor e nos celulares. Com zero, os desenhos somem. Vale na hora.' },
    ],
  },
];

const TODOS = SECOES.flatMap((s) => s.campos);

// Para a tela: a tabela com o padrão de cada campo.
function secoesParaTela() {
  return SECOES.map((s) => ({ ...s, campos: s.campos.map((c) => ({ ...c, padrao: P[c.chave] })) }));
}

const intervalo = (c) => `de ${c.min} a ${c.max}`;

// Valida os números enviados. Devolve { novo } ou { erro } com mensagem em português simples.
function validarNumeros(enviado) {
  const novo = {};
  for (const c of TODOS) {
    const bruto = enviado[c.chave];
    const vazio = bruto === undefined || bruto === '' || bruto === null;
    if (!c.obrigatorio && vazio) continue;
    const v = Number(bruto);
    if (vazio || !Number.isInteger(v) || v < c.min || v > c.max) {
      return { erro: `${c.nome}: use um número inteiro ${intervalo(c)}.` };
    }
    novo[c.chave] = v;
  }
  return { novo };
}

module.exports = { SECOES, TODOS, secoesParaTela, validarNumeros, intervalo };
