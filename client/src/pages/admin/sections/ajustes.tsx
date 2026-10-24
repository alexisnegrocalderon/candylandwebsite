/* Secciones del hub «ajustes» del panel (se cargan solas al abrirlas, ver ADMIN_SECTIONS en ../Dashboard.tsx). */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { startRegistration } from '@simplewebauthn/browser';
import { signalAcceptedCredentials } from '@/lib/passkeySignals';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Instagram, Fingerprint, Loader2 } from 'lucide-react';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { formatChileDateTime, formatChileShortDate } from '@shared/chileDate';
import { onMutationError } from './shared';

/** Tarjeta de "Ajustes" para administrar passkeys (Face ID/Touch ID) -- camino
 * adicional al login con contraseña+TOTP, no lo reemplaza. Registrar un
 * dispositivo nuevo requiere ya estar adentro (adminProcedure), por eso vive
 * acá y no en AdminLoginForm. */
export function WebauthnSecurityCard() {
  const { data: credentials, refetch } = trpc.auth.webauthnCredentialsList.useQuery();
  const { data: userInfo } = trpc.auth.webauthnUserInfo.useQuery();
  const [registering, setRegistering] = useState(false);

  // Le dice al llavero del teléfono cuáles llaves siguen vigentes, para que
  // quite solo las viejas (mejor esfuerzo: ignorado si el navegador no soporta
  // la Signal API). Corre al abrir la tarjeta y cada vez que cambia la lista.
  useEffect(() => {
    if (!credentials || !userInfo) return;
    signalAcceptedCredentials({ ...userInfo, credentialIds: credentials.map((c) => c.credentialId) });
  }, [credentials, userInfo]);
  const [addingDevice, setAddingDevice] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('');

  const registrationOptions = trpc.auth.webauthnRegistrationOptions.useMutation();
  const registrationVerify = trpc.auth.webauthnRegistrationVerify.useMutation({
    onSuccess: () => { refetch(); toast.success('Dispositivo registrado'); },
    onError: onMutationError,
  });
  const deleteCredential = trpc.auth.webauthnCredentialDelete.useMutation({
    onSuccess: () => { refetch(); toast.success('Dispositivo eliminado'); },
    onError: onMutationError,
  });
  const deleteAllCredentials = trpc.auth.webauthnCredentialDeleteAll.useMutation({
    onSuccess: () => { refetch(); toast.success('Listo: sin dispositivos registrados. Registra de nuevo este iPhone/iPad.'); },
    onError: onMutationError,
  });

  // El nombre se pide ANTES en un campo propio (no window.prompt): un diálogo
  // nativo bloqueante en medio del flujo le puede hacer perder al navegador
  // el "gesto del usuario" que WebAuthn exige justo al llamar a
  // startRegistration -- en iOS/iPadOS eso se traduce en un NotAllowedError
  // silencioso y ningún dispositivo guardado.
  const registrarDispositivo = async () => {
    const label = deviceLabel.trim();
    if (!label) return;
    setRegistering(true);
    try {
      const { options, ticket } = await registrationOptions.mutateAsync();
      const response = await startRegistration({ optionsJSON: options });
      await registrationVerify.mutateAsync({ ticket, deviceLabel: label, response });
      setDeviceLabel('');
      setAddingDevice(false);
    } catch (e: any) {
      toast.error(
        e?.name === 'NotAllowedError'
          ? 'No se pudo completar el registro con Face ID/Touch ID. Intenta de nuevo sin cambiar de pestaña.'
          : e?.message || 'No se pudo registrar el dispositivo.'
      );
    } finally {
      setRegistering(false);
    }
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Seguridad — Face ID / Touch ID</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Registra este iPhone o iPad Pro para entrar al panel con Face ID/Touch ID, sin escribir
          la contraseña ni el código de la app de autenticación. Es un camino adicional -- el login
          de siempre sigue funcionando igual.
        </p>
        <p className="text-muted-foreground text-xs">
          Registra cada dispositivo UNA sola vez. Si el llavero del teléfono muestra llaves viejas
          &quot;admin&quot;, toca &quot;Borrar todos y empezar de cero&quot; y registra de nuevo; el teléfono las
          quita solo, o bórralas a mano en Ajustes del iPhone → Contraseñas → mansionplayroom.cl.
        </p>
        {credentials && credentials.length > 0 && (
          <div className="space-y-2">
            {credentials.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{c.deviceLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    Registrado {new Date(c.createdAt).toLocaleDateString('es-CL')}
                    {c.lastUsedAt ? ` · Último uso ${new Date(c.lastUsedAt).toLocaleDateString('es-CL')}` : ' · Sin usar todavía'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { if (window.confirm(`¿Quitar "${c.deviceLabel}"?`)) deleteCredential.mutate({ id: c.id }); }}
                  disabled={deleteCredential.isPending}
                  className="interactive text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {credentials && credentials.length > 0 && !addingDevice && (
          <Button
            variant="outline"
            size="sm"
            disabled={deleteAllCredentials.isPending}
            onClick={() => { if (window.confirm('¿Borrar TODOS los dispositivos registrados? Después tendrás que registrar de nuevo cada iPhone/iPad.')) deleteAllCredentials.mutate(); }}
            className="interactive text-destructive"
          >
            Borrar todos y empezar de cero
          </Button>
        )}
        {addingDevice ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder='Nombre del dispositivo (ej. "iPhone de Alexis")'
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && deviceLabel.trim()) registrarDispositivo(); }}
              className="flex-1"
            />
            <div className="flex gap-2">
              <WriteButton onClick={registrarDispositivo} disabled={registering || !deviceLabel.trim()} className="interactive gap-2">
                <Fingerprint className="w-4 h-4" />
                {registering ? 'Registrando…' : 'Continuar'}
              </WriteButton>
              <Button variant="ghost" onClick={() => { setAddingDevice(false); setDeviceLabel(''); }} disabled={registering} className="interactive">
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <WriteButton onClick={() => setAddingDevice(true)} className="interactive gap-2">
            <Fingerprint className="w-4 h-4" />
            Registrar este dispositivo
          </WriteButton>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsManager() {
  const { data: settings, refetch } = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation({ onSuccess: () => { refetch(); toast.success('Ajustes guardados'); }, onError: onMutationError });
  // Mismo número que llega en el correo de las 3am -- acá se puede revisar
  // manual en cualquier momento, sin esperar el correo.
  const { data: checkin } = trpc.settings.checkinCount.useQuery(undefined, { refetchInterval: 30_000 });
  const [followers, setFollowers] = useState('');
  const [posts, setPosts] = useState('');
  const [feePercent, setFeePercent] = useState('');
  const [cardFeePercent, setCardFeePercent] = useState('');
  const [parkingVenueFeeClp, setParkingVenueFeeClp] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');
  const [ogImageUrl, setOgImageUrl] = useState('');

  useEffect(() => {
    if (settings) {
      setFollowers(String(settings.instagramFollowers ?? 0));
      setPosts(String(settings.instagramPosts ?? 0));
      setFeePercent(String(settings.serviceFeePercent ?? 0));
      setCardFeePercent(String((settings as any).cardFeePercent ?? 3.5));
      setParkingVenueFeeClp(String((settings as any).parkingVenueFeeClp ?? 3000));
      setVendorName((settings as any).kitchenVendorName ?? '');
      setVendorEmail((settings as any).kitchenVendorEmail ?? '');
      setOgImageUrl((settings as any).ogImageUrl ?? '');
    }
  }, [settings]);

  const utilsSettings = trpc.useUtils();
  const syncInstagram = trpc.settings.syncInstagram.useMutation({
    onSuccess: (r) => {
      setFollowers(String(r.followers));
      if (r.posts) setPosts(String(r.posts));
      utilsSettings.settings.get.invalidate();
      toast.success(`Actualizado: ${r.followers.toLocaleString('es-CL')} seguidores`);
    },
    onError: onMutationError,
  });

  const handleSave = () => {
    updateSettings.mutate({ instagramFollowers: Number(followers) || 0, instagramPosts: Number(posts) || 0 });
  };

  const handleSaveFee = () => {
    updateSettings.mutate({ serviceFeePercent: Number(feePercent) || 0 });
  };

  const handleSaveCardFee = () => {
    updateSettings.mutate({ cardFeePercent: Number(cardFeePercent) || 0 });
  };

  const handleSaveParkingVenueFee = () => {
    updateSettings.mutate({ parkingVenueFeeClp: Number(parkingVenueFeeClp) || 0 });
  };

  const handleSaveVendor = () => {
    updateSettings.mutate({ kitchenVendorName: vendorName || null, kitchenVendorEmail: vendorEmail || null });
  };

  const handleSaveOgImage = () => {
    updateSettings.mutate({ ogImageUrl: ogImageUrl.trim() || null });
  };

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl">Ajustes</h2>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5 bg-gradient-to-br from-[#241432]/10 to-transparent">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-heading text-lg">🎃 Modo Halloween</h3>
              <p className="text-sm text-muted-foreground max-w-xl">
                Cambia la portada del sitio a la versión Halloween (misma página, con la paleta Halloween y
                detalles flotando). Al apagarlo vuelve al instante a la portada oficial.
              </p>
              <a href="/halloween" target="_blank" rel="noreferrer" className="text-sm text-primary font-semibold hover:underline mt-2 inline-block">
                Ver vista previa en /halloween →
              </a>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">{settings?.halloweenModeEnabled ? 'Prendido' : 'Apagado'}</span>
              <Switch
                checked={!!settings?.halloweenModeEnabled}
                onCheckedChange={(v) => updateSettings.mutate({ halloweenModeEnabled: v })}
                disabled={updateSettings.isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Personas y entradas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {checkin ? (
            <>
              <p className="text-muted-foreground text-sm">{checkin.eventTitle}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-4xl font-heading font-extrabold">{checkin.expectedCount.toLocaleString('es-CL')}</p>
                  <p className="text-muted-foreground text-sm">Personas con entrada comprada</p>
                </div>
                <div>
                  <p className="text-4xl font-heading font-extrabold">{checkin.insideCount.toLocaleString('es-CL')}</p>
                  <p className="text-muted-foreground text-sm">Ya ingresaron a la fiesta</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Se actualiza solo cada 30 segundos. "Entrada comprada" cuenta personas, no órdenes -- un Dúo suma 2, un Grupo suma 4 -- e incluye abonos de Misión 300 ya pagados aunque su ticket todavía no se haya generado.</p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No hay un evento activo con datos de puerta todavía.</p>
          )}
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Instagram</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Números que se muestran junto al ícono de Instagram en el footer. Se actualizan solos cada madrugada desde Instagram (gratis, sin IA).
            Si Meta no responde se queda el último número. También puedes editarlos a mano o actualizarlos ahora.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Seguidores</Label><Input type="number" value={followers} onChange={(e) => setFollowers(e.target.value)} className="mt-1" /></div>
            <div><Label>Publicaciones</Label><Input type="number" value={posts} onChange={(e) => setPosts(e.target.value)} className="mt-1" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <WriteButton onClick={handleSave} disabled={updateSettings.isPending} className="interactive">
              {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
            </WriteButton>
            <WriteButton variant="outline" onClick={() => syncInstagram.mutate()} disabled={syncInstagram.isPending} className="interactive">
              {syncInstagram.isPending ? 'Actualizando…' : 'Actualizar desde Instagram'}
            </WriteButton>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Recargo por servicio</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Porcentaje que se suma al total de cada venta nueva (entradas + extras), calculado sobre el monto ya con
            descuento aplicado. Aparece en el checkout y en el correo como "Cargo por servicio" con el monto — sin
            mostrar el porcentaje. No afecta órdenes ya creadas.
          </p>
          <div className="max-w-xs">
            <Label>Recargo (%)</Label>
            <Input type="number" step="0.01" min="0" max="100" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} className="mt-1" />
          </div>
          <WriteButton onClick={handleSaveFee} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </WriteButton>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Comisión de tarjeta (Mercado Pago)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Porcentaje que se descuenta solo, como costo, en el resultado (P&L) de cada evento — tanto de las ventas
            web como de las ventas en caja pagadas con débito, crédito o QR (el efectivo no paga comisión). Ajusta
            este número cuando tengas el % exacto de tu liquidación de Mercado Pago.
          </p>
          <div className="max-w-xs">
            <Label>Comisión (%)</Label>
            <Input type="number" step="0.01" min="0" max="100" value={cardFeePercent} onChange={(e) => setCardFeePercent(e.target.value)} className="mt-1" />
          </div>
          <WriteButton onClick={handleSaveCardFee} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </WriteButton>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Estacionamiento — pago al establecimiento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Cuánto le pagas al establecimiento por CADA auto que pagó estacionamiento (online o en la puerta) — los
            autos de staff con estacionamiento gratis no cuentan acá. Se usa en el reporte "Estacionamiento" del
            admin para calcular el monto a pagar.
          </p>
          <div className="max-w-xs">
            <Label>Monto por auto (CLP)</Label>
            <Input type="number" step="1" min="0" value={parkingVenueFeeClp} onChange={(e) => setParkingVenueFeeClp(e.target.value)} className="mt-1" />
          </div>
          <WriteButton onClick={handleSaveParkingVenueFee} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </WriteButton>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Proveedor de cocina</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            A quién rendirle cuentas de lo vendido en productos de cocina. Se usa en Gastos y P&amp;L → Ventas → Reporte de cocina para mandarle el detalle por email.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nombre</Label><Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="mt-1" /></div>
            <div><Label>Email</Label><Input type="email" value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} className="mt-1" /></div>
          </div>
          <WriteButton onClick={handleSaveVendor} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </WriteButton>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Imagen para compartir en redes (OG)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Se usa cuando alguien comparte el sitio (no un evento puntual) en WhatsApp/Instagram/Facebook. Cada evento
            usa su propio flyer automáticamente en su página. Si dejas esto vacío, se usa la imagen de siempre.
          </p>
          <ImageUploadField value={ogImageUrl} onChange={setOgImageUrl} pathPrefix="site" />
          <Input value={ogImageUrl} onChange={(e) => setOgImageUrl(e.target.value)} className="mt-2" placeholder="https://..." />
          <WriteButton onClick={handleSaveOgImage} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </WriteButton>
        </CardContent>
      </Card>
      <WebauthnSecurityCard />
      <AlertasCard />
    </div>
  );
}

/** Convierte la clave pública VAPID (base64url, como la devuelve el server)
 * al Uint8Array que pide `pushManager.subscribe` -- transformación estándar
 * de la spec de Web Push, no hay forma más corta con las APIs del browser. */
export function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
  return array;
}

