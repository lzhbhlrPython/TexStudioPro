import { useEffect, useState } from 'react';

/** Debounced native previews; late replies and rejected IPC calls never escape the tool. */
export function useDiagramPreview(open: boolean, projectRoot: string | null, filePath: string | null, source: string) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setPreview(null);
    setError('');
    if (!open || !projectRoot || !filePath || !source.trim()) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await window.texpro.renderTikz({ projectRoot, filePath, source });
        if (cancelled) return;
        if (!result.ok || !result.svgPath) throw new Error(result.error || 'Preview failed');
        setPreview(result.svgPath);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 650);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, projectRoot, filePath, source, attempt]);

  return { preview, error, busy, retry: () => setAttempt((value) => value + 1) };
}
