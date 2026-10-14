// Utilitários comuns às três telas.
import { definirTemaDasCores } from '/shared/cores.js';

// Cria um elemento: el('button', { class: 'x', onclick }, 'texto', outroNo)
export function el(tag, props = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) {
    if (f == null || f === false) continue;
    if (f.nodeType) n.append(f);
    else n.append(...comMenosReforcado(String(f)));
  }
  return n;
}

// O sinal "−" (U+2212) dos pontos negativos parece um hífen em corpo pequeno: ele ganha um span (.menos) mais
// pesado e maior. O texto continua o mesmo para leitores de tela.
function comMenosReforcado(texto) {
  if (!texto.includes('−')) return [document.createTextNode(texto)];
  const nos = [];
  texto.split('−').forEach((parte, i) => {
    if (i > 0) { const m = document.createElement('span'); m.className = 'menos'; m.textContent = '−'; nos.push(m); }
    if (parte) nos.push(document.createTextNode(parte));
  });
  return nos;
}

// Título em duas cores: primeira palavra em preto, o restante em azul.
export function tituloDuasCores(texto, { quebra = false } = {}) {
  const [primeira, ...resto] = texto.split(' ');
  return el('h1', { class: 'titulo' },
    el('span', { class: 'preto' }, primeira),
    quebra ? null : ' ',
    el('span', { class: 'azul' }, resto.join(' ')));
}

// Conexão WebSocket com reconexão automática.
export function conectar({ papel, cor, aoEstado, aoStatus, aoMensagem }) {
  let ws;
  let tentativa = 0;
  let parado = false;
  let seq = 0;
  const pendentes = new Map();

  function abrir() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?papel=${papel}${cor ? `&cor=${cor}` : ''}`);
    ws.onopen = () => { tentativa = 0; aoStatus?.(true); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'estado') aoEstado?.(m);
      else if ((m.t === 'ok' || m.t === 'erro') && pendentes.has(m.id)) {
        pendentes.get(m.id)(m);
        pendentes.delete(m.id);
      } else aoMensagem?.(m);
    };
    ws.onclose = () => {
      aoStatus?.(false);
      if (!parado) setTimeout(abrir, Math.min(3000, 400 * ++tentativa));
    };
  }
  abrir();

  return {
    enviar: (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj)),
    // Dispara uma ação e devolve { t: 'ok' } ou { t: 'erro', msg }.
    acao(nome, ...args) {
      return new Promise((resolve) => {
        if (ws.readyState !== 1) return resolve({ t: 'erro', msg: 'Sem conexão com o servidor.' });
        const id = `a${++seq}`;
        pendentes.set(id, resolve);
        ws.send(JSON.stringify({ t: 'acao', id, nome, args }));
      });
    },
    parar() { parado = true; ws.close(); },
    // Fecha e reabre a conexão (a /tela usa para reconhecer o cookie do responsável sem recarregar).
    reconectar() { ws.close(); },
  };
}

export const DISCIPLINA_PADRAO = 'Profissão: Competências e Habilidades';

// Capa compartilhada entre /host e /tela. `acao` é o nó do botão (só no /host).
export function capa(fundoHtml, acao, disciplina = DISCIPLINA_PADRAO) {
  return el('section', { class: 'cena capa' },
    el('div', { class: 'fundo', html: fundoHtml }),
    el('div', { class: 'conteudo' },
      el('h1', { class: 'titulo' },
        el('span', { class: 'preto' }, 'Misoginia'),
        el('span', { class: 'azul' }, 'na área da saúde')),
      el('p', { class: 'disciplina' }, disciplina),
      acao ? el('div', { class: 'acao' }, acao) : null));
}

export function botaoSeta(classe, rotulo, aoClicar) {
  return el('button', { class: `avanco ${classe}`, 'aria-label': rotulo, title: rotulo, onclick: aoClicar },
    el('img', { src: '/assets/proximo.png', alt: '', width: 30, height: 30 }));
}

// ---------- tema (claro/noturno) ----------
// O servidor decide o tema e o manda em toda visão. O último tema fica em cache local só para
// evitar o piscar branco ao abrir a página; a primeira visão recebida corrige se for diferente.
const CHAVE_TEMA = 'oficina_tema';

// Painel e projetor: usa o último tema conhecido até a primeira visão chegar. O celular NÃO chama isto (ele não guarda tema).
export function restaurarTemaLocal() {
  try {
    if (localStorage.getItem(CHAVE_TEMA) === 'noturno') { document.documentElement.dataset.tema = 'noturno'; definirTemaDasCores('noturno'); }
  } catch { /* sem armazenamento */ }
}

// `guardar: false` (celular): aplica o tema global sem ler nem gravar nada no aparelho.
export function aplicarTema(tema, { guardar = true } = {}) {
  const novo = tema === 'noturno' ? 'noturno' : 'claro';
  const raiz = document.documentElement;
  definirTemaDasCores(novo); // o time Preto vira Branco no noturno
  if (raiz.dataset.tema === novo) return;
  const primeira = !raiz.dataset.tema;
  raiz.dataset.tema = novo;
  if (guardar) { try { localStorage.setItem(CHAVE_TEMA, novo); } catch { /* sem armazenamento */ } }
  if (!primeira) {
    raiz.classList.add('trocando'); // transição suave de cor (desligada com prefers-reduced-motion)
    setTimeout(() => raiz.classList.remove('trocando'), 300);
  }
}

const LUA = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>';
const SOL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>';

// Alternador de tema: lua no tema claro (vai para o noturno), sol no noturno (volta ao claro).
export function botaoTema(tema, aoAlternar, { fixo = false } = {}) {
  const noturno = tema === 'noturno';
  return el('button', {
    class: `btn-tema${fixo ? ' fixo' : ''}`,
    'aria-label': 'Modo noturno',
    'aria-pressed': noturno ? 'true' : 'false',
    title: noturno ? 'Voltar ao tema claro (T)' : 'Modo noturno (T)',
    html: noturno ? SOL : LUA,
    onclick: () => aoAlternar(noturno ? 'claro' : 'noturno'),
  });
}
