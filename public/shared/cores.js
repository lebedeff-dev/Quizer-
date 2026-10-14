// As 10 cores dos grupos. Sempre sólidas; o texto sobre cada uma (preto ou branco) é
// escolhido pelo maior contraste calculado, nunca fixado à mão.
let tema = 'claro';
// Contorno de cada time por tema, definido só aqui. Preto (claro): cinza `#616161`. Branco (noturno): preto `#000000`; sua sombra
// sólida no celular continua cinza `#9E9E9E` (propriedade `sombra`).
const PRETO = { nome: 'Preto', hex: '#212121', contorno: '#616161' };
const BRANCO = { nome: 'Branco', hex: '#F2F2F2', contorno: '#000000', sombra: '#9E9E9E' };
// Chamado por aplicarTema (shared/ui.js) sempre que o tema global muda.
export function definirTemaDasCores(t) { tema = t === 'noturno' ? 'noturno' : 'claro'; }

export const CORES = {
  vermelho: { nome: 'Vermelho', hex: '#E57373' },
  azul: { nome: 'Azul', hex: '#64B5F6' },
  verde: { nome: 'Verde', hex: '#81C784' },
  amarelo: { nome: 'Amarelo', hex: '#FFEE58' },
  laranja: { nome: 'Laranja', hex: '#FFB74D' },
  roxo: { nome: 'Roxo', hex: '#BA68C8' },
  rosa: { nome: 'Rosa', hex: '#F48FB1' },
  ciano: { nome: 'Ciano', hex: '#4DB6AC' },
  // O time de id "preto" é Preto no tema claro e Branco no noturno (mesmo grupo, mesma pontuação): ver PRETO e BRANCO.
  get preto() { return tema === 'noturno' ? BRANCO : PRETO; },
  cinza: { nome: 'Cinza', hex: '#90A4AE' },
};

export const ORDEM_CORES = Object.keys(CORES);

// Versões saturadas das cores dos grupos, só para os fogos de artifício (sobre fundo escuro as pastel ficam apagadas).
// O Preto brilha em branco.
export const VIVAS = {
  vermelho: '#FF1744', azul: '#2979FF', verde: '#00E676', amarelo: '#FFEA00', laranja: '#FF9100',
  roxo: '#D500F9', rosa: '#FF4081', ciano: '#1DE9B6', preto: '#FFFFFF', cinza: '#B0BEC5',
};

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Luminância relativa (WCAG).
function luminancia(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(hexA, hexB) {
  const a = luminancia(hexA);
  const b = luminancia(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Preto ou branco, o que tiver mais contraste sobre a cor.
export function textoSobre(hex) {
  return contraste(hex, '#000000') >= contraste(hex, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

// Escurece uma cor misturando com preto (resultado sólido, para sombra de botão).
export function escurecer(hex, fator = 0.25) {
  const [r, g, b] = rgb(hex).map((v) => Math.round(v * (1 - fator)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Estilo inline de um bloco/ficha da cor: fundo sólido e texto com contraste.
export function estiloCor(cor) {
  const { hex, contorno } = CORES[cor];
  return `background:${hex};color:${textoSobre(hex)};${contorno ? `box-shadow:inset 0 0 0 2px ${contorno};` : ''}`;
}
