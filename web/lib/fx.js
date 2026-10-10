// Effets dessinés sur un calque au-dessus de la scène : le boulet et sa course, la fumée,
// les éclats. Tout est en aplats, comme les illustrations. Le calque ne tourne que le
// temps d'un effet.
const WHITE = '#fff';
const PALE = '#cfe0ff';
const RED = '#ff6352';
const NAVY = '#081547';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// La cloche d'un tir : le point de contrôle de la courbe entre le canon et sa cible.
// Le canon s'en sert aussi pour viser.
export function arc(from, to) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return { x: lerp(from.x, to.x, 0.55), y: Math.min(from.y, to.y) - (dist * 0.28 + 30), dist };
}

export function createFx(stage) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx';
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let parts = [];
  let jobs = []; // fonctions (dt) qui dessinent et rendent false une fois finies
  let frame = 0;
  let last = 0;
  let w = 0;
  let h = 0;

  function fit() {
    const r = stage.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(r.width * d) || canvas.height !== Math.round(r.height * d)) {
      canvas.width = Math.round(r.width * d);
      canvas.height = Math.round(r.height * d);
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    w = r.width;
    h = r.height;
  }
  // Les points arrivent en coordonnées de la fenêtre.
  const local = (p) => {
    const r = stage.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  };

  function star(x, y, r, points, turn) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = turn + (Math.PI * i) / points;
      const d = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fill();
  }

  function draw(p) {
    const k = p.age / p.life;
    const out = 1 - (1 - k) ** 3;
    const r = lerp(p.r0, p.r1, out);
    ctx.globalAlpha = p.alpha * (p.hold ? Math.min(1, (1 - k) * 3) : (1 - k) ** 1.4);
    ctx.fillStyle = ctx.strokeStyle = p.color;
    if (p.shape === 'ring') {
      ctx.lineWidth = p.hold ? p.width : Math.max(0.5, p.width * (1 - k));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.shape === 'star') {
      star(p.x, p.y, r, 8, p.rot);
    } else if (p.shape === 'streak') {
      ctx.lineWidth = p.r0 * (1 - k);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
    } else if (p.shape === 'chip') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.roundRect(-p.r0, -p.r0 * 0.7, p.r0 * 2, p.r0 * 1.4, p.r0 * 0.4);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step(p, dt) {
    if (p.delay > 0) {
      p.delay -= dt;
      return true;
    }
    p.age += dt;
    if (p.age >= p.life) return false;
    const drag = Math.exp(-(p.drag || 0) * dt);
    p.vx *= drag;
    p.vy = p.vy * drag + (p.g || 0) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += (p.spin || 0) * dt;
    return true;
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fit();
    ctx.clearRect(0, 0, w, h);
    parts = parts.filter((p) => step(p, dt));
    for (const p of parts) if (!(p.delay > 0)) draw(p);
    ctx.globalAlpha = 1;
    jobs = jobs.filter((job) => job(dt) !== false);
    ctx.globalAlpha = 1;
    frame = parts.length || jobs.length ? requestAnimationFrame(tick) : 0;
    if (!frame) ctx.clearRect(0, 0, w, h);
  }
  function run() {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }
  const add = (p) => parts.push({ age: 0, vx: 0, vy: 0, rot: rand(0, 6.3), alpha: 1, r1: p.r0, shape: 'dot', color: WHITE, ...p });

  // La bouche du canon : un éclair, des étincelles, et la fumée qui part dans l'axe du tir.
  function muzzle(p, dir, power) {
    const angle = Math.atan2(dir.y, dir.x);
    add({ ...p, shape: 'star', color: RED, r0: 12, r1: 44 + 22 * power, life: 0.16, hold: true });
    add({ ...p, shape: 'star', color: WHITE, r0: 8, r1: 26 + 14 * power, life: 0.13, hold: true });
    for (let i = 0; i < 12 + 8 * power; i++) {
      const a = angle + rand(-0.5, 0.5);
      const v = rand(90, 420) * (1 + 0.4 * power);
      add({ ...p, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3.4, g: -50, r0: rand(6, 10), r1: rand(22, 36), life: rand(0.6, 1.15), alpha: 0.55 });
    }
    for (let i = 0; i < 9; i++) {
      const a = angle + rand(-0.32, 0.32);
      const v = rand(520, 980);
      add({ ...p, shape: 'streak', color: pick([WHITE, RED]), vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 4, r0: rand(2.5, 4), life: rand(0.14, 0.26) });
    }
  }

  // L'impact : un éclair bref, deux ondes, des éclats qui retombent, un peu de fumée.
  function impact(p, power, size) {
    add({ ...p, r0: size * 1.2, r1: size * 3.6, life: 0.13, alpha: 0.95, hold: true });
    add({ ...p, shape: 'ring', width: 8, r0: size, r1: size * (5 + 5 * power), life: 0.42 });
    add({ ...p, shape: 'ring', color: RED, width: 5, r0: size * 0.6, r1: size * (3.4 + 3 * power), life: 0.5, delay: 0.05 });
    for (let i = 0; i < 16 + 16 * power; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(200, 520) * (1 + 0.6 * power);
      add({ ...p, shape: 'chip', color: pick([WHITE, PALE, PALE, RED]), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, g: 1250, drag: 1.1, spin: rand(-14, 14), r0: rand(3, 6.5), life: rand(0.5, 0.95), alpha: 1 });
    }
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(480, 900) * (1 + 0.4 * power);
      add({ ...p, shape: 'streak', vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 5, r0: rand(2.5, 4.5), life: rand(0.16, 0.28) });
    }
    for (let i = 0; i < 7; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(40, 120);
      add({ ...p, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4, g: -30, r0: rand(8, 12), r1: rand(26, 40), life: rand(0.7, 1.05), alpha: 0.4, delay: 0.04 });
    }
  }

  return {
    // Tire un boulet de `from` à `to` (points de la fenêtre). La promesse se résout à
    // l'impact. power : 0 à 1. fast : animations rapides.
    shot({ from, to, power = 0, fast = false }) {
      if (still) return Promise.resolve();
      const a = local(from);
      const b = local(to);
      const c = arc(a, b);
      const time = (fast ? 0.22 : 0.44) * clamp(c.dist / 480, 0.8, 1.3);
      const size = clamp(w * 0.022, 13, 22) * (1 + 0.3 * power);
      const dir = { x: c.x - a.x, y: c.y - a.y };
      const at = (k) => ({
        x: (1 - k) ** 2 * a.x + 2 * (1 - k) * k * c.x + k * k * b.x,
        y: (1 - k) ** 2 * a.y + 2 * (1 - k) * k * c.y + k * k * b.y,
      });
      muzzle(a, dir, power);
      const tail = [];
      let t = 0;
      let landed = 0;
      return new Promise((resolve) => {
        // Un onglet en arrière-plan suspend le calque : le tour ne doit pas rester bloqué.
        const guard = setTimeout(resolve, time * 1000 + 400);
        jobs.push((dt) => {
          t += dt;
          const k = Math.min(1, t / time);
          const p = at(k ** 1.12);
          if (!landed) {
            tail.unshift(p);
            tail.length = Math.min(tail.length, 7);
            add({ ...p, vx: rand(-20, 20), vy: rand(-20, 20), drag: 2, r0: size * 0.45, r1: size * 1.5, life: 0.4, alpha: 0.3 });
          }
          // La traînée, de plus en plus fine.
          ctx.lineCap = 'round';
          ctx.strokeStyle = WHITE;
          for (let i = 1; i < tail.length; i++) {
            ctx.globalAlpha = 0.55 * (1 - i / tail.length);
            ctx.lineWidth = size * 1.5 * (1 - i / tail.length);
            ctx.beginPath();
            ctx.moveTo(tail[i - 1].x, tail[i - 1].y);
            ctx.lineTo(tail[i].x, tail[i].y);
            ctx.stroke();
          }
          // Le boulet : rouge, un reflet, une ombre.
          ctx.globalAlpha = 1;
          ctx.fillStyle = RED;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = NAVY;
          ctx.beginPath();
          ctx.arc(p.x + size * 0.18, p.y + size * 0.2, size * 0.82, 0.1, Math.PI * 0.9);
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = WHITE;
          ctx.beginPath();
          ctx.arc(p.x - size * 0.32, p.y - size * 0.34, size * 0.28, 0, Math.PI * 2);
          ctx.fill();
          if (k < 1) return true;
          // Un instant d'arrêt sur la cible, puis tout éclate.
          landed += dt;
          if (landed < 0.045) return true;
          clearTimeout(guard);
          impact(b, power, size);
          resolve();
          return false;
        });
        run();
      });
    },
    // Une explosion sans boulet (dynamite, numéro tiré à la roue). scale grossit le tout.
    blast(point, power = 0, scale = 1) {
      if (still) return;
      fit();
      impact(local(point), power, clamp(w * 0.022, 13, 22) * scale);
      run();
    },
    // Une implosion : une onde se referme sur le point, puis l'air s'échappe en bulles
    // qui montent pendant que les débris coulent.
    implode(point, power = 0) {
      if (still) return;
      const p = local(point);
      const size = clamp(w * 0.022, 13, 22);
      add({ ...p, shape: 'ring', width: 6, r0: size * 7, r1: 2, life: 0.16, hold: true });
      add({ ...p, r0: size * 0.4, r1: size * 3.2, life: 0.14, alpha: 0.95, hold: true, delay: 0.14 });
      add({ ...p, shape: 'ring', width: 7, r0: size, r1: size * (7 + 4 * power), life: 0.5, delay: 0.14 });
      for (let i = 0; i < 26 + 14 * power; i++) {
        const r = rand(2.5, 8);
        add({ ...p, shape: 'ring', width: 3, hold: true, x: p.x + rand(-size, size), y: p.y + rand(-size * 0.6, size * 0.6), vx: rand(-70, 70), vy: rand(-60, 40), g: -rand(260, 520), drag: 1.2, r0: r, r1: r * 1.3, life: rand(0.9, 1.7), alpha: 0.9, delay: 0.16 + rand(0, 0.25) });
      }
      for (let i = 0; i < 12; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(120, 380);
        add({ ...p, shape: 'chip', color: pick([WHITE, PALE, PALE]), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 260, drag: 2.2, spin: rand(-9, 9), r0: rand(3, 6), life: rand(0.9, 1.5), alpha: 1, delay: 0.14 });
      }
      run();
    },
    // Une gerbe d'eau : un poisson pris, un scatter qui tombe, l'hameçon qui plonge.
    splash(point, power = 0) {
      if (still) return;
      const p = local(point);
      add({ ...p, shape: 'ring', width: 4, r0: 6, r1: 38 + 34 * power, life: 0.42 });
      for (let i = 0; i < 10 + 10 * power; i++) {
        const a = rand(-2.6, -0.55);
        const v = rand(170, 430) * (1 + 0.5 * power);
        const r = rand(2.5, 6);
        add({ ...p, color: pick([WHITE, WHITE, PALE]), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1150, drag: 0.6, r0: r, r1: r * 0.5, life: rand(0.5, 0.85), alpha: 0.95 });
      }
      run();
    },
    destroy() {
      cancelAnimationFrame(frame);
      canvas.remove();
    },
  };
}
