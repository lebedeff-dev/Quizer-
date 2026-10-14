// Habilidades: ícones, nomes e descrições, compartilhados por /tela, /host e celular.
// As regras estão em docs/regras-habilidades.md; os textos, em /shared/textos.js.
import { el } from '/shared/ui.js';
import { descricoes } from '/shared/textos.js';

export const ICONES = {
  bloqueio: '/assets/bloqueio.png',
  dobro: '/assets/dobro-x2.png',
  escudo: '/assets/escudo.png',
  passe: '/assets/passe.png',
  dica5050: '/assets/dica-50-50.png',
  aposta: '/assets/aposta.png',
};

export const NOMES = {
  bloqueio: 'Bloqueio',
  dobro: 'Dobro',
  escudo: 'Escudo',
  passe: 'Passe',
  dica5050: 'Dica 50/50',
  aposta: 'Aposta',
};

// Descrições com os números padrão; use `descricoes(config)` para os da partida.
export const DESCRICOES = descricoes();
export { descricoes };

// Ficha de aposta desenhada em SVG próprio (anel pontilhado, círculo e losango). Usa a cor do texto
// (`currentColor`): escura sobre o círculo claro do tema claro e branca sobre o círculo escuro do noturno.
const SVG_APOSTA = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="20" stroke-width="3"/><circle cx="24" cy="24" r="20" stroke-width="8" stroke-dasharray="7 8.7"/><circle cx="24" cy="24" r="11" stroke-width="3"/><path d="M24 16.5 31.5 24 24 31.5 16.5 24Z" fill="currentColor" stroke="none"/></svg>';

// Ícone dentro do selo redondo (nunca se perde sobre cores escuras ou vermelhas). A Aposta é o SVG acima.
export function selo(tipo, classe = '') {
  if (tipo === 'aposta') return el('span', { class: `hab-selo hab-selo-svg ${classe}`.trim(), html: SVG_APOSTA });
  return el('span', { class: `hab-selo ${classe}`.trim(), }, el('img', { src: ICONES[tipo], alt: '', 'data-tipo': tipo }));
}
