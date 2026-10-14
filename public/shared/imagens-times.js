// Imagens decorativas dos times (Etapa 8k): um ícone de traço único por cor, desenhado aqui mesmo (SVG inline,
// sem biblioteca nem arquivo externo). Sem rostos nem corpos. Servem só de detalhe visual, atrás do conteúdo.
import { el } from '/shared/ui.js';
import { CORES, textoSobre } from '/shared/cores.js';

import { svgDoTime, OPACIDADE_PADRAO } from '/shared/imagens-times-dados.js';

export { DESENHOS } from '/shared/imagens-times-dados.js';

// Elemento decorativo do time. `forma`: 'banner' (≈100 px, à direita), 'celular' (≈200 px, canto superior direito)
// ou 'grande' (banner de parabéns). A cor do traço é a cor de texto calculada para o grupo (preto ou branco).
// Opacidade 0 não cria elemento nenhum.
export function imagemTime(cor, opacidade = OPACIDADE_PADRAO, forma = 'banner') {
  const pct = Number.isFinite(Number(opacidade)) ? Math.min(30, Math.max(0, Number(opacidade))) : OPACIDADE_PADRAO;
  if (!CORES[cor] || pct <= 0) return null;
  return el('span', {
    class: `time-img ${forma}`,
    'aria-hidden': 'true',
    'data-time-img': cor,
    style: `color:${textoSobre(CORES[cor].hex)};opacity:${pct / 100}`,
    html: svgDoTime(cor),
  });
}
