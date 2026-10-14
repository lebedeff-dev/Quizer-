'use strict';
// Ajudantes das capturas: com TEMA=noturno (ou claro) no ambiente, grava as capturas em capturas/<tema>/
// e liga o tema no servidor de teste antes de abrir as páginas.
const path = require('node:path');
const { Cliente, autenticar } = require('../test/ajuda');

const TEMA = process.env.TEMA || null;
const pastaCapturas = path.join(__dirname, '..', 'capturas', TEMA || '');

async function temaInicial(srv, pin = '1234') {
  if (!TEMA) return;
  const { cookie } = await autenticar(srv.porta, pin);
  const c = new Cliente(srv.porta, 'papel=host', cookie);
  await c.aberto;
  await c.acao('definirTema', TEMA);
  c.fechar();
}

// O alternador de tema (lua/sol) não pode cobrir campo, botão, link nem texto em nenhuma posição de rolagem.
// Mede os retângulos na página aberta e acrescenta o que encontrar em `erros`.
async function conferirBotaoTema(pg, nome, erros) {
  if (!(await pg.$('.btn-tema'))) return;
  const total = await pg.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (const y of [0, 200, 400, 700, Math.max(0, total)]) {
    await pg.evaluate((yy) => window.scrollTo(0, yy), y);
    await pg.waitForTimeout(60);
    const cobre = await pg.evaluate(() => {
      const botao = document.querySelector('.btn-tema');
      const t = botao.getBoundingClientRect();
      // janela de decisão por cima do botão (véu): é ela que cobre o botão, não o contrário
      const topo = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
      if (topo && !botao.contains(topo)) return [];
      const seletor = 'input, textarea, select, a, button:not(.btn-tema), h1, h2, .titulo, p, code, label';
      return [...document.querySelectorAll(seletor)].filter((n) => {
        if (!n.textContent.trim() && !n.matches('input, textarea, select')) return false;
        const r = n.getBoundingClientRect();
        return r.width && r.height && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top;
      }).map((n) => (n.id || n.className || n.tagName).toString().slice(0, 30));
    });
    if (cobre.length) erros.push(`${nome}: o botão de tema cobre [${cobre.join(', ')}] em scrollY=${y}`);
  }
  await pg.evaluate(() => window.scrollTo(0, 0));
}

module.exports = { TEMA, pastaCapturas, temaInicial, conferirBotaoTema };
