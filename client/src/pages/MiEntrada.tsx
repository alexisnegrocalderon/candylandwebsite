import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { lastTicketCode } from '@/lib/customerPush';

/* Destino del aviso push "Hoy es la noche": abre la última entrada que se
 * abrió en ESTE teléfono (el aviso nunca lleva el código, ver
 * server/customerPush.ts). Sin entrada guardada, a la home. */
export default function MiEntrada() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const code = lastTicketCode();
    setLocation(code ? `/verificar/${code}` : '/', { replace: true });
  }, [setLocation]);
  return null;
}
