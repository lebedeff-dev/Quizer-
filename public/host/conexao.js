// Peças do painel sobre a conexão: endereço e PIN para abrir o /host em outro aparelho (com "Copiar"),
// aviso de "sem rede local" e, só no app desktop (Quizer.exe), os botões do programa.
import { el } from '/shared/ui.js';

export const noApp = () => !!window.quizer?.desktop;

// Copia para a área de transferência: pela ponte do app, pela API do navegador ou, em último caso, por seleção.
export async function copiar(texto) {
  try {
    if (window.quizer?.copiar && await window.quizer.copiar(texto)) return true;
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texto); return true; }
  } catch { /* cai para a seleção */ }
  const t = document.createElement('textarea');
  t.value = texto;
  t.setAttribute('readonly', '');
  t.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.append(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* sem permissão */ }
  t.remove();
  return ok;
}

function botaoCopiar(rotulo, texto) {
  const b = el('button', { class: 'btn-mini', type: 'button' }, rotulo);
  b.addEventListener('click', async () => {
    const ok = await copiar(texto);
    b.textContent = ok ? 'Copiado' : 'Não copiou';
    setTimeout(() => { b.textContent = rotulo; }, 1600);
  });
  return b;
}

// "Painel no celular": endereço do /host e PIN. Aparece com ou sem o QR dos grupos na tela.
export function linhaPainelCelular(e) {
  return el('div', { class: 'menu-celular' },
    el('span', { class: 'mc-rotulo' }, 'Painel no celular'),
    e.enderecoPainel
      ? el('span', { class: 'mc-item' }, el('code', {}, e.enderecoPainel), botaoCopiar('Copiar endereço', e.enderecoPainel))
      : el('span', { class: 'mc-item mc-sem' }, 'sem rede: ainda não há endereço'),
    el('span', { class: 'mc-item' }, 'PIN ', el('code', {}, e.pin), botaoCopiar('Copiar PIN', e.pin)));
}

// Sem rede local, os celulares não conseguem entrar.
export function avisoSemRede(e) {
  if (!e.semRede) return null;
  const botao = noApp()
    ? el('button', { class: 'btn-secundario', type: 'button', onclick: () => window.quizer.abrirHotspot() }, 'Abrir hotspot do Windows')
    : null;
  return el('div', { class: 'aviso-rede', role: 'alert' },
    el('p', {},
      el('strong', {}, 'Sem rede local. '),
      'Os celulares não conseguem entrar. Ligue o roteador Wi-Fi e conecte o notebook a ele (melhor opção), ou ligue o hotspot do Windows (aceita no máximo 8 aparelhos).'),
    botao);
}

// Só no app: reabrir a tela do projetor e encerrar. `aoEncerrar` abre a confirmação dentro da página.
export function botoesDoApp(aoEncerrar) {
  if (!noApp()) return [];
  return [
    el('button', { class: 'btn-secundario', type: 'button', onclick: () => window.quizer.reabrirTela() }, 'Reabrir tela do projetor'),
    el('button', { class: 'btn-secundario', type: 'button', onclick: aoEncerrar }, 'Encerrar'),
  ];
}

export function dicaFirewall() {
  if (!noApp()) return null;
  return el('p', { class: 'dica-fw' }, 'Se o Windows perguntar sobre o Firewall, marque “Redes privadas” e clique em “Permitir acesso”.');
}
