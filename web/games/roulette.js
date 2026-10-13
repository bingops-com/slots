import { $, $$, el, sleep, esc } from '../lib/dom.js';
import { App } from '../lib/app';
import { Art } from '../lib/art.js';
import { Reels, fly, countUp, stageBanner, bigWin, slotLayout, settled } from '../lib/slotkit.js';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const color = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
const CHIPS = [10, 100, 1000, 10000, 100000];

const game = {
  mount(root) {
    const cell = (type, value, label, cls = '') => `<button class="rb ${cls}" data-type="${type}" data-value="${value ?? ''}">${label}</button>`;
    let board = cell('straight', 0, '0', 'zero');
    for (let row = 3; row >= 1; row--) {
      for (let n = row; n <= 36; n += 3) board += cell('straight', n, n, color(n));
      board += cell('column', row, '2:1', 'out');
    }
    board += '<span></span>' + [1, 2, 3].map((d) => cell('dozen', d, `${d * 12 - 11} à ${d * 12}`, 'out w4')).join('') + '<span></span>';
    board +=
      '<span></span>' +
      cell('low', null, '1 à 18', 'out w2') + cell('even', null, 'Pair', 'out w2') + cell('red', null, 'Rouge', 'red w2') +
      cell('black', null, 'Noir', 'black w2') + cell('odd', null, 'Impair', 'out w2') + cell('high', null, '19 à 36', 'out w2') +
      '<span></span>';

    root.innerHTML = `
      <div class="panel">
        <div class="field"><label>Jeton</label><div class="chips">${CHIPS.map((c, i) => `<button data-chip="${c}" class="${i === 1 ? 'on' : ''}">${c >= 100000 ? '1k' : c / 100}</button>`).join('')}</div></div>
        <div class="field"><label>Mise totale</label><div class="readout" id="r-total"></div></div>
        <button class="btn primary play">Lancer la bille</button>
        <button class="btn quiet" id="r-clear">Retirer les jetons</button>
        <p class="hint">Un clic pose un jeton, un clic droit retire la mise de la case.</p>
      </div>
      <div class="stage roulette-stage">
        <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/roulette-stage.webp)"></i></div>
        <div class="history" id="r-history"></div>
        <div class="rwheel"><img class="pic rwheel-img" src="/art/tables/wheel.webp" alt="" draggable="false"><i class="orbit"><i></i></i><div class="ball" id="r-ball">?</div></div>
        <div class="winline" id="r-msg">Posez vos jetons sur le tapis</div>
        <div class="board-scroll" role="region" aria-label="Tapis de roulette" tabindex="0"><div class="board">${board}</div></div>
      </div>`;

    let chip = 100;
    let busy = false;
    const fx = createFx($('.stage', root));
    const wheel = $('.rwheel-img', root);
    const orbit = $('.orbit', root);
    let angle = 0; // où la roue s'est arrêtée la dernière fois
    const bets = new Map(); // "type:valeur" -> montant

    const refresh = () => {
      let total = 0;
      $$('.rb', root).forEach((b) => {
        const amount = bets.get(`${b.dataset.type}:${b.dataset.value}`) || 0;
        total += amount;
        let badge = $('i', b);
        if (!amount) return badge && badge.remove();
        if (!badge) b.append((badge = document.createElement('i')));
        badge.textContent = amount >= 100000 ? `${+(amount / 100000).toFixed(1)}k` : amount / 100;
      });
      $('#r-total', root).innerHTML = App.coin(total);
      return total;
    };
    refresh();

    $$('[data-chip]', root).forEach((b) => (b.onclick = () => {
      chip = Number(b.dataset.chip);
      $$('[data-chip]', root).forEach((x) => x.classList.toggle('on', x === b));
    }));
    $$('.rb', root).forEach((b) => {
      const key = `${b.dataset.type}:${b.dataset.value}`;
      b.onclick = () => !busy && (bets.set(key, (bets.get(key) || 0) + chip), refresh(), Sound.play('chip'));
      b.oncontextmenu = (e) => {
        e.preventDefault();
        if (!busy) bets.delete(key), refresh();
      };
    });
    $('#r-clear', root).onclick = () => !busy && (bets.clear(), refresh());

    async function spin() {
      if (busy) return;
      const total = refresh();
      if (!total) return App.toast('Posez au moins un jeton sur le tapis');
      if (total > App.user.balance) return App.toast('Il ne reste pas assez de crédits pour ces mises');
      busy = true;
      $('.play', root).disabled = true;
      $$('.rb.hit', root).forEach((x) => x.classList.remove('hit'));
      const ball = $('#r-ball', root);
      try {
        const payload = [...bets].map(([key, amount]) => {
          const [type, value] = key.split(':');
          return { type, value: value === '' ? undefined : Number(value), amount };
        });
        const pending = App.api('/api/roulette', { bets: payload });
        App.showBalance(App.user.balance - total);
        ball.className = 'ball rolling';
        const quiet = Sound.reels();
        // La roue part d'un côté, la bille de l'autre ; elles ralentissent ensemble.
        const turns = App.turbo ? 2 : 4;
        const stop = angle + 360 * turns + Math.random() * 360;
        const duration = App.turbo ? 900 : 2300;
        const easing = 'cubic-bezier(.12,.6,.2,1)';
        wheel.animate([{ transform: `rotate(${angle}deg)` }, { transform: `rotate(${stop}deg)` }], { duration, easing, fill: 'forwards' });
        orbit.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${-360 * (turns + 1)}deg)` }], { duration, easing, fill: 'forwards' });
        orbit.classList.add('on');
        angle = stop % 360;
        const timer = setInterval(() => {
          const n = Math.floor(Math.random() * 37);
          ball.textContent = n;
          ball.dataset.color = color(n);
        }, 70);
        let res;
        try {
          res = await pending;
          await sleep(duration - 150);
        } finally {
          clearInterval(timer);
          quiet();
        }
        Sound.play('stop', 2);
        Sound.play(res.payout ? 'win' : 'lose', Math.min(6, Math.round(Math.log2(1 + res.payout / total))));
        ball.textContent = res.number;
        ball.dataset.color = res.color;
        ball.className = 'ball landed';
        orbit.classList.remove('on');
        if (res.payout) fx.blast(ball, Math.min(1, Math.log2(1 + res.payout / total) / 5), 1.1);
        const hit = $(`.rb[data-type="straight"][data-value="${res.number}"]`, root);
        if (hit) hit.classList.add('hit');
        $('#r-history', root).prepend(el(`<span class="${res.color}">${res.number}</span>`));
        $$('#r-history span', root).slice(14).forEach((x) => x.remove());
        $('#r-msg', root).innerHTML = res.payout ? `Gagné ${App.coin(res.payout)}` : 'Aucune mise gagnante';
        App.setUser(res.user);
      } catch (e) {
        ball.className = 'ball';
        App.toast(e.message);
        if (App.user) App.showBalance(App.user.balance);
      }
      busy = false;
      $('.play', root).disabled = false;
    }
    $('.play', root).onclick = spin;
    const unbind = App.onSpace(spin);
    return () => {
      unbind();
      fx.destroy();
    };
  },
};

export default game;
