'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PERGUNTAS_EXEMPLO = [1, 2, 3, 4, 5].map((n) => ({
  id: n,
  tipo: 'facil',
  enunciado: `[EXEMPLO, substitua] Pergunta de exemplo ${n}`,
  alternativas: ['Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D'],
  correta: 0,
  explicacao: '[EXEMPLO, substitua] Explicação de exemplo.',
  reserva: false,
}));

const FINAL_PADRAO = {
  disciplina: 'Profissão: Competências e Habilidades',
  professor: 'Prof. Dr. Itacir João Piasson',
  mensagem: 'Obrigado a todos que participaram!',
  // Pop-up de comemoração nos celulares (Etapa 8k-2). Até 300 caracteres.
  parabens: 'Parabéns a todos os grupos! Combater a misoginia na área da saúde começa por ouvir, acreditar nas queixas e oferecer o mesmo cuidado a todas as pessoas. Levem o que aprenderam para a prática de vocês.',
  integrantes: [
    'João Henrique Vogado Lima',
    'Juliana Mel Soares Mutran',
    'Kawany Beatriz Araújo Sousa',
    'Luís Guilherme Lebedeff Rocha Mota',
    'Mariana Cardoso Lima',
    'Ryan Gabriel Araújo Almeida',
  ],
};

// Leitura e gravação de JSON em uma pasta. A gravação é atômica (arquivo temporário + rename),
// para que uma queda de energia não deixe um arquivo pela metade.
function criarStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const caminho = (nome) => path.join(dir, nome);

  function ler(nome, padrao = null) {
    try {
      return JSON.parse(fs.readFileSync(caminho(nome), 'utf8'));
    } catch {
      return padrao;
    }
  }

  function gravar(nome, obj) {
    const destino = caminho(nome);
    const tmp = `${destino}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, destino);
  }

  // Se o arquivo existe (mesmo vazio), vale o que está nele. Só semeia exemplos quando não existe.
  function lerPerguntas() {
    const dados = ler('perguntas.json');
    if (dados && Array.isArray(dados.perguntas)) return dados.perguntas;
    gravar('perguntas.json', { perguntas: PERGUNTAS_EXEMPLO });
    return PERGUNTAS_EXEMPLO;
  }

  // Grava as perguntas. Antes de sobrescrever, guarda uma cópia datada da versão anterior em
  // backup/ (no máximo a cada 30 s, ou sempre que `forcarBackup`), mantendo só as 10 últimas.
  let ultimoBackup = 0;
  function salvarPerguntas(lista, { forcarBackup = false } = {}) {
    const anterior = ler('perguntas.json');
    const agora = Date.now();
    if (anterior && (forcarBackup || agora - ultimoBackup > 30000)) {
      fs.mkdirSync(caminho('backup'), { recursive: true });
      const d = new Date(agora);
      const p2 = (n) => String(n).padStart(2, '0');
      const nome = `perguntas-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}.json`;
      gravar(`backup/${nome}`, anterior);
      ultimoBackup = agora;
      const todos = fs.readdirSync(caminho('backup')).filter((n) => n.startsWith('perguntas-')).sort();
      for (const velho of todos.slice(0, Math.max(0, todos.length - 10))) fs.unlinkSync(caminho(`backup/${velho}`));
    }
    gravar('perguntas.json', { perguntas: lista });
    return agora;
  }

  function dataArquivo(nome) {
    try { return fs.statSync(caminho(nome)).mtimeMs; } catch { return null; }
  }

  function lerConfig() {
    const c = ler('config.json', {});
    return { jogo: c.jogo || {}, final: { ...FINAL_PADRAO, ...(c.final || {}) } };
  }

  return { dir, ler, gravar, lerPerguntas, salvarPerguntas, dataArquivo, lerConfig };
}

module.exports = { criarStore, PERGUNTAS_EXEMPLO, FINAL_PADRAO };
