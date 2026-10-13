import { $, $$, el, sleep, esc } from '../lib/dom.js';
import { App } from '../lib/app';
import { Art } from '../lib/art.js';
import { Reels, fly, countUp, stageBanner, bigWin, slotLayout, settled } from '../lib/slotkit.js';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';

const game = {
  mount(root) {
    root.innerHTML = `
      <div class="panel">
        <div class="controls"></div>
        <div class="field"><label>Gain potentiel</label><div class="readout" id="d-profit"></div></div>
        <button class="btn primary play">Lancer</button>
        <p class="hint">La barre d'espace lance aussi les dés.</p>
      </div>
      <div class="stage dice-stage">
        <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/dice-stage.webp)"></i></div>
        <div class="history" id="d-history"></div>
        <div class="dice-table"><img class="pic crab" src="/art/tables/crab.webp" alt="" draggable="false"><img class="pic dicepic" src="/art/tables/dice.webp" alt="" draggable="false"></div>
        <div class="dice-track">
          <div class="dice-result" id="d-result" hidden></div>
          <input type="range" min="2" max="98" step="1" value="50" id="d-range" aria-label="Seuil des dés">
          <div class="scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        </div>
        <div class="dice-stats">
          <div class="field"><label>Multiplicateur</label><div class="readout" id="d-mult"></div></div>
          <div class="field"><label id="d-modelabel"></label><button class="readout btn-like" id="d-mode"></button></div>
          <div class="field"><label>Chance de gain</label><div class="readout" id="d-chance"></div></div>
        </div>
      </div>`;
    const bet = App.betControl();
    $('.controls', root).append(bet.el);
    const range = $('#d-range', root);
    let over = true;
    let busy = false;
    const stage = $('.stage', root);
    const fx = createFx(stage);
    const crab = $('.crab', root);
    const dice = $('.dicepic', root);
    const replay = (node, cls) => {
      node.classList.remove(cls);
      void node.offsetWidth;
      node.classList.add(cls);
    };

    const refresh = () => {
      const target = Number(range.value);
      const chance = over ? 99.99 - target : target;
      const mult = Math.floor((99 / chance) * 10000) / 10000;
      $('#d-mult', root).textContent = `×${mult.toFixed(4)}`;
      $('#d-chance', root).textContent = `${chance.toFixed(2)} %`;
      $('#d-modelabel', root).textContent = over ? 'Au-dessus de' : 'En dessous de';
      $('#d-mode', root).textContent = `${target.toFixed(2)} ⇄`;
      $('#d-profit', root).innerHTML = App.coin(Math.floor(bet.value * mult) - bet.value);
      range.style.setProperty('--p', `${target}%`);
      range.classList.toggle('under', !over);
    };
    range.oninput = refresh;
    bet.el.addEventListener('change', refresh);
    bet.el.addEventListener('click', refresh);
    $('#d-mode', root).onclick = () => {
      over = !over;
      refresh();
    };
    refresh();

    async function roll() {
      if (busy) return;
      busy = true;
      $('.play', root).disabled = true;
      try {
        Sound.play('rattle');
        // Le crabe secoue son cornet, les dés roulent, puis le résultat tombe sur la règle.
        replay(crab, 'shake-cup');
        replay(dice, 'tumble');
        const res = await App.api('/api/dice', { bet: bet.value, target: Number(range.value), over });
        await App.wait(520);
        Sound.play(res.win ? 'win' : 'lose', Math.round(Math.log2(res.multiplier)));
        replay(crab, res.win ? 'cheer' : 'sulk');
        if (res.win) fx.blast(dice, Math.min(1, Math.log2(res.multiplier) / 6), 0.8);
        const marker = $('#d-result', root);
        marker.hidden = false;
        marker.textContent = `${res.roll.toFixed(2)} ${res.win ? 'gagné' : 'perdu'}`;
        marker.className = `dice-result ${res.win ? 'win' : 'lose'}`;
        marker.style.left = `${Math.min(93, Math.max(7, res.roll))}%`;
        const chip = el(`<span class="${res.win ? 'win' : 'lose'}" title="${res.win ? 'Gagné' : 'Perdu'}">${res.roll.toFixed(2)}</span>`);
        $('#d-history', root).prepend(chip);
        $$('#d-history span', root).slice(12).forEach((x) => x.remove());
        await App.wait(250);
        App.setUser(res.user);
      } catch (e) {
        App.toast(e.message);
      }
      busy = false;
      $('.play', root).disabled = false;
    }
    $('.play', root).onclick = roll;
    const unbind = App.onSpace(roll);
    return () => {
      unbind();
      fx.destroy();
    };
  },
};

export default game;
