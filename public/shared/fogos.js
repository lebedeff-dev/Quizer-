// Fogos de artifício em canvas, JavaScript puro, sem som e sem biblioteca (Etapa 8k-2, visual reforçado na 8k-2b).
// - Explosões grandes (60 a 120 partículas), rastro curto que se apaga e brilho aditivo ('lighter').
// - Limite de partículas vivas (`max`) para não travar celulares simples.
// - Com `prefers-reduced-motion` (ou `reduzido: true`) não há partículas em movimento: só um brilho suave na cor do vencedor.
// - O canvas ganha data-atributos para teste e depuração: data-fogos ("ativo" ou "fim"), data-particulas (vivas agora),
//   data-pico (maior número de partículas vivas), data-modo ("fogos" ou "brilho") e data-explosoes.

const reduzidoNoSistema = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const sorteia = (a, b) => a + Math.random() * (b - a);

export function iniciarFogos(canvas, { duracaoMs = 6000, cores = ['#FFFFFF'], destaque = null, max = 220, reduzido = reduzidoNoSistema(), aoFim = null } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0;
  let H = 0;
  function medir() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  medir();
  window.addEventListener('resize', medir);

  const particulas = [];
  const t0 = performance.now();
  let proximaExplosao = t0 + 120;
  let ultimo = t0;
  let pico = 0;
  let explosoes = 0;
  let parado = false;
  let quadro = 0;
  canvas.dataset.fogos = 'ativo';
  canvas.dataset.modo = reduzido ? 'brilho' : 'fogos';
  canvas.dataset.pico = '0';
  canvas.dataset.particulas = '0';
  canvas.dataset.explosoes = '0';
  const escala = Math.max(0.8, Math.min(W, H) / 700);
  // a cor do vencedor aparece em metade das explosões; as demais saem das cores vivas dos grupos
  const corSorteada = () => (destaque && Math.random() < 0.5 ? destaque : cores[Math.floor(Math.random() * cores.length)]);

  function explodir() {
    const livres = max - particulas.length;
    if (livres < 30) return; // não dá para uma explosão decente: espera as partículas se apagarem
    const n = Math.min(livres, Math.round(sorteia(60, 120)));
    const x = sorteia(W * 0.12, W * 0.88);
    const y = sorteia(H * 0.1, H * 0.5);
    const cor = corSorteada();
    const alt = corSorteada();
    for (let i = 0; i < n; i += 1) {
      const ang = (Math.PI * 2 * i) / n + sorteia(-0.08, 0.08);
      const anel = i % 3 === 0 ? 1 : sorteia(0.45, 0.95); // alguns raios chegam mais longe: contorno da explosão
      const vel = sorteia(2.2, 6.2) * anel * escala;
      particulas.push({
        x, y, px: x, py: y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
        vida: 0, dura: sorteia(55, 100), cor: Math.random() < 0.78 ? cor : alt, r: sorteia(1.8, 3.4) * Math.max(0.9, escala * 0.9),
      });
    }
    explosoes += 1;
    canvas.dataset.explosoes = String(explosoes);
  }

  function terminar() {
    if (parado) return;
    parado = true;
    cancelAnimationFrame(quadro);
    window.removeEventListener('resize', medir);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    particulas.length = 0;
    canvas.dataset.fogos = 'fim';
    canvas.dataset.particulas = '0';
    aoFim?.();
  }

  function passo(agora) {
    if (parado) return;
    const dt = Math.min(48, agora - ultimo) / 16.7; // 1 = um quadro a 60 Hz
    ultimo = agora;
    const decorrido = agora - t0;
    if (decorrido >= duracaoMs) { terminar(); return; }

    if (reduzido) {
      // brilho suave: um clarão que sobe e desce devagar, sem partículas
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      const t = decorrido / duracaoMs;
      const alfa = Math.sin(Math.PI * Math.min(1, t)) * 0.38;
      const cor = destaque || cores[0];
      const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.7);
      g.addColorStop(0, cor);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = alfa;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      quadro = requestAnimationFrame(passo);
      return;
    }

    // rastro curto: em vez de limpar o quadro, apaga uma parte do que estava desenhado
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.5, 0.2 * dt)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter'; // brilho aditivo: as cores se somam onde as partículas se cruzam
    ctx.lineCap = 'round';

    if (agora >= proximaExplosao && decorrido < duracaoMs - 1500) {
      explodir();
      proximaExplosao = agora + sorteia(260, 520);
    }
    for (let i = particulas.length - 1; i >= 0; i -= 1) {
      const p = particulas[i];
      p.vida += dt;
      if (p.vida >= p.dura) { particulas.splice(i, 1); continue; }
      p.px = p.x;
      p.py = p.y;
      p.vx *= 0.983 ** dt;
      p.vy = p.vy * 0.983 ** dt + 0.05 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alfa = Math.max(0, 1 - (p.vida / p.dura) ** 1.6);
      ctx.globalAlpha = alfa;
      ctx.strokeStyle = p.cor;
      ctx.fillStyle = p.cor;
      ctx.lineWidth = p.r * 1.3;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.7 + 0.5 * alfa), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    pico = Math.max(pico, particulas.length);
    canvas.dataset.particulas = String(particulas.length);
    canvas.dataset.pico = String(pico);
    quadro = requestAnimationFrame(passo);
  }
  quadro = requestAnimationFrame(passo);
  return { parar: terminar };
}
