import { $, $$, el, store } from './dom.js';
import { App } from './app';

// Chips and the gauge edit the next commitment; only the server debits it.
export function blackjackBets({ sides = true } = {}) {
  const minimum = App.user.limits.min;
  const maximum = App.user.limits.max;
  const values = { main: Math.max(minimum, Math.min(maximum, Number(store.get('table.bet')) || 100)), pairs: 0, trio: 0 };
  let selected = 'main';
  let locked = false;
  const names = { main: 'Mise principale', pairs: 'Perfect Pairs', trio: '21+3' };
  const keys = sides ? ['main', 'pairs', 'trio'] : ['main'];
  const node = el(`<div class="tb-bets">
    <div class="tb-wagers" role="group" aria-label="Mise à régler">${keys.map(key => `<button type="button" data-wager="${key}" aria-pressed="${key === selected}"><span>${names[key]}</span><b></b></button>`).join('')}</div>
    <div class="tb-chip-rack" role="group" aria-label="Valeur du jeton">${[100, 500, 2500, 10000, 50000].map(value => `<button type="button" class="tb-chip" data-chip="${value}" aria-label="${value / 100} crédits"><span>${value / 100}</span></button>`).join('')}</div>
    <div class="field"><label for="tb-bet-range">Montant sélectionné</label><input id="tb-bet-range" type="range" min="${minimum}" max="${maximum}" step="10"><div class="tb-amount-row"><input id="bet-input" type="number" inputmode="decimal" step="0.10" aria-label="Montant en crédits"><span>crédits</span><button type="button" class="btn quiet small" data-clear>Retirer</button></div></div>
    <p class="tb-bet-total"><span>Total par place</span><b></b></p>
  </div>`);
  const range = $('#tb-bet-range', node), amount = $('#bet-input', node);
  const total = () => values.main + values.pairs + values.trio;
  const cap = () => selected === 'main' ? maximum : values.main;
  const floor = () => selected === 'main' ? minimum : 0;
  const render = () => {
    range.min = floor(); range.max = cap(); range.value = values[selected];
    range.setAttribute('aria-valuetext', App.fmt(values[selected]));
    amount.min = floor() / 100; amount.max = cap() / 100; amount.value = (values[selected] / 100).toFixed(2);
    $$('[data-wager]', node).forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.wager === selected)); $('b', button).textContent = App.fmt(values[button.dataset.wager]); });
    $$('[data-chip]', node).forEach(button => { button.setAttribute('aria-pressed', String(Number(button.dataset.chip) === values[selected])); button.disabled = locked || Number(button.dataset.chip) > cap(); });
    $('[data-clear]', node).disabled = locked || selected === 'main' || values[selected] === 0;
    $('.tb-bet-total b', node).textContent = App.fmt(total());
  };
  const write = cents => {
    if (!Number.isFinite(cents)) return render();
    values[selected] = Math.max(floor(), Math.min(cap(), Math.round(cents / 10) * 10));
    if (selected === 'main') {
      values.pairs = Math.min(values.pairs, values.main); values.trio = Math.min(values.trio, values.main);
      store.set('table.bet', String(values.main));
    }
    render();
  };
  $$('[data-wager]', node).forEach(button => { button.onclick = () => { selected = button.dataset.wager; render(); }; });
  $$('[data-chip]', node).forEach(button => { button.onclick = () => write(Number(button.dataset.chip)); });
  range.oninput = () => write(Number(range.value));
  amount.onchange = () => write(Math.round(Number(amount.value) * 100));
  $('[data-clear]', node).onclick = () => write(0);
  render();
  return { el: node, get value() { return values.main; }, get sideBets() { return { pairs: values.pairs, trio: values.trio }; }, get total() { return total(); }, lock(on) { locked = on; $$('button,input', node).forEach(control => { control.disabled = on; }); render(); } };
}
