import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import GameStage from '@/components/GameStage';
import { GAMES, byId } from '@/games/catalog';

export const dynamicParams = false;

export function generateStaticParams() {
  return GAMES.map((g) => ({ id: g.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const game = byId((await params).id);
  return { title: game ? `${game.name} · lab.bingo slots` : 'lab.bingo slots' };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!byId(id)) notFound();
  return <GameStage id={id} />;
}
