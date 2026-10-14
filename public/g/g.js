import { el, conectar, aplicarTema } from '/shared/ui.js';
import { ICONES, NOMES as NOME_HAB, DESCRICOES, selo } from '/shared/habilidades.js';
import { pontosComSinal, CELULAR as TXT } from '/shared/textos.js';
import { folha, passoAutomatico, passoValido } from '/g/folha.js';
import { CORES, textoSobre, escurecer } from '/shared/cores.js';
import { imagemTime } from '/shared/imagens-times.js';
import { classeTam } from '/shared/nomes.js';
import { atualizarComemoracao } from '/g/comemoracao.js';

const app = document.getElementById('app');
const cor = location.pathname.split('/').filter(Boolean).pop();
if (!CORES[cor]) {
  app.replaceChildren(el('div', { class: 'g' }, el('div', { class: 'g-meio g-msg' }, el('h2', {}, 'Cor inválida'), el('p', {}, 'Escaneie o QR code da tela de novo.'))));
  throw new Error('cor inválida');
}

// A cor do grupo vale para a tela inteira; o texto (preto ou branco) é o de maior contraste. O time Preto é Branco no tema
// noturno, então isto roda de novo sempre que o tema global muda.
const raiz = document.documentElement.style;
function aplicarCorDoTime() {
  const info = CORES[cor];
  raiz.setProperty('--cor', info.hex);
  raiz.setProperty('--txt', textoSobre(info.hex));
  raiz.setProperty('--sombra', info.sombra || info.contorno || escurecer(info.hex, 0.3));
  document.title = `Botão ${info.nome}`;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', info.hex);
}

// O celular não tem tema próprio e não guarda tema no aparelho: usa o do servidor antes de desenhar (sem piscar com o tema
// errado). Se o servidor não responder em 2 s, o claro.
try {
  const resp = await Promise.race([fetch('/api/capa', { cache: 'no-store' }).then((r) => r.json()), new Promise((_, no) => setTimeout(() => no(new Error('sem resposta')), 2000))]);
  aplicarTema(resp.tema, { guardar: false });
} catch {
  aplicarTema('claro', { guardar: false });
}
aplicarCorDoTime();

// ---------- token no localStorage (tolera navegador sem armazenamento) ----------
const chave = `oficina_token_${cor}`;
// O Preto era Marrom: um celular que já tinha entrado como Marrom continua com o mesmo token.
const lerToken = () => { try { return localStorage.getItem(chave) || (cor === 'preto' ? localStorage.getItem('oficina_token_marrom') : null); } catch { return null; } };
const guardarToken = (t) => { try { localStorage.setItem(chave, t); } catch { /* sem armazenamento */ } };
const limparToken = () => { try { localStorage.removeItem(chave); } catch { /* sem armazenamento */ } };

