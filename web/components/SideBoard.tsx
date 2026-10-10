'use client';

import Link from 'next/link';
import { App, useApp } from '@/lib/app';
import { useGameBoard } from '@/lib/board';

const times = (m: number) => `×${m.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;

// Le classement du jeu affiché, à côté de la scène : le plus gros gain de chaque joueur
// cette saison, compté en fois la mise. On y voit sa place bouger en jouant.
export default function SideBoard({ game, name }: { game: string; name: string }) {
  const { account, practice } = useApp();
  const board = useGameBoard(game);
  const rows = board ? board.top : [];
  const you = board?.you ?? null;
  const below = you && you.rank > rows.length ? you : null;
  return (
    <aside className="sideboard" aria-label={`Classement de ${name}`}>
      <h2>Plus gros gains sur {name}</h2>
      <p>{board ? `Saison ${board.season.id}, en fois la mise.` : board === null ? 'Classement indisponible hors ligne.' : ' '}</p>
      {board && rows.length === 0 && <p>Aucun gain classé pour l&apos;instant : le premier ouvre le tableau.</p>}
      {rows.length > 0 && (
        <ol>
          {[...rows, ...(below ? [below] : [])].map((p) => (
            <li key={p.name} className={account?.name === p.name ? 'me' : undefined}>
              <span>{p.rank}</span>
              <b>{p.name}</b>
              <i>
                {times(p.mult)}
                <small>{App.fmt(p.payout)}</small>
              </i>
            </li>
          ))}
        </ol>
      )}
      {board && (
        <p>
          {practice
            ? "À l'entraînement, vos gains n'entrent pas au tableau."
            : !you
              ? 'Vous entrez au tableau dès votre premier gain classé.'
              : you.rank === 0
                ? `${you.rounds.toLocaleString('fr-FR')} manches jouées, pas encore de gain.`
                : `Vous êtes ${you.rank}${you.rank === 1 ? 'er' : 'e'}, avec ${times(you.mult)}.`}
        </p>
      )}
      <Link href="/classement/">Classement de la saison</Link>
    </aside>
  );
}
