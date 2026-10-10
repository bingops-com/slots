import Link from 'next/link';

export default function NotFound() {
  return (
    <p className="notice">
      Cette page n&apos;existe pas. <Link href="/">Revenir au classement</Link>
    </p>
  );
}
