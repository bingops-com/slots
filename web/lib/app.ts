// L'état de l'application et tout ce que les scènes de jeu lui demandent : le portefeuille,
// le mode (classé avec un compte, entraînement sinon), les appels au serveur, les préférences. Les composants
// React s'y abonnent avec useApp() ; les scènes, dessinées à la main, appellent App.
import { useSyncExternalStore } from 'react';
import { $, $$, el, sleep, store } from './dom.js';
import { ACTIONS, engine } from './engine';
import { Sound } from './sound.js';
import { setLanguage, type Lang } from './i18n';

export interface Wallet {
  name: string;
  practice?: boolean;
  balance: number;
  stake: number;
  loot: number;
  debt: number;
  banked: number;
  score: number;
  wagered: number;
  rounds: number;
  rebuys: number;
  best: { mult: number; game: string; payout: number } | null;
  canAdvance: boolean;
  limits: { min: number; max: number; start: number; advance: number };
  season?: { id: number; startedAt: number };
}

export interface Toast {
  id: number;
  msg: string;
  kind: 'error' | 'ok';
}

export interface State {
  ready: boolean; // les préférences et la session sont lues
  account: Wallet | null; // compte connecté, tel que le serveur le décrit
  user: Wallet | null; // portefeuille du mode en cours (compte ou entraînement)
  shown: number | null; // solde affiché pendant qu'une manche se joue
  practice: boolean;
  offline: boolean;
  turbo: boolean;
  sound: boolean;
  lang: Lang;
  modal: 'login' | 'register' | 'repay' | null;
  toasts: Toast[];
  epoch: number; // change quand la scène affichée doit repartir de zéro
}

let state: State = {
  ready: false, account: null, user: null, shown: null, practice: true,
  offline: false, turbo: false, sound: true, lang: 'fr', modal: null, toasts: [], epoch: 0,
};
const listeners = new Set<() => void>();
const SERVER_STATE = state;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  // Sans compte ou hors ligne, on s'entraîne.
  const practice = !state.account || state.offline;
  if (practice !== state.practice) state = { ...state, practice };
  listeners.forEach((fn) => fn());
}

export function useApp(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => SERVER_STATE,
  );
}

const fmt = (cents: number) => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Entraînement : le portefeuille reste dans le navigateur, le moteur aussi.
const Local = {
  async wallet(): Promise<string> {
    return store.get('practice') || (await engine()).newWallet();
  },
  async me() {
    const out = JSON.parse((await engine()).me(await Local.wallet()));
    return { user: { name: 'Entraînement', practice: true, ...out.user } as Wallet, active: out.active };
  },
  async call(key: string, body: unknown) {
    if (key === 'me') return Local.me();
    const out = JSON.parse((await engine()).play(await Local.wallet(), key, JSON.stringify(body ?? {})));
    if (out.error) throw new Error(out.error);
    store.set('practice', JSON.stringify(out.wallet));
    return { ...out.out, user: { name: 'Entraînement', practice: true, ...out.user } };
  },
};

let toastId = 0;

