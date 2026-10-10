import { $, $$, el, sleep } from './dom.js';
import { App } from './app';

// Rouleaux partagés par les machines à sous : chaque rouleau est une bande qui défile
// réellement, ralentit et rebondit à l'arrêt.
// render(cell) -> HTML d'un symbole ; random() -> symbole aléatoire pour le défilement.
export class Reels {
  constructor(cols, rows, render, random) {
    Object.assign(this, { cols, rows, render, random });
    this.el = el(`<div class="reels" style="--cols:${cols};--rows:${rows}"></div>`);
    for (let c = 0; c < cols; c++) {
      const reel = el('<div class="reel"><div class="strip"></div></div>');
      for (let r = 0; r < rows; r++) reel.firstChild.append(this.make(this.random()));
      this.el.append(reel);
    }
  }

  make(data) {
    return el(`<div class="cell">${this.render(data)}</div>`);
  }

  reel(c) {
    return this.el.children[c];
  }

  strip(c) {
    return this.reel(c).firstChild;
  }

  cell(c, r) {
    return this.strip(c).children[r];
  }

  set(c, r, data, cls) {
    const x = this.cell(c, r);
    x.innerHTML = this.render(data);
    if (cls) this.flash([[c, r]], cls);
  }

  clear() {
    $$('.cell', this.el).forEach((x) => {
      x.className = 'cell';
      x.style.animationDelay = '';
    });
    $$('.reel', this.el).forEach((x) => (x.className = 'reel'));
  }

  // cells : [[col, ligne], ...]
  mark(cells, cls = 'win') {
    for (const [c, r] of cells) this.cell(c, r).classList.add(cls);
  }

  // Rejoue une animation ponctuelle sur des cases.
  flash(cells, cls) {
    for (const [c, r] of cells) {
      const x = this.cell(c, r);
      x.classList.remove(cls);
      void x.offsetWidth;
      x.classList.add(cls);
    }
  }

  cellHeight() {
    return this.reel(0).clientHeight / this.rows;
  }

  // Lance les rouleaux puis les arrête de gauche à droite sur grid[col][ligne].
  // hold[c] : le rouleau ne tourne pas. tease[c] : il tourne plus longtemps (suspense).
  // onStop(c) est appelé à l'arrêt de chaque rouleau, onTease(c) quand le suspense commence.
  async spin(grid, { hold = [], tease = [], onStop, onTease } = {}) {
    this.clear();
    const h = this.cellHeight();
    const speed = App.turbo ? 0.4 : 1;
    let delay = 0;
    const runs = [];
    for (let c = 0; c < this.cols; c++) {
      if (hold[c]) continue;
      const strip = this.strip(c);
      const filler = 8 + c * 3 + (tease[c] ? 14 : 0);
      const fresh = [];
      for (let r = 0; r < this.rows; r++) fresh.push(this.make(grid[c][r]));
      for (let i = 0; i < filler; i++) fresh.push(this.make(this.random()));
      strip.prepend(...fresh);
      const from = -(filler + this.rows) * h;
      strip.style.transform = `translateY(${from}px)`;
      delay += tease[c] ? 1100 : 190;
      const duration = (520 + delay) * speed;
      if (tease[c]) setTimeout(() => {
        this.reel(c).classList.add('tease');
        if (onTease) onTease(c);
      }, duration - 1100 * speed);
      this.reel(c).classList.add('spinning');
      const anim = strip.animate(
        [
          { transform: `translateY(${from}px)`, easing: 'cubic-bezier(.3,.1,.3,1)' },
          { transform: `translateY(${h * 0.14}px)`, offset: 0.9, easing: 'ease-out' },
          { transform: 'translateY(0)' },
        ],
        { duration }
      );
      setTimeout(() => this.reel(c).classList.remove('spinning'), duration * 0.8);
      runs.push(
        settled(anim, duration).then(() => {
          while (strip.children.length > this.rows) strip.lastChild.remove();
          strip.style.transform = '';
          this.reel(c).classList.remove('tease', 'spinning');
          if (onStop) onStop(c);
        })
      );
    }
    await Promise.all(runs);
    await App.wait(120);
  }

  // Décale un rouleau d'une case : vers le haut (dir = -1, la nouvelle case entre par le
  // bas) ou vers le bas (dir = 1, elle entre par le haut).
  async shift(c, dir, data) {
    const strip = this.strip(c);
    const h = this.cellHeight();
    const node = this.make(data);
    if (dir < 0) strip.append(node);
    else strip.prepend(node);
    const frames = dir < 0 ? [0, -h] : [-h, 0];
    const duration = App.turbo ? 220 : 520;
    await settled(strip.animate(frames.map((y) => ({ transform: `translateY(${y}px)` })), { duration, easing: 'cubic-bezier(.4,0,.2,1.2)' }), duration);
    (dir < 0 ? strip.firstChild : strip.lastChild).remove();
  }

