# 1ooo — WebGPU Hybrid Voxel-Action Engine

[![Build & Test](https://github.com/muxd22-alt/1ooo/actions/workflows/ci.yml/badge.svg)](https://github.com/muxd22-alt/1ooo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-r186%20(WebGPU)-black)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF)](https://vitejs.dev/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-WebAssembly-blue)](https://onnxruntime.ai/)

**1ooo** is an open-source, high-performance browser-based 3D hybrid voxel-action engine. Built on **Three.js (r186) WebGPU**, **Web Worker Greedy Meshing**, a **4-slot Modular Gunsmith System**, and an **In-Browser Edge AI Pipeline (Laya ONNX)**, `1ooo` delivers real-time destructible voxel environments with zero-install accessibility.

Live build: https://muxd22-alt.github.io/1ooo/

---

## Key Features

* **Round Planet World:** A seeded `192³` voxel planet (radius 64) with **radial gravity** — no map edges, you can walk the full globe and never fall off. The spherical city is laid out on meridian/parallel road corridors (every 45°), split into **16 cells × 9 plots × 12 districts** (downtown towers, rowhouses, parks, plazas, parking…), with sidewalk lamp posts, neon signs and fountains. Generation is analytic per-voxel (no chunk seams at all) and verified by `scripts/planet.test.mjs`.
* **Per-Seed Color Themes:** `makeTheme(seed)` deterministically derives the whole palette from the seed — HSL-jittered nature/structure hues, emissive lamp/neon glow, sky/dusk/moon/sun/hemisphere colors — so every world has its own identity (the "recolor trick"). Same seed → same theme on client and worker.
* **Rounded Voxel Shading:** The worker meshes 48³ sub-chunks with a 1-voxel halo, baking **per-vertex ambient occlusion** and **smooth normals** for soft, rounded planet curvature (AO multiplies albedo only, never emissive).
* **Responsive FPS Movement:** `PlanetControls` gives 1:1 responsive FPS movement — raw mouse input, instant ground velocity, sprint (Shift), jump (Space), step-up/step-down traversal, air control and a fly toggle (F) — all in a rotating radial-gravity frame.
* **Day/Night Cycle & Street Lights:** A 3-minute sunrise→noon→dusk→midnight cycle drives sun/moon position, sky, fog and a TSL `nightGlow` uniform — lamp posts, neon signs and glass windows are emissive voxel materials that light up the planet after dark (`?phase=0.75` starts at midnight).
* **WebGPU Voxel Renderer & Worker Greedy Mesher:** Offloads chunk mesh generation to non-blocking Web Workers using greedy meshing, combined with Three Shader Language (TSL) node materials. Automatic WebGL2 fallback when no WebGPU adapter is available.
* **CSG Voxel Destruction:** Real-time spherical voxel subtraction (`subtractSphere`) driven by DDA raycasting over the full world — shots carve craters and re-mesh only the affected chunks in the worker.
* **Modular Gunsmith System:** 4-slot weapon assembly framework (Receiver, Barrel, Grip, Magazine) with deterministic attribute aggregation, weight clamping, and recoil impulse vector scaling. 10 parts, 28/36 valid assemblies, JSON-Schema validated.
* **Laya ONNX Edge AI (Web Worker):** Executes a quantized INT8 neural network (`onnxruntime-web` over WASM) off-thread to analyze 10 Hz player telemetry vectors (aim sigma, APM, movement variance) into tactical logits — AGGRESSIVE / HARVESTER / CAMPER — driving atmosphere and director state.
* **Deterministic Seeding:** Planet generation and its color theme are seeded (`?seed=1337` or `R` to reseed) and reproducible across client and CI (reference-tested mesher output). Without a `?seed=` parameter the game draws a crypto-random seed and opens a neon boot menu (reroll, weapon pick, deploy); with `?seed=` it boots straight into the world.
* **First-Person Viewmodel:** GLB gun models (AR / SMG / DMR) with recoil sway, kick animation, sparkle eject and a star-shaped muzzle flash with a brief muzzle light — all themed per-seed by the vibe palette.
* **Rounded Terrain & Raised Sidewalks:** Open ground snaps to the planet's analytic sphere (`R + 0.6 m` shell) so earth, roads and curbs read as continuous surfaces instead of voxel stairs — 5.5 m smoothing taps (bisected to 0.06 m) pass through trees, lamps, fences and buildings to read the true ground and take over only where terrain has been edited, so craters heal softly while canopies and lamp posts never sag. A smoothstep sidewalk rise (~0.16 m above the road with a 0.7 m fade) keeps curbs as one continuous curve.
* **GLB Building Models:** 35 CC0 commercial city-kit models (`skyscraper`, `building`, `low-detail-building` families) are loaded once, cached, and placed as `InstancedMesh` batches — position, yaw and uniform scale computed from per-plot math on the sphere (east/up/north basis at plot center, bbox-fit scale, ground-origin translate). Neon sign quads are emitted onto the actual oriented wall extents of each placed model.
* **Scattered Grass:** Seeded grass tufts (`grassScatter.js`) instanced along walkable ground, tinted from the theme nature palette.
* **Seeded Traffic Signals:** 48 signal poles at the 24 intersections, each intersection phase derived from the seed hash with a 7.6 s green/amber/red cycle per axis.
* **Blocky Clouds & Light Shafts:** A drifting field of flat-white blocky cloud clusters acts as the visible light source for 9 sun shafts and 9 ground light pools anchored to the surface.
* **Seed-Color Tracers & Muzzle Physics Feel:** Each shot fires a pooled tracer tinted from the seed's neon palette with per-shot jitter, fading over its lifetime.
* **Laya Atmosphere Driver:** The ONNX director's intents now steer `neon / shaft / drama / tracer` atmosphere scalars on top of fog/sky/sun — `drama` also drives a cinematic vignette, and night amplifies neon glow and emissive spill pools.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser Client                        │
├────────────────────┬─────────────────────┬───────────────────┤
│  WebGPU Renderer   │  Mesher Worker      │  Laya AI Worker   │
│  • three/webgpu    │  • planet gen       │  • INT8 ONNX      │
│  • TSL material    │  • halo greedy mesh │  • 10 Hz telemetry│
│  • WebGL2 fallback │    (AO + smooth)    │  • intent logits  │
│  • day/night cycle │  • DDA raycast +    │    → atmosphere   │
│  • radial gravity  │    subtractSphere   │                   │
└────────────────────┴─────────────────────┴───────────────────┘
              ▲ build/shoot msgs          ▲ INFER_TELEMETRY
              │ BufferGeometry replies    │ INTENT_RESULT
        ┌─────┴───────────────────────────────┴─────┐
        │        main.js orchestrator + HUD         │
        └───────────────────────────────────────────┘
```

All heavy work runs off the main thread: chunk meshing and CSG destruction in one worker, ONNX inference in another. The renderer main thread only swaps incoming `BufferGeometry` and interpolates atmosphere.

---

## Tech Stack

| Domain | Technology | Description |
| :--- | :--- | :--- |
| **Graphics** | `Three.js r186` / `WebGPURenderer` | WebGPU rendering pipeline with TSL materials, WebGL2 fallback. |
| **Build System** | `Vite 8` | ESM bundling, module workers, COOP/COEP headers for isolated WASM threads. |
| **Meshing** | `Web Workers` | Parallelized greedy meshing of `48³` sub-chunks (halo-extracted for seam-free AO/smooth normals) over a `192³` planet, per-vertex emissive attributes. |
| **Edge AI** | `onnxruntime-web` | Quantized (INT8) ONNX session running over WASM in a dedicated worker. |
| **Testing** | `Node scripts` + `CDP` | Unit tests (mesher/theme/planet/voxelops/weapon/telemetry) and Chrome DevTools Protocol smoke testing. |
| **Deployment** | `GitHub Actions` → `GitHub Pages` | CI runs test + smoke + build on every push; Pages deploys `dist/` automatically. |

---

## Quickstart & Installation

### Prerequisites

* **Node.js**: v22.x (v20.19+ also works with Vite 8)
* **Browser**: Chrome / Edge — WebGPU recommended (`chrome://flags/#enable-unsafe-webgpu` on older builds); WebGL2 fallback otherwise

### Installation

```bash
# Clone the repository
git clone https://github.com/muxd22-alt/1ooo.git
cd 1ooo

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## Testing & Verification

Run the test suite to verify unit logic, weapon math, and headless browser navigation:

```bash
# Run unit tests (mesher, theme, planet, voxel destruction, weapon aggregation, telemetry/director)
npm test

# Run CDP headless Chrome smoke test (CDP port 9233 / app port 5310)
npm run smoke

# WASD movement test over CDP (CDP port 9235 / app port 5312)
node scripts/keys.test.mjs

# Headless diagnostic (renderer backend + HUD state, no assertions)
npm run diag

# Validate production build
npm run build

# Capture the visual regression screenshot suite (14 day shots; MENU=1 for the boot menu, NIGHT=1 for the night trio, ONLY=<name> for one shot, SEED=<n> for a specific seed)
node scripts/shot.mjs

# Numeric scene probes over CDP (road/sidewalk radii + block ids, camera rays, city instance/sign placement dbg)
node scripts/probe.mjs

# Regenerate the Laya ONNX model + reference logits (needs Python + onnx/onnxruntime)
npm run gen:model
```

The smoke test boots Vite + headless Chrome over CDP and asserts: renderer ready, planet radial bounds (player glued to the surface in gravity mode), a shot that removes voxels, a live Laya inference, and per-intent logits matching `data/laya-reference.json` within tolerance.

---

## Modular Weapon Schema Example

Weapons are dynamically assembled from JSON definitions (`data/weapon-parts.json`) conforming to the 4-slot schema (`schema/modular-weapon-part.schema.json`):

```json
{
  "partId": "part_carbine_barrel_v1",
  "slotType": "barrel",
  "weightClass": 1.2,
  "compatibilityTags": ["standard_receiver"],
  "baseAttributes": {
    "thermalMass": 15.0,
    "durability": 95.0
  },
  "statModifiers": {
    "damageFlat": 12.0,
    "damageScalar": 1.05,
    "fireRateRPM": 150,
    "recoilImpulseVertical": 0.3,
    "recoilImpulseHorizontal": 0.1,
    "voxelDestructionRadius": 1.5
  }
}
```

Aggregation rules: damage = flat sum x scalar product; RPM/weight/recoil/radius all clamped; recoil scaled by `1 / (1 + weight x 0.15)`.

---

## Controls

| Input | Action |
| :--- | :--- |
| Click canvas | Capture mouse (pointer lock) |
| `WASD` | Move (sprint with `Shift`) |
| `Space` | Jump |
| `F` | Toggle fly mode (`Shift` descends) |
| `LMB` | Fire (RPM-gated) |
| `E` | Harvest voxel into carry (hold to repeat, max 10) |
| `Q` | Place selected voxel against the aimed face |
| `X` | Cycle selected carry material |
| `1` – `3` | Loadout preset (seed-driven identity & parts) |
| `R` | Reseed world (new city, theme, loadout) |

---

## Roadmap

- [x] **Phase 1: Renderer & Meshing** — WebGPU render loop, Web Worker greedy meshing, DDA voxel destruction.
- [x] **Phase 2: Gunsmith & Edge AI** — 4-slot weapon aggregation, Laya ONNX worker pipeline, HUD telemetry.
- [x] **Phase 3: CI & Deployment** — GitHub Actions (test + smoke + build) and GitHub Pages auto-deploy.
- [x] **Phase 4: Planet World** — radial-gravity spherical city (meridian roads, 12 districts, no seams), per-seed color themes, AO/smooth shading, day/night cycle with emissive street lights.
- [x] **Phase 5: Smooth Earth & GLB City** — analytic sphere snap with edit-aware 5.5 m tap smoothing (staircase-free earth, roads and curbs, craters heal softly, structures never sag), CC0 GLB building models instanced by spherical placement math with wall-mounted neon signs.
- [ ] **Phase 6: Physics & Colliders** — Rapier3D trimesh/compound-cuboid colliders derived from worker mesher output (rebuilt per re-mesh, not per shot).

---

## License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.
