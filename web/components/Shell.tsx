'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { pic, GAMES } from '@/games/catalog';
import { App, useApp } from '@/lib/app';
import { store } from '@/lib/dom.js';
import Icon, { Tile } from './Icon';

// Une famille de jeux dans la navigation : son titre l'ouvre et la referme, et le choix
// est retenu d'une visite à l'autre.
function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => setOpen(store.get(`nav.${id}`) !== '0'), [id]);
  const toggle = () => {
    store.set(`nav.${id}`, open ? '0' : '1');
    setOpen(!open);
  };
  return (
    <section className="nav-group">
      <h2>
        <button type="button" aria-expanded={open} aria-controls={`nav-${id}`} onClick={toggle}>
          <span>{title}</span>
          <i className="chevron" aria-hidden="true" />
        </button>
      </h2>
      <div id={`nav-${id}`} hidden={!open}>{children}</div>
    </section>
  );
}

function Nav() {
  const here = usePathname();
  const link = (href: string, icon: string, label: string) => (
    <Link key={href} href={href} aria-current={here === href ? 'page' : undefined}>
      <Icon html={icon} />
      <span>{label}</span>
    </Link>
  );
  const of = (kind: string) => GAMES.filter((g) => g.kind === kind).map((g) => link(`/g/${g.id}/`, g.icon, g.name));
  return (
    <nav id="nav" aria-label="Jeux">
      {link('/', pic('nav/home'), 'Accueil')}
      {link('/classement/', pic('nav/trophy'), 'Classement')}
      <Group id="slot" title="Machines à sous">{of('slot')}</Group>
      <Group id="table" title="Jeux de table">{of('table')}</Group>
      <Group id="online" title="En ligne, à plusieurs">{of('online')}</Group>
    </nav>
  );
}

// Le chat du logo, assis : tête ronde à mèche, oreilles doublées de bleu pâle, sourcil
// décidé, cache-œil navy sur l'œil gauche, collier menthe à médaille. Il cligne de l'œil,
// remue une oreille et balance la queue.
function Mascot() {
  return (
    <svg className="mascot" viewBox="0 0 132 150" aria-hidden="true">
      <path className="mascot-tail" d="M92 138c22 2 30-14 24-30-3-8-11-9-14-3" />
      <path className="mascot-fur" d="M32 150c-5-30 6-58 30-58s35 28 30 58z" />
      <g className="mascot-ear-l">
        <path className="mascot-fur" d="M27 48 31 13c1-5 5-6 9-3l20 18z" />
        <path className="mascot-inner" d="M33 41 36 21l13 11z" />
      </g>
      <g className="mascot-ear">
        <path className="mascot-fur" d="M97 48 93 13c-1-5-5-6-9-3L64 28z" />
        <path className="mascot-inner" d="M91 41 88 21 75 32z" />
      </g>
      <path className="mascot-fur" d="M54 27c3-8 9-10 15-10-3 3-3 6-2 9 4-3 8-3 11-2-4 3-5 7-5 11z" />
      <path className="mascot-fur" d="M22 60l-9 5 9 3-6 7 12 1zM102 60l9 5-9 3 6 7-12 1z" />
      <ellipse className="mascot-fur" cx="62" cy="57" rx="38" ry="31" />
      <path className="mascot-brow" d="M38 46 55 50" />
      <g className="mascot-eye">
        <circle className="mascot-ink" cx="47" cy="59" r="7.5" />
        <circle className="mascot-glint" cx="49.5" cy="56" r="2.4" />
      </g>
      <path className="mascot-strap" d="M31 40 99 66" />
      <path className="mascot-ink" d="M66 50h23v8a11.5 11.5 0 0 1-23 0z" />
      <path className="mascot-ink" d="M58 65h8l-4 4z" />
      <path className="mascot-mouth" d="M54 71q4 5 8 0q4 5 8 0" />
      <path className="mascot-collar" d="M36 84q26 13 52 0v8q-26 13-52 0z" />
      <circle className="mascot-tag" cx="62" cy="97" r="6.5" />
    </svg>
  );
}

// Le solde, et le score quand la partie est classée. Sans compte ou hors ligne, on
// s'entraîne : le libellé du solde le dit.
function Readout({ className }: { className?: string }) {
  const s = useApp();
  const u = s.user;
  if (!u) return null;
  return (
    <div className={className ? `wallet ${className}` : 'wallet'}>
      <div className="wallet-main">
        <small>{s.practice ? 'Entraînement' : 'À miser'}</small>
        <b><span className="coin">◈</span><span>{App.fmt(s.shown ?? u.balance)}</span></b>
      </div>
      {!s.practice && (
        <div className="wallet-side">
          <small>Score</small>
          <b>{App.fmt(u.score)}</b>
        </div>
      )}
    </div>
  );
}

