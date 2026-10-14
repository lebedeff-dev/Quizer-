// Dados puros das imagens dos times (sem DOM, para testar em Node). O elemento fica em imagens-times.js.
const TRACO = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';

const ESTETOSCOPIO = '<path d="M16 8v14a12 12 0 0 0 24 0V8M16 8h-4M40 8h4M28 34v8a10 10 0 0 0 20 0"/><circle cx="48" cy="38" r="5"/>';
const RELOGIO = '<circle cx="32" cy="32" r="22"/><path d="M32 18v14l9 6"/>';
const OLHO = '<path d="M4 32C12 18 22 12 32 12s20 6 28 20C52 46 42 52 32 52S12 46 4 32z"/><circle cx="32" cy="32" r="8"/>';
const BALANCA = '<path d="M32 10v42M20 54h24M12 18h40M12 18L6 34M12 18l10 16M52 18l-10 16M52 18l6 16"/><path d="M6 34a8 6 0 0 0 16 0zM42 34a8 6 0 0 0 16 0z"/>';

export const DESENHOS = {
  vermelho: ESTETOSCOPIO, // estetoscópio
  azul: '<rect x="14" y="10" width="36" height="46" rx="4"/><rect x="24" y="5" width="16" height="9" rx="2"/><path d="M22 28h20M22 36h20M22 44h12"/>', // prancheta
  verde: '<rect x="27" y="6" width="10" height="26" rx="2" transform="rotate(20 32 19)"/><path d="M14 56h36M22 56a18 18 0 0 0 20-24M16 46h20"/>', // microscópio
  amarelo: BALANCA, // balança em equilíbrio
  laranja: '<path d="M10 12h44a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H28L16 54V44h-6a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z"/><path d="M32 20v12"/><circle cx="32" cy="38" r="1.6" fill="currentColor"/>', // balão de fala com exclamação
  roxo: '<path d="M32 36C20 28 18 18 24 14c4-2 7 0 8 3 1-3 4-5 8-3 6 4 4 14-8 22z"/><path d="M6 40c4 14 16 20 26 20s22-6 26-20"/>', // coração em mãos em concha
  rosa: '<circle cx="32" cy="24" r="14"/><path d="M32 38v20M22 48h20"/>', // símbolo de Vênus
  ciano: '<path d="M32 28C20 10 10 18 16 30c4 8 12 6 16-2 4 8 12 10 16 2 6-12-4-20-16-2z"/><path d="M32 28L22 56M32 28l10 28"/>', // laço de conscientização
  preto: RELOGIO, // relógio: a demora no atendimento (o traço fica branco pelo contraste calculado)
  cinza: OLHO, // olho: a dor que ninguém vê
};

export const OPACIDADE_PADRAO = 12; // por cento; 0 desliga

export function svgDoTime(cor) {
  return `<svg viewBox="0 0 64 64" ${TRACO} aria-hidden="true" focusable="false">${DESENHOS[cor] || ''}</svg>`;
}

