import { $, $$, el } from '../lib/dom.js';
import { App } from '../lib/app';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';

// Plinko : une perle tombe entre des rangées de plots, à gauche ou à droite à chaque plot,
// et finit dans une case qui porte un multiplicateur. Le tirage est fait par le moteur ;
// l'écran ne fait que montrer le chemin qu'il a rendu.
//
// Les mêmes tables que le moteur (internal/engine/plinko.go).
const TABLES = {
  8: { low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6], medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13], high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29] },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};
const HOP = 150; // millisecondes d'un plot au suivant
const MAX_BALLS = 12;
const SEND_INTERVAL = 240; // one request at a time, at most about four per second
const label = (m) => (m >= 100 ? m.toLocaleString('fr-FR') : m.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
// Une case se lit à sa teinte : sous la mise, à la mise, au-dessus, et les grosses.
const tier = (m) => (m < 1 ? 'pays-under' : m < 2 ? 'pays-even' : m < 10 ? 'pays-over' : 'pays-top');

const game = {
  mount(root) {
    root.innerHTML = `
      <div class="panel">
        <div class="controls"></div>
        <div class="field"><label for="p-risk">Risque</label><select id="p-risk"><option value="low">Faible</option><option value="medium" selected>Moyen</option><option value="high">Élevé</option></select></div>
        <div class="field"><label for="p-rows">Rangées</label><select id="p-rows"><option>8</option><option selected>12</option><option>16</option></select></div>
        <button class="btn primary play">Lâcher une perle</button>
        <p class="hint">Espace lâche une perle. Maintenez la touche pour un envoi continu ; relâchez pour arrêter. Les cases du milieu rendent moins que la mise, celles des bords beaucoup plus.</p>
        <p class="hint" id="p-sending" role="status" hidden>Envoi continu : relâchez Espace pour arrêter</p>
      </div>
      <div class="stage plinko-stage">
        <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/plinko-stage.webp)"></i></div>
        <div class="history" id="p-history"></div>
        <div class="plinko-board">
          <canvas class="plinko-pegs" aria-hidden="true"></canvas>
          <div class="plinko-buckets" id="p-buckets"></div>
        </div>
        <div class="winline" id="p-msg" role="status">Choisissez le risque et les rangées, puis lâchez une perle</div>
      </div>`;
    const bet = App.betControl();
    $('.controls', root).append(bet.el);
    const stage = $('.stage', root);
    const board = $('.plinko-board', root);
    const canvas = $('.plinko-pegs', root);
    const ctx = canvas.getContext('2d');
    const buckets = $('#p-buckets', root);
    const msg = $('#p-msg', root);
    const risk = $('#p-risk', root);
    const rowsSel = $('#p-rows', root);
    const fx = createFx(stage);
    let gone = false;
    let balls = []; // perles en vol : { path, t0, res, rows }
    let glow = new Map(); // plots touchés : "rangée-plot" -> instant
    let frame = 0;
    let shown = null; // solde affiché pendant que des perles tombent
    let last = null; // dernier portefeuille rendu par le moteur
    let lastTick = 0;
    let pending = false;
    let holding = false;
    let spaceOwned = false;
    let sendTimer = 0;

    const rows = () => Number(rowsSel.value);
    const table = () => TABLES[rows()][risk.value];

    function layout() {
      const box = canvas.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(box.width * d) || canvas.height !== Math.round(box.height * d)) {
        canvas.width = Math.round(box.width * d);
        canvas.height = Math.round(box.height * d);
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const n = rows();
      // La rangée i compte i + 3 plots ; les cases s'ouvrent entre ceux de la dernière.
      const dx = box.width / (n + 2);
      const top = dx * 0.9;
      const dy = (box.height - top - dx * 0.35) / n;
      return { w: box.width, h: box.height, n, dx, dy, top, peg: (i, j) => ({ x: box.width / 2 + (j - (i + 2) / 2) * dx, y: top + i * dy }) };
    }

    function drawBuckets() {
      const t = table();
      buckets.style.setProperty('--n', t.length);
      buckets.style.setProperty('--pad', `${100 / (rows() + 2)}%`);
      buckets.innerHTML = t.map((m) => `<b class="${tier(m)}">${label(m)}</b>`).join('');
    }

    // Où est une perle à l'instant t (en nombre de sauts depuis le lâcher) : elle tombe
    // sur le plot du milieu de la première rangée, puis saute de plot en plot.
    function position(L, ball, hops) {
      const i = Math.min(Math.floor(hops), ball.rows);
      const k = hops - i;
      let pos = 0;
      for (let r = 0; r < i - 1; r++) pos += ball.path[r];
      const at = (row, p) => (row < 0 ? { x: L.w / 2, y: L.top - L.dy * 1.2 } : row >= ball.rows ? { x: L.w / 2 + (p - ball.rows / 2) * L.dx, y: L.top + ball.rows * L.dy - L.dy * 0.25 } : L.peg(row, p + 1));
      const from = at(i - 1, pos);
      const to = at(i, i === 0 ? 0 : pos + ball.path[i - 1]);
      // Un saut : l'horizontale à vitesse constante, la verticale en cloche puis en chute.
      const lift = i === 0 ? 0 : L.dy * 0.42;
      return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k * k - lift * Math.sin(Math.PI * k) * (1 - k), row: i - 1, peg: pos + 1 };
    }

    function tick(now) {
      if (gone) return;
      const L = layout();
      ctx.clearRect(0, 0, L.w, L.h);
      const r = Math.max(2.5, Math.min(6, L.dx * 0.13));
      for (let i = 0; i < L.n; i++) {
        for (let j = 0; j < i + 3; j++) {
          const p = L.peg(i, j);
          const lit = Math.max(0, 1 - (now - (glow.get(`${i}-${j}`) || 0)) / 260);
          ctx.fillStyle = lit ? `rgb(138 242 191 / ${0.6 + 0.4 * lit})` : 'rgb(255 255 255 / 0.85)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * (1 + 0.7 * lit), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const R = Math.max(5, Math.min(11, L.dx * 0.26));
      balls = balls.filter((ball) => {
        const hops = (now - ball.t0) / HOP;
        if (hops >= ball.rows + 1) {
          land(ball, L);
          return false;
        }
        const p = position(L, ball, hops);
        // Le plot que la perle vient de quitter s'allume.
        if (p.row >= 0 && p.row !== ball.lit) {
          ball.lit = p.row;
          glow.set(`${p.row}-${p.peg}`, now);
          if (now - lastTick > 45) {
            lastTick = now;
            Sound.play('tick');
          }
        }
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y - R, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgb(138 242 191 / 0.9)';
        ctx.beginPath();
        ctx.arc(p.x - R * 0.3, p.y - R * 1.3, R * 0.32, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
      frame = balls.length || [...glow.values()].some((t) => now - t < 260) ? requestAnimationFrame(tick) : 0;
      if (!frame) settle();
    }
    const run = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    function land(ball) {
      const res = ball.res;
      const chip = buckets.children[res.bucket];
      if (chip) {
        chip.classList.remove('hit');
        void chip.offsetWidth;
        chip.classList.add('hit');
        if (res.multiplier >= 2) fx.splash(chip, Math.min(1, Math.log2(res.multiplier) / 6));
        if (res.multiplier >= 10) fx.blast(chip, Math.min(1, Math.log2(res.multiplier) / 9), 1);
      }
      Sound.play(res.multiplier >= 10 ? 'big' : res.multiplier >= 1 ? 'plop' : 'lose', Math.min(13, Math.round(Math.log2(1 + res.multiplier) * 3)));
      shown += res.payout;
      App.showBalance(shown);
      msg.innerHTML = `×${label(res.multiplier)} : ${res.payout > res.bet ? 'gagné' : res.payout === res.bet ? 'mise rendue' : 'rendu'} ${App.coin(res.payout)}`;
      const h = el(`<span class="${res.payout >= res.bet ? 'win' : 'lose'}">×${label(res.multiplier)}</span>`);
      $('#p-history', root).prepend(h);
      $$('#p-history span', root).slice(12).forEach((x) => x.remove());
    }

    // Plus rien ne tombe : le solde affiché redevient celui du portefeuille.
    function settle() {
      if (balls.length || pending || !last) return;
      shown = null;
      App.setUser(last);
      risk.disabled = rowsSel.disabled = false;
    }

    async function drop() {
      if (gone || pending || balls.length >= MAX_BALLS) return;
      if (document.hidden || document.querySelector('dialog[open]')) { stopSending(); return; }
      const stake = bet.value;
      const balance = shown ?? App.user.balance;
      if (stake > balance) { stopSending(); return App.toast('Il ne reste pas assez de crédits pour cette mise'); }
      pending = true;
      shown = balance - stake;
      App.showBalance(shown);
      // Le plateau ne change pas pendant qu'une perle tombe.
      risk.disabled = rowsSel.disabled = true;
      try {
        const res = await App.api('/api/plinko', { bet: stake, rows: rows(), risk: risk.value });
        if (gone) return;
        last = res.user;
        balls.push({ path: res.path, rows: res.rows, res, t0: performance.now(), lit: -1 });
        run();
      } catch (e) {
        if (gone) return;
        stopSending();
        App.toast(e.message);
        shown += stake;
        App.showBalance(shown);
        if (!balls.length) {
          shown = null;
          risk.disabled = rowsSel.disabled = false;
        }
      } finally {
        pending = false;
        if (!gone) settle();
      }
    }

    const redraw = () => {
      drawBuckets();
      run();
    };
    risk.onchange = rowsSel.onchange = redraw;
    $('.play', root).onclick = drop;
    const interactive = (target) => target instanceof Element && target.closest('input,select,textarea,a,summary,[contenteditable="true"],[role="textbox"],button:not(.play)');
    function stopSending() {
      holding = false;
      clearInterval(sendTimer);
      sendTimer = 0;
      $('#p-sending', root).hidden = true;
    }
    const keyDown = (event) => {
      if (event.code !== 'Space' || event.ctrlKey || event.altKey || event.metaKey || interactive(event.target) || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      spaceOwned = true;
      if (holding || event.repeat) return;
      holding = true;
      $('#p-sending', root).hidden = false;
      void drop();
      if (holding) sendTimer = setInterval(() => { if (holding) void drop(); }, SEND_INTERVAL);
    };
    const keyUp = (event) => { if (event.code === 'Space' && spaceOwned) { event.preventDefault(); spaceOwned = false; stopSending(); } };
    const visibility = () => { if (document.hidden) stopSending(); };
    const focus = (event) => { if (interactive(event.target)) stopSending(); };
    document.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', stopSending);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('focusin', focus);
    const resize = () => run();
    window.addEventListener('resize', resize);
    redraw();
    return () => {
      gone = true;
      stopSending();
      document.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', stopSending);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('focusin', focus);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frame);
      fx.destroy();
    };
  },
};

export default game;
