import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WriteButton } from '@/components/admin/WriteButton';
import { blockedKeysFor, hasHardKey } from '@shared/blockedMatch';

export interface BlockedForm {
  fullName: string; rut: string; phone: string; instagram: string; email: string;
  sourceVenue: string; sourceProducer: string; blockedOn: string; sourceBy: string; reason: string; notes: string;
}

export const emptyBlockedForm = (): BlockedForm => ({ fullName: '', rut: '', phone: '', instagram: '', email: '', sourceVenue: '', sourceProducer: '', blockedOn: '', sourceBy: '', reason: '', notes: '' });

export const formFromBlocked = (b: any): BlockedForm => ({
  fullName: b.fullName ?? '', rut: b.rut ?? '', phone: b.phone ?? '', instagram: b.instagram ?? '', email: b.email ?? '',
  sourceVenue: b.sourceVenue ?? '', sourceProducer: b.sourceProducer ?? '', blockedOn: b.blockedOn ?? '', sourceBy: b.sourceBy ?? '', reason: b.reason ?? '', notes: b.notes ?? '',
});

/** Lo que se manda al servidor: vacío = se borra el dato. */
export const payloadFromBlockedForm = (f: BlockedForm) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])) as Record<keyof BlockedForm, string | null>;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}</div>;
}

/** Ficha de un bloqueado: contacto, origen del bloqueo y notas. Basta con un dato para bloquear; el resto se completa después. */
export function BlockedSheet({ open, onOpenChange, mode, initial, saving, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; mode: 'new' | 'edit'; initial: BlockedForm; saving: boolean; onSave: (f: BlockedForm) => void;
}) {
  const [form, setForm] = useState<BlockedForm>(initial);
  useEffect(() => { if (open) setForm(initial); }, [open, initial]);
  const set = (k: keyof BlockedForm) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const keys = blockedKeysFor({ rut: form.rut, email: form.email, phone: form.phone, instagram: form.instagram, fullName: form.fullName });
  const anyData = hasHardKey(keys) || !!keys.nameFold || !!form.fullName.trim();
  const onlyName = anyData && !hasHardKey(keys);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle>{mode === 'new' ? 'Bloquear a alguien' : 'Ficha del bloqueado'}</SheetTitle>
          <SheetDescription>Basta con un dato. Lo demás se completa a medida que haya más información.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Contacto</h3>
            <Field label="Nombre completo"><Input value={form.fullName} onChange={set('fullName')} placeholder="Nombre y apellido" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="RUT / pasaporte"><Input value={form.rut} onChange={set('rut')} placeholder="12.345.678-9" /></Field>
              <Field label="Teléfono"><Input value={form.phone} onChange={set('phone')} placeholder="+56 9 1234 5678" inputMode="tel" /></Field>
              <Field label="Instagram"><Input value={form.instagram} onChange={set('instagram')} placeholder="@usuario" /></Field>
              <Field label="Correo"><Input value={form.email} onChange={set('email')} placeholder="correo@…" inputMode="email" /></Field>
            </div>
            <p className={`rounded-xl px-3 py-2 text-xs ${onlyName ? 'bg-amber-500/15 text-amber-300' : 'bg-white/5 text-muted-foreground'}`}>
              {!anyData ? 'Agrega al menos un dato.' : onlyName
                ? 'Solo con el nombre no se bloquea: la puerta y el panel avisan "posible bloqueado" para que decidas. Con RUT, teléfono, Instagram o correo sí se impide la entrada.'
                : 'Si alguien compra o llega con cualquiera de estos datos, no se le permite la entrada.'}
            </p>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Origen del bloqueo</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Local donde lo bloquearon"><Input value={form.sourceVenue} onChange={set('sourceVenue')} placeholder="Ej: Sinners" /></Field>
              <Field label="Productora"><Input value={form.sourceProducer} onChange={set('sourceProducer')} placeholder="Opcional" /></Field>
              <Field label="Fecha del bloqueo"><Input type="date" value={form.blockedOn} onChange={set('blockedOn')} /></Field>
              <Field label="Quién pasó el dato"><Input value={form.sourceBy} onChange={set('sourceBy')} placeholder="Persona o productora" /></Field>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Motivo y notas</h3>
            <Field label="Motivo"><Input value={form.reason} onChange={set('reason')} placeholder="Qué pasó" /></Field>
            <Field label="Notas"><Textarea value={form.notes} onChange={set('notes')} rows={4} placeholder="Lo que vayas sabiendo: más datos, contexto, cuentas alternativas…" /></Field>
          </section>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <WriteButton className="flex-1" disabled={saving || !anyData} onClick={() => onSave(form)}>{saving ? 'Guardando…' : mode === 'new' ? 'Bloquear' : 'Guardar'}</WriteButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
