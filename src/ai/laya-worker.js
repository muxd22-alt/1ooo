import * as ort from 'onnxruntime-web/wasm';
import wasmGlueUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import wasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

let session = null;

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'INIT') {
    try {
      ort.env.wasm.numThreads = self.crossOriginIsolated ? 2 : 1;
      ort.env.wasm.wasmPaths = { mjs: wasmGlueUrl, wasm: wasmBinaryUrl };
      session = await ort.InferenceSession.create(payload.modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });
      self.postMessage({ type: 'READY' });
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: String(err?.message ?? err) });
    }
    return;
  }

  if (type === 'INFER_TELEMETRY' && session) {
    try {
      const features = new Float32Array(payload.telemetryBuffer);
      const inputTensor = new ort.Tensor('float32', features, [1, features.length]);

      const startTime = performance.now();
      const results = await session.run({ telemetry_input: inputTensor });
      const latencyMs = performance.now() - startTime;

      const logits = Array.from(results.action_logits.data);
      self.postMessage({ type: 'INTENT_RESULT', logits, latencyMs });
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: String(err?.message ?? err) });
    }
  }
};
