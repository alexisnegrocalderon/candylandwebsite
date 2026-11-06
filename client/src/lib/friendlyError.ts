/** Los errores de validación del servidor llegan como un JSON ([{ "code": …, "message": … }]): se muestra solo lo que
 * dice cada mensaje, en criollo, en vez del JSON crudo. */
export function friendlyMessage(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const messages = list.map((e) => (e && typeof e === "object" && typeof (e as any).message === "string" ? (e as any).message : null)).filter((m): m is string => !!m);
    return messages.length > 0 ? Array.from(new Set(messages)).join("\n") : raw;
  } catch {
    return raw;
  }
}

