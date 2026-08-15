type UmamiTracker = (event: string, data?: Record<string, string | number | boolean>) => void;

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export function trackConversion(event: string, data?: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof window.umami === 'function') {
      window.umami(event, data);
    }
  } catch {
    // Analytics must never block navigation, checkout or payment actions.
  }
}
