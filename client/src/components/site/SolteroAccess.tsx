import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BadgeCheck, Clock, Loader2, ShieldAlert } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { solteroRequestProblem } from '@shared/soltero';

/* «Acceso Soltero» en «Mi cuenta»: el hombre que viene solo pide su aprobación
 * una vez (nombre, RUT, Instagram, WhatsApp y quién lo recomienda) y, aprobado,
 * compra Soltero o Dúo de dos hombres sin código desde su app. La decisión la
 * toma el admin (Clientes → Solteros); el aviso le llega por push y correo. */

export function useSolteroStatus() {
  const { data } = trpc.member.soltero.useQuery(undefined, { retry: false, staleTime: 60_000 });
  return data ?? null;
}

export const solteroRowSub = (status: string | null | undefined) =>
  status === 'aprobado' ? 'Aprobado: compras sin código'
    : status === 'pendiente' ? 'En revisión: te avisamos'
      : 'Para hombres que vienen solos';

const field = 'h-12 w-full rounded-2xl bg-white/[0.08] px-4 text-body text-white outline-none placeholder:text-white/40 focus:bg-white/[0.12]';

export function SolteroAccess() {
  const utils = trpc.useUtils();
  const status = useSolteroStatus();
  const { data: prefill } = trpc.member.checkoutPrefill.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const [f, setF] = useState({ fullName: '', rut: '', instagram: '', phone: '', referredBy: '', message: '' });
  const [again, setAgain] = useState(false);
  useEffect(() => {
    if (!prefill) return;
    setF((cur) => ({
      ...cur,
      fullName: cur.fullName || prefill.fullName || '',
      rut: cur.rut || (prefill.docType === 'rut' ? prefill.rut ?? '' : ''),
      instagram: cur.instagram || prefill.instagram || '',
      phone: cur.phone || prefill.phone || '',
    }));
  }, [prefill]);
  const send = trpc.member.solteroRequest.useMutation({
    onSuccess: (r) => {
      utils.member.soltero.invalidate();
      setAgain(false);
      toast.success(r.status === 'aprobado' ? 'Ya estabas aprobado' : 'Solicitud enviada: te avisamos apenas la revisemos');
    },
    onError: (e) => toast.error(e.message || 'No se pudo enviar'),
  });
  const problem = solteroRequestProblem(f);

  if (status?.status === 'aprobado') {
    return (
      <div className="space-y-3">
        <div className="account-glass rounded-[24px] p-5 text-center">
          <BadgeCheck className="mx-auto h-10 w-10 text-emerald-300" />
          <p className="mt-2 text-title3 font-bold">Estás aprobado</p>
          <p className="mt-1 text-subhead text-white/70">Compra Soltero o Dúo de dos hombres desde tu app sin código, con este mismo correo.</p>
        </div>
        <a href="/" className="flex h-14 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-semibold text-white">Comprar mi entrada</a>
      </div>
    );
  }

  if (status?.status === 'pendiente' && !again) {
    return (
      <div className="account-glass rounded-[24px] p-5 text-center">
        <Clock className="mx-auto h-10 w-10 text-amber-300" />
        <p className="mt-2 text-title3 font-bold">Tu solicitud está en revisión</p>
        <p className="mt-1 text-subhead text-white/70">Te avisamos con una notificación y un correo apenas quede aprobada. Mientras, puedes comprar con tu código de comunidad.</p>
        <button type="button" onClick={() => setAgain(true)} className="mt-3 text-footnote text-white/60 underline">Corregir mis datos</button>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!problem) send.mutate({ ...f, referredBy: f.referredBy || null, message: f.message || null }); }}>
      {(status?.status === 'rechazado' || status?.status === 'revocado') && !again ? (
        <div className="account-glass flex items-start gap-3 rounded-[22px] p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <p className="text-subhead text-white/75">Por ahora no pudimos aprobar tu acceso. Si crees que es un error, escríbenos por WhatsApp o vuelve a enviar tus datos.</p>
        </div>
      ) : (
        <p className="text-subhead leading-relaxed text-white/75">
          Si vienes solo o con otro hombre, te aprobamos una vez y después compras Soltero o Dúo de dos hombres desde tu app sin código. Lo revisamos a mano para cuidar la fiesta.
        </p>
      )}
      <input className={field} placeholder="Nombre y apellido" autoComplete="name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
      <input className={field} placeholder="RUT (12.345.678-9)" value={f.rut} onChange={(e) => setF({ ...f, rut: e.target.value })} />
      <input className={field} placeholder="Instagram (@tuusuario)" autoCapitalize="none" autoCorrect="off" value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} />
      <input className={field} type="tel" placeholder="WhatsApp (+56 9…)" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <input className={field} placeholder="¿Quién te recomienda? (opcional)" value={f.referredBy} onChange={(e) => setF({ ...f, referredBy: e.target.value })} />
      <textarea className={`${field} h-24 py-3`} placeholder="Algo que quieras contarnos (opcional)" maxLength={500} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      {problem && (f.fullName || f.rut || f.instagram || f.phone) && <p className="text-footnote text-amber-300">{problem}</p>}
      <button type="submit" disabled={!!problem || send.isPending} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-semibold text-white disabled:opacity-50">
        {send.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Pedir mi aprobación
      </button>
      <p className="text-center text-caption1 text-white/45">Tus datos solo los ve el equipo de Mansion Playroom.</p>
    </form>
  );
}
