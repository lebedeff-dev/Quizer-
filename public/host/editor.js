// Editor de perguntas (aba Perguntas do /host).
// O editor mantém o próprio DOM: o painel não o recria a cada mensagem do servidor, para não
// perder o foco enquanto o responsável digita.
import { el, botaoSeta } from '/shared/ui.js';

const LETRAS = ['A', 'B', 'C', 'D'];
const META_BANCO = 25;
const META_TOTAL = 26;

const ICONES = {
  alerta: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3 2 21h20L12 3z" style="fill:var(--amarelo-pastel);stroke:var(--tom-amarelo-azul)" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 18v.5" style="stroke:var(--tom-amarelo-azul)" stroke-width="2.2" stroke-linecap="round"/></svg>',
  grip: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>',
  cima: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  baixo: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
};

// ---------- regras (espelham o servidor; o servidor revalida tudo) ----------
function problemasDe(p) {
  const out = [];
  if (!p.enunciado.trim()) out.push('enunciado');
  p.alternativas.forEach((a, i) => { if (!a.trim()) out.push(`alternativa ${LETRAS[i]}`); });
  if (p.correta === null) out.push('marcar a alternativa correta');
  return out;
}
const valida = (p) => problemasDe(p).length === 0;
const hhmm = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const resumoTexto = (t, n = 90) => (t.trim() ? (t.length > n ? `${t.slice(0, n).trim()}…` : t) : 'Pergunta sem enunciado');

