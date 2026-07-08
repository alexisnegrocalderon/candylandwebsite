import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRoute, useSearch } from 'wouter';
import { ArrowLeft, Tag, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Checkout() {
  const [, params] = useRoute('/checkout/:eventSlug');
  const eventSlug = params?.eventSlug ?? '';
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const itemsParam = searchParams.get('items') || '';

  const { data: event } = trpc.events.getBySlug.useQuery({ slug: eventSlug });
  const { data: ticketTypesData } = trpc.events.getTicketTypes.useQuery({ slug: eventSlug });

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    discountCode: '',
    ambassadorCode: '',
  });
  const [discountApplied, setDiscountApplied] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [discountError, setDiscountError] = useState('');

  const validateDiscount = trpc.orders.validateDiscount.useMutation();
  const createOrder = trpc.orders.create.useMutation();

  // Parse items from URL
  const items = itemsParam.split(',').filter(Boolean).map((item) => {
    const [id, qty] = item.split(':');
    return { ticketTypeId: Number(id), quantity: Number(qty) };
  });

  const ticketTypes = ticketTypesData ?? [];

  const subtotal = items.reduce((sum, item) => {
    const tt = ticketTypes.find((t: any) => t.id === item.ticketTypeId);
    return sum + (tt ? Number(tt.price) * item.quantity : 0);
  }, 0);

  const discountAmount = discountApplied
    ? discountApplied.discountType === 'percentage'
      ? Math.round(subtotal * Number(discountApplied.discountValue) / 100)
      : Number(discountApplied.discountValue)
    : 0;

  const total = Math.max(0, subtotal - discountAmount);

  const handleApplyDiscount = async () => {
    if (!form.discountCode.trim()) return;
    setDiscountError('');
    try {
      const result = await validateDiscount.mutateAsync({
        code: form.discountCode,
        eventId: event?.id ?? 0,
      });
      if (result.valid) {
        setDiscountApplied(result.discount);
      } else {
        setDiscountError(result.message || 'Código inválido');
      }
    } catch {
      setDiscountError('Error al validar el código');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setIsProcessing(true);
    try {
      const result = await createOrder.mutateAsync({
        eventSlug,
        buyerName: form.name,
        buyerEmail: form.email,
        buyerPhone: form.phone,
        items,
        discountCode: form.discountCode || undefined,
        ambassadorCode: form.ambassadorCode || undefined,
      });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err: any) {
      setIsProcessing(false);
      alert(err.message || 'Error al procesar la orden');
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container max-w-4xl">
        <Link href={`/eventos/${eventSlug}`} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 interactive">
          <ArrowLeft className="w-4 h-4" /> Volver al evento
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-2">Checkout</h1>
          {event && <p className="text-muted-foreground text-lg mb-8">{event.title}</p>}
        </motion.div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-3 space-y-6"
          >
            <div className="bg-card border border-border/50 rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-4">Datos del comprador</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Nombre completo *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="mt-1"
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="mt-1"
                    placeholder="tu@email.com"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1"
                    placeholder="+56 9 1234 5678"
                  />
                </div>
              </div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-4">Códigos</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="discount">Código de descuento</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="discount"
                      value={form.discountCode}
                      onChange={(e) => setForm({ ...form, discountCode: e.target.value.toUpperCase() })}
                      placeholder="CODIGO2024"
                      disabled={!!discountApplied}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleApplyDiscount}
                      disabled={!!discountApplied || !form.discountCode}
                      className="interactive"
                    >
                      <Tag className="w-4 h-4" />
                    </Button>
                  </div>
                  {discountApplied && (
                    <p className="text-sm text-green-400 mt-1">
                      Descuento aplicado: {discountApplied.discountType === 'percentage' ? `${discountApplied.discountValue}%` : `$${Number(discountApplied.discountValue).toLocaleString('es-CL')}`}
                    </p>
                  )}
                  {discountError && <p className="text-sm text-destructive mt-1">{discountError}</p>}
                </div>
                <div>
                  <Label htmlFor="ambassador">Código de embajador (referido)</Label>
                  <Input
                    id="ambassador"
                    value={form.ambassadorCode}
                    onChange={(e) => setForm({ ...form, ambassadorCode: e.target.value.toUpperCase() })}
                    className="mt-1"
                    placeholder="Código de quien te invitó"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="lg:col-span-2"
          >
            <div className="sticky top-24 bg-card border border-border/50 rounded-2xl p-6">
              <h3 className="font-semibold text-lg mb-4">Resumen</h3>
              <div className="space-y-3 mb-4">
                {items.map((item) => {
                  const tt = ticketTypes.find((t: any) => t.id === item.ticketTypeId);
                  if (!tt) return null;
                  return (
                    <div key={item.ticketTypeId} className="flex justify-between text-sm">
                      <span>{item.quantity}x {tt.name}</span>
                      <span>${(Number(tt.price) * item.quantity).toLocaleString('es-CL')}</span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border/50 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${subtotal.toLocaleString('es-CL')}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-400">
                    <span>Descuento</span>
                    <span>-${discountAmount.toLocaleString('es-CL')}</span>
                  </div>
                )}
                <div className="flex justify-between font-heading text-xl pt-2 border-t border-border/50">
                  <span>Total</span>
                  <span className="text-gradient">${total.toLocaleString('es-CL')}</span>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isProcessing || !form.name || !form.email || items.length === 0}
                className="w-full h-12 rounded-full text-lg font-semibold mt-6 glow-pink interactive"
              >
                {isProcessing ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Procesando...</>
                ) : (
                  'Pagar con Mercado Pago'
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-3">
                Pago seguro procesado por Mercado Pago
              </p>
            </div>
          </motion.div>
        </form>
      </div>
    </div>
  );
}
