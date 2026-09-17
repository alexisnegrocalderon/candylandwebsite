import { useState } from 'react';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/* Automatizaciones de Instagram por palabra clave: comentar (post/reel) o
 * responder a una historia con la palabra justa dispara un DM automático --
 * un link, un mensaje de puro texto, o un código de descuento, según lo que
 * el dueño configure para esa campaña puntual.
 *
 * "comentario" no hace nada todavía en producción: Meta exige un permiso
 * aparte (instagram_business_manage_comments, Advanced Access) que hoy no
 * está aprobado para esta app -- ver docs/INSTAGRAM-AGENT.md. "Respuesta a
 * historia" funciona apenas se despliega, sin nada nuevo que pedirle a
 * Meta. */

const onError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
};

const TRIGGER_LABEL: Record<string, string> = {
  comment: 'Comentario (⏳ pendiente de permiso de Meta)',
  story_reply: 'Respuesta a historia',
  both: 'Comentario + respuesta a historia',
};

export function InstagramAutomations() {
  const utils = trpc.useUtils();
  const { data: automations } = trpc.instagramAutomations.list.useQuery();
  const [showForm, setShowForm] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [triggerSource, setTriggerSource] = useState<'comment' | 'story_reply' | 'both'>('story_reply');
  const [replyMessage, setReplyMessage] = useState('');
  const [withDiscount, setWithDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(10);
  const [maxUses, setMaxUses] = useState('');
  const [validUntil, setValidUntil] = useState('');

  const resetForm = () => {
    setKeyword('');
    setTriggerSource('story_reply');
    setReplyMessage('');
    setWithDiscount(false);
    setDiscountType('percentage');
    setDiscountValue(10);
    setMaxUses('');
    setValidUntil('');
    setShowForm(false);
  };

  const save = trpc.instagramAutomations.save.useMutation({
    onSuccess: () => { utils.instagramAutomations.list.invalidate(); resetForm(); toast.success('Automatización guardada.'); },
    onError,
  });
  const setActive = trpc.instagramAutomations.setActive.useMutation({
    onSuccess: () => utils.instagramAutomations.list.invalidate(),
    onError,
  });
  const remove = trpc.instagramAutomations.delete.useMutation({
    onSuccess: () => utils.instagramAutomations.list.invalidate(),
    onError,
  });

  const handleSave = () => {
    if (!keyword.trim() || !replyMessage.trim()) return;
    save.mutate({
      keyword: keyword.trim(),
      triggerSource,
      replyMessage: replyMessage.trim(),
      discount: withDiscount ? {
        discountType,
        discountValue,
        maxUses: maxUses ? Number(maxUses) : undefined,
        validUntil: validUntil || undefined,
      } : undefined,
    });
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" /> Automatizaciones por palabra clave</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Cuando alguien comenta o responde a una historia con la palabra que definas acá, le llega automático el DM que
          configures -- un link, un mensaje, o un código de descuento. Las de "comentario" están listas en el código pero
          no van a hacer nada hasta que Meta apruebe un permiso nuevo que el dueño tiene que pedir en su panel.
        </p>

        {(automations ?? []).map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-4 rounded-2xl border p-3">
            <div className="text-sm min-w-0">
              <p className="font-medium">"{a.keyword}"</p>
              <p className="text-muted-foreground text-xs">{TRIGGER_LABEL[a.triggerSource]}</p>
              <p className="text-muted-foreground text-xs mt-1 whitespace-pre-wrap break-words">{a.replyMessage}</p>
              {a.discountCode && <p className="text-xs mt-1">Código: <span className="font-mono">{a.discountCode}</span></p>}
              <p className="text-muted-foreground text-xs mt-1">{a.redemptions} persona{a.redemptions === 1 ? '' : 's'} ya lo recibió</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                checked={a.active === 1}
                onCheckedChange={(on) => setActive.mutate({ id: a.id, active: on })}
              />
              <Button
                variant="ghost" size="sm" className="text-destructive"
                onClick={() => { if (window.confirm(`¿Eliminar la automatización de "${a.keyword}"?`)) remove.mutate({ id: a.id }); }}
              >
                Eliminar
              </Button>
            </div>
          </div>
        ))}

        {!showForm ? (
          <Button variant="outline" onClick={() => setShowForm(true)}>+ Nueva automatización</Button>
        ) : (
          <div className="space-y-3 rounded-2xl border p-4">
            <div>
              <Label>Palabra clave</Label>
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Ej: disfraz" className="mt-1" />
            </div>
            <div>
              <Label>¿Dónde aplica?</Label>
              <Select value={triggerSource} onValueChange={(v) => setTriggerSource(v as typeof triggerSource)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="story_reply">Respuesta a historia</SelectItem>
                  <SelectItem value="comment">Comentario (⏳ pendiente de permiso de Meta)</SelectItem>
                  <SelectItem value="both">Las dos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mensaje que le llega</Label>
              <Textarea
                rows={4}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder='Escribe lo que le quieres mandar: puede ser un link a un artículo, el texto de un premio, o cualquier mensaje. Si además le agregas un código de descuento abajo, usa {{codigo}} donde quieras que aparezca.'
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-2xl border p-3">
              <div className="text-sm">
                <p className="font-medium">¿Esta automatización también regala un código de descuento?</p>
                <p className="text-muted-foreground text-xs">Apagado por defecto -- muchas automatizaciones solo mandan un link o un mensaje.</p>
              </div>
              <Switch checked={withDiscount} onCheckedChange={setWithDiscount} />
            </div>

            {withDiscount && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as typeof discountType)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Porcentaje</SelectItem>
                      <SelectItem value="fixed">Monto fijo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor</Label>
                  <Input type="number" min={1} value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} className="mt-1" />
                </div>
                <div>
                  <Label>Tope de usos (opcional)</Label>
                  <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Vence el (opcional)</Label>
                  <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-1" />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <WriteButton onClick={handleSave} disabled={save.isPending || !keyword.trim() || !replyMessage.trim()}>
                {save.isPending ? 'Guardando...' : 'Guardar'}
              </WriteButton>
              <Button variant="ghost" onClick={resetForm}>Cancelar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
