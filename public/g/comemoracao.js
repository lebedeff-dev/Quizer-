// Comemoração no celular do grupo (Etapa 8k-2): fogos em tela cheia só no grupo vencedor (~6 s) e um pop-up com a mensagem de
// parabenização em todos os grupos. O pop-up fica até ser fechado; fechado, não volta para a mesma comemoração (o id vem do
// servidor e o último fechado fica no navegador). Camadas próprias no <body>: não somem quando a tela do grupo é refeita.
import { el } from '/shared/ui.js';
import { VIVAS } from '/shared/cores.js';
import { iniciarFogos } from '/shared/fogos.js';

const DURACAO_MS = 6000;
let idVisto = null;
let canvas = null;
let escuro = null;
let fogos = null;
let popup = null;

function guardado(cor) { try { return localStorage.getItem(`oficina_comem_${cor}`); } catch { return null; } }
function guardar(cor, id) { try { localStorage.setItem(`oficina_comem_${cor}`, String(id)); } catch { /* sem armazenamento */ } }

// Fundo levemente escurecido durante os fogos (abaixo dos fogos e do pop-up, que ficam nítidos).
function desligarEscuro(rapido = false) {
  const e = escuro;
  if (!e) return;
  escuro = null;
  e.classList.remove('ligado');
  if (rapido) e.remove(); else setTimeout(() => e.remove(), 450);
}

function limparFogos(rapido = true) {
  fogos?.parar();
  fogos = null;
  canvas?.remove();
  canvas = null;
  desligarEscuro(rapido);
}

function limparPopup() {
  popup?.remove();
  popup = null;
}

function tocarFogos(cor) {
  limparFogos();
  escuro = el('div', { class: 'g-fogos-fundo', 'aria-hidden': 'true' });
  document.body.append(escuro);
  requestAnimationFrame(() => requestAnimationFrame(() => escuro?.classList.add('ligado')));
  canvas = el('canvas', { class: 'g-fogos', 'aria-hidden': 'true' });
  document.body.append(canvas);
  const vivo = VIVAS[cor];
  fogos = iniciarFogos(canvas, {
    duracaoMs: DURACAO_MS,
    cores: [vivo, '#FFFFFF', '#FFD54F', '#FF4081', '#40C4FF'],
    destaque: vivo,
    max: 160, // celulares simples: poucas partículas
    aoFim: () => { canvas?.remove(); canvas = null; desligarEscuro(); },
  });
}

function abrirPopup(cor, c) {
  limparPopup();
  const fechar = () => { guardar(cor, c.id); limparPopup(); };
  const botao = el('button', { class: 'g-parabens-fechar', type: 'button', onclick: fechar }, 'Fechar');
  popup = el('div', { class: 'g-parabens', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Parabéns' },
    el('div', { class: 'g-parabens-cartao' },
      c.vencedor ? el('h2', { class: 'g-parabens-vitoria' }, 'Vocês venceram!') : null,
      el('p', { class: 'g-parabens-texto' }, c.mensagem),
      botao));
  document.body.append(popup);
  botao.focus({ preventScroll: true });
}

// Chamado a cada visão do celular. `aoVivo`: a página já estava aberta quando a comemoração começou (só então há fogos;
// quem reconecta ou recarrega durante a comemoração vê só o pop-up, uma vez).
export function atualizarComemoracao(v, cor, aoVivo) {
  const c = v?.registrado ? v.comemoracao : null;
  if (!c) {
    idVisto = null;
    limparFogos();
    limparPopup();
    return;
  }
  if (c.id === idVisto) return; // a mesma comemoração (reconexão): nada muda, o pop-up segue como estiver
  idVisto = c.id;
  if (c.vencedor && aoVivo) tocarFogos(cor);
  if (String(c.id) !== guardado(cor)) abrirPopup(cor, c);
  else limparPopup();
}
