/* Mientras carga «Mi cuenta» en el celular: la forma de la pantalla (cabecera, entrada con la
 * PlayCard asomando detrás, botones y barra de abajo) con un brillo que pasa, en vez de una
 * pantalla negra. Es liviano a propósito: también lo usa App.tsx antes de bajar la página. */

const bone = 'lg-skeleton bg-white/[0.07]';

export function AccountSkeleton() {
  return (
    <div className="account-font fixed inset-0 z-[60] flex flex-col bg-[#0b0612]" aria-busy="true" aria-label="Cargando tu cuenta">
      <div className="account-backdrop" />
      <div className="relative z-10 flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-9 w-9 opacity-80" />
        <div className={`${bone} h-7 w-44 rounded-full`} />
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+92px)]">
        <div className="relative pt-[58px]">
          <div className={`${bone} absolute inset-x-0 top-0 h-[54px] origin-top scale-x-[0.94] rounded-t-[26px] opacity-70`} />
          <div className="relative space-y-4 rounded-[26px] border border-white/10 bg-[#150a1e] p-5">
            <div className="flex items-center justify-between">
              <div className={`${bone} h-5 w-24 rounded-full`} />
              <div className={`${bone} h-6 w-20 rounded-full`} />
            </div>
            <div className={`${bone} h-8 w-3/4 rounded-xl`} />
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => <div key={i} className="space-y-1.5"><div className={`${bone} h-2.5 w-10 rounded-full`} /><div className={`${bone} h-4 w-full rounded-full`} /></div>)}
            </div>
            <div className="flex items-end justify-between gap-4">
              <div className="flex-1 space-y-1.5"><div className={`${bone} h-2.5 w-14 rounded-full`} /><div className={`${bone} h-4 w-2/3 rounded-full`} /></div>
              <div className={`${bone} h-7 w-28 rounded-full`} />
            </div>
          </div>
        </div>
        <div className={`${bone} h-14 rounded-full`} />
        <div className="grid grid-cols-2 gap-2">
          <div className={`${bone} h-11 rounded-full`} />
          <div className={`${bone} h-11 rounded-full`} />
        </div>
      </div>
      <div className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 z-10 flex w-[calc(100vw-24px)] max-w-md -translate-x-1/2 items-end gap-1">
        <div className={`${bone} h-[58px] flex-1 rounded-full`} />
        <div className="w-[68px] shrink-0" />
        <div className={`${bone} h-[58px] flex-1 rounded-full`} />
        <div className="absolute bottom-3 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full bg-gradient-to-br from-pink-500/50 via-fuchsia-500/40 to-sky-500/50" />
      </div>
    </div>
  );
}
