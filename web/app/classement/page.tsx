import type { Metadata } from 'next';
import Board from '@/components/Board';

export const metadata: Metadata = { title: 'Classement · lab.bingo slots' };

export default function Page() {
  return <Board />;
}
