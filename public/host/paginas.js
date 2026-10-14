// Páginas Configurações e Registro do /host. Cada uma mantém o próprio DOM (o painel não as refaz a
// cada mudança de estado, para não tirar o foco de quem está digitando).
import { el, botaoSeta } from '/shared/ui.js';
import { fundoDiscreto } from '/shared/decoracao.js';
import { CORES, estiloCor } from '/shared/cores.js';

const hora = (ms) => new Date(ms).toTimeString().slice(0, 8);
const horaCurta = (ms) => new Date(ms).toTimeString().slice(0, 5);

// ====================== Configurações ======================
// Os campos numéricos (nome, explicação, unidade, limites e padrão) vêm do servidor em `camposConfig`.
const MODOS_PLACAR = [['cada', 'De tantas em tantas perguntas'], ['toda', 'Depois de toda pergunta'], ['desligado', 'Nunca mostrar']];
const CAMPOS_TEXTO = ['disciplina', 'professor', 'mensagem', 'parabens', 'integrantes'];
const LIMITE_PARABENS = 300;
const contadorTexto = (t) => `${String(t).length} de ${LIMITE_PARABENS} caracteres`;

export function criarConfig({ acao, aoVoltar }) {
  const C = { montado: false, form: null, status: '', erro: '', nota: null, padroes: null, campos: [] };

  function formDe(e, campos) {
    return {
      jogo: { ...Object.fromEntries(campos.map((c) => [c.chave, String(e.configJogo[c.chave])])), placarModo: e.configJogo.placarModo },
      disciplina: e.final.disciplina,
      professor: e.final.professor,
      mensagem: e.final.mensagem,
      parabens: e.final.parabens ?? '',
      integrantes: e.final.integrantes.join('\n'),
    };
  }

  function campo(rotulo, dica, entrada, id) {
    return el('div', { class: 'pg-campo' },
      el('label', { for: id }, rotulo),
      entrada,
      ...(Array.isArray(dica) ? dica : [dica]).filter(Boolean).map((t) => el('p', { class: 'pg-dica' }, t)));
  }

  // Mensagem do pop-up de comemoração nos celulares: até 300 caracteres, com contador e botão para voltar ao texto original.
  function campoParabens(f) {
    const area = el('textarea', { id: 'cfg-parabens', rows: 5, maxlength: LIMITE_PARABENS });
    area.value = f.parabens;
    const contador = el('span', { id: 'cfg-parabens-contador', class: 'pg-contador', role: 'status' }, contadorTexto(f.parabens));
    area.addEventListener('input', () => { f.parabens = area.value; contador.textContent = contadorTexto(area.value); });
    const restaurarTexto = el('button', { type: 'button', class: 'btn-secundario', id: 'cfg-parabens-restaurar', onclick: () => {
      f.parabens = C.padroes.final.parabens;
      area.value = f.parabens;
      contador.textContent = contadorTexto(f.parabens);
    } }, 'Restaurar o texto original');
    return campo('Mensagem de parabenização', ['Aparece num pop-up nos celulares de todos os grupos quando você aperta Comemorar no Ranking. O grupo vencedor ganha antes a frase "Vocês venceram!".', 'Até 300 caracteres.'], el('div', { class: 'pg-parabens' }, area, el('div', { class: 'pg-parabens-linha' }, contador, restaurarTexto)), 'cfg-parabens');
  }

  function entradaTexto(id, valor, aoMudar, { area = false, max = 120 } = {}) {
    const n = el(area ? 'textarea' : 'input', area ? { id, rows: 7 } : { id, type: 'text', maxlength: max });
    n.value = valor;
    n.addEventListener('input', () => aoMudar(n.value));
    return n;
  }

  async function salvar() {
    C.erro = '';
    const f = C.form;
    const integrantes = f.integrantes.split('\n').map((x) => x.trim()).filter(Boolean);
    let r = await acao('salvarConfigJogo', f.jogo);
    if (r.t === 'ok') r = await acao('salvarTextos', { disciplina: f.disciplina, professor: f.professor, mensagem: f.mensagem, parabens: f.parabens, integrantes });
    if (r.t === 'ok') C.status = `Salvo às ${horaCurta(Date.now())}`;
    else { C.status = ''; C.erro = r.msg; }
    atualizarRodape();
  }

  let rodape;
  function atualizarRodape() {
    if (!rodape) return;
    rodape.status.textContent = C.status;
    rodape.erro.textContent = C.erro;
    rodape.erro.hidden = !C.erro;
  }

  function atualizarNota(e) {
    if (!C.nota) return;
    const andamento = e.emAndamento && e.estado.fase !== 'espera';
    C.nota.textContent = andamento
      ? 'Há uma partida em andamento. As regras salvas agora valem a partir do próximo jogo novo. A capa, a tela final e as imagens dos times mudam na hora.'
      : 'Ainda não há partida em andamento. As regras salvas valem já para o próximo jogo.';
  }

  const SINGULAR = { perguntas: 'pergunta', segundos: 'segundo', pontos: 'ponto', acertos: 'acerto', trocas: 'troca', vezes: 'vez', habilidades: 'habilidade', apostas: 'aposta' };
  const plural = (n, unidade) => (n === 1 ? SINGULAR[unidade] || unidade : unidade);

  function montar(e) {
    const secoes = e.camposConfig || [];
    C.campos = secoes.flatMap((s) => s.campos);
    if (!C.form) { C.form = formDe(e, C.campos); C.padroes = e.padroes; }
    C.montado = true;
    const f = C.form;

    const criarCampo = (c) => {
      const n = el('input', { id: `cfg-${c.chave}`, type: 'number', inputmode: 'numeric', min: c.min, max: c.max, step: 1 });
      n.value = f.jogo[c.chave];
      n.addEventListener('input', () => { f.jogo[c.chave] = n.value; });
      const entrada = el('div', { class: 'pg-entrada' }, n, el('span', { class: 'pg-unidade' }, c.unidade));
      return campo(c.nome, [c.efeito, `De ${c.min} a ${c.max} ${c.unidade}. Padrão: ${c.padrao} ${plural(c.padrao, c.unidade)}.`], entrada, `cfg-${c.chave}`);
    };

    // A opção realmente salva já nasce marcada (selected), e o valor é reafirmado depois de montar as opções.
    const seletor = el('select', { id: 'cfg-placarModo' }, MODOS_PLACAR.map(([v, r]) => el('option', { value: v, selected: v === f.jogo.placarModo }, r)));
    seletor.value = f.jogo.placarModo;
    seletor.addEventListener('change', () => { f.jogo.placarModo = seletor.value; });
    const campoModo = campo('Quando mostrar o placar parcial', ['O placar aparece no projetor depois da explicação, nunca no desempate nem junto do Ranking.', 'Padrão: de tantas em tantas perguntas.'], seletor, 'cfg-placarModo');

    const cartaoSecao = (s) => el('div', { class: 'cartao leve pg-cartao', 'data-secao': s.id },
      el('h2', {}, s.titulo),
      el('div', { class: 'pg-campos' }, s.id === 'placar' ? [campoModo, ...s.campos.map(criarCampo)] : s.campos.map(criarCampo)));

    C.nota = el('p', { class: 'pg-nota' });
    atualizarNota(e);
    rodape = { status: el('span', { class: 'pg-status', role: 'status' }), erro: el('p', { class: 'msg-erro', role: 'alert', hidden: true }) };
    atualizarRodape();

    const restaurar = () => {
      C.form = formDe({ configJogo: C.padroes.jogo, final: C.padroes.final }, C.campos);
      for (const c of C.campos) document.getElementById(`cfg-${c.chave}`).value = C.form.jogo[c.chave];
      document.getElementById('cfg-placarModo').value = C.form.jogo.placarModo;
      for (const k of CAMPOS_TEXTO) document.getElementById(`cfg-${k}`).value = C.form[k];
      document.getElementById('cfg-parabens-contador').textContent = contadorTexto(C.form.parabens);
      C.status = 'Valores padrão carregados. Clique em Salvar para aplicar.';
      C.erro = '';
      atualizarRodape();
    };

    const textos = el('div', { class: 'cartao leve pg-cartao', 'data-secao': 'textos' },
      el('h2', {}, 'Capa e tela final'),
      el('div', { class: 'pg-campos' },
        campo('Nome da disciplina', 'Aparece na capa do jogo.', entradaTexto('cfg-disciplina', f.disciplina, (v) => { f.disciplina = v; }), 'cfg-disciplina'),
        campo('Professor orientador', 'Aparece na tela final, depois de “Professor orientador:”.', entradaTexto('cfg-professor', f.professor, (v) => { f.professor = v; }), 'cfg-professor'),
        campo('Mensagem de agradecimento', 'Frase exibida na tela final. Até 200 caracteres.', entradaTexto('cfg-mensagem', f.mensagem, (v) => { f.mensagem = v; }, { max: 200 }), 'cfg-mensagem'),
        campoParabens(f),
        campo('Integrantes do grupo', 'Escreva um nome por linha, até 20 nomes.', entradaTexto('cfg-integrantes', f.integrantes, (v) => { f.integrantes = v; }, { area: true }), 'cfg-integrantes')));

    const no = el('section', { class: 'cena pg' },
      el('div', { class: 'fundo', html: fundoDiscreto() }),
      el('div', { class: 'conteudo pg-corpo' },
        el('header', { class: 'pg-topo' }, el('h1', {}, 'Configurações')),
        C.nota,
        el('div', { class: 'pg-grade' }, [...secoes.map(cartaoSecao), textos]),
        el('div', { class: 'pg-rodape' },
          el('button', { class: 'btn-secundario', onclick: restaurar }, 'Restaurar valores padrão'),
          el('button', { class: 'btn-pilula pequeno', onclick: salvar }, 'Salvar'),
          rodape.status),
        rodape.erro),
      botaoSeta('voltar', 'Voltar ao menu', aoVoltar));
    return no;
  }

  return {
    get montado() { return C.montado; },
    montar,
    aoEstado: atualizarNota,
    desmontar() { C.montado = false; C.form = null; C.status = ''; C.erro = ''; C.nota = null; rodape = null; },
  };
}