// ---------- tela sempre acesa (Screen Wake Lock), tolerando falha ----------
let trava = null;
async function manterAcesa() {
  try {
    if (!('wakeLock' in navigator) || trava) return;
    trava = await navigator.wakeLock.request('screen');
    trava.addEventListener('release', () => { trava = null; });
  } catch { /* o navegador pode negar; o jogo funciona igual */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') manterAcesa(); });
manterAcesa();

// ---------- estado local ----------
const E = {
  visao: null,
  ligado: false,
  aguardandoToken: false,
  enviando: false,
  entrando: false,
  nome: '',
  erro: '',
  assinatura: '',
  ganho: null, // habilidade recém-ganha: tela cheia com o ícone entrando
  folha: null, // folha de habilidades aberta: { passo, ... } (Etapa 8d)
  autoVisto: '', // última decisão que abriu a folha sozinha (não reabre a cada atualização)
};

const conexao = conectar({
  papel: 'g',
  cor,
  aoStatus(ok) {
    E.ligado = ok;
    if (ok) {
      const t = lerToken();
      if (t) {
        E.aguardandoToken = true;
        conexao.enviar({ t: 'entrar', token: t });
      }
    } else {
      E.enviando = false;
    }
    desenhar();
  },
  aoEstado(v) {
    aplicarTema(v.tema, { guardar: false }); // tema global do servidor (também ao reconectar e ao alternar, sem recarregar)
    aplicarCorDoTime(); // o fundo é a cor do time (Preto ou Branco conforme o tema)
    // Ganhou uma habilidade agora (não conta a primeira visão depois de abrir/recarregar a página).
    const novos = E.visao && v.registrado ? novasHabilidades(E.visao.habilidades || [], v.habilidades || []) : [];
    if (novos.length) {
      E.ganho = novos[0];
      setTimeout(() => { E.ganho = null; desenhar(); }, 2600);
    }
    const eraAoVivo = !!E.visao?.registrado; // a página já estava dentro do grupo antes desta visão
    E.visao = v;
    atualizarComemoracao(v, cor, eraAoVivo);
    if (v.registrado) {
      // Oferta, decisão do Escudo e Dica abrem a folha sozinhas, uma vez; se a decisão já foi tomada (no celular
      // ou pelo painel), a folha fecha.
      const auto = passoAutomatico(v);
      if (auto && auto.chave !== E.autoVisto && !E.folha) { E.autoVisto = auto.chave; E.folha = { passo: auto.passo }; }
      if (v.acoes?.escudo && !E.folha) E.folha = { passo: 'escudo' }; // enquanto houver decisão pendente, a folha reaparece
      if (v.acoes?.escudo && !E.historico) { history.pushState({ escudo: true }, ''); E.historico = true; } // o Voltar do navegador cai aqui, não sai da página
      if (!v.acoes?.escudo) E.historico = false;
      if (E.folha && !passoValido(v, E.folha)) E.folha = null;
    } else E.folha = null;
    if (v.botao !== 'aberto') E.enviando = false;
    if (v.registrado) { E.aguardandoToken = false; E.entrando = false; E.erro = ''; }
    desenhar();
  },
  aoMensagem(m) {
    if (m.t === 'entrou') {
      guardarToken(m.token);
      E.aguardandoToken = false;
      E.entrando = false;
      E.erro = '';
    } else if (m.t === 'precisaNome') {
      limparToken();
      E.aguardandoToken = false;
    } else if (m.t === 'erro') {
      E.aguardandoToken = false;
      E.entrando = false;
      E.erro = m.msg;
    } else if (m.t === 'ignorado') {
      E.enviando = false;
    }
    desenhar();
  },
});

// ---------- ações ----------
function apertar(ev) {
  const v = E.visao;
  if (!E.ligado || !v || E.enviando) return;
  if (v.botao === 'teste') {
    conexao.enviar({ t: 'apertar' });
    navigator.vibrate?.(60);
    ev.currentTarget.classList.add('apertou');
    setTimeout(() => ev.currentTarget?.classList.remove('apertou'), 220);
    return;
  }
  if (v.botao !== 'aberto') return;
  E.enviando = true; // "Enviando…" até o servidor confirmar a posição
  navigator.vibrate?.(80);
  conexao.enviar({ t: 'apertar' });
  desenhar();
  manterAcesa();
}

function entrar(ev) {
  ev.preventDefault();
  const nome = E.nome.trim();
  if (!nome || E.entrando) return;
  E.entrando = true;
  E.erro = '';
  conexao.enviar({ t: 'entrar', nome });
  desenhar();
}

// ---------- habilidades ----------
// O que entrou no estoque entre duas visões (compara por tipo, porque pode haver repetidas).
function novasHabilidades(antes, depois) {
  const sobra = [...antes];
  const novos = [];
  for (const t of depois) {
    const i = sobra.indexOf(t);
    if (i >= 0) sobra.splice(i, 1);
    else novos.push(t);
  }
  return novos;
}

// "Você tem:" com UM CHIP TOCÁVEL por habilidade guardada e o chip da Aposta (sempre presente). Tocar num chip habilitado
// inicia o uso com a confirmação de sempre; num desabilitado mostra o motivo em texto curto. Mais o chip "em jogo"
// (informativo) da habilidade usada na rodada. Quem manda no que pode é `v.acoes.habs` (calculado no servidor).
function iniciarUso(tipo, h) {
  if (tipo === 'dobro') ir('dobroOk');
  else if (tipo === 'bloqueio') ir(h.pendente ? 'pedido' : 'alvo');
  else if (tipo === 'passe') ir('passeOk');
  else if (tipo === 'dica5050') ir('dicaOk');
  else if (tipo === 'escudo') ir('escudo');
  else if (tipo === 'aposta') ir('aposta');
}

function mostrarMotivo(texto) {
  E.motivo = texto;
  clearTimeout(mostrarMotivo.t);
  mostrarMotivo.t = setTimeout(() => { E.motivo = null; desenhar(); }, 3500);
  desenhar();
}

// Círculo do chip: a Aposta é o SVG próprio; as outras, o PNG da habilidade.
function iconeChip(tipo, extra = '') {
  if (tipo === 'aposta') return selo('aposta', `g-hab-selo ${extra}`.trim());
  return el('span', { class: `hab-selo g-hab-selo ${extra}`.trim() }, el('img', { src: ICONES[tipo], alt: '', 'data-tipo': tipo }));
}

function chipsHabilidades(v) {
  if (!v?.registrado) return null;
  const habs = v.acoes?.habs || {};
  const reservar = [...(v.reservadas || [])];
  const botaoChip = (tipo, rotulo, extraClasse = '') => {
    const h = habs[tipo] || { pode: false, motivo: '' };
    const nome = NOME_HAB[tipo];
    return el('button', {
      class: `g-hab g-chip${h.pode ? '' : ' desab'}${extraClasse}`,
      'data-tipo': tipo,
      'aria-label': h.pode ? TXT.usarHabilidade(nome) : TXT.usarIndisponivel(nome, h.motivo),
      'aria-disabled': h.pode ? 'false' : 'true',
      onclick: () => (h.pode ? iniciarUso(tipo, h) : mostrarMotivo(h.motivo)),
    }, iconeChip(tipo), el('span', {}, rotulo));
  };
  const chipsGuardados = (v.habilidades || []).map((t) => {
    const k = reservar.indexOf(t);
    if (k >= 0) { reservar.splice(k, 1); return botaoChip(t, `${NOME_HAB[t]} (na aposta)`, ' reservada'); }
    return botaoChip(t, NOME_HAB[t]);
  });
  const emJogo = v.ativa ? el('div', { class: 'g-hab em-jogo' },
    iconeChip(v.ativa, `hab-em-jogo ${v.ativa}`),
    el('span', {}, textoAtiva(v))) : null;
  return el('div', { class: 'g-habs' },
    el('span', { class: 'g-habs-rotulo' }, TXT.voceTem),
    chipsGuardados,
    botaoChip('aposta', NOME_HAB.aposta),
    emJogo,
    E.motivo ? el('p', { class: 'g-motivo', role: 'status' }, E.motivo) : null);
}

// O que o chip da habilidade "em jogo" diz: Passe e Dica já foram usados; a Aposta mostra o modo e, depois da
// rodada, o resultado.
function textoAtiva(v) {
  if (v.ativa === 'passe') return 'Passe usado';
  if (v.ativa === 'dica5050') return 'Dica 50/50 usada';
  if (v.ativa === 'aposta') {
    const a = v.aposta;
    if (a?.estado === 'cobrada') return `Aposta cobrada: ${pontosComSinal(a.delta)} pontos`;
    if (a?.estado === 'devolvida') return 'Aposta não cobrada';
    return a?.modo === 'pontos' ? 'Aposta com pontos em jogo' : 'Aposta com habilidades em jogo';
  }
  return `${NOME_HAB[v.ativa]} em jogo`;
}

// Dica 50/50 do próprio grupo: A, B, C e D, com as eliminadas apagadas.
function linhaDica(v) {
  if (!v?.eliminadas?.length) return null;
  return el('div', { class: 'g-dica', role: 'status' },
    el('span', { class: 'g-dica-rotulo' }, 'Dica 50/50:'),
    ['A', 'B', 'C', 'D'].map((L, i) => el('span', { class: `g-dica-letra${v.eliminadas.includes(i) ? ' fora' : ''}` }, L)));
}

// Tela cheia ao ganhar: o ícone entra com escala, repique e brilho, e some sozinha.
function telaGanho() {
  if (!E.ganho) return null;
  return el('div', { class: 'g-ganho', role: 'status' },
    el('div', { class: 'hab-selo g-ganho-selo hab-ganho' }, el('img', { src: ICONES[E.ganho], alt: '' })),
    el('p', {}, `Você ganhou ${E.ganho === 'dica5050' ? 'a' : 'o'} ${NOME_HAB[E.ganho]}`),
    el('p', { class: 'g-ganho-desc' }, DESCRICOES[E.ganho]));
}

// ---------- folha de habilidades (o grupo decide no celular) ----------
const ir = (p) => { E.folha = typeof p === 'string' ? { passo: p } : p; desenhar(); };
// Com decisão de Escudo pendente a folha não fecha: "Fechar" (de outra folha) leva de volta à decisão.
const fecharFolha = () => { E.folha = E.visao?.acoes?.escudo ? { passo: 'escudo' } : null; desenhar(); };

// Envia a ação do grupo e espera o servidor (que valida fase, regra e idempotência). Um toque repetido não faz nada.
async function enviarHab(nome, ...args) {
  const F = E.folha;
  if (!F || F.ocupado) return;
  F.ocupado = true;
  F.erro = '';
  desenhar();
  const resp = await Promise.race([conexao.acao(nome, ...args), new Promise((r) => setTimeout(() => r({ t: 'erro', msg: 'Sem resposta do servidor. Tente de novo ou peça ao responsável.' }), 6000))]);
  if (E.folha && E.folha !== F) return; // o estado novo já pode ter fechado a folha: a resposta ainda vale
  if (resp.t === 'ok') E.folha = nome === 'pedirBloqueio' ? { passo: 'pedido' } : null;
  else { F.ocupado = false; F.erro = resp.msg; }
  navigator.vibrate?.(40);
  desenhar();
}

// Acertos seguidos como moeda (Etapa 8f): contador "N de 7" com marcas e o botão de trocar por habilidade.
function blocoAcertos(v) {
  const t = v?.acoes?.troca;
  if (!v?.registrado || !t || E.folha) return null;
  const marcas = el('span', { class: 'g-marcas', 'aria-hidden': 'true' }, Array.from({ length: t.max }, (_, i) => el('i', { class: i < t.sequencia ? 'cheia' : '' })));
  const contador = el('div', { class: 'g-acertos' }, el('span', { class: 'g-acertos-txt' }, TXT.acertos(t.sequencia, t.max)), marcas,
    el('span', { class: 'g-trocas-usadas' }, TXT.trocasUsadas(t.usadas, t.limite)));
  if (v.botao === 'aberto') return el('div', { class: 'g-troca' }, contador); // janela aberta: só o contador, o botão de apertar é o foco
  return el('div', { class: 'g-troca' }, contador,
    el('button', { class: 'g-troca-btn', disabled: !t.pode, onclick: () => ir('trocar') }, TXT.trocarBotao),
    t.pode ? null : el('small', { class: 'g-troca-motivo' }, t.motivo));
}

// Barra do Tigrinho (3, 6, 9... rodadas sem pontuar): imita o formato de uma notificação de mensagem (foto redonda,
// nome do remetente e um balão com o texto), desenhada com CSS próprio na identidade do Quizer. Só aparece quando o
// servidor manda `acoes.tigrinho` (o grupo pode apostar), some com a janela de 30 s e fica por baixo da folha.
// Tocar abre a Aposta; o X dispensa; passados TIGRINHO_SEGUNDOS ela sai sozinha. O tempo só corre com a página visível.
// Dispensada, aberta ou expirada, não volta para esta contagem de rodadas sem pontuar (o servidor guarda).
const TIGRINHO_SEGUNDOS = 10;
const tig = { n: null, restanteMs: 0, ultimo: 0, saindo: false };

function dispensarTigrinhoAgora(n, { animar }) {
  if (E.tigDispensado === n) return;
  conexao.acao('dispensarTigrinho');
  if (!animar) { E.tigDispensado = n; desenhar(); return; }
  tig.saindo = true; // sobe para fora do topo e depois some
  desenhar();
  setTimeout(() => { tig.saindo = false; E.tigDispensado = n; desenhar(); }, 350);
}

// Relógio da barra: conta só enquanto a página está visível (celular com tela apagada ou em outra aba pausa).
setInterval(() => {
  const n = E.visao?.acoes?.tigrinho?.n;
  const agora = Date.now();
  const delta = Math.min(agora - (tig.ultimo || agora), 1000);
  tig.ultimo = agora;
  if (!n || E.folha || E.tigDispensado === n || tig.saindo) return;
  if (document.visibilityState !== 'visible') return;
  if (tig.n !== n) { tig.n = n; tig.restanteMs = TIGRINHO_SEGUNDOS * 1000; return; }
  tig.restanteMs -= delta;
  if (tig.restanteMs <= 0) dispensarTigrinhoAgora(n, { animar: true });
}, 250);

function barraTigrinho(v) {
  const n = v?.acoes?.tigrinho?.n;
  if (!v?.registrado || !n || E.folha) return null;
  if (tig.n !== n) { tig.n = n; tig.restanteMs = TIGRINHO_SEGUNDOS * 1000; }
  const foto = el('img', { class: 'g-tig-foto', src: '/shared/tigrinho.png', alt: TXT.tigrinhoFoto, width: 44, height: 44 });
  const inicial = () => el('span', { class: 'g-tig-foto g-tig-inicial', role: 'img', 'aria-label': TXT.tigrinhoFoto }, 'T');
  foto.addEventListener('error', () => foto.replaceWith(inicial())); // sem a imagem, o círculo com a inicial
  return el('div', { class: `g-tig${tig.saindo ? ' saindo' : ''}`, role: 'status' },
    el('button', { class: 'g-tig-corpo', 'aria-label': TXT.tigrinhoAbrir, onclick: () => { dispensarTigrinhoAgora(n, { animar: false }); ir('aposta'); } },
      foto,
      el('span', { class: 'g-tig-txt' },
        el('strong', { class: 'g-tig-nome' }, TXT.tigrinhoNome),
        el('span', { class: 'g-tig-balao' }, TXT.tigrinhoTexto(n)))),
    el('button', { class: 'g-tig-x', 'aria-label': TXT.tigrinhoDispensar, onclick: () => dispensarTigrinhoAgora(n, { animar: true }) }, '×'));
}

// ---------- telas ----------
function topo(v) {
  return el('header', { class: 'g-topo' },
    // Já dentro do grupo: só o nome do grupo (a cor é o fundo; o nome da cor fica só para leitores de tela).
    // Antes de entrar não há nome ainda: aparece o nome da cor.
    v?.registrado && v.nome
      ? el('h1', { class: `g-cor g-nome-grupo${classeTam(v.nome)}`, 'aria-label': `${v.nome}, cor ${CORES[cor].nome}` }, v.nome)
      : el('h1', { class: 'g-cor' }, CORES[cor].nome),
    chipsHabilidades(v),
    linhaDica(v));
}

function mensagem(titulo, texto) {
  return el('div', { class: 'g-meio g-msg' }, el('h2', {}, titulo), texto ? el('p', {}, texto) : null);
}

function formulario() {
  const campo = el('input', { id: 'g-nome', type: 'text', maxlength: 40, autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'go' });
  campo.value = E.nome;
  campo.addEventListener('input', () => { E.nome = campo.value; });
  return el('form', { class: 'g-meio g-form', onsubmit: entrar },
    el('label', { for: 'g-nome' }, 'Nome do grupo'),
    campo,
    E.erro ? el('p', { class: 'g-erro', role: 'alert' }, E.erro) : null,
    el('button', { class: 'g-entrar', type: 'submit', disabled: E.entrando }, E.entrando ? 'Entrando…' : 'Entrar'));
}

function botao(v) {
  const b = v.botao;
  // O aperto é no pointerdown (não no click), para a menor latência possível.
  const comPointer = (extra, ...filhos) => el('button', { class: `g-botao ${extra}`, onpointerdown: apertar }, ...filhos);

  if (b === 'bloqueado') {
    return el('div', { class: 'g-meio' },
      el('button', { class: 'g-botao bloqueado', disabled: true },
        el('span', { class: 'g-selo' }, el('img', { src: '/assets/bloqueio.png', alt: '' })),
        el('span', {}, 'Bloqueado nesta rodada')));
  }
  if (b === 'registrado') {
    return el('div', { class: 'g-meio' },
      el('button', { class: 'g-botao registrado', disabled: true }, el('span', {}, 'Registrado'), el('small', {}, 'você é o'), el('strong', {}, `${v.posicao}º`)));
  }
  if (b === 'aberto') {
    if (E.enviando) return el('div', { class: 'g-meio' }, el('button', { class: 'g-botao', disabled: true }, 'Enviando…'));
    return el('div', { class: 'g-meio' }, comPointer('livre', 'APERTE'));
  }
  if (b === 'teste') {
    return el('div', { class: 'g-meio' }, comPointer('livre teste', 'APERTE', el('small', {}, 'modo teste, nada vale ponto')));
  }
  if (b === 'pausado') return el('div', { class: 'g-meio' }, el('button', { class: 'g-botao', disabled: true }, 'Pausado'));
  // fora da janela
  return el('div', { class: 'g-meio' }, el('button', { class: 'g-botao', disabled: true }, 'Aguarde'));
}

function corpo() {
  const v = E.visao;
  if (!v) return { chave: 'conectando', no: mensagem('Conectando…') };
  if (!v.registrado) {
    if (E.aguardandoToken) return { chave: 'conectando', no: mensagem('Conectando…') };
    switch (v.entrada) {
      case 'comecou': return { chave: 'comecou', no: mensagem('A partida já começou', 'Aguarde a próxima partida.') };
      case 'ocupada': return { chave: 'ocupada', no: mensagem('Esta cor já está em uso', 'Peça ao responsável para liberar a cor.') };
      case 'fechada': return { chave: 'fechada', no: mensagem('Aguarde', 'O responsável ainda não abriu o jogo.') };
      default: return { chave: `form|${E.erro}|${E.entrando}`, no: formulario() };
    }
  }
  if (v.botao === 'espera') return { chave: 'espera', no: mensagem('Aguarde') };
  if (v.botao === 'placar') return { chave: 'placar', no: mensagem('Placar na tela') };
  return { chave: `botao|${v.botao}|${v.posicao}|${E.enviando}`, no: botao(v) };
}

function desenhar() {
  const v = E.visao;
  const c = corpo();
  const chave = `${c.chave}|${v?.nome}|${E.ligado}|${(v?.habilidades || []).join(',')}|${v?.ativa}|${E.ganho}|${(v?.reservadas || []).join(',')}|${(v?.eliminadas || []).join(',')}|${JSON.stringify(v?.aposta)}|${JSON.stringify(v?.acoes)}|${v?.pedidoRecusado || ''}|${JSON.stringify(E.folha)}|${E.tigDispensado}|${tig.saindo}|${E.motivo || ''}|${v?.imagens}|${v?.tema}`;
  if (chave === E.assinatura) return; // nada visível mudou (e o campo de nome não perde o foco)
  E.assinatura = chave;
  const emForm = c.chave.startsWith('form');
  // replaceChildren(null) escreve o TEXTO "null" na página: só entram nós de verdade.
  app.replaceChildren(...[
    el('main', { class: 'g tem-img' }, imagemTime(cor, v?.imagens, 'celular'), topo(v), blocoAcertos(v), c.no),
    E.folha && v?.acoes ? folha({ v, F: E.folha, ir, fechar: fecharFolha, enviar: enviarHab }) : null,
    !E.ligado && v ? el('div', { class: 'g-reconectando', role: 'status' }, 'Reconectando...') : null,
    telaGanho(),
    E.tigDispensado === v?.acoes?.tigrinho?.n && !tig.saindo ? null : barraTigrinho(v),
  ].filter(Boolean));
  if (emForm) document.getElementById('g-nome')?.focus({ preventScroll: true });
}

desenhar();

// Botão Voltar do navegador: com decisão de Escudo pendente não há saída (a folha reaparece e o histórico é recolocado).
window.addEventListener('popstate', () => {
  if (E.visao?.acoes?.escudo) {
    history.pushState({ escudo: true }, '');
    if (!E.folha) { E.folha = { passo: 'escudo' }; desenhar(); }
  }
});
