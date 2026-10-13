'use client';

import { useEffect, useState } from 'react';
import { byId } from '@/games/catalog';
import { App, useApp } from '@/lib/app';
import { Art } from '@/lib/art.js';
import { BOARDS, useLeaderboard, type Board, type Leaderboard, type Ranked } from '@/lib/board';
import Icon from './Icon';

const LANES = 6;

interface FeedEntry {
  name: string;
  game: string;
  payout: number;
  mult: number;
  t: number;
}

function GameTag({ id }: { id?: string }) {
  const game = id && byId(id);
  return game ? <span className="tag"><Icon html={game.icon} />{game.name}</span> : null;
}

// La course : un bateau par joueur, d'autant plus loin de la ligne de départ que son score
// est haut. Au premier affichage, les bateaux quittent la ligne pour rejoindre leur place.
function Course({ lb, board, me }: { lb: Leaderboard; board: Board; me?: string }) {
  const [sailed, setSailed] = useState(false);
  const [sailing, setSailing] = useState(true);
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setSailed(true)));
    const timer = setTimeout(() => setSailing(false), 1600);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  const boats = lb.top.slice(0, LANES);
  if (lb.you && lb.you.rank > LANES) boats.push(lb.you);
  if (!boats.length) {
    return (
      <div className="course" id="course">
        <p className="course-empty">Personne n&apos;a encore joué cette saison. La première manche classée ouvre le classement.</p>
      </div>
    );
  }
  const lo = Math.min(0, ...boats.map((b) => b.score));
  const hi = Math.max(lo + 1, ...boats.map((b) => b.score));
  const x = (score: number) => 6 + (88 * (score - lo)) / (hi - lo);
  return (
    <div className={`course${sailing ? ' sailing' : ''}`} id="course">
      <div className="start" style={{ left: `${x(0)}%` }}><span>Départ</span></div>
      {boats.map((b) => (
        <div key={b.name} className={`lane${b.name === me ? ' me' : ''}`}>
          <div className={`boat${x(b.score) > 55 ? ' flip' : ''}`} style={{ left: `${sailed ? x(b.score) : x(0)}%` }}>
            <Icon html={Art.boat} />
            <span><b>{b.rank}. {b.name}</b> {BOARDS[board].score(b.score)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function standing(lb: Leaderboard, board: Board, signedIn: boolean) {
  if (lb.you) return `Vous êtes ${lb.you.rank}${lb.you.rank === 1 ? 'er' : 'e'} sur ${lb.players}, avec ${BOARDS[board].score(lb.you.score)}.`;
  if (signedIn) return 'Vous entrez au classement dès votre première manche classée.';
  if (!lb.players) return 'Créez un compte pour ouvrir la course, ou entraînez-vous sans enjeu.';
  return `${lb.players} joueur${lb.players > 1 ? 's' : ''} en course. Créez un compte pour ${lb.players > 1 ? 'les' : 'le'} rejoindre, ou entraînez-vous sans enjeu.`;
}

export default function Board() {
  const { account, ready } = useApp();
  const [board, setBoard] = useState<Board>('score');
  const lb = useLeaderboard(board);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const rounds = account?.rounds;
  useEffect(() => {
    if (!ready) return;
    let gone = false;
    const load = () =>
      fetch('/api/feed')
        .then((r) => (r.ok ? r.json() : { feed: [] }))
        .catch(() => ({ feed: [] }))
        .then((data) => gone || setFeed(data.feed));
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [ready, rounds]);

  const def = BOARDS[board];
  const mine = (p: Ranked) => p.name === account?.name;
  const row = (p: Ranked) => (
    <tr key={p.name} className={mine(p) ? 'me' : undefined}>
      <td>{p.rank}</td>
      <td>{p.name}{mine(p) && <> <span className="you">vous</span></>} <GameTag id={p.game} /></td>
      <td>{p.rounds.toLocaleString('fr-FR')}</td>
      <td>{App.fmt(p.stake)}</td>
      <td>{def.score(p.score)}</td>
    </tr>
  );
  return (
    <>
      <section className="sea">
        <h1 id="lb-title">{lb ? `Classement de la saison ${lb.season.id}` : 'Classement'}</h1>
        <p id="lb-you">
          {lb ? standing(lb, board, !!account) : lb === null ? "Le classement n'est pas disponible hors ligne. L'entraînement, lui, fonctionne : choisissez un jeu." : ' '}
        </p>
        <div className="tabs" role="group" aria-label="Critère de classement">
          {(Object.keys(BOARDS) as Board[]).map((k) => (
            <button key={k} aria-pressed={k === board} onClick={() => setBoard(k)}>{BOARDS[k].label}</button>
          ))}
        </div>
        {lb ? <Course lb={lb} board={board} me={account?.name} /> : <div className="course" id="course" />}
      </section>
      <div className="record">
        <section>
          <table className="lb" id="lb-table">
            <thead>
              <tr><th>Rang</th><th>Joueur</th><th>Manches</th><th>Dotation restante</th><th>{def.label}</th></tr>
            </thead>
            <tbody>
              {lb?.top.map(row)}
              {lb && lb.top.length === 0 && <tr><td colSpan={5} className="empty">Aucun joueur classé pour l&apos;instant.</td></tr>}
              {lb?.you && lb.you.rank > lb.top.length && row(lb.you)}
            </tbody>
          </table>
          {lb && lb.hallOfFame.length > 0 && (
            <div id="hof" className="hof">
              <h2>Saisons précédentes</h2>
              <ul>
                {lb.hallOfFame.map((s) => (
                  <li key={s.season}>Saison {s.season} : {s.podium.map((p) => p.name).join(', ') || 'aucun joueur'}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <aside>
          <h2>Comment les points sont comptés</h2>
          <p>Chaque joueur reçoit 10 000 crédits de dotation, au début de la saison ou le jour où il arrive.</p>
          <p>La dotation ne vaut rien tant qu&apos;elle n&apos;est pas misée. Ce que vos mises rapportent devient votre butin, et le butin est votre score.</p>
          <p>À sec, une avance de 1 000 crédits permet de rejouer. Elle est retirée du score.</p>
          <p>Rembourser sa dette retire les crédits du solde et augmente le score du même montant. Le remboursement est limité à la dette restante.</p>
          <h2>Gros gains récents</h2>
          <ul className="feed" id="feed">
            {feed.map((f) => (
              <li key={`${f.t}${f.name}`}>
                <b>{f.name}</b> a gagné {App.fmt(f.payout)}, soit {f.mult.toLocaleString('fr-FR')} fois sa mise <GameTag id={f.game} />
              </li>
            ))}
            {feed.length === 0 && <li className="empty">Aucun gain de plus de dix fois la mise pour l&apos;instant.</li>}
          </ul>
        </aside>
      </div>
    </>
  );
}
