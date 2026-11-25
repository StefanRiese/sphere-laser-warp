import { type WarpParams, warp } from '../core/warp';

export interface WorkerRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  params: WarpParams;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, width, height, buffer, params } = e.data;
  const res = warp({ data: new Uint8ClampedArray(buffer), width, height }, params);
  const out = res.data.buffer as ArrayBuffer;
  (self as unknown as Worker).postMessage({ id, ...res, data: undefined, buffer: out }, [out]);
};
