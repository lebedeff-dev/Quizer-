// Nome de exibição de um grupo: o que o grupo digitou (o servidor já resolve vazio e repetido e manda em `nomes`).
// A cor só aparece como cor (fundo, barra, ponto); o nome da cor só serve de reserva se a visão ainda não trouxe nomes.
import { CORES } from '/shared/cores.js';

export const nomeDoGrupo = (nomes, cor) => nomes?.[cor] || CORES[cor]?.nome || cor;

// Nomes da visão que está sendo desenhada (a /tela e as animações compartilham).
let atuais = {};
export function usarNomes(nomes) { atuais = nomes || {}; }
export const nomeG = (cor) => nomeDoGrupo(atuais, cor);

// Nome longo reduz a fonte (classes .longo e .muito-longo nos CSS) em vez de cortar o texto.
export const classeTam = (nome) => { const n = String(nome).length; return n > 32 ? ' muito-longo' : n > 20 ? ' longo' : n > 9 ? ' medio' : ''; };