export const App = {
  get user() {
    return state.user!;
  },
  get turbo() {
    return state.turbo;
  },
  get state() {
    return state;
  },

  fmt,
  signed: (cents: number) => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${fmt(Math.abs(cents))}`,
  coin: (cents: number) => `<span class="coin">◈</span>${fmt(cents)}`,
  // Pause d'animation, raccourcie par « Animations rapides ».
  wait: (ms: number) => sleep(state.turbo ? ms * 0.35 : ms),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async api(path: string, body?: unknown): Promise<any> {
    const key = path.replace('/api/', '');
    if (state.practice && (key === 'me' || ACTIONS.has(key))) return Local.call(key, body);
    let res: Response;
    try {
      res = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      App.setOffline(true);
      throw new Error('Serveur injoignable');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && state.account && !path.includes('/login')) App.signedOut();
    if (!res.ok) throw new Error(data.error || 'Le serveur a refusé la demande');
    return data;
  },

  toast(msg: string, kind: Toast['kind'] = 'error') {
    const id = ++toastId;
    set({ toasts: [...state.toasts, { id, msg, kind }] });
    setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), 4500);
  },

  showBalance(cents: number) {
    set({ shown: cents });
  },

  // Reçoit le portefeuille renvoyé avec chaque résultat de manche.
  setUser(user: Wallet | null) {
    if (!user) return;
    if (user.practice) set({ user, shown: null });
    else set({ account: user, user: state.practice ? state.user : user, shown: null });
  },

  async sync() {
    if (state.practice) set({ user: (await Local.me()).user, shown: null });
    else set({ user: state.account, shown: null });
  },

  // Tout ce qui change le portefeuille affiché relance la scène en cours.
  async restart(patch: Partial<State> = {}) {
    set(patch);
    await App.sync().catch((e) => App.toast(e.message));
    set({ epoch: state.epoch + 1 });
  },

  setOffline(off: boolean) {
    if (state.offline === off) return;
    const wasPractice = state.practice;
    if (off && !wasPractice) App.toast('Hors ligne : vous passez en entraînement, rien ne compte pour le classement.');
    if (off) void App.restart({ offline: true });
    else void App.refresh({ offline: false });
  },

  // Relit la session auprès du serveur.
  async refresh(patch: Partial<State> = {}) {
    set(patch);
    let account: Wallet | null = null;
    if (!state.offline && store.get('signed') === '1') {
      const res = await fetch('/api/me').catch(() => null);
      if (!res) set({ offline: true });
      else if (res.ok) account = (await res.json()).user;
      else if (res.status === 401) store.del('signed');
    }
    await App.restart({ account });
  },

  async sign(mode: 'login' | 'register', name: string, password: string) {
    const wasPractice = state.practice;
    set({ practice: false });
    try {
      const res = await App.api(`/api/${mode}`, { name, password });
      store.set('signed', '1');
      await App.restart({ account: res.user, modal: null });
    } catch (e) {
      set({ practice: wasPractice });
      throw e;
    }
  },

  signedOut() {
    store.del('signed');
    void App.restart({ account: null });
  },

  signOut() {
    fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    App.signedOut();
  },

  async advance() {
    try {
      App.setUser((await App.api('/api/advance', {})).user);
      App.toast('1 000 crédits avancés. Ils sont retirés de votre score.', 'ok');
    } catch (e) {
      App.toast((e as Error).message);
    }
  },

  async repay(amount: number) {
    const response = await App.api('/api/repay', { amount });
    App.setUser(response.user);
    App.openModal(null);
    App.toast('Remboursement effectué. Votre score est à jour.', 'ok');
  },

  resetPractice() {
    store.del('practice');
    void App.restart();
  },

  openModal: (modal: State['modal']) => set({ modal }),

  setTurbo(turbo: boolean) {
    store.set('turbo', turbo ? '1' : '0');
    set({ turbo });
  },

  // Change la langue de l'interface ; la scène en cours repart pour prendre ses règles.
  setLang(lang: Lang) {
    store.set('lang', lang);
    setLanguage(lang);
    set({ lang, epoch: state.epoch + 1 });
  },

  toggleSound() {
    set({ sound: Sound.toggle() });
  },

  // Champ de mise commun à tous les jeux. Renvoie { el, value (centièmes), lock(bool) }.
  betControl(label = 'Mise') {
    const saved = Number(store.get('bet')) || 100;
    const node = el(`
      <div class="field">
        <label for="bet-input">${label}</label>
        <div class="bet">
          <span class="coin">◈</span>
          <input id="bet-input" type="number" min="0.10" step="0.10" inputmode="decimal" value="${(saved / 100).toFixed(2)}">
          <button type="button" data-f="0.5" aria-label="Diviser la mise par deux">½</button>
          <button type="button" data-f="2" aria-label="Doubler la mise">2×</button>
        </div>
      </div>`) as HTMLElement;
    const input = $('input', node) as HTMLInputElement;
    const read = () => Math.round((parseFloat(input.value) || 0) * 100);
    // cap : ½ et 2× ne dépassent jamais ce que le joueur peut encore miser.
    const write = (cents: number, cap = false) => {
      const { min } = App.user.limits;
      const max = cap ? Math.min(App.user.limits.max, App.user.balance) : App.user.limits.max;
      cents = Math.max(min, Math.min(max, Math.round(cents)));
      input.value = (cents / 100).toFixed(2);
      store.set('bet', String(cents));
    };
    input.onchange = () => write(read());
    ($$('button', node) as HTMLButtonElement[]).forEach((b) => (b.onclick = () => write(read() * Number(b.dataset.f), true)));
    return {
      el: node,
      get value() {
        write(read());
        return read();
      },
      lock(on: boolean) {
        ($$('input,button', node) as (HTMLInputElement | HTMLButtonElement)[]).forEach((x) => (x.disabled = on));
      },
    };
  },

  turboToggle() {
    const node = el(`<label class="toggle"><input type="checkbox" ${state.turbo ? 'checked' : ''}> Animations rapides</label>`) as HTMLElement;
    ($('input', node) as HTMLInputElement).onchange = (e) => App.setTurbo((e.target as HTMLInputElement).checked);
    return node;
  },

  // Raccourci clavier : Espace déclenche l'action principale du jeu affiché.
  onSpace(fn: () => void) {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || /INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY|A/.test((e.target as HTMLElement).tagName)) return;
      e.preventDefault();
      fn();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  },

  // Lit les préférences et la session, une fois, à l'ouverture.
  async start() {
    if (state.ready) return;
    const lang: Lang = store.get('lang') === 'en' || (!store.get('lang') && !navigator.language.toLowerCase().startsWith('fr')) ? 'en' : 'fr';
    setLanguage(lang);
    set({
      lang,
      turbo: store.get('turbo') === '1',
      offline: !navigator.onLine,
      sound: Sound.init(),
    });
    window.addEventListener('offline', () => App.setOffline(true));
    window.addEventListener('online', () => App.setOffline(false));
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
    await App.refresh();
    set({ ready: true });
  },
};
