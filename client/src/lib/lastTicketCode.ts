/** Clave de localStorage donde Ticket.tsx y Party.tsx guardan el último
 * ticketCode válido que este celular abrió -- así /playmatch puede saltarse
 * el formulario de "pegar código" y entrar directo. */
export const LAST_TICKET_CODE_KEY = 'mp_last_ticket_code';

export function rememberTicketCode(ticketCode: string) {
  try {
    localStorage.setItem(LAST_TICKET_CODE_KEY, ticketCode);
  } catch {
    // Storage puede fallar en modo privado -- no es crítico, solo se pierde el atajo.
  }
}
