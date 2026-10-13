import { $, $$, el, sleep, esc } from '../lib/dom.js';
import { App } from '../lib/app';
import { Art } from '../lib/art.js';
import { Reels, fly, countUp, stageBanner, bigWin, slotLayout, settled } from '../lib/slotkit.js';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';

const CLAM = '<img class="pic" src="/art/tables/clam.webp" alt="" draggable="false">';
const PEARL = '<img class="pic" src="/art/tables/pearl.webp" alt="" draggable="false">';
const MINE = '<img class="pic" src="/art/tables/mine.webp" alt="" draggable="false">';

const game = {
  mount(root, active) {
    root.innerHTML = `
      <div class="panel">
        <div class="controls"></div>
        <div class="field"><label for="m-count">Nombre de mines</label><select id="m-count">${Array.from({ length: 24 }, (_, i) => `<option ${i === 2 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
        <div class="field"><label>Multiplicateur, puis à la prochaine perle</label><div class="readout" id="m-mult">1,00 puis 1,12</div></div>
        <button class="btn primary play">Commencer</button>
      </div>
      <div class="stage mines-stage">
        <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/mines-stage.webp)"></i></div>
        <div class="winline" id="m-msg">Choisissez le nombre de mines, puis commencez</div>
        <div class="mines-grid">${Array.from({ length: 25 }, (_, i) => `<button class="tile" data-i="${i}" aria-label="Case ${i + 1}" disabled>${CLAM}</button>`).join('')}</div>
      </div>`;
    const bet = App.betControl();
    $('.controls', root).append(bet.el);
    const tiles = $$('.tile', root);
    const play = $('.play', root);
    let game = null;
    let busy = false;
    const stage = $('.stage', root);
    const fx = createFx(stage);
    let opened = new Set(); // cases déjà ouvertes à l'écran

    function draw(g) {
      const live = !g.done;
      game = live ? g : null;
      if (!g.revealed.length && !g.done) opened = new Set();
      tiles.forEach((t, i) => {
        const open = g.revealed.includes(i);
        const bomb = g.done && g.bombs.includes(i);
        // Un coquillage qui vient de s'ouvrir saute ; les autres ne bougent pas.
        const fresh = (open && !opened.has(i)) || g.hit === i;
        t.className = `tile ${open ? 'gem' : ''} ${bomb ? 'bomb' : ''} ${g.hit === i ? 'struck' : ''} ${g.done && !open && g.hit !== i ? 'dim' : ''} ${fresh ? 'fresh' : ''}`;
        t.innerHTML = open ? PEARL : bomb ? MINE : g.done ? PEARL : CLAM;
        t.disabled = !live || open;
        t.setAttribute('aria-label', open ? 'Perle' : bomb ? 'Mine' : `Case ${i + 1}`);
        if (fresh && open) fx.splash(t, 0.2);
      });
      opened = new Set(g.revealed);
      if (g.hit !== undefined && g.hit !== null) {
        fx.blast(tiles[g.hit], 0.9, 1.3);
        stage.style.setProperty('--kick', '10px');
        stage.classList.remove('shake');
        void stage.offsetWidth;
        stage.classList.add('shake');
      }
      bet.lock(live);
      $('#m-count', root).disabled = live;
      $('#m-mult', root).textContent = `×${g.multiplier.toFixed(2)} puis ×${g.next.toFixed(2)}`;
      if (live) {
        play.innerHTML = g.revealed.length ? `Encaisser ${App.coin(Math.floor(g.bet * g.multiplier))}` : 'Révélez une case';
        play.disabled = !g.revealed.length;
        $('#m-msg', root).innerHTML = `${g.mines} mine${g.mines > 1 ? 's' : ''} cachée${g.mines > 1 ? 's' : ''}`;
      } else {
        play.innerHTML = 'Commencer';
        play.disabled = false;
        $('#m-msg', root).innerHTML = g.payout ? `Encaissé ${App.coin(g.payout)} (×${g.multiplier.toFixed(2)})` : 'Mine touchée, mise perdue';
      }
    }

    async function call(path, body) {
      if (busy) return;
      busy = true;
      try {
        const res = await App.api(path, body);
        draw(res.game);
        const g = res.game;
        if (path.endsWith('/start')) Sound.play('lever');
        else if (g.hit !== undefined) Sound.play('cannon', 0.3);
        else {
          if (path.endsWith('/reveal')) Sound.play('plop', g.revealed.length - 1);
          if (g.done) setTimeout(() => Sound.play('line', 3), 150);
        }
        App.setUser(res.user);
      } catch (e) {
        App.toast(e.message);
      }
      busy = false;
    }

    tiles.forEach((t, i) => (t.onclick = () => game && call('/api/mines/reveal', { cell: i })));
    play.onclick = () => (game ? call('/api/mines/cashout', {}) : call('/api/mines/start', { bet: bet.value, mines: Number($('#m-count', root).value) }));
    if (active && active.mines) draw(active.mines);
    return () => fx.destroy();
  },
};

export default game;