/** Vigilante de caja (server/caja/alerts.ts): interruptores, umbrales y el
 * historial de todo lo que avisó durante el evento. */
export function CajaWatchSettings({ config, saving, onSave }: {
  config: { pushCajaAlerts: boolean; cajaAiSummary: boolean; cajaLowStockUnits: number; cajaHighSaleClp: number } | undefined;
  saving: boolean;
  onSave: (patch: Partial<{ pushCajaAlerts: boolean; cajaAiSummary: boolean; cajaLowStockUnits: number; cajaHighSaleClp: number }>) => void;
}) {
  const { data: alerts } = trpc.cajaReports.alerts.useQuery(undefined, { refetchInterval: 60_000 });
  const [lowStock, setLowStock] = useState('');
  const [highSale, setHighSale] = useState('');
  useEffect(() => {
    if (!config) return;
    setLowStock(String(config.cajaLowStockUnits));
    setHighSale(String(config.cajaHighSaleClp));
  }, [config?.cajaLowStockUnits, config?.cajaHighSaleClp]);

  const saveNumber = (key: 'cajaLowStockUnits' | 'cajaHighSaleClp', raw: string) => {
    const n = Math.round(Number(raw.replace(/\D/g, '')));
    if (!Number.isFinite(n) || !config || n === config[key]) return;
    onSave({ [key]: n });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/50 p-3">
      <Label>🧾 Vigilante de caja</Label>
      <div className="flex items-center justify-between gap-3 py-1.5">
        <div>
          <p className="text-sm">Alertas de caja en vivo</p>
          <p className="text-xs text-muted-foreground">Push por ventas anuladas, clave admin incorrecta, stock bajo/agotado, ventas o descuentos fuera de lo normal, descuadres al cerrar turno, cajas sin movimiento y turnos que quedan abiertos.</p>
        </div>
        <Switch checked={!!config?.pushCajaAlerts} disabled={saving || !config} onCheckedChange={(v) => onSave({ pushCajaAlerts: v })} />
      </div>
      <div className="flex items-center justify-between gap-3 py-1.5">
        <div>
          <p className="text-sm">Resumen IA de la noche</p>
          <p className="text-xs text-muted-foreground">Cada hora durante la fiesta un resumen corto por push, y al cerrar todas las cajas un correo con el resumen y todas las alertas.</p>
        </div>
        <Switch checked={!!config?.cajaAiSummary} disabled={saving || !config} onCheckedChange={(v) => onSave({ cajaAiSummary: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Avisar stock bajo con (unidades)</Label>
          <Input inputMode="numeric" value={lowStock} onChange={(e) => setLowStock(e.target.value)} onBlur={() => saveNumber('cajaLowStockUnits', lowStock)} />
        </div>
        <div>
          <Label className="text-xs">Avisar ventas desde ($)</Label>
          <Input inputMode="numeric" value={highSale} onChange={(e) => setHighSale(e.target.value)} onBlur={() => saveNumber('cajaHighSaleClp', highSale)} />
        </div>
      </div>
      {alerts && alerts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Últimas alertas de caja</p>
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {alerts.map((a) => (
              <div key={a.id} className={`text-sm p-2 rounded-lg border ${a.severity === 'critical' ? 'border-destructive/40 bg-destructive/5' : 'border-border/50'}`}>
                <p className="font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-line">{a.body}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{formatChileDateTime(a.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Push al iPad instalado + correo resumen diario. Interruptores todos
 * apagados por defecto (shared/adminAlertsConfig.ts) -- desplegar esto no
 * debe empezar a notificar solo. */
export function AlertasCard() {
  const { data: config, refetch: refetchConfig } = trpc.adminAlerts.getConfig.useQuery();
  const { data: vapid } = trpc.adminAlerts.getVapidPublicKey.useQuery();
  const { data: subscriptions, refetch: refetchSubs } = trpc.adminAlerts.listSubscriptions.useQuery(undefined, { refetchInterval: 60_000 });
  const saveConfig = trpc.adminAlerts.saveConfig.useMutation({ onSuccess: () => refetchConfig(), onError: onMutationError });
  const subscribe = trpc.adminAlerts.subscribe.useMutation();
  const unsubscribe = trpc.adminAlerts.unsubscribe.useMutation();
  const removeSubscription = trpc.adminAlerts.removeSubscription.useMutation({ onSuccess: () => refetchSubs() });
  const sendTestPush = trpc.adminAlerts.sendTestPush.useMutation();
  const sendDigestNow = trpc.adminAlerts.sendDigestNow.useMutation();
  const sendFinanceNow = trpc.finance.sendDigestNow.useMutation();

  const [thisDeviceEndpoint, setThisDeviceEndpoint] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  // Al cargar, revisa si ESTE dispositivo ya tiene una suscripción activa --
  // el permiso y la suscripción viven en el navegador, no en la base, así
  // que hay que preguntarle al service worker, no a `subscriptions` (esa
  // lista es "todos los dispositivos", útil para verlos/borrarlos, no para
  // saber el estado de este).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration('/admin/').then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (sub) setThisDeviceEndpoint(sub.endpoint);
    }).catch(() => {});
  }, []);

  const notifSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const alreadyOn = !!thisDeviceEndpoint;

  const handleActivate = async () => {
    if (!vapid?.publicKey) { toast.error('Faltan configurar las claves VAPID en el servidor.'); return; }
    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { toast.error('No diste permiso de notificaciones -- revísalo en Ajustes del navegador.'); return; }

      const reg = await navigator.serviceWorker.getRegistration('/admin/') ?? await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = sub.toJSON();
      await subscribe.mutateAsync({
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
        label: navigator.userAgent.includes('iPad') ? 'iPad' : navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Dispositivo',
      });
      setThisDeviceEndpoint(json.endpoint!);
      refetchSubs();
      toast.success('Notificaciones activadas en este dispositivo.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo activar. Revisa que la app esté agregada a la pantalla de inicio.');
    } finally {
      setSubscribing(false);
    }
  };

  const handleDeactivate = async () => {
    if (!thisDeviceEndpoint) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/admin/');
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      await unsubscribe.mutateAsync({ endpoint: thisDeviceEndpoint });
      setThisDeviceEndpoint(null);
      refetchSubs();
      toast.success('Notificaciones desactivadas en este dispositivo.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desactivar.');
    }
  };

  const ALERT_TOGGLES: { key: 'pushNewOrder' | 'pushAmbassadorApplication' | 'pushPartyReport' | 'pushInstagramHandoff' | 'pushWhatsAppHandoff'; label: string; help: string }[] = [
    { key: 'pushNewOrder', label: 'Venta web nueva', help: 'Push apenas se aprueba una compra en el sitio.' },
    { key: 'pushAmbassadorApplication', label: 'Postulación de embajador', help: 'Push cuando alguien postula a Embajador VIP.' },
    { key: 'pushPartyReport', label: 'Denuncia en la fiesta', help: 'Push cuando alguien reporta a otra persona desde Playmatch.' },
    { key: 'pushInstagramHandoff', label: 'Instagram sin resolver', help: 'Push cuando el agente de Instagram deriva una conversación a una persona.' },
    { key: 'pushWhatsAppHandoff', label: 'WhatsApp sin resolver', help: 'Push cuando el agente de WhatsApp deriva una conversación a una persona.' },
  ];

  const allOn = !!config && ALERT_TOGGLES.every((t) => config[t.key]) && config.dailyDigestEmail;
  const setAll = (value: boolean) => {
    if (!config) return;
    saveConfig.mutate({ ...config, pushNewOrder: value, pushAmbassadorApplication: value, pushPartyReport: value, pushInstagramHandoff: value, pushWhatsAppHandoff: value, dailyDigestEmail: value });
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>🔔 Alertas</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-muted-foreground text-sm">
          Push a este iPad (agregado a la pantalla de inicio) y correo resumen diario -- para enterarte de novedades sin
          tener que revisar sección por sección.
        </p>

        {!notifSupported && (
          <p className="text-xs text-destructive">Este navegador no soporta notificaciones push.</p>
        )}

        {notifSupported && (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-border/50">
            <span className="text-sm flex-1 min-w-40">
              {alreadyOn ? '✅ Activado en este dispositivo' : 'No activado en este dispositivo'}
            </span>
            {alreadyOn ? (
              <Button variant="outline" size="sm" onClick={handleDeactivate}>Desactivar acá</Button>
            ) : (
              <WriteButton size="sm" onClick={handleActivate} disabled={subscribing || !vapid?.publicKey} className="interactive">
                {subscribing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Activar notificaciones
              </WriteButton>
            )}
            {alreadyOn && (
              <Button variant="outline" size="sm" disabled={sendTestPush.isPending}
                onClick={() => sendTestPush.mutate(undefined, { onSuccess: () => toast.success('Push de prueba enviado.'), onError: onMutationError })}>
                Mandar prueba
              </Button>
            )}
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-border/50 p-3">
          <div className="flex items-center justify-between">
            <Label>Interruptores</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Todas</span>
              <Switch checked={allOn} onCheckedChange={setAll} disabled={saveConfig.isPending || !config} />
            </div>
          </div>
          {ALERT_TOGGLES.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-3 py-1.5">
              <div>
                <p className="text-sm">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.help}</p>
              </div>
              <Switch
                checked={!!config?.[t.key]}
                disabled={saveConfig.isPending || !config}
                onCheckedChange={(v) => config && saveConfig.mutate({ ...config, [t.key]: v })}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 py-1.5 border-t border-border/50 pt-3 mt-1">
            <div>
              <p className="text-sm">Correo resumen diario</p>
              <p className="text-xs text-muted-foreground">Todos los días, con las novedades de las últimas 24h + lo pendiente de resolver.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                checked={!!config?.dailyDigestEmail}
                disabled={saveConfig.isPending || !config}
                onCheckedChange={(v) => config && saveConfig.mutate({ ...config, dailyDigestEmail: v })}
              />
            </div>
          </div>
          {([
            ['financeNightlyEmail', 'Cierre financiero de la noche', 'La mañana siguiente a cada fiesta: ingreso, costos, ganancia, por pagar y consejos.', 'night'],
            ['financeWeeklyEmail', 'Resumen financiero de los lunes', 'El mes en curso, lo que va del año y todo lo que hay por pagar.', 'week'],
          ] as const).map(([key, title, desc, kind]) => (
            <div key={key} className="flex items-center justify-between gap-3 py-1.5 border-t border-border/50 pt-3 mt-1">
              <div>
                <p className="text-sm">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
                {config?.[key] && (
                  <Button variant="link" size="sm" className="px-0 h-auto" disabled={sendFinanceNow.isPending}
                    onClick={() => sendFinanceNow.mutate({ kind }, {
                      onSuccess: (r) => toast.success(r.sent ? 'Correo enviado.' : `No se mandó: ${r.reason}`),
                      onError: onMutationError,
                    })}>Mandar uno ahora para probar</Button>
                )}
              </div>
              <Switch checked={!!config?.[key]} disabled={saveConfig.isPending || !config}
                onCheckedChange={(v) => config && saveConfig.mutate({ ...config, [key]: v })} />
            </div>
          ))}
          {config?.dailyDigestEmail && (
            <Button variant="outline" size="sm" disabled={sendDigestNow.isPending}
              onClick={() => sendDigestNow.mutate(undefined, {
                onSuccess: (r) => toast.success(r.sent ? 'Resumen enviado.' : `No se mandó: ${r.reason}`),
                onError: onMutationError,
              })}>
              Mandar resumen ahora
            </Button>
          )}
        </div>

        <CajaWatchSettings config={config} saving={saveConfig.isPending} onSave={(patch) => config && saveConfig.mutate({ ...config, ...patch })} />

        {subscriptions && subscriptions.length > 0 && (
          <div className="space-y-2">
            <Label>Dispositivos con notificaciones activas ({subscriptions.length})</Label>
            {subscriptions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 text-sm p-2 rounded-lg border border-border/50">
                <span>{s.label || 'Dispositivo'} <span className="text-muted-foreground text-xs">· desde {formatChileShortDate(s.createdAt)}</span></span>
                <Button variant="ghost" size="sm" onClick={() => removeSubscription.mutate({ id: s.id })}>Quitar</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
