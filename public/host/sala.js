// Sala de espera no /host: Começar, fichas das 10 cores, rede e teste de botões.
// Só mostra o que é da sala de espera.
import { el, botaoSeta } from '/shared/ui.js';
import { fundoDiscreto } from '/shared/decoracao.js';
import { CORES, ORDEM_CORES, estiloCor } from '/shared/cores.js';
import { imagemTime } from '/shared/imagens-times.js';
import { nomeDoGrupo } from '/shared/nomes.js';
import { linhaPainelCelular, avisoSemRede } from '/host/conexao.js';

export function criarSala({ acao, aoVoltar, redesenhar }) {
  const S = { editando: null, nome: '', erro: '' };

  async function executar(nome, ...args) {
    const r = await acao(nome, ...args);
    S.erro = r.t === 'erro' ? r.msg : '';
    if (r.t === 'erro') redesenhar();
    return r;
  }

  function motivos(e) {
    const conectados = e.estado.grupos.filter((g) => g.conectado).length;
    const out = [];
    if (conectados < 2) out.push('Conecte pelo menos 2 grupos');
    if ((e.perguntasInfo?.invalidas || 0) > 0) out.push('Há perguntas incompletas. Corrija em “Criar e editar perguntas”');
    return out;
  }

  function ficha(cor, e) {
    const g = e.estado.grupos.find((x) => x.cor === cor);
    const selecionada = e.ui.corSelecionada === cor;
    // Cor livre: o nome da cor. Cor ocupada: só o nome do grupo (a cor é o fundo da ficha).
    const nome = el('span', { class: g ? 'hs-nome' : 'hs-nome cor-nome' }, g ? nomeDoGrupo(e.nomes, cor) : CORES[cor].nome);

    if (!g) {
      return el('button', {
        class: `hs-ficha tem-img livre${selecionada ? ' sel' : ''}`,
        style: estiloCor(cor),
        'aria-pressed': selecionada ? 'true' : 'false',
        title: selecionada ? 'Tirar o QR da tela' : 'Mostrar o QR na tela',
        onclick: () => executar('selecionarCor', selecionada ? null : cor),
      }, imagemTime(cor, e.imagens), nome, el('span', { class: 'hs-estado' }, selecionada ? 'Aguardando QR' : 'Livre'));
    }

    if (S.editando === cor) {
      const campo = el('input', { type: 'text', class: 'hs-campo', maxlength: 40, 'aria-label': `Nome do grupo, cor ${CORES[cor].nome}` });
      campo.value = S.nome;
      campo.addEventListener('input', () => { S.nome = campo.value; });
      const salvar = async () => {
        if (!S.nome.trim()) return;
        const r = await executar('renomearGrupo', cor, S.nome.trim());
        if (r.t === 'ok') { S.editando = null; redesenhar(); }
      };
      campo.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') salvar();
        if (ev.key === 'Escape') { S.editando = null; redesenhar(); }
      });
      return el('div', { class: 'hs-ficha tem-img ocupada', style: estiloCor(cor) }, imagemTime(cor, e.imagens), nome, campo,
        el('span', { class: 'hs-botoes' },
          el('button', { class: 'hs-mini', onclick: salvar }, 'Salvar'),
          el('button', { class: 'hs-mini', onclick: () => { S.editando = null; redesenhar(); } }, 'Cancelar')));
    }

    return el('div', { class: 'hs-ficha tem-img ocupada', style: estiloCor(cor) },
      imagemTime(cor, e.imagens),
      nome,
      g.conectado ? null : el('span', { class: 'hs-estado' }, 'sem conexão'),
      el('span', { class: 'hs-botoes' },
        el('button', { class: 'hs-mini', onclick: () => { S.editando = cor; S.nome = g.representante; redesenhar(); } }, 'Editar nome'),
        el('button', { class: 'hs-mini', onclick: () => executar('liberarGrupo', cor) }, 'Liberar')));
  }

  function cartaoRede(e) {
    const seletor = el('select', { class: 'hs-select', 'aria-label': 'Endereço usado nos QR codes' },
      e.ips.length
        ? e.ips.map((i) => el('option', { value: i.ip, selected: i.ip === e.ui.ip }, `${i.ip}  (${i.nome})`))
        : el('option', {}, 'Nenhuma rede encontrada'));
    seletor.addEventListener('change', () => executar('escolherIp', seletor.value));
    return el('div', { class: 'cartao leve hs-cartao' },
      el('h2', {}, 'Rede'),
      el('p', {}, `Os QR codes apontam para http://${e.ui.ip}:${e.porta}`),
      seletor,
      linhaPainelCelular(e));
  }

  function cartaoTeste(e) {
    const t = e.ui.teste;
    const chips = t.ordem.map((cor, i) => el('span', { class: 'hs-chip', style: estiloCor(cor) }, `${i + 1}º ${nomeDoGrupo(e.nomes, cor)}`));
    return el('div', { class: 'cartao leve hs-cartao' },
      el('h2', {}, 'Teste de botões'),
      el('p', {}, t.ativo
        ? 'Peça aos grupos para apertar. A tela pisca a cor de quem apertou. Nada vale ponto.'
        : 'Confira se os celulares estão enviando o aperto. Nada vale ponto.'),
      t.ativo ? el('div', { class: 'hs-chips' }, chips.length ? chips : el('span', { class: 'hs-nota' }, 'Ninguém apertou ainda.')) : null,
      el('div', { class: 'hs-linha' },
        el('button', { class: `btn-secundario${t.ativo ? '' : ' forte'}`, onclick: () => executar('testeBotoes', !t.ativo) }, t.ativo ? 'Desligar modo teste' : 'Ligar modo teste'),
        t.ativo ? el('button', { class: 'btn-secundario', onclick: () => executar('testeZerar') }, 'Zerar ordem') : null));
  }

  function render(e) {
    const motivo = motivos(e);
    const pode = motivo.length === 0;
    const botao = el('button', {
      class: `hs-comecar${pode ? '' : ' desabilitado'}`,
      disabled: !pode,
      'aria-describedby': pode ? null : 'hs-motivo',
      onclick: () => executar('iniciar'),
    }, 'Começar');

    return el('section', { class: 'cena hs' },
      el('div', { class: 'fundo', html: fundoDiscreto() }),
      el('div', { class: 'conteudo hs-corpo' },
        el('div', { class: 'hs-topo' },
          avisoSemRede(e),
          botao,
          pode
            ? el('p', { class: 'hs-motivo ok' }, 'Grupos que não conectarem ficam de fora da partida.')
            : el('div', { id: 'hs-motivo', class: 'hs-motivo' }, motivo.map((m) => el('p', {}, m))),
          S.erro ? el('p', { class: 'msg-erro', role: 'alert' }, S.erro) : null),
        el('div', { class: 'hs-fichas' }, ORDEM_CORES.map((cor) => ficha(cor, e))),
        el('div', { class: 'hs-cartoes' }, cartaoRede(e), cartaoTeste(e))),
      botaoSeta('voltar', 'Voltar ao menu', aoVoltar));
  }

  // Depois de desenhar: devolve o foco ao campo de nome, que o painel recria a cada mudança.
  function aposDesenhar() {
    if (S.editando) {
      const c = document.querySelector('.hs-campo');
      if (c && document.activeElement !== c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
    }
  }

  return { render, aposDesenhar };
}
