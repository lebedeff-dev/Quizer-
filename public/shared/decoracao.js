// Decoração em SVG inline, sem imagens externas. Tudo fica atrás do texto (.fundo).

// Cruz médica em caixa 100x100; o arredondamento vem do stroke-linejoin round.
const CRUZ = 'M30 5H70V30H95V70H70V95H30V70H5V30H30Z';

function svg(estilo, viewBox, corpo, extra = '') {
  return `<svg style="${estilo}" viewBox="${viewBox}" aria-hidden="true" focusable="false" ${extra}>${corpo}</svg>`;
}

const cruz = (classe, estilo) => svg(estilo, '0 0 100 100', `<path class="${classe}" d="${CRUZ}"/>`);

// Cruz de contorno duplo: contorno azul e uma cópia deslocada em azul claro.
const cruzDupla = (estilo) =>
  svg(estilo, '0 0 112 112',
    `<path class="cruz-contorno-eco" d="${CRUZ}" transform="translate(12 12)"/><path class="cruz-contorno" d="${CRUZ}"/>`);

// Mancha rosa orgânica.
const mancha = (estilo) =>
  svg(estilo, '0 0 600 600',
    '<path class="mancha" d="M318 28C430 10 555 78 577 205c20 118-34 190-83 262-58 86-168 124-275 98C108 540 24 450 22 330 20 214 82 150 144 94 195 48 250 38 318 28Z"/>');

const ondas = (estilo) =>
  svg(estilo, '0 0 1440 220',
    '<path class="onda-suave" d="M0 90C240 20 480 20 720 80S1200 150 1440 70V220H0Z"/>' +
      '<path class="onda-forte" d="M0 150C300 105 600 190 900 150S1300 115 1440 150V220H0Z"/>',
    'preserveAspectRatio="none"');

const ONDAS_BAIXO = 'left:0;bottom:0;width:100%;height:20vh;';

export function fundoCapa() {
  return [
    // pequena cruz sólida no canto superior esquerdo
    cruz('cruz-solida', 'left:5vw;top:7vh;width:3.6vw;min-width:38px;'),
    // lado direito: mancha rosa, cruzes pálidas cortadas pela borda e cruz de contorno duplo
    // cruz inteira, pequena e bem clara (sem corte pela borda)
    cruz('cruz-clara', 'left:58vw;top:9vh;width:4.5vw;min-width:44px;'),
    mancha('right:-3vw;top:calc(50% - 20vw);width:36vw;'),
    cruzDupla('right:14vw;top:calc(50% - 6vw);width:9vw;'),
    cruz('cruz-solida', 'right:11vw;top:calc(50% + 12vw);width:3vw;min-width:28px;'),
    ondas(ONDAS_BAIXO),
  ].join('');
}

export function fundoMenu() {
  return [
    cruz('cruz-solida', 'left:5vw;top:7vh;width:3.6vw;min-width:38px;'),
    cruz('cruz-clara', 'right:7vw;top:8vh;width:5vw;min-width:44px;'),
    ondas(ONDAS_BAIXO),
  ].join('');
}

// Fundo quase vazio, para o painel do responsável durante o jogo.
export function fundoDiscreto() {
  return ondas('left:0;bottom:0;width:100%;height:10vh;');
}