async function api(caminho, opcoes = {}) {
  const r = await fetch(caminho, {
    ...opcoes,
    headers: opcoes.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  let dados = {};
  try { dados = await r.json(); } catch { /* sem corpo */ }
  return { ok: r.ok, status: r.status, ...dados };
}

export function criarEditor({ aoVoltar }) {
  const E = {
    lista: [],
    sel: null,
    info: null,
    salvoEm: null,
    status: 'ocioso', // ocioso | salvando | salvo | erro
    erro: '',
    timer: null,
    salvando: null,
    modal: null,
    arrastando: null,
    carregado: false,
    erroCarga: '',
    antesAleatorizar: null,
  };
  const R = {}; // referências de DOM
  let raiz = null;

  const selecionada = () => E.lista.find((p) => p.id === E.sel) || null;
  const emUso = (p) => !!p && E.info?.emUso === p.id;

  // ---------- salvamento ----------
  function agendarSalvar() {
    E.antesAleatorizar = null; // qualquer edição encerra o "desfazer ordem"
    E.status = 'salvando';
    E.erro = '';
    desenharStatus();
    clearTimeout(E.timer);
    E.timer = setTimeout(salvarAgora, 500);
  }

  async function salvarAgora() {
    clearTimeout(E.timer);
    E.timer = null;
    if (E.status !== 'salvando') return;
    const r = await api('/api/perguntas', { method: 'PUT', body: JSON.stringify({ perguntas: E.lista }) });
    let refazForm = false;
    if (r.ok) {
      E.status = 'salvo';
      E.salvoEm = r.salvoEm;
      if (r.info) E.info = r.info;
    } else {
      E.status = 'erro';
      E.erro = r.erro || 'Não foi possível salvar.';
      if (r.status === 409) { await recarregar(); refazForm = true; } // volta ao que está salvo no servidor
    }
    desenharTudo(refazForm);
  }

  async function recarregar() {
    const r = await api('/api/perguntas');
    if (r.ok) {
      E.lista = r.perguntas;
      E.info = r.info;
      E.salvoEm = r.info.salvoEm;
      if (!E.lista.some((p) => p.id === E.sel)) E.sel = E.lista[0]?.id ?? null;
    }
  }

  // ---------- operações na lista ----------
  const novoId = () => E.lista.reduce((m, p) => Math.max(m, p.id), 0) + 1;

  function alterouEstrutura(foco = false) {
    desenharTudo(true, foco);
    agendarSalvar();
  }

  function adicionar() {
    const p = { id: novoId(), tipo: 'facil', enunciado: '', alternativas: ['', '', '', ''], correta: null, explicacao: '', reserva: false };
    E.lista.push(p);
    E.sel = p.id;
    alterouEstrutura(true);
  }

  function duplicar(id) {
    const i = E.lista.findIndex((p) => p.id === id);
    if (i < 0) return;
    const c = { ...structuredClone(E.lista[i]), id: novoId(), reserva: false };
    E.lista.splice(i + 1, 0, c);
    E.sel = c.id;
    alterouEstrutura();
  }

  function excluir(id) {
    const i = E.lista.findIndex((p) => p.id === id);
    if (i < 0) return;
    E.lista.splice(i, 1);
    E.sel = (E.lista[i] || E.lista[i - 1] || {}).id ?? null;
    E.modal = null;
    alterouEstrutura();
  }

  function mover(id, delta) {
    const i = E.lista.findIndex((p) => p.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= E.lista.length) return;
    [E.lista[i], E.lista[j]] = [E.lista[j], E.lista[i]];
    alterouEstrutura();
  }

  function moverPara(origem, alvo, depois) {
    if (origem === alvo) return;
    const i = E.lista.findIndex((p) => p.id === origem);
    if (i < 0) return;
    const [p] = E.lista.splice(i, 1);
    let j = E.lista.findIndex((x) => x.id === alvo);
    if (depois) j += 1;
    E.lista.splice(j, 0, p);
    alterouEstrutura();
  }

  // ---------- topo ----------
  function desenharTopo() {
    const info = resumoDaLista();
    const chips = [];
    if (info.doBanco < META_BANCO) chips.push(chip(`Faltam ${META_BANCO - info.doBanco} perguntas do banco`));
    if (!info.temReserva) chips.push(chip('Falta a pergunta reserva'));
    if (info.invalidas > 0) chips.push(chip(`${info.invalidas} ${info.invalidas === 1 ? 'incompleta' : 'incompletas'}`));

    const importarBtn = el('button', { class: 'btn-secundario', onclick: aoImportar }, 'Importar JSON');
    const bloqueada = !!E.info?.partidaAtiva;
    const aleatBtn = el('button', {
      class: 'btn-secundario', disabled: bloqueada || E.lista.length < 2,
      title: bloqueada ? 'Indisponível com partida em andamento' : 'Embaralha a ordem das perguntas',
      onclick: () => { E.modal = { tipo: 'aleatorizar' }; desenharModal(); },
    }, 'Aleatorizar ordem');
    // Sempre presente (desabilitado quando não há o que desfazer): assim nenhum botão muda de lugar depois de aleatorizar.
    const desfazerBtn = el('button', {
      class: 'btn-secundario', id: 'ed-desfazer-ordem', disabled: bloqueada || !E.antesAleatorizar,
      title: E.antesAleatorizar ? 'Volta à ordem de antes de aleatorizar' : 'Nada para desfazer',
      onclick: desfazerAleatorizar,
    }, 'Desfazer ordem');
    aleatBtn.id = 'ed-aleatorizar';
    const exportarBtn = el('a', { class: 'btn-secundario', href: '/api/perguntas/exportar', download: '' }, 'Exportar JSON');

    R.topo.replaceChildren(
      el('div', { class: 'ed-topo-esq' },
        el('h1', { class: 'ed-titulo' }, 'Perguntas'),
        el('span', { class: 'ed-contador' }, `${E.lista.length} de ${META_TOTAL} perguntas`),
        ...chips),
      el('div', { class: 'ed-topo-dir' },
        el('span', { class: `ed-status ${E.status}`, role: 'status' }, textoStatus()),
        bloqueada ? el('span', { class: 'ed-motivo', role: 'note' }, 'Ordem e importação bloqueadas: há partida em andamento') : null,
        importarBtn,
        exportarBtn,
        aleatBtn,
        desfazerBtn));
  }

  function chip(texto) {
    return el('span', { class: 'chip-aviso' }, el('span', { html: ICONES.alerta }), texto);
  }

  function resumoDaLista() {
    return {
      doBanco: E.lista.filter((p) => !p.reserva).length,
      temReserva: E.lista.some((p) => p.reserva),
      invalidas: E.lista.filter((p) => !valida(p)).length,
    };
  }

  function textoStatus() {
    if (E.status === 'salvando') return 'Salvando…';
    if (E.status === 'erro') return E.erro;
    if (E.salvoEm) return `Salvo às ${hhmm(E.salvoEm)}`;
    return 'Tudo salvo';
  }

  function desenharStatus() {
    if (R.topo.querySelector('.ed-status')) {
      const s = R.topo.querySelector('.ed-status');
      s.className = `ed-status ${E.status}`;
      s.textContent = textoStatus();
    }
  }

  // ---------- lista ----------
  function desenharLista() {
    const lis = E.lista.map((p, i) => {
      const invalida = !valida(p);
      const li = el('li', { class: 'ed-li', draggable: 'true', 'data-id': p.id },
        el('div', { class: `ed-item${p.id === E.sel ? ' sel' : ''}${invalida ? ' inv' : ''}` },
          el('span', { class: 'ed-grip', html: ICONES.grip, title: 'Arraste para reordenar', 'aria-hidden': 'true' }),
          el('button', {
            class: 'ed-item-btn',
            'aria-current': p.id === E.sel ? 'true' : null,
            onclick: () => { E.sel = p.id; desenharTudo(true); },
          },
          el('span', { class: 'ed-num' }, i + 1),
          el('span', { class: 'ed-corpo' },
            el('span', { class: 'ed-txt' }, resumoTexto(p.enunciado)),
            el('span', { class: 'ed-tags' },
              el('span', { class: 'tag' }, p.tipo === 'atencao' ? 'Atenção' : 'Fácil'),
              p.reserva ? el('span', { class: 'tag reserva' }, 'Reserva') : null)),
          invalida ? el('span', { class: 'ed-alerta', html: ICONES.alerta, title: `Incompleta: ${problemasDe(p).join(', ')}`, role: 'img', 'aria-label': 'Pergunta incompleta' }) : null)));
      li.addEventListener('dragstart', (e) => {
        E.arrastando = p.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(p.id));
        li.classList.add('arrastando');
      });
      li.addEventListener('dragend', () => {
        E.arrastando = null;
        R.lista.querySelectorAll('.arrastando,.alvo-antes,.alvo-depois').forEach((n) => n.classList.remove('arrastando', 'alvo-antes', 'alvo-depois'));
      });
      li.addEventListener('dragover', (e) => {
        if (E.arrastando == null || E.arrastando === p.id) return;
        e.preventDefault();
        const r = li.getBoundingClientRect();
        const depois = e.clientY > r.top + r.height / 2;
        li.classList.toggle('alvo-antes', !depois);
        li.classList.toggle('alvo-depois', depois);
      });
      li.addEventListener('dragleave', () => li.classList.remove('alvo-antes', 'alvo-depois'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const r = li.getBoundingClientRect();
        const origem = E.arrastando;
        li.classList.remove('alvo-antes', 'alvo-depois');
        if (origem != null) moverPara(origem, p.id, e.clientY > r.top + r.height / 2);
      });
      return li;
    });

    R.lista.replaceChildren(
      el('div', { class: 'ed-lista-topo' },
        el('h2', {}, 'Lista'),
        el('button', { class: 'btn-primario-pequeno', onclick: adicionar }, '+ Nova pergunta')),
      lis.length
        ? el('ul', { class: 'ed-itens' }, lis)
        : el('p', { class: 'ed-vazio' }, 'Nenhuma pergunta ainda. Use “Nova pergunta” ou “Importar JSON”.'));
  }

  // ---------- formulário ----------
  function desenharForm(foco = false) {
    const p = selecionada();
    if (!p) {
      R.form.replaceChildren(el('div', { class: 'cartao leve ed-form-vazio' }, el('p', {}, 'Selecione uma pergunta na lista ou crie uma nova.')));
      return;
    }
    const travada = emUso(p);
    const i = E.lista.findIndex((x) => x.id === p.id);
    const aviso = el('div', { class: 'ed-problemas' });
    const contador = el('span', { class: 'ed-conta' });
    const longo = el('p', { class: 'ed-longo' });

    const atualizarAvisos = () => {
      const pr = problemasDe(p);
      aviso.hidden = pr.length === 0;
      aviso.replaceChildren(el('span', { html: ICONES.alerta }), el('span', {}, `Incompleta. Falta: ${pr.join(', ')}. Fica salva como rascunho, mas o jogo só começa com todas válidas.`));
      const n = p.explicacao.length;
      contador.textContent = `${n} ${n === 1 ? 'caractere' : 'caracteres'}`;
      longo.hidden = n <= 200;
      longo.textContent = 'Explicação longa: acima de 200 caracteres ela pode ficar pequena no projetor.';
    };
    const aoAlterar = () => {
      atualizarAvisos();
      desenharLista();
      desenharTopo();
      agendarSalvar();
    };

    const enunciado = el('textarea', { id: 'f-enunciado', rows: 2, maxlength: 400, disabled: travada, 'aria-describedby': 'f-aviso' });
    enunciado.value = p.enunciado;
    enunciado.addEventListener('input', () => { p.enunciado = enunciado.value; aoAlterar(); });

    const linhas = LETRAS.map((L, k) => {
      const campo = el('input', { type: 'text', maxlength: 200, 'aria-label': `Alternativa ${L}`, disabled: travada });
      campo.value = p.alternativas[k];
      campo.addEventListener('input', () => { p.alternativas[k] = campo.value; aoAlterar(); });
      const radio = el('input', { type: 'radio', name: `correta-${p.id}`, 'aria-label': `Alternativa ${L} é a correta`, disabled: travada });
      radio.checked = p.correta === k;
      const linha = el('div', { class: `ed-alt${p.correta === k ? ' certa' : ''}` },
        el('span', { class: 'ed-letra' }, L),
        campo,
        el('label', { class: 'ed-radio' }, radio, el('span', {}, 'Correta')));
      radio.addEventListener('change', () => {
        p.correta = k;
        form.querySelectorAll('.ed-alt').forEach((n, idx) => n.classList.toggle('certa', idx === k));
        aoAlterar();
      });
      return linha;
    });

    const explicacao = el('textarea', { id: 'f-explicacao', rows: 2, maxlength: 1000, disabled: travada });
    explicacao.value = p.explicacao;
    explicacao.addEventListener('input', () => { p.explicacao = explicacao.value; atualizarAvisos(); agendarSalvar(); });

    const tipo = (valor, rotulo) => {
      const r = el('input', { type: 'radio', name: `tipo-${p.id}`, disabled: travada });
      r.checked = p.tipo === valor;
      r.addEventListener('change', () => { p.tipo = valor; desenharLista(); agendarSalvar(); });
      return el('label', { class: 'ed-seg' }, r, el('span', {}, rotulo));
    };

    const reserva = el('input', { type: 'checkbox', disabled: travada });
    reserva.checked = p.reserva;
    reserva.addEventListener('change', () => {
      // Só pode haver uma reserva: marcar esta desmarca as outras.
      if (reserva.checked) E.lista.forEach((x) => { x.reserva = x.id === p.id; });
      else p.reserva = false;
      desenharLista();
      desenharTopo();
      agendarSalvar();
    });

    const form = el('div', { class: 'cartao leve ed-form' },
      el('div', { class: 'ed-form-topo' },
        el('h2', {}, `Pergunta ${i + 1}`),
        el('div', { class: 'ed-acoes' },
          el('button', { class: 'btn-icone', 'aria-label': 'Mover para cima', title: 'Mover para cima', html: ICONES.cima, disabled: i === 0, onclick: () => mover(p.id, -1) }),
          el('button', { class: 'btn-icone', 'aria-label': 'Mover para baixo', title: 'Mover para baixo', html: ICONES.baixo, disabled: i === E.lista.length - 1, onclick: () => mover(p.id, 1) }),
          el('button', { class: 'btn-secundario', onclick: () => duplicar(p.id) }, 'Duplicar'),
          el('button', { class: 'btn-secundario', disabled: travada, onclick: () => { E.modal = { tipo: 'excluir', id: p.id }; desenharModal(); } }, 'Excluir'),
          el('button', { class: 'btn-secundario forte', onclick: () => { E.modal = { tipo: 'previa', cena: 'pergunta', id: p.id }; desenharModal(); } }, 'Ver no projetor'))),
      travada ? el('div', { class: 'ed-trava', role: 'status' }, el('span', { html: ICONES.alerta }), el('span', {}, 'Esta pergunta está sendo usada na rodada em andamento e não pode ser alterada agora.')) : null,
      el('div', { id: 'f-aviso' }, aviso),
      el('div', { class: 'ed-campo' }, el('label', { for: 'f-enunciado' }, 'Enunciado'), enunciado),
      el('div', { class: 'ed-campo' }, el('span', { class: 'ed-rotulo' }, 'Alternativas (marque a correta)'), el('div', { class: 'ed-alts' }, linhas)),
      el('div', { class: 'ed-campo' },
        el('div', { class: 'ed-linha-rotulo' }, el('label', { for: 'f-explicacao' }, 'Explicação'), contador),
        explicacao, longo),
      el('div', { class: 'ed-opcoes' },
        el('div', { class: 'ed-grupo', role: 'radiogroup', 'aria-label': 'Tipo' }, el('span', { class: 'ed-rotulo' }, 'Tipo'), tipo('facil', 'Fácil'), tipo('atencao', 'Atenção')),
        el('label', { class: 'ed-reserva' }, reserva, el('span', {}, 'Pergunta reserva (desempate)'))));
    atualizarAvisos();
    R.form.replaceChildren(form);
    if (foco && !travada) enunciado.focus();
  }

  // ---------- janelas (confirmação, importação, prévia) ----------
  function desenharModal() {
    const m = E.modal;
    if (!m) { R.modal.replaceChildren(); return; }
    let cartao;
    if (m.tipo === 'excluir') {
      const i = E.lista.findIndex((p) => p.id === m.id);
      cartao = el('div', { class: 'painel cartao', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Excluir pergunta' },
        el('h2', {}, `Excluir a pergunta ${i + 1}?`),
        el('p', {}, resumoTexto(E.lista[i]?.enunciado || '', 120)),
        el('div', { class: 'linha' },
          el('button', { class: 'btn-secundario', onclick: fecharModal }, 'Cancelar'),
          el('button', { class: 'btn-secundario perigo', onclick: () => excluir(m.id) }, 'Excluir')));
    } else if (m.tipo === 'aviso') {
      cartao = el('div', { class: 'painel cartao', role: 'dialog', 'aria-modal': 'true' },
        el('h2', {}, m.titulo),
        el('p', {}, m.texto),
        el('div', { class: 'linha' }, el('button', { class: 'btn-secundario', onclick: fecharModal }, 'Entendi')));
    } else if (m.tipo === 'aleatorizar') {
      cartao = el('div', { class: 'painel cartao', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Aleatorizar ordem' },
        el('h2', {}, 'Aleatorizar ordem?'),
        el('p', {}, 'Isso muda a ordem de todas as perguntas.'),
        el('p', {}, 'A nova ordem vale a partir do próximo jogo iniciado. Um jogo em andamento mantém a ordem antiga.'),
        el('p', { class: 'nota' }, 'As alternativas e a resposta correta não mudam, e a pergunta reserva continua por último. Uma cópia do banco atual fica em data/backup. Depois você pode usar Desfazer ordem, e também pode aleatorizar de novo quantas vezes quiser.'),
        m.erro ? el('p', { class: 'msg-erro' }, m.erro) : null,
        el('div', { class: 'linha' },
          el('button', { class: 'btn-secundario', onclick: fecharModal }, 'Cancelar'),
          el('button', { class: 'btn-secundario forte', disabled: m.aplicando, onclick: () => aleatorizar(m) }, 'Aleatorizar')));
    } else if (m.tipo === 'importar') {
      cartao = modalImportar(m);
    } else if (m.tipo === 'previa') {
      cartao = modalPrevia(m);
    }
    const fundo = el('div', { class: 'sobreposicao', onclick: (e) => { if (e.target === fundo) fecharModal(); } }, cartao);
    R.modal.replaceChildren(fundo);
    cartao.setAttribute('tabindex', '-1');
    cartao.focus({ preventScroll: true });
  }

  function fecharModal() {
    E.modal = null;
    desenharModal();
  }

  function modalPrevia(m) {
    const p = E.lista.find((x) => x.id === m.id);
    const cena = m.cena;
    const troca = (c, rotulo) => el('button', { class: `ed-aba${cena === c ? ' ativa' : ''}`, onclick: () => { m.cena = c; desenharModal(); } }, rotulo);
    const tela = cena === 'pergunta'
      ? el('div', { class: 'projetor' }, el('p', { class: 'proj-enunciado-grande' }, p.enunciado.trim() || 'Sem enunciado'))
      : el('div', { class: 'projetor' },
        el('p', { class: 'proj-enunciado' }, p.enunciado.trim() || 'Sem enunciado'),
        el('div', { class: 'proj-alts' }, LETRAS.map((L, k) =>
          el('div', { class: 'proj-alt' }, el('span', { class: 'proj-letra' }, L), el('span', { class: 'proj-texto' }, p.alternativas[k].trim() || '—')))));
    return el('div', { class: 'painel cartao previa', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Prévia no projetor' },
      el('div', { class: 'previa-topo' },
        el('h2', {}, 'Como aparece no projetor'),
        el('div', { class: 'ed-abas' }, troca('pergunta', 'Pergunta'), troca('alternativas', 'Alternativas'))),
      tela,
      el('div', { class: 'linha' }, el('button', { class: 'btn-secundario', onclick: fecharModal }, 'Fechar')));
  }

  function modalImportar(m) {
    const a = m.analise;
    if (!a.ok) {
      return el('div', { class: 'painel cartao largo', role: 'dialog', 'aria-modal': 'true' },
        el('h2', {}, 'Não foi possível importar'),
        el('p', {}, `Arquivo: ${m.nome}. Nada foi alterado.`),
        el('ul', { class: 'lista-erros' }, a.erros.map((e) => el('li', {}, e))),
        el('div', { class: 'linha' }, el('button', { class: 'btn-secundario', onclick: fecharModal }, 'Fechar')));
    }
    const comProblema = a.itens.filter((x) => x.problemas.length);
    const radio = (valor, rotulo, detalhe) => {
      const r = el('input', { type: 'radio', name: 'modo', value: valor });
      r.checked = m.modo === valor;
      r.addEventListener('change', () => { m.modo = valor; desenharModal(); });
      return el('label', { class: 'ed-modo' }, r, el('span', {}, el('strong', {}, rotulo), el('small', {}, detalhe)));
    };
    return el('div', { class: 'painel cartao largo', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Resumo da importação' },
      el('h2', {}, 'Resumo da importação'),
      el('p', { class: 'resumo-imp' },
        el('strong', {}, `${a.total} ${a.total === 1 ? 'pergunta' : 'perguntas'}`), ` em ${m.nome}: `,
        el('strong', {}, `${a.validas} ${a.validas === 1 ? 'válida' : 'válidas'}`),
        comProblema.length ? `, ${comProblema.length} com pendências.` : '.'),
      comProblema.length
        ? el('ul', { class: 'lista-erros' }, comProblema.map((x) => el('li', {}, el('strong', {}, `Pergunta ${x.posicao}: `), x.problemas.join('; '))))
        : null,
      comProblema.length ? el('p', { class: 'nota' }, 'As perguntas com pendências entram como rascunho, e o jogo só começa depois de corrigi-las.') : null,
      el('div', { class: 'ed-modos' },
        radio('acrescentar', 'Acrescentar', `Adiciona ao fim da lista (hoje são ${a.atuais} perguntas).`),
        radio('substituir', 'Substituir tudo', `Apaga as ${a.atuais} perguntas atuais. Uma cópia fica em data/backup.`)),
      m.modo === 'acrescentar' && a.avisosAcrescentar.length ? el('p', { class: 'nota' }, a.avisosAcrescentar[0]) : null,
      m.erroAplicar ? el('p', { class: 'msg-erro' }, m.erroAplicar) : null,
      el('div', { class: 'linha' },
        el('button', { class: 'btn-secundario', onclick: fecharModal }, 'Cancelar'),
        el('button', { class: 'btn-secundario forte', disabled: m.aplicando, onclick: () => aplicarImportacao(m) }, m.modo === 'substituir' ? 'Substituir tudo' : 'Acrescentar')));
  }

  // ---------- aleatorizar ordem ----------
  async function aleatorizar(m) {
    if (E.status === 'salvando') await salvarAgora();
    m.aplicando = true;
    const antes = structuredClone(E.lista);
    const r = await api('/api/perguntas/aleatorizar', { method: 'POST' });
    m.aplicando = false;
    if (!r.ok) { m.erro = r.erro || 'Não foi possível aleatorizar.'; desenharModal(); return; }
    E.antesAleatorizar = antes;
    E.lista = r.perguntas;
    E.info = r.info;
    E.salvoEm = r.info.salvoEm;
    E.status = 'salvo';
    E.modal = null;
    desenharTudo(true);
  }

  // Desfazer: devolve ao servidor a ordem de antes (o mesmo salvamento do editor).
  async function desfazerAleatorizar() {
    const antes = E.antesAleatorizar;
    if (!antes) return;
    const r = await api('/api/perguntas', { method: 'PUT', body: JSON.stringify({ perguntas: antes }) });
    if (!r.ok) { E.status = 'erro'; E.erro = r.erro || 'Não foi possível desfazer.'; desenharTopo(); return; }
    E.lista = antes;
    E.antesAleatorizar = null;
    E.status = 'salvo';
    E.salvoEm = r.salvoEm;
    if (r.info) E.info = r.info;
    desenharTudo(true);
  }

  // ---------- importação ----------
  function aoImportar() {
    if (E.info?.partidaAtiva) {
      E.modal = { tipo: 'aviso', titulo: 'Importação bloqueada', texto: 'Não é possível importar durante uma partida em andamento. Volte ao menu e crie um novo jogo antes.' };
      desenharModal();
      return;
    }
    const entrada = el('input', { type: 'file', accept: '.json,application/json' });
    entrada.addEventListener('change', async () => {
      const arq = entrada.files[0];
      if (!arq) return;
      const texto = await arq.text();
      const r = await api('/api/perguntas/importar/analisar', { method: 'POST', body: JSON.stringify({ texto }) });
      if (!r.ok && r.erro) { E.modal = { tipo: 'aviso', titulo: 'Não foi possível ler o arquivo', texto: r.erro }; desenharModal(); return; }
      if (r.bloqueio) { E.modal = { tipo: 'aviso', titulo: 'Importação bloqueada', texto: r.bloqueio }; desenharModal(); return; }
      E.modal = { tipo: 'importar', nome: arq.name, texto, analise: r, modo: 'acrescentar' };
      desenharModal();
    });
    entrada.click();
  }

  async function aplicarImportacao(m) {
    m.aplicando = true;
    const r = await api('/api/perguntas/importar/aplicar', { method: 'POST', body: JSON.stringify({ texto: m.texto, modo: m.modo }) });
    m.aplicando = false;
    if (!r.ok) {
      m.erroAplicar = r.erro || 'Não foi possível importar.';
      desenharModal();
      return;
    }
    E.lista = r.perguntas;
    E.info = r.info;
    E.salvoEm = r.info.salvoEm;
    E.status = 'salvo';
    E.sel = E.lista[0]?.id ?? null;
    E.modal = null;
    desenharTudo(true);
  }

  // ---------- montagem ----------
  function desenharTudo(comForm = true, foco = false) {
    desenharTopo();
    desenharLista();
    if (comForm) desenharForm(foco);
    desenharModal();
  }

  async function voltar() {
    if (E.status === 'salvando') await salvarAgora();
    aoVoltar();
  }

  return {
    get montado() { return !!raiz; },
    montar() {
      R.topo = el('header', { class: 'ed-topo' });
      R.lista = el('aside', { class: 'ed-lista', 'aria-label': 'Lista de perguntas' });
      R.form = el('main', { class: 'ed-form-area' });
      R.modal = el('div', { class: 'ed-modal' });
      raiz = el('section', { class: 'editor' },
        R.topo,
        el('div', { class: 'ed-corpo' }, R.lista, R.form),
        R.modal,
        botaoSeta('voltar', 'Voltar', voltar));
      document.addEventListener('keydown', teclas);
      R.topo.replaceChildren(el('span', { class: 'ed-status' }, 'Carregando…'));
      recarregar().then(() => {
        E.carregado = true;
        E.sel = E.lista[0]?.id ?? null;
        E.status = 'ocioso';
        desenharTudo(true);
      });
      return raiz;
    },
    desmontar() {
      document.removeEventListener('keydown', teclas);
      clearTimeout(E.timer);
      raiz = null;
    },
    // Chamado a cada mensagem do servidor: só atualiza o que depende da situação do jogo.
    aoEstado(visao) {
      if (!raiz || !visao.perguntasInfo) return;
      const antes = E.info?.emUso;
      const antesAtiva = E.info?.partidaAtiva;
      E.info = { ...E.info, ...visao.perguntasInfo };
      if (E.carregado && (antes !== E.info.emUso || antesAtiva !== E.info.partidaAtiva)) desenharForm(false);
    },
  };

  function teclas(e) {
    if (e.key === 'Escape' && E.modal) fecharModal();
  }
}
