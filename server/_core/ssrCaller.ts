import type { Request, Response } from 'express';
import { appRouter } from '../routers';
import { createContext } from './context';
import type { SsrPrefetch } from '../../client/src/ssr/prefetch';

/**
 * SSR uses the existing tRPC router in-process. Only public read procedures
 * are exposed here; mutations, admin reads and operational data stay out of
 * the HTML render path.
 */
export async function buildSsrPrefetch(req: Request, res: Response): Promise<SsrPrefetch> {
  const ctx = await createContext({ req, res } as any);
  const caller = appRouter.createCaller(ctx);
  return {
    listForHome: () => caller.events.listForHome(),
    listPublished: () => caller.events.listPublished(),
    eventBySlug: (input) => caller.events.getBySlug(input),
    ticketTypes: (input) => caller.events.getTicketTypes(input),
    pendingMission: (input) => caller.mission300.pendingPersonas(input),
    settingsGet: () => caller.settings.get(),
  };
}
