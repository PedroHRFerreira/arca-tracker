import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateControlSummary, createControlState, localDateString } from '@arca/domain';
import { dispatchControlCommand, loadControlBundle, subscribeControl, withControlLock, type ControlBundle, type ControlMutation } from '@/db/control';
import { syncControl, refreshControlBanks, resolveControlConflict, getControlServiceStatus } from '@/api/control';
import { financeErrorMessage } from '@/financeValidation';

export function useControl() {
  const [bundle, setBundle] = useState<ControlBundle>(() => { const state = createControlState(); return { state, base: state, pending: [], conflict: null, lastSyncAt: null, restorePending: false }; });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hadConflict = useRef(false);
  const reload = useCallback(async () => { try {
    const next = await withControlLock(loadControlBundle);
    setBundle(next);
    if (hadConflict.current && !next.conflict) setError(null);
    hadConflict.current = !!next.conflict;
    setReady(true);
  } catch { setError('Não foi possível abrir o controle financeiro. Seus registros foram preservados.'); } }, []);
  useEffect(() => { void reload(); return subscribeControl(() => { void reload(); }); }, [reload]);
  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setBusy(true); setError(null);
    try { const result = await operation(); await reload(); return result; }
    catch (cause) { setError(financeErrorMessage(cause, 'Não foi possível concluir. Tente novamente.')); throw cause; }
    finally { setBusy(false); }
  }, [reload]);
  const save = useCallback((mutation: ControlMutation) => run(() => dispatchControlCommand(mutation)), [run]);
  const sync = useCallback(() => run(syncControl), [run]);
  const refreshBanks = useCallback(() => run(refreshControlBanks), [run]);
  const resolveConflict = useCallback((choice: 'REMOTE' | 'LOCAL') => run(() => resolveControlConflict(choice)), [run]);
  const summary = useMemo(() => calculateControlSummary(bundle.state, localDateString()), [bundle]);
  return { ...bundle, ready, busy, error, summary, save, sync, refreshBanks, resolveConflict, reload, serviceStatus: getControlServiceStatus() };
}
