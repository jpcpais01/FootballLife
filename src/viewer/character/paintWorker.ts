// Paints character textures off the main thread.
import { runPaintJob, type PaintJob } from './paintJobs.ts';

self.onmessage = (e: MessageEvent<{ id: number; job: PaintJob }>) => {
  const { id, job } = e.data;
  try {
    const p = runPaintJob(job);
    (self as unknown as Worker).postMessage({ id, color: p.color, detail: p.detail }, [p.color.buffer, p.detail.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