// Réglages et compte : dans la barre du haut sur un ordinateur, dans le menu sur téléphone.
function Tools() {
  const s = useApp();
  return (
    <>
      {s.offline && <button className="offline" onClick={() => App.refresh({ offline: false })}><Tile name="anchor" />Hors ligne, réessayer</button>}
      <button className="btn quiet small sound" aria-pressed={s.sound} onClick={() => App.toggleSound()}>
        <Tile name={s.sound ? 'bell' : 'bell-off'} />
        {s.sound ? 'Son activé' : 'Son coupé'}
      </button>
      <button className="btn quiet small" data-notranslate lang={s.lang === 'fr' ? 'en' : 'fr'} onClick={() => App.setLang(s.lang === 'fr' ? 'en' : 'fr')}>
        <Tile name="globe" />
        {s.lang === 'fr' ? 'English' : 'Français'}
      </button>
      <div className="account">
        {s.account ? (
          <>
            <span className="who"><Tile name="cap" />{s.account.name}</span>
            <button className="btn quiet small" onClick={() => App.signOut()}><Tile name="rowboat" />Se déconnecter</button>
          </>
        ) : (
          s.ready && (
            <>
              <button className="btn quiet small" onClick={() => App.openModal('login')}>Se connecter</button>
              <button className="btn primary small" onClick={() => App.openModal('register')}>Créer un compte</button>
            </>
          )
        )}
      </div>
    </>
  );
}

function AuthModal() {
  const { modal } = useApp();
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!modal) return;
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && App.openModal(null);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [modal]);
  if (!modal) return null;
  const register = modal === 'register';
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await App.sign(modal, String(f.get('name')), String(f.get('password')));
    } catch (err) {
      App.toast((err as Error).message);
    }
  };
  return (
    <div id="modal" className="modal" onClick={(e) => e.target === e.currentTarget && App.openModal(null)}>
      <form className="dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{register ? 'Créer un compte' : 'Se connecter'}</h2>
        <p>
          {register
            ? 'Vous recevez 10 000 crédits fictifs à jouer, comme chaque joueur de la saison. Aucun argent réel.'
            : 'Vos parties classées reprennent où vous les avez laissées.'}
        </p>
        <label>Pseudo<input ref={first} name="name" autoComplete="username" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_\-]+" /></label>
        <label>
          Mot de passe
          <input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : 1} maxLength={128} />
        </label>
        <button className="btn primary">{register ? 'Créer le compte' : 'Se connecter'}</button>
        <button type="button" className="btn quiet switch" onClick={() => App.openModal(register ? 'login' : 'register')}>
          {register ? "J'ai déjà un compte" : 'Créer un compte'}
        </button>
      </form>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { toasts, user, practice } = useApp();
  const here = usePathname();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    void App.start();
  }, []);
  // Le menu du téléphone se referme dès qu'on a choisi une page.
  useEffect(() => setMenu(false), [here]);
  return (
    <>
      <div id="app">
        <aside className="side">
          <Link className="lockup" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src="/brand/logo.webp" alt="" width={36} height={36} />
            <span>lab.bingo <span className="lockup-kind">slots</span></span>
          </Link>
          <Readout className="side-wallet" />
          <button className="burger" aria-label="Menu" aria-expanded={menu} aria-controls="menu" onClick={() => setMenu(!menu)}><i /></button>
          {/* Sur téléphone, le menu porte aussi le compte et les réglages. */}
          <div id="menu" className={menu ? 'menu open' : 'menu'}>
            <div className="menu-tools">
              <Tools />
              {user && !practice && <p className="menu-score">Score <b>{App.fmt(user.score)}</b></p>}
            </div>
            <Nav />
          </div>
          <Mascot />
        </aside>
        <div className="main">
          <header className="top">
            <Readout />
            <Tools />
          </header>
          <main id="view">{children}</main>
          <footer className="foot">Jeu entièrement fictif. Les crédits n&apos;ont aucune valeur : ils ne s&apos;achètent pas et ne se retirent pas.</footer>
        </div>
      </div>
      <AuthModal />
      <div id="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </>
  );
}