  // Cascade : les cases gagnantes éclatent, puis chaque colonne se tasse. Les symboles
  // restés au-dessus d'un vide glissent vers le bas d'autant de cases qu'il s'en est
  // libéré sous eux, et les nouveaux entrent par le haut derrière eux. `wild` ([col, ligne]
  // dans la nouvelle grille) est signalé une fois tout le monde en place. onLand(col) est
  // appelé quand une colonne a fini de tomber.
  async cascade(cells, grid, wild, { onLand } = {}) {
    this.mark(cells, 'pop');
    for (const [c, r] of cells) burst(this.cell(c, r), { sparks: 6, reach: this.cellHeight() * 0.7, cls: 'small' });
    await App.wait(340);
    const h = this.cellHeight();
    const speed = App.turbo ? 0.5 : 1;
    const freed = Array.from({ length: this.cols }, () => new Set());
    for (const [c, r] of cells) freed[c].add(r);
    this.clear();
    const runs = [];
    for (let c = 0; c < this.cols; c++) {
      const fresh = freed[c].size;
      const kept = [];
      for (let r = 0; r < this.rows; r++) if (!freed[c].has(r)) kept.push(r);
      let longest = 0;
      for (let r = 0; r < this.rows; r++) {
        const x = this.cell(c, r);
        x.innerHTML = this.render(grid[c][r]);
        // Un nouveau symbole descend de toute la hauteur libérée ; un ancien, de sa
        // ligne d'avant à sa nouvelle ligne.
        const drop = r < fresh ? fresh : r - kept[r - fresh];
        if (!drop) continue;
        const duration = (230 + 95 * drop) * speed;
        const delay = c * 40 * speed;
        longest = Math.max(longest, duration + delay);
        const anim = x.animate(
          [
            { transform: `translateY(${-drop * h}px)`, easing: 'cubic-bezier(.5,0,.9,.6)' },
            { transform: 'translateY(0)', offset: 0.76, easing: 'ease-out' },
            { transform: `translateY(${-h * 0.07}px)`, offset: 0.88, easing: 'ease-in' },
            { transform: 'translateY(0)' },
          ],
          { duration, delay, fill: 'backwards' }
        );
        runs.push(settled(anim, duration + delay));
      }
      if (longest && onLand) setTimeout(() => onLand(c), longest * 0.76);
    }
    await Promise.all(runs);
    if (wild) {
      this.flash([wild], 'pulse');
      await App.wait(380);
    }
    await App.wait(60);
    this.clear();
  }
}

// Attend la fin d'une animation, sans jamais rester bloqué si le navigateur la suspend
// (onglet en arrière-plan) : passé sa durée, on continue et on la termine d'office.
export async function settled(anim, ms) {
  await Promise.race([anim.finished.catch(() => {}), sleep(ms + 60)]);
  anim.cancel();
}

