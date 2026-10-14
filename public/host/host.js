import { el, tituloDuasCores, conectar, capa, botaoSeta, aplicarTema, botaoTema, restaurarTemaLocal, DISCIPLINA_PADRAO } from '/shared/ui.js';
import { fundoCapa, fundoMenu, fundoDiscreto } from '/shared/decoracao.js';
import { criarEditor } from '/host/editor.js';
import { criarSala } from '/host/sala.js';
import { criarJogoHost } from '/host/jogo.js';
import { criarConfig, criarRegistro } from '/host/paginas.js';
import { linhaPainelCelular, avisoSemRede, botoesDoApp, dicaFirewall, noApp } from '/host/conexao.js';

const app = document.getElementById('app');

const local = {
  autenticado: false,
  pinAberto: false,
  erroPin: '',
  confirmandoSubstituir: false,
  confirmandoEncerrar: false,
  conectado: false,
  estado: null, // última visão enviada pelo servidor
  irParaMenuAoConectar: false,
  disciplina: DISCIPLINA_PADRAO,
};

let conexao = null;
const editor = criarEditor({ aoVoltar: () => conexao.acao('irMenu') });
const config = criarConfig({ acao: (...a) => conexao.acao(...a), aoVoltar: () => conexao.acao('irMenu') });
const registro = criarRegistro({ aoVoltar: () => conexao.acao('irMenu') });
restaurarTemaLocal();
let ultimoTema = null;
let temaDoUltimoAviso = null;

// Ao mudar o tema com o time Preto/Branco em uso, um aviso discreto (uma vez por mudança) explica que não é erro.
function avisarTimeDoTema(m) {
  const t = m.ui?.tema;
  if (!t) return;
  if (temaDoUltimoAviso && t !== temaDoUltimoAviso && m.estado?.grupos?.some((g) => g.cor === 'preto')) {
    document.querySelector('.aviso-tema')?.remove();
    const no = el('div', { class: 'aviso-tema', role: 'status' },
      el('span', {}, 'O grupo Preto aparece como Branco no tema noturno.'),
      el('button', { class: 'aviso-tema-x', 'aria-label': 'Fechar aviso', onclick: () => no.remove() }, '×'));
    document.body.append(no);
    setTimeout(() => no.remove(), 9000);
  }
  temaDoUltimoAviso = t;
}
const sala = criarSala({
  acao: (...a) => conexao.acao(...a),
  aoVoltar: () => conexao.acao('irMenu'),
  redesenhar: () => desenhar(),
});

const jogo = criarJogoHost({
  acao: (...a) => conexao.acao(...a),
  aoMenu: () => conexao.acao('irMenu'),
  redesenhar: () => desenhar(),
  alternarTema: (t) => conexao.acao('definirTema', t),
});

function conectarServidor() {
  if (conexao) return;
  conexao = conectar({
    papel: 'host',
    aoStatus(ok) {
      local.conectado = ok;
      desenhar();
    },
    aoEstado(m) {
      local.estado = m;
      aplicarTema(m.ui?.tema);
      avisarTimeDoTema(m);
      if (local.irParaMenuAoConectar) {
        local.irParaMenuAoConectar = false;
        conexao.acao('irMenu');
      }
      desenhar();
    },
  });
}

async function enviarPin(pin) {
  const r = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (r.ok) {
    local.autenticado = true;
    local.pinAberto = false;
    local.erroPin = '';
    local.irParaMenuAoConectar = true;
    conectarServidor();
    return;
  }
  const dados = await r.json().catch(() => ({}));
  local.erroPin = dados.erro || 'PIN incorreto.';
  desenhar();
}

// ---------- telas ----------

function telaCapa() {
  const iniciar = el('button', {
    class: 'btn-pilula',
    onclick: () => {
      if (local.autenticado) conexao.acao('irMenu');
      else { local.pinAberto = true; desenhar(); }
    },
  }, 'Iniciar');
  return capa(fundoCapa(), iniciar, local.estado?.final?.disciplina || local.disciplina);
}

