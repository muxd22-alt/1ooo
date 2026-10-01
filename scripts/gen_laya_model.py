import json
import os
import sys

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper, numpy_helper
from onnxruntime.quantization import QuantType, quantize_dynamic

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(ROOT, "public", "models")
FP32_PATH = os.path.join(MODELS_DIR, "laya_tactical_fp32.onnx")
INT8_PATH = os.path.join(MODELS_DIR, "laya_tactical_int8.onnx")
REFERENCE_PATH = os.path.join(ROOT, "data", "laya-reference.json")

INPUT_NAME = "telemetry_input"
OUTPUT_NAME = "action_logits"
FEATURES = ["sigma_aim", "apm", "var_v", "tau_mine_ratio", "elev_bias", "crouch_freq"]
INTENTS = ["AGGRESSIVE", "HARVESTER", "CAMPER"]
SEED = 1337
HIDDEN = 16
OPSET = 13
IR_VERSION = 10

TEACHER_W2 = np.array(
    [
        [2.0, -0.5, -0.4],
        [0.15, -0.1, -0.05],
        [0.5, -0.2, -0.4],
        [-0.3, 1.5, -0.3],
        [-0.4, -0.2, 1.8],
        [-0.2, -0.1, -0.1],
    ],
    dtype=np.float32,
)
TEACHER_B2 = np.array([0.3, 0.0, -0.2], dtype=np.float32)

SAMPLES = [
    [3.5, 120.0, 1.8, 0.2, 0.4, 0.0],
    [0.4, 15.0, 0.3, 4.0, 0.3, 0.0],
    [0.2, 4.0, 0.05, 0.1, 0.9, 0.0],
    [1.0, 50.0, 0.8, 1.0, 0.5, 0.0],
]


def synth_batch(rng, count):
    return np.stack(
        [
            rng.uniform(0.0, 4.0, 6) * np.array([1.0, 35.0, 0.7, 1.3, 0.27, 0.0])
            for _ in range(count)
        ]
    ).astype(np.float32)


def teacher_logits(x):
    hidden = np.maximum(x, 0.0)
    return hidden @ TEACHER_W2 + TEACHER_B2


def init_weights(rng):
    w1 = np.zeros((6, HIDDEN), dtype=np.float32)
    w1[:6, :6] = np.eye(6, dtype=np.float32)
    w1 += rng.normal(0.0, 0.01, w1.shape).astype(np.float32)
    b1 = rng.normal(0.0, 0.01, HIDDEN).astype(np.float32)
    w2 = np.zeros((HIDDEN, 3), dtype=np.float32)
    w2[:6, :] = TEACHER_W2
    w2 += rng.normal(0.0, 0.01, w2.shape).astype(np.float32)
    b2 = TEACHER_B2.copy()
    return w1, b1, w2, b2


def forward(x, w1, b1, w2, b2):
    h_pre = x @ w1 + b1
    h = np.maximum(h_pre, 0.0)
    out = h @ w2 + b2
    return h_pre, h, out


def train(seed):
    rng = np.random.default_rng(seed)
    w1, b1, w2, b2 = init_weights(rng)
    batch = synth_batch(rng, 512)
    target = teacher_logits(batch)
    lr = 0.002
    initial = float(np.mean((forward(batch, w1, b1, w2, b2)[2] - target) ** 2))
    loss = initial
    for step in range(400):
        h_pre, h, out = forward(batch, w1, b1, w2, b2)
        diff = out - target
        loss = float(np.mean(diff**2))
        grad_out = 2.0 * diff / diff.size
        gw2 = np.clip(h.T @ grad_out, -1.0, 1.0)
        gb2 = np.clip(grad_out.sum(axis=0), -1.0, 1.0)
        gh = grad_out @ w2.T
        gh_pre = gh * (h_pre > 0.0)
        gw1 = np.clip(batch.T @ gh_pre, -1.0, 1.0)
        gb1 = np.clip(gh_pre.sum(axis=0), -1.0, 1.0)
        w1 -= lr * gw1
        b1 -= lr * gb1
        w2 -= lr * gw2
        b2 -= lr * gb2
    if not (loss < initial):
        raise RuntimeError(f"training diverged: initial={initial:.6f} final={loss:.6f}")
    return w1, b1, w2, b2, initial, loss


def build_model(w1, b1, w2, b2):
    initializers = [
        numpy_helper.from_array(w1, "W1"),
        numpy_helper.from_array(b1, "B1"),
        numpy_helper.from_array(w2, "W2"),
        numpy_helper.from_array(b2, "B2"),
    ]
    nodes = [
        helper.make_node("MatMul", [INPUT_NAME, "W1"], ["h1_pre"]),
        helper.make_node("Add", ["h1_pre", "B1"], ["h1_bias"]),
        helper.make_node("Relu", ["h1_bias"], ["h1"]),
        helper.make_node("MatMul", ["h1", "W2"], ["h2_pre"]),
        helper.make_node("Add", ["h2_pre", "B2"], [OUTPUT_NAME]),
    ]
    graph = helper.make_graph(
        nodes,
        "laya_tactical",
        [helper.make_tensor_value_info(INPUT_NAME, TensorProto.FLOAT, [1, 6])],
        [helper.make_tensor_value_info(OUTPUT_NAME, TensorProto.FLOAT, [1, 3])],
        initializer=initializers,
    )
    model = helper.make_model(
        graph,
        producer_name="laya-micro-finetune",
        opset_imports=[helper.make_opsetid("", OPSET)],
    )
    model.ir_version = IR_VERSION
    onnx.checker.check_model(model)
    return model


def run_samples(path):
    session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
    results = []
    for features in SAMPLES:
        outputs = session.run(None, {INPUT_NAME: np.asarray([features], dtype=np.float32)})
        logits = [float(v) for v in outputs[0].reshape(-1)]
        intent = INTENTS[int(np.argmax(logits))]
        results.append({"features": features, "logits": logits, "intent": intent})
    return results


def main():
    os.makedirs(MODELS_DIR, exist_ok=True)

    w1, b1, w2, b2, initial, loss = train(SEED)
    print(f"distillation loss: {initial:.6f} -> {loss:.6f}")

    model = build_model(w1, b1, w2, b2)
    onnx.save(model, FP32_PATH)

    quantize_dynamic(FP32_PATH, INT8_PATH, weight_type=QuantType.QInt8)
    onnx.checker.check_model(INT8_PATH)

    samples = run_samples(INT8_PATH)
    intents_seen = {s["intent"] for s in samples}
    if intents_seen != set(INTENTS):
        print(f"WARNING: samples did not cover all intents: {intents_seen}")

    reference = {
        "model": "models/laya_tactical_int8.onnx",
        "inputName": INPUT_NAME,
        "outputName": OUTPUT_NAME,
        "features": FEATURES,
        "intents": INTENTS,
        "seed": SEED,
        "hidden": HIDDEN,
        "opset": OPSET,
        "tolerance": 0.05,
        "samples": samples,
    }
    with open(REFERENCE_PATH, "w", encoding="utf-8") as f:
        json.dump(reference, f, indent=2)

    print(f"fp32  {os.path.getsize(FP32_PATH)} bytes -> {FP32_PATH}")
    print(f"int8  {os.path.getsize(INT8_PATH)} bytes -> {INT8_PATH}")
    print(f"reference -> {REFERENCE_PATH}")
    for sample in samples:
        print(
            f"  {sample['intent']:<11} logits={[round(v, 4) for v in sample['logits']]} "
            f"features={sample['features']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