// Centre d'un élément, ou le point { x, y } lui-même (coordonnées de la fenêtre).
export function centre(target) {
  if (!target.getBoundingClientRect) return target;
  const r = target.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Fait voler une pastille d'un élément ou d'un point à un autre (valeur de poisson, boulet
// de canon). trail : nombre de copies qui la suivent en s'effaçant.
export async function fly(from, to, html, cls = '', { trail = 0, lift = 30 } = {}) {
  const a = centre(from);
  const b = centre(to);
  const duration = App.turbo ? 200 : 460;
  const frames = [
    { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) scale(1)` },
    { transform: `translate(${(a.x + b.x) / 2}px, ${Math.min(a.y, b.y) - lift}px) translate(-50%, -50%) scale(1.25)`, offset: 0.5 },
    { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) scale(.8)` },
  ];
  const nodes = [];
  let lead;
  for (let i = 0; i <= trail; i++) {
    const node = el(`<div class="fly ${cls}${i ? ' ghost' : ''}">${i ? '' : html}</div>`);
    if (i) node.style.opacity = String(0.5 - (0.4 * i) / (trail + 1));
    document.body.append(node);
    const anim = node.animate(frames, { duration, delay: i * 28, easing: 'ease-in-out', fill: 'both' });
    lead ??= anim;
    nodes.push(node);
  }
  await settled(lead, duration);
  nodes.forEach((n) => n.remove());
}

// Éclats projetés autour d'un point : l'impact d'un boulet, un symbole qui éclate.
export function burst(point, { sparks = 12, reach = 90, cls = '' } = {}) {
  const { x, y } = centre(point);
  const node = el(`<div class="blast ${cls}" style="left:${x}px;top:${y}px"></div>`);
  for (let i = 0; i < sparks; i++) {
    const angle = (360 / sparks) * i + Math.random() * 20;
    node.append(el(`<i style="--a:${angle}deg;--d:${reach * (0.6 + Math.random() * 0.6)}px"></i>`));
  }
  document.body.append(node);
  setTimeout(() => node.remove(), 700);
}

// Fait défiler un montant (en centièmes) jusqu'à sa valeur.
export function countUp(node, to, ms = 900) {
  const from = Number(node.dataset.value) || 0;
  node.dataset.value = to;
  ms = App.turbo ? ms * 0.35 : ms;
  const t0 = performance.now();
  let done = false;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    if (done) return;
    node.textContent = App.fmt(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
    if (k < 1 && node.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return sleep(ms + 30).then(() => {
    done = true;
    node.textContent = App.fmt(to);
  });
}

// Bandeau plein écran sur la scène (déclenchement / fin de bonus).
export async function stageBanner(stage, html, ms = 1800) {
  const b = el(`<div class="banner" role="status"><div>${html}</div></div>`);
  stage.append(b);
  await App.wait(ms);
  b.remove();
}

// Un gain d'au moins vingt fois la mise est compté à l'écran.
export async function bigWin(stage, payout, bet) {
  const ratio = payout / bet;
  if (ratio < 20) return;
  const title = ratio >= 500 ? 'Gain colossal' : ratio >= 100 ? 'Gain énorme' : ratio >= 50 ? 'Très gros gain' : 'Gros gain';
  const b = el(`<div class="banner" role="status"><div>${title}<strong><span class="coin">◈</span><span></span></strong><small>${ratio.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} fois la mise</small></div></div>`);
  stage.append(b);
  await countUp($('strong span:last-child', b), payout, ratio >= 100 ? 2600 : 1600);
  await App.wait(1300);
  b.remove();
}

// Squelette commun : panneau de mise à gauche, scène à droite, règles en dessous.
export function slotLayout(root, { title, subtitle, rules }) {
  root.innerHTML = `
    <div class="panel">
      <div class="slot-controls"></div>
      <button class="btn primary play">Lancer</button>
      <p class="hint">La barre d'espace lance aussi un tour.</p>
      <div class="auto">
        <select aria-label="Nombre de tours automatiques"><option>10</option><option>25</option><option>50</option><option>100</option></select>
        <button class="btn quiet auto-btn" type="button">Tours automatiques</button>
      </div>
      <div class="slot-extra"></div>
      <div class="lastwin">Dernier gain <b>aucun</b></div>
    </div>
    <div class="stage slot-stage">
      <div class="slot-head"><h1>${title}</h1><p>${subtitle}</p></div>
      <div class="hud"></div>
      <div class="frame"></div>
      <div class="under"></div>
      <div class="tally idle"><small>Gain du tour</small><b><span class="coin">◈</span><span>0,00</span></b></div>
      <div class="winline">&nbsp;</div>
    </div>
    <details class="rules"><summary>Règles et table des gains</summary><div class="prose">${rules}</div></details>`;
  const bet = App.betControl();
  $('.slot-controls', root).append(bet.el, App.turboToggle());
  // Le gain du tour, en grand : il s'additionne à chaque ligne, cascade ou prise, et reste
  // affiché jusqu'au tour suivant, y compris avec les animations rapides.
  const tallyBox = $('.tally', root);
  const tallyValue = $('b span:last-child', tallyBox);
  let won = 0;
  const tally = {
    reset() {
      won = 0;
      tallyBox.classList.add('idle');
      tallyValue.dataset.value = 0;
      tallyValue.textContent = App.fmt(0);
    },
    set(cents) {
      if (cents <= 0) return;
      const grew = cents > won;
      won = cents;
      tallyBox.classList.remove('idle');
      if (grew) {
        tallyBox.classList.remove('bump');
        void tallyBox.offsetWidth;
        tallyBox.classList.add('bump');
      }
      return countUp(tallyValue, cents, 700);
    },
    add(cents) {
      return tally.set(won + cents);
    },
  };
  // Tours automatiques : spin() joue un tour et rend true s'il a bien eu lieu. La série
  // s'arrête au nombre choisi, au clic sur le bouton, ou dès qu'un tour ne peut pas se jouer
  // (plus assez de crédits, serveur injoignable).
  const autoBtn = $('.auto-btn', root);
  const autoCount = $('.auto select', root);
  let left = 0;
  const auto = {
    running: () => left > 0,
    stop() {
      left = 0;
      autoBtn.textContent = 'Tours automatiques';
      autoBtn.classList.remove('armed');
      autoCount.disabled = false;
    },
    bind(spin) {
      autoBtn.onclick = async () => {
        if (left > 0) return auto.stop();
        left = Number(autoCount.value);
        autoCount.disabled = true;
        autoBtn.classList.add('armed');
        while (left > 0) {
          autoBtn.textContent = `Arrêter (${left} restant${left > 1 ? 's' : ''})`;
          if (!(await spin())) break;
          if (left > 0) left--;
          if (left > 0) await App.wait(450);
        }
        auto.stop();
      };
    },
  };
  return {
    bet,
    tally,
    auto,
    controls: $('.slot-controls', root),
    extra: $('.slot-extra', root),
    play: $('.play', root),
    stage: $('.stage', root),
    hud: $('.hud', root),
    frame: $('.frame', root),
    under: $('.under', root),
    winline: $('.winline', root),
    lastwin: $('.lastwin b', root),
  };
}