function telaPin() {
  const campo = el('input', {
    class: `campo-pin${local.erroPin ? ' erro' : ''}`,
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'off',
    maxlength: 4,
    placeholder: '••••',
    'aria-label': 'PIN do responsável',
  });
  const enviar = () => { if (campo.value.length === 4) enviarPin(campo.value); };
  campo.addEventListener('input', () => { campo.value = campo.value.replace(/\D/g, ''); if (campo.value.length === 4) enviar(); });
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
  setTimeout(() => campo.focus(), 0);

  return el('section', { class: 'cena menu' },
    el('div', { class: 'fundo', html: fundoMenu() }),
    el('div', { class: 'conteudo' },
      el('div', { class: 'painel pin cartao' },
        el('h2', {}, 'PIN do responsável'),
        el('p', {}, 'Ele aparece no terminal onde o servidor foi iniciado.'),
        campo,
        local.erroPin ? el('p', { class: 'msg-erro', role: 'alert' }, local.erroPin) : null,
        el('div', { class: 'linha' },
          el('button', { class: 'btn-secundario', onclick: () => { local.pinAberto = false; local.erroPin = ''; desenhar(); } }, 'Voltar'),
          el('button', { class: 'btn-secundario', onclick: enviar }, 'Entrar')))));
}

function opcao(titulo, descricao, aoClicar) {
  return el('button', { class: 'cartao opcao', onclick: aoClicar },
    el('h2', {}, titulo),
    el('p', {}, descricao));
}

// Aviso (sem bloquear) quando há perguntas incompletas: o jogo só começa com todas válidas.
function avisoPerguntas(e) {
  const n = e?.perguntasInfo?.invalidas || 0;
  if (!n) return null;
  return el('p', { class: 'aviso-menu', role: 'status' },
    n === 1 ? 'Há 1 pergunta incompleta.' : `Há ${n} perguntas incompletas.`,
    ' O jogo só começa com todas válidas. Corrija em “Criar e editar perguntas”.');
}

function telaMenu() {
  const e = local.estado;
  if (local.confirmandoSubstituir) {
    return el('section', { class: 'cena menu' },
      el('div', { class: 'fundo', html: fundoMenu() }),
      el('div', { class: 'conteudo' },
        el('div', { class: 'painel cartao' },
          el('h2', {}, 'Substituir o jogo salvo?'),
          el('p', {}, 'Os pontos e o andamento da partida atual serão apagados. As perguntas continuam salvas.'),
          el('div', { class: 'linha' },
            el('button', { class: 'btn-secundario', onclick: () => { local.confirmandoSubstituir = false; desenhar(); } }, 'Cancelar'),
            el('button', {
              class: 'btn-secundario',
              onclick: async () => {
                local.confirmandoSubstituir = false;
                await conexao.acao('novoJogo', { substituir: true });
              },
            }, 'Substituir')))));
  }

  const extras = el('div', { class: 'menu-extra' },
    el('button', { class: 'btn-secundario', onclick: () => conexao.acao('irConfig') }, 'Configurações'),
    el('button', { class: 'btn-secundario', onclick: () => conexao.acao('irRegistro') }, 'Registro'),
    ...botoesDoApp(() => { local.confirmandoEncerrar = true; desenhar(); }));
  if (local.confirmandoEncerrar) {
    return el('section', { class: 'cena menu' },
      el('div', { class: 'fundo', html: fundoMenu() }),
      el('div', { class: 'conteudo' },
        el('div', { class: 'painel cartao' },
          el('h2', {}, 'Encerrar o Quizer?'),
          el('p', {}, 'Fecha o servidor e as duas janelas. O jogo fica salvo e pode ser retomado em “Continuar jogo”.'),
          el('div', { class: 'linha' },
            el('button', { class: 'btn-secundario', onclick: () => { local.confirmandoEncerrar = false; desenhar(); } }, 'Cancelar'),
            el('button', { class: 'btn-secundario', onclick: () => window.quizer.encerrar() }, 'Encerrar')))));
  }

  const opcoes = [
    opcao('Criar novo jogo', 'Abre a sala de espera, com o QR code de cada grupo.', () => {
      if (e?.emAndamento) { local.confirmandoSubstituir = true; desenhar(); }
      else conexao.acao('novoJogo', {});
    }),
    opcao('Criar e editar perguntas', 'Escreva, importe ou ajuste as perguntas antes da partida.', () => conexao.acao('irEditor')),
  ];
  if (e?.emAndamento) {
    opcoes.push(opcao('Continuar jogo', 'Retoma a partida salva, do ponto em que parou.', () => conexao.acao('continuarJogo')));
  }

  return el('section', { class: 'cena menu' },
    el('div', { class: 'fundo', html: fundoMenu() }),
    el('div', { class: 'conteudo' },
      tituloDuasCores('Vamos começar'),
      el('div', { class: 'opcoes' }, opcoes),
      extras,
      avisoSemRede(e),
      linhaPainelCelular(e),
      dicaFirewall(),
      avisoPerguntas(e)));
}

