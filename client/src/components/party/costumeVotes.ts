import { useCallback } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

/* «Mejor disfraz» (aniversario Halloween): a quién votó esta persona y cuántos votos le quedan.
 * Los votos los ve solo el staff (ranking en el admin); acá solo se sabe los propios. */
export type CostumeVoting = {
  votedIds: Set<number>;
  votesLeft: number;
  toggle: (profileId: number, alias: string) => void;
};

export function useCostumeVotes(ticketCode: string, enabled: boolean): CostumeVoting {
  const utils = trpc.useUtils();
  const mine = trpc.party.myCostumeVotes.useQuery({ ticketCode }, { enabled });
  const vote = trpc.party.voteCostume.useMutation({ onError: (e) => toast.error(e.message) });
  const toggle = useCallback((profileId: number, alias: string) => {
    vote.mutate({ ticketCode, targetProfileId: profileId }, {
      onSuccess: (res) => {
        utils.party.myCostumeVotes.invalidate();
        toast.success(res.voted ? `Votaste por el disfraz de ${alias} 🏆 · te quedan ${res.votesLeft}` : 'Quitaste tu voto');
      },
    });
  }, [vote, ticketCode, utils]);
  return { votedIds: new Set(mine.data?.votedIds ?? []), votesLeft: mine.data?.votesLeft ?? 0, toggle };
}
