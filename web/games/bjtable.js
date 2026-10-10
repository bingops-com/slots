import { $, $$ } from '../lib/dom.js';
import { App } from '../lib/app';
import { Sound } from '../lib/sound.js';
import { createFx } from '../lib/fx.js';

// La table de blackjack à plusieurs : cinq places, une donne commune, chacun joue sa main
// à son tour contre le même croupier. La table attend une première mise, laisse quelques
// secondes aux autres pour s'asseoir, puis distribue. Tout se passe sur le serveur ;
// l'écran redemande l'état de la table un peu plus d'une fois par seconde.
const pic = (name) => `<img class="pic" src="/art/tables/${name}.webp" alt="" draggable="false">`;
const LABEL = { win: 'gagné', lose: 'perdu', push: 'égalité', blackjack: 'blackjack' };
const secs = (ms) => Math.max(1, Math.ceil(ms / 1000));

const game = {
  mount(root) {
    if (App.state.practice) {
      root.innerHTML = `
        <div class="panel"><p>La table à plusieurs se joue en classé, avec un compte. À l'entraînement, le <a href="/g/blackjack/">blackjack en solo</a> reste ouvert.</p></div>
        <div class="stage bj-stage">
          <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/blackjack-stage.webp)"></i></div>
          <div class="croupier">${pic('dealer')}</div>
          <div class="winline">Créez un compte pour vous asseoir à la table</div>
        </div>`;
      return;
    }
    root.innerHTML = `
      <div class="panel">
        <div class="controls"></div>
        <button class="btn primary play">Miser</button>
        <div class="bj-actions">
          <button class="btn quiet" data-act="hit">Tirer</button>
          <button class="btn quiet" data-act="stand">Rester</button>
          <button class="btn quiet" data-act="double">Doubler</button>
        </div>
        <p class="hint">Cinq places. La donne part douze secondes après la première mise. Vingt secondes pour jouer, sinon la main reste. Blackjack payé 3 pour 2, le croupier reste à 17.</p>
      </div>
      <div class="stage bj-stage tb-stage">
        <div class="scene" aria-hidden="true"><i class="scenery" style="background-image:url(/art/tables/blackjack-stage.webp)"></i></div>
        <div class="croupier">${pic('dealer')}</div>
        <div class="bj-row"><h4>Croupier <b id="tb-dt"></b></h4><div class="cards" id="tb-dealer"></div></div>
        <div class="winline" id="tb-msg" role="status">Connexion à la table…</div>
        <div class="tb-seats" id="tb-seats"></div>
      </div>`;
    const bet = App.betControl();
    $('.controls', root).append(bet.el);
    const stage = $('.stage', root);
    const fx = createFx(stage);
    const croupier = $('.croupier', root);
    const play = $('.play', root);
    const msg = $('#tb-msg', root);
    let gone = false;
    let busy = false;
    // Ce qui était déjà sur le tapis au dessin précédent, pour ne distribuer que les
    // cartes nouvelles.
    let seen = { round: -1, phase: '', dealer: 0, hole: false, seats: {} };
    let myTurn = false;

    function draw(t) {
      if (t.round !== seen.round || (t.phase === 'betting' && seen.phase !== 'betting')) seen = { round: t.round, phase: '', dealer: 0, hole: false, seats: {} };
      let dealt = 0;
      const card = (c, fresh, flip) => {
        const cls = `pcard ${c && '♥♦'.includes(c.s) ? 'red' : ''} ${c ? '' : 'back'} ${fresh ? 'new' : ''} ${flip ? 'flip' : ''}`;
        const style = fresh ? ` style="animation-delay:${dealt++ * 90}ms"` : '';
        return c ? `<div class="${cls}"${style}><b>${c.r}</b><span>${c.s}</span></div>` : `<div class="${cls}"${style}></div>`;
      };
      $('#tb-dealer', root).innerHTML =
        t.dealer.map((c, i) => card(c, i >= seen.dealer + (seen.hole ? 1 : 0), seen.hole && !t.hole && i === seen.dealer)).join('') + (t.hole ? card(null, !seen.hole) : '');
      $('#tb-dt', root).textContent = t.dealer.length ? t.dealerTotal : '';
      const seats = t.seats
        .map((s) => `
          <div class="tb-seat ${s.you ? 'you' : ''} ${s.turn ? 'active' : ''} ${s.result || ''}">
            <div class="cards">${s.cards.map((c, j) => card(c, j >= (seen.seats[s.name] || 0))).join('')}</div>
            <div class="tb-name">${s.you ? 'Vous' : s.name.replace(/[<>&]/g, '')}</div>
            <div class="bj-total">${s.cards.length ? s.total : ''}${s.result ? `${s.cards.length ? ', ' : ''}${LABEL[s.result]}` : ''} <small>${App.fmt(s.bet)}</small></div>
          </div>`)
        .join('');
      const empty = Array.from({ length: t.free }, () => '<div class="tb-seat free"><div class="tb-name">Place libre</div></div>').join('');
      $('#tb-seats', root).innerHTML = seats + empty;
      if (dealt) {
        croupier.classList.remove('deal');
        void croupier.offsetWidth;
        croupier.classList.add('deal');
        for (let i = 0; i < Math.min(dealt, 6); i++) setTimeout(() => gone || Sound.play('card'), i * 90);
      }

      const you = t.seats.find((s) => s.you);
      const turn = t.seats.find((s) => s.turn);
      if (t.phase === 'waiting') msg.textContent = "En attente qu'un joueur mise";
      else if (t.phase === 'betting') msg.textContent = `Les mises ferment dans ${secs(t.remaining)} s${t.free ? `, ${t.free} place${t.free > 1 ? 's' : ''} libre${t.free > 1 ? 's' : ''}` : ''}`;
      else if (t.phase === 'playing') msg.textContent = turn && turn.you ? `À vous de jouer (${secs(t.remaining)} s)` : `Au tour de ${turn ? turn.name : '…'} (${secs(t.remaining)} s)`;
      else if (you) msg.innerHTML = you.payout > you.bet ? `Gagné ${App.coin(you.payout)}` : you.payout === you.bet ? 'Égalité, mise rendue' : 'Perdu';
      else msg.textContent = 'Donne terminée';

      // Ce qui vient de changer pour le joueur : son tour qui commence, sa donne qui finit.
      const mine = t.actions.length > 0;
      if (mine && !myTurn) Sound.play('arm');
      myTurn = mine;
      if (t.phase === 'done' && seen.phase !== 'done' && you) {
        Sound.play(you.result === 'blackjack' ? 'big' : you.payout > you.bet ? 'line' : you.payout === you.bet ? 'arm' : 'lose', 2);
        const node = $('.tb-seat.you', root);
        if (node && you.payout > you.bet) setTimeout(() => gone || fx.blast(node, you.result === 'blackjack' ? 0.8 : 0.3, 0.9), 300);
      }

      $$('[data-act]', root).forEach((b) => (b.disabled = busy || !t.actions.includes(b.dataset.act)));
      play.disabled = busy || !t.canBet;
      play.textContent = t.seated && t.phase !== 'done' ? 'Mise posée' : t.canBet ? 'Miser' : t.free ? 'Donne en cours' : 'Table complète';
      bet.lock(!t.canBet);
      seen = { round: t.round, phase: t.phase, dealer: t.dealer.length, hole: t.hole, seats: Object.fromEntries(t.seats.map((s) => [s.name, s.cards.length])) };
    }

    function take(res) {
      if (gone) return;
      draw(res.table);
      // Le portefeuille suit la table : mise débitée, gain payé.
      if (res.user && res.user.balance !== App.user.balance) App.setUser(res.user);
    }

    async function call(path, body) {
      if (busy) return;
      busy = true;
      try {
        take(await App.api(path, body));
      } catch (e) {
        App.toast(e.message);
      }
      busy = false;
    }

    play.onclick = () => call('/api/table/bet', { bet: bet.value });
    $$('[data-act]', root).forEach((b) => {
      b.disabled = true;
      b.onclick = () => call('/api/table/action', { action: b.dataset.act });
    });
    const poll = () => busy || document.hidden || App.api('/api/table').then(take).catch(() => (msg.textContent = 'Table injoignable, nouvel essai…'));
    poll();
    const timer = setInterval(poll, 800);
    return () => {
      gone = true;
      clearInterval(timer);
      fx.destroy();
    };
  },
};

export default game;
