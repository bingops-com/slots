import { $, $$, el, sleep, esc } from '../lib/dom.js';
import { App } from '../lib/app';
import { Art } from '../lib/art.js';
import { Reels, fly, countUp, stageBanner, bigWin, slotLayout, settled } from '../lib/slotkit.js';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';
import { blackjackBets } from '../lib/blackjack-bets';

const game = {
  mount(root, active) {
    root.innerHTML = `
      <div class="panel">
        <div class="controls"></div>
        <div class="bj-actions">
          <button class="btn quiet" data-act="hit">Tirer</button>
          <button class="btn quiet" data-act="stand">Rester</button>
          <button class="btn quiet" data-act="double">Doubler</button>
          <button class="btn quiet" data-act="split">Séparer</button>
        </div>
        <button class="btn primary play">Distribuer</button>
      </div>
      <div class="stage bj-stage">
        <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/blackjack-stage.webp)"></i></div>
        <div class="croupier"><img class="pic" src="/art/tables/dealer.webp" alt="" draggable="false"></div>
        <div class="bj-row"><h4>Croupier <b id="bj-dt"></b></h4><div class="cards" id="bj-dealer"></div></div>
        <div class="winline" id="bj-msg">Blackjack payé 3 pour 2, le croupier reste à 17</div>
        <div class="bj-row"><div class="bj-hands" id="bj-hands"></div><h4>Vous</h4></div>
      </div>`;
    const bet = blackjackBets({ sides: false });
    $('.controls', root).append(bet.el);
    let busy = false;
    let playing = false;

    const stage = $('.stage', root);
    const fx = createFx(stage);
    const croupier = $('.croupier', root);
    const replay = (node, cls) => {
      node.classList.remove(cls);
      void node.offsetWidth;
      node.classList.add(cls);
    };
    // Seules les cartes qui viennent d'arriver sont distribuées ; celles déjà posées ne
    // bougent pas. seen : combien de cartes chaque main montrait au dessin précédent.
    let seen = { dealer: 0, hole: false, hands: [] };
    let dealt = 0;
    const card = (c, fresh, flip) => {
      const cls = `pcard ${c && '♥♦'.includes(c.s) ? 'red' : ''} ${c ? '' : 'back'} ${fresh ? 'new' : ''} ${flip ? 'flip' : ''}`;
      const style = fresh ? ` style="--d:${dealt++ * 110}ms"` : '';
      return c ? `<div class="${cls}"${style}><b>${c.r}</b><span>${c.s}</span></div>` : `<div class="${cls}"${style}></div>`;
    };
    const LABEL = { win: 'Gagné', lose: 'Perdu', push: 'Égalité', blackjack: 'Blackjack !' };

    function draw(g) {
      playing = g.phase === 'player';
      dealt = 0;
      // Une donne repart de zéro ; sinon on compare à ce qui était déjà sur le tapis.
      if (g.hands.length < seen.hands.length || g.hands[0].cards.length < (seen.hands[0] || 0)) seen = { dealer: 0, hole: false, hands: [] };
      // La carte cachée du croupier se retourne au lieu d'être redistribuée.
      $('#bj-dealer', root).innerHTML =
        g.dealer.map((c, i) => card(c, i >= seen.dealer + (seen.hole ? 1 : 0), seen.hole && !g.hole && i === seen.dealer)).join('') + (g.hole ? card(null, !seen.hole) : '');
      $('#bj-dt', root).textContent = g.dealerTotal;
      $('#bj-hands', root).innerHTML = g.hands
        .map((h, i) => `
          <div class="bj-hand ${playing && i === g.active ? 'active' : ''} ${h.result || ''}">
            <div class="cards">${h.cards.map((c, j) => card(c, j >= (seen.hands[i] || 0))).join('')}</div>
            <div class="bj-total">${h.total}${h.result ? `, ${LABEL[h.result].toLowerCase()}` : ''} <small>${App.fmt(h.bet)}</small></div>
          </div>`)
        .join('');
      if (dealt) replay(croupier, 'deal');
      seen = { dealer: g.dealer.length, hole: g.hole, hands: g.hands.map((h) => h.cards.length) };
      $$('[data-act]', root).forEach((b) => (b.disabled = !g.actions.includes(b.dataset.act)));
      $('.play', root).disabled = playing;
      bet.lock(playing);
      if (g.phase === 'done') {
        const staked = g.hands.reduce((n, h) => n + h.bet, 0);
        $('#bj-msg', root).innerHTML = g.payout > staked ? `Gagné ${App.coin(g.payout)}` : g.payout === staked ? 'Égalité, mise rendue' : g.payout ? `Récupéré ${App.coin(g.payout)}` : 'Perdu';
      } else {
        $('#bj-msg', root).innerHTML = 'À vous de jouer';
      }
    }

    async function call(path, body) {
      if (busy) return;
      busy = true;
      try {
        const res = await App.api(path, body);
        draw(res.game);
        // Deux cartes de chaque côté à la donne, une seule ensuite.
        const cards = path.endsWith('/start') ? 4 : body.action === 'stand' ? 0 : 1;
        for (let i = 0; i < cards; i++) setTimeout(() => Sound.play('card'), i * 90);
        if (res.game.phase === 'done') {
          for (const node of $$('.bj-hand.win, .bj-hand.blackjack', root)) setTimeout(() => fx.blast(node, node.classList.contains('blackjack') ? 0.8 : 0.3, 0.9), cards * 90 + 200);
          const bet = res.game.hands.reduce((n, h) => n + h.bet, 0);
          const natural = res.game.hands.some((h) => h.result === 'blackjack');
          setTimeout(() => Sound.play(natural ? 'big' : res.game.payout > bet ? 'line' : res.game.payout === bet ? 'arm' : 'lose', 2), cards * 90 + 150);
        }
        App.setUser(res.user);
      } catch (e) {
        App.toast(e.message);
      }
      busy = false;
    }

    $$('[data-act]', root).forEach((b) => {
      b.disabled = true;
      b.onclick = () => call('/api/blackjack/action', { action: b.dataset.act });
    });
    const deal = () => !playing && call('/api/blackjack/start', { bet: bet.value });
    $('.play', root).onclick = deal;
    if (active && active.blackjack) draw(active.blackjack);
    const unbind = App.onSpace(deal);
    return () => {
      unbind();
      fx.destroy();
    };
  },
};

export default game;