// ====================== Registro ======================
const TIPOS = [
  ['todos', 'Tudo'], ['rodada', 'Rodadas'], ['clique', 'Cliques'], ['resposta', 'Respostas'],
  ['habilidade', 'Habilidades'], ['pontos', 'Pontos'], ['conexao', 'Conexão'], ['jogo', 'Jogo'], ['sistema', 'Sistema'],
];

export function criarRegistro({ aoVoltar }) {
  const R = { montado: false, itens: [], total: -1, filtro: 'todos', lista: null, contador: null, chips: null, buscando: false };

  function nomeCor(msg) {
    // bolinha da primeira cor citada na linha
    let melhor = null;
    let pos = Infinity;
    for (const cor of Object.keys(CORES)) {
      const i = msg.indexOf(CORES[cor].nome);
      if (i >= 0 && i < pos) { pos = i; melhor = cor; }
    }
    return melhor;
  }

  function desenharLista() {
    if (!R.lista) return;
    const itens = R.itens.filter((i) => R.filtro === 'todos' || i.tipo === R.filtro).slice().reverse(); // mais novo primeiro
    R.contador.textContent = `${itens.length} de ${R.itens.length} eventos`;
    R.lista.replaceChildren(...(itens.length
      ? itens.map((i) => {
        const cor = 'cor' in i ? i.cor : nomeCor(i.msg); // linhas antigas (sem o campo) ainda são lidas pelo nome da cor no texto
        return el('li', { class: 'rg-linha' },
          el('time', { class: 'rg-hora' }, hora(i.t)),
          el('span', { class: 'rg-tipo' }, (TIPOS.find(([k]) => k === i.tipo) || [0, i.tipo])[1].toLowerCase()),
          cor ? el('i', { class: 'rg-cor', style: estiloCor(cor), 'aria-hidden': 'true' }) : el('i', { class: 'rg-cor vazio', 'aria-hidden': 'true' }),
          el('span', { class: 'rg-msg' }, i.msg));
      })
      : [el('li', { class: 'rg-vazio' }, 'Nenhum evento ainda.')]));
    R.chips?.forEach(([k, n]) => n.classList.toggle('ligado', k === R.filtro));
  }

  async function buscar() {
    if (R.buscando) return;
    R.buscando = true;
    try {
      const r = await fetch('/api/registro', { cache: 'no-store' });
      if (r.ok) { R.itens = (await r.json()).itens; desenharLista(); }
    } catch { /* tenta de novo na próxima mudança */ }
    R.buscando = false;
  }

  function montar(e) {
    R.montado = true;
    R.total = e.registroTotal;
    R.chips = TIPOS.map(([k, rotulo]) => [k, el('button', {
      class: 'rg-chip', 'aria-pressed': 'false',
      onclick: () => { R.filtro = k; desenharLista(); },
    }, rotulo)]);
    R.lista = el('ol', { class: 'rg-lista' });
    R.contador = el('span', { class: 'ed-contador' });
    buscar();
    return el('section', { class: 'cena pg' },
      el('div', { class: 'fundo', html: fundoDiscreto() }),
      el('div', { class: 'conteudo pg-corpo pg-registro' },
        el('header', { class: 'pg-topo' },
          el('h1', {}, 'Registro'),
          R.contador,
          el('a', { class: 'btn-secundario pg-baixar', href: '/api/registro.txt', download: 'registro-oficina.txt' }, 'Baixar .txt')),
        el('div', { class: 'rg-chips' }, R.chips.map(([, n]) => n)),
        el('div', { class: 'cartao leve pg-cartao rg-cartao' }, R.lista)),
      botaoSeta('voltar', 'Voltar ao menu', aoVoltar));
  }

  return {
    get montado() { return R.montado; },
    montar,
    aoEstado(e) { if (e.registroTotal !== R.total) { R.total = e.registroTotal; buscar(); } },
    desmontar() { R.montado = false; R.itens = []; R.lista = null; R.chips = null; },
  };
}
