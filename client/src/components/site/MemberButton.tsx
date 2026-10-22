import { Link } from 'wouter';
import { Sparkles } from 'lucide-react';
import { useMemberInvite, useMemberSession } from '@/lib/member';

/** Botón «Mi cuenta» del header: píldora con borde degradado rosa → celeste y brillo suave.
 * En celular queda solo el ícono; en escritorio, ícono y texto. `light` = el header tiene fondo claro. */
export function MemberButton({ light, size = 'md' }: { light: boolean; size?: 'sm' | 'md' }) {
  const invite = useMemberInvite();
  const { data: session } = useMemberSession();
  if (!invite) return null;
  const loggedIn = !!session?.loggedIn;
  const label = loggedIn ? 'Mi cuenta' : 'Entrar';
  return (
    <Link
      href="/cuenta"
      aria-label={loggedIn ? 'Mi cuenta' : 'Entrar a Mi cuenta'}
      className="member-pill interactive inline-flex shrink-0 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-400 to-sky-400 p-[1.5px]"
    >
      <span
        className={`flex items-center gap-1.5 rounded-full font-semibold ${size === 'sm' ? 'h-[33px] w-[33px] justify-center md:w-auto md:px-3.5' : 'h-[33px] px-3.5'} ${
          light ? 'bg-background text-foreground' : 'bg-[#0b0612]/90 text-white backdrop-blur'
        }`}
      >
        <Sparkles className="h-4 w-4 text-pink-400" strokeWidth={2} />
        <span className={`text-xs uppercase tracking-wide ${size === 'sm' ? 'hidden md:inline' : ''}`}>{label}</span>
      </span>
    </Link>
  );
}