// Provisórias: o editor entra na Etapa 4 e a sala de espera na Etapa 5.
function telaProvisoria(titulo, texto, aoVoltar, extra = null) {
  return el('section', { class: 'cena menu' },
    el('div', { class: 'fundo', html: fundoDiscreto() }),
    el('div', { class: 'conteudo' },
      el('div', { class: 'painel cartao' },
        el('h2', {}, titulo),
        el('p', {}, texto),
        extra)),
    botaoSeta('voltar', 'Voltar', aoVoltar));
}

function desenhar() {
  const e = local.estado;
  const noEditor = local.autenticado && e?.ui.cena === 'editor';
  if (noEditor && editor.montado) {
    editor.aoEstado(e); // o editor mantém o próprio DOM (não perde o foco ao digitar)
    return;
  }
  if (!noEditor && editor.montado) editor.desmontar();
  // Configurações e Registro mantêm o próprio DOM (não perdem o foco); refazem só ao trocar de tema.
  const cenaAtual = local.autenticado ? e?.ui.cena : null;
  const paginas = { config, registro };
  const pagina = paginas[cenaAtual];
  if (pagina?.montado && e.ui.tema === ultimoTema) {
    pagina.aoEstado(e);
    return;
  }
  for (const [nome, p] of Object.entries(paginas)) if (nome !== cenaAtual && p.montado) p.desmontar();
  ultimoTema = e?.ui.tema ?? null;
  let tela;
  if (!local.autenticado || !e) {
    tela = local.pinAberto ? telaPin() : telaCapa();
  } else {
    switch (e.ui.cena) {
      case 'menu': tela = telaMenu(); break;
      case 'editor':
        tela = editor.montar();
        editor.aoEstado(e);
        break;
      case 'config': tela = config.montar(e); break;
      case 'registro': tela = registro.montar(e); break;
      case 'jogo':
        tela = e.estado.fase === 'espera'
          ? sala.render(e)
          : jogo.render(e);
        break;
      default: tela = telaCapa();
    }
  }
  if (!(local.autenticado && e?.ui.cena === 'jogo' && e.estado.fase !== 'espera')) jogo.sair();
  const filhos = [tela];
  // Alternador de tema no canto da capa e do menu (no painel do jogo ele fica na barra superior).
  if (local.autenticado && e && (!['jogo', 'editor'].includes(e.ui.cena) || e.ui.cena === 'menu')) {
    filhos.push(botaoTema(e.ui.tema, (t) => conexao.acao('definirTema', t), { fixo: true }));
  }
  if (local.autenticado && !local.conectado) filhos.push(el('div', { class: 'estado-conexao', role: 'status' }, 'Reconectando...'));
  app.replaceChildren(...filhos);
  sala.aposDesenhar();
}

// Início: se o cookie de autenticação ainda vale, entra direto na conexão.
(async () => {
  try {
    const capaInfo = await (await fetch('/api/capa')).json();
    local.disciplina = capaInfo.disciplina || local.disciplina;
    aplicarTema(capaInfo.tema); // o cartão de PIN de outro aparelho já nasce no tema certo
    const r = await fetch('/api/auth/status');
    local.autenticado = (await r.json()).autenticado;
  } catch { /* servidor fora do ar: mostra a capa */ }
  desenhar();
  if (local.autenticado) conectarServidor();
})();

// Atalho T: alterna o tema (fora de campos de texto).
window.addEventListener('keydown', (ev) => {
  if (ev.key.toLowerCase() !== 't' || ev.ctrlKey || ev.altKey || ev.metaKey || ev.repeat) return;
  const alvo = ev.target;
  if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
  const e = local.estado;
  if (!local.autenticado || !e || !conexao) return;
  conexao.acao('definirTema', e.ui.tema === 'noturno' ? 'claro' : 'noturno');
});
