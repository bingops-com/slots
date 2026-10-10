'use client';

import Link from 'next/link';
import { GAMES, type Game } from '@/games/catalog';
import { App, useApp } from '@/lib/app';
import { BOARDS, useLeaderboard } from '@/lib/board';

// Les affiches : l'image d'ensemble d'une machine, le décor d'une table.
const COVER: Record<string, string> = { bjtable: 'blackjack' };
const cover = (g: Game) => `/art/home/${COVER[g.id] ?? g.id}.webp`;

function Poster({ game }: { game: Game }) {
  return (
    <Link className="poster" href={`/g/${game.id}/`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover(game)} alt="" loading="lazy" />
      <span>
        <b>{game.name}</b>
        <small>{game.blurb}</small>
      </span>
    </Link>
  );
}

function Shelf({ title, note, kind }: { title: string; note: string; kind: Game['kind'] }) {
  return (
    <section className="shelf">
      <h2>{title}</h2>
      <p>{note}</p>
      <div className="posters">{GAMES.filter((g) => g.kind === kind).map((g) => <Poster key={g.id} game={g} />)}</div>
    </section>
  );
}

// L'accueil : ce qu'est le lieu, ce qu'on y joue, et qui mène la saison.
export default function Landing() {
  const { account, ready } = useApp();
  const lb = useLeaderboard('score');
  const podium = lb ? lb.top.slice(0, 5) : [];
  return (
    <div className="landing">
      <section className="welcome">
        <div className="welcome-text">
          <h1>Le casino où rien ne se perd</h1>
          <p>
            Des machines à sous, des tables et des parties à plusieurs, pour le classement et rien d&apos;autre : les crédits sont fictifs, ils ne
            s&apos;achètent pas et ne se retirent pas.
          </p>
          <div className="welcome-actions">
            <Link className="btn welcome-primary" href="/g/beard/">Jouer tout de suite</Link>
            {ready && !account && <button className="btn welcome-quiet" onClick={() => App.openModal('register')}>Créer un compte</button>}
            {account && <Link className="btn welcome-quiet" href="/classement/">Voir la course</Link>}
          </div>
        </div>
      </section>

      <section className="steps" aria-label="Comment ça marche">
        <div><b>1</b><h3>Dix mille crédits pour tous</h3><p>Chaque joueur reçoit la même dotation, au début de la saison ou le jour où il arrive.</p></div>
        <div><b>2</b><h3>Ce que vous gagnez est votre score</h3><p>La dotation ne compte pas tant qu&apos;elle n&apos;est pas misée ; ce que vos mises rapportent, si.</p></div>
        <div><b>3</b><h3>Sans compte, on s&apos;entraîne</h3><p>Tous les jeux en solo se jouent aussi hors classement, sur votre appareil, même hors ligne.</p></div>
      </section>

      <Shelf title="Machines à sous" note="Trois machines, chacune avec son univers, ses tours gratuits et ses bonus." kind="slot" />
      <Shelf title="Jeux de table" note="En solo, contre la maison : une manche prend quelques secondes." kind="table" />
      <Shelf title="En ligne, à plusieurs" note="Une table commune, en classé : on s'y assoit avec un compte." kind="online" />

      <section className="lead">
        <div>
          <h2>{lb ? `En tête de la saison ${lb.season.id}` : 'La saison en cours'}</h2>
          <p>Le classement est une course : plus le score est haut, plus le bateau est loin.</p>
          <Link href="/classement/">Voir tout le classement</Link>
        </div>
        <ol>
          {podium.map((p) => (
            <li key={p.name} className={account?.name === p.name ? 'me' : undefined}>
              <span>{p.rank}</span>
              <b>{p.name}</b>
              <i>{BOARDS.score.score(p.score)}</i>
            </li>
          ))}
          {lb && podium.length === 0 && <li className="empty">Personne n&apos;a encore joué cette saison : la première manche classée ouvre la course.</li>}
          {lb === null && <li className="empty">Le classement n&apos;est pas disponible hors ligne.</li>}
        </ol>
      </section>
    </div>
  );
}
