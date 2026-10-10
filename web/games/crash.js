import { $, $$, el, sleep } from '../lib/dom.js';
import { App } from '../lib/app';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';

// Crash : le sous-marin plonge et le multiplicateur grimpe avec la profondeur. Il faut
// remonter avant que la coque ne cède sous la pression ; à quelle profondeur, personne ne
// le sait avant la fin. Le temps qui compte est celui du serveur : l'écran ne fait que le
// suivre.
const pic = (name, cls = 'pic') => `<img class="${cls}" src="/art/tables/${name}.webp" alt="" draggable="false">`;
// Dix mètres par seconde de plongée.
const depth = (m, rate) => `${Math.round((Math.log(Math.max(1, m)) / rate) * 10).toLocaleString('fr-FR')} m`;
const times = (m) => `×${m.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const game = {
  mount(root, active) {
    root.innerHTML = `
      <div class="panel">
        <div class="controls"></div>
        <div class="field">
          <label for="c-auto">Remonter tout seul à</label>
          <input id="c-auto" type="number" min="1.01" max="10000" step="0.01" inputmode="decimal" placeholder="jamais">
        </div>
        <button class="btn primary play">Plonger</button>
        <p class="hint">La barre d'espace fait plonger, puis remonter. Une fois sur deux, la coque cède avant ×2.</p>
      </div>
      <div class="stage crash-stage">
        <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/crash-stage.webp)"></i></div>
        <div class="history" id="c-history"></div>
        <div class="crash-view">
          <canvas class="crash-graph" aria-hidden="true"></canvas>
          <div class="crash-sub">${pic('submarine')}</div>
          <div class="crash-read" role="status"><b id="c-mult">×1,00</b><span id="c-depth">en surface</span></div>
        </div>
        <div class="winline" id="c-msg">Misez, plongez, remontez avant que la coque ne cède</div>
      </div>`;
    const bet = App.betControl();
    $('.controls', root).append(bet.el);
    const stage = $('.stage', root);
    const view = $('.crash-view', root);
    const canvas = $('.crash-graph', root);
    const ctx = canvas.getContext('2d');
    const boat = $('.crash-sub', root);
    const mult = $('#c-mult', root);
    const deep = $('#c-depth', root);
    const msg = $('#c-msg', root);
    const play = $('.play', root);
    const auto = $('#c-auto', root);
    const fx = createFx(stage);
    let gone = false;
    let run = null; // plongée en cours : { bet, rate, t0 }
    let asking = false;
    let frame = 0;
    let poller = 0;
    let notes = 0;

    const elapsed = () => (performance.now() - run.t0) / 1000;
    const current = () => Math.floor(Math.exp(run.rate * elapsed()) * 100) / 100;

    // La courbe : le temps en abscisse, le multiplicateur en ordonnée ; l'échelle s'étire
    // à mesure que la traversée dure. Rend la position de la pointe, pour y poser le voilier.
    function draw(t, m, rate, sunk) {
      const box = view.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(box.width * d)) {
        canvas.width = Math.round(box.width * d);
        canvas.height = Math.round(box.height * d);
      }
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const w = box.width;
      const h = box.height;
      const pad = 28;
      const tMax = Math.max(8, t * 1.15);
      const mMax = Math.max(2, m * 1.2);
      const x = (s) => pad + (s / tMax) * (w - pad * 2 - 40);
      // La surface est en haut : plus le multiplicateur monte, plus la courbe descend.
      const y = (v) => pad + ((v - 1) / (mMax - 1)) * (h - pad * 2 - 34);
      ctx.clearRect(0, 0, w, h);
      // Repères : quelques multiplicateurs ronds, comme des lignes de profondeur.
      ctx.font = '500 12px "Red Hat Text Variable", sans-serif';
      ctx.fillStyle = 'rgb(255 255 255 / 0.7)';
      ctx.strokeStyle = 'rgb(255 255 255 / 0.14)';
      ctx.lineWidth = 1;
      const step = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500].find((s) => (mMax - 1) / s <= 5) || 5000;
      for (let v = 1 + step; v < mMax; v += step) {
        ctx.beginPath();
        ctx.moveTo(pad, y(v));
        ctx.lineTo(w - pad, y(v));
        ctx.stroke();
        ctx.fillText(`×${v.toLocaleString('fr-FR')}`, pad, y(v) - 5);
      }
      ctx.beginPath();
      ctx.moveTo(x(0), y(1));
      const n = 60;
      for (let i = 1; i <= n; i++) {
        const s = (t * i) / n;
        ctx.lineTo(x(s), y(Math.min(m, Math.exp(rate * s))));
      }
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      ctx.setLineDash([2, 9]);
      ctx.strokeStyle = sunk ? 'rgb(255 255 255 / 0.4)' : 'rgb(255 255 255 / 0.85)';
      ctx.stroke();
      ctx.setLineDash([]);
      // La pente à la pointe fait piquer le sous-marin du nez.
      const slope = Math.atan2(y(m) - y(m * (1 - rate * 0.4)), x(t) - x(t - 0.4));
      return { x: x(t), y: y(m), tilt: Math.max(0, Math.min(38, (slope * 180) / Math.PI)) };
    }

    function place(tip) {
      boat.style.transform = `translate(${tip.x}px, ${tip.y}px) translate(-62%, -50%) rotate(${tip.tilt}deg)`;
    }

    function tick() {
      if (!run || gone) return;
      const m = current();
      mult.textContent = times(m);
      deep.textContent = depth(m, run.rate);
      place(draw(elapsed(), m, run.rate, false));
      play.innerHTML = `Remonter ${App.coin(Math.floor(run.bet * m))}`;
      // Un écho de sonar à chaque palier franchi, de plus en plus grave.
      const level = Math.floor(Math.log2(m) * 3);
      if (level > notes) {
        notes = level;
        Sound.play('sonar', level);
      }
      frame = requestAnimationFrame(tick);
    }

    function begin(g) {
      run = { bet: g.bet, rate: g.rate / 1, t0: performance.now() - g.elapsed };
      notes = 0;
      view.className = 'crash-view sailing';
      msg.innerHTML = g.auto ? `Remontée automatique à ${times(g.auto)}` : 'En plongée : remontez quand vous voulez';
      bet.lock(true);
      auto.disabled = true;
      play.disabled = false;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
      clearInterval(poller);
      // Le serveur dit si la coque a cédé ; on le lui demande quatre fois par seconde.
      poller = setInterval(() => ask('/api/crash/poll'), 250);
    }

    function finish(res) {
      const g = res.game;
      const t = run ? elapsed() : 0;
      const rate = run ? run.rate : g.rate;
      run = null;
      clearInterval(poller);
      cancelAnimationFrame(frame);
      const reached = g.crashed ? g.point : g.at;
      mult.textContent = times(reached);
      const tip = draw(Math.max(0.05, Math.min(t, Math.log(reached) / rate)), reached, rate, g.crashed);
      place(tip);
      const box = view.getBoundingClientRect();
      const point = { x: box.left + tip.x, y: box.top + tip.y };
      deep.textContent = depth(reached, rate);
      if (g.crashed) {
        // La coque cède : le sous-marin s'écrase sur lui-même, puis l'air remonte.
        view.className = 'crash-view sunk';
        msg.innerHTML = `La coque a cédé à ${times(g.point)}, par ${depth(g.point, rate)} de fond : mise perdue`;
        Sound.play('cannon', 0.7);
        setTimeout(() => gone || Sound.play('splash', 1), 180);
        fx.implode(point, 1);
        stage.style.setProperty('--kick', '10px');
        stage.classList.remove('shake');
        void stage.offsetWidth;
        stage.classList.add('shake');
      } else {
        view.className = 'crash-view safe';
        msg.innerHTML = `Remonté à ${times(g.at)} : ${App.coin(g.payout)}. La coque aurait cédé à ${times(g.point)}.`;
        Sound.play(g.at >= 10 ? 'big' : 'line', Math.min(6, Math.round(Math.log2(g.at) * 2)));
        fx.blast(point, Math.min(1, Math.log2(g.at) / 5), 1);
      }
      const chip = el(`<span class="${g.crashed ? 'lose' : 'win'}" title="${g.crashed ? 'Perdu' : 'Remonté'}">${times(g.point)}</span>`);
      $('#c-history', root).prepend(chip);
      $$('#c-history span', root).slice(10).forEach((x) => x.remove());
      bet.lock(false);
      auto.disabled = false;
      play.disabled = false;
      play.textContent = 'Plonger';
      App.setUser(res.user);
    }

    // Une seule demande à la fois : un encaissement ne croise jamais un sondage.
    async function ask(path, body = {}) {
      if (asking || gone) return;
      asking = true;
      try {
        const res = await App.api(path, body);
        if (gone) return;
        if (res.game && res.game.done) finish(res);
        else if (res.game && !run) begin(res.game);
      } catch (e) {
        if (path !== '/api/crash/poll') App.toast(e.message);
      }
      asking = false;
    }

    async function act() {
      if (run) {
        play.disabled = true;
        // Laisse finir un sondage en cours, puis remonte.
        for (let i = 0; i < 20 && asking; i++) await sleep(20);
        return ask('/api/crash/cashout');
      }
      const stake = bet.value;
      if (stake > App.user.balance) return App.toast('Il ne reste pas assez de crédits pour cette mise');
      const target = parseFloat(auto.value);
      if (auto.value && !(target >= 1.01 && target <= 10000)) return App.toast('Remontée automatique : entre 1,01 et 10 000');
      view.className = 'crash-view';
      App.showBalance(App.user.balance - stake);
      Sound.play('lever');
      await ask('/api/crash/start', auto.value ? { bet: stake, auto: target } : { bet: stake });
      if (!run && App.user) App.showBalance(App.user.balance);
    }

    play.onclick = act;
    const unbind = App.onSpace(act);
    draw(0, 1, 0.06, false);
    place({ x: 28, y: 28, tilt: 0 });
    // Une plongée laissée en cours (page fermée, onglet rechargé) reprend ou se règle.
    if (active && active.crash) ask('/api/crash/poll');
    return () => {
      gone = true;
      unbind();
      clearInterval(poller);
      cancelAnimationFrame(frame);
      fx.destroy();
    };
  },
};

export default game;
