import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  CONCEPTS, FILES, CONCEPT_EDGES, FILE_EDGES, STEPS, DOMAINS, PR,
  CONCEPT_BY_ID, FILE_BY_ID,
} from "./data.js";

// ─── Layout positions ──────────────────────────────────────────────────────

// Hand-tuned concept positions (flow / execution-flow mode).
const POSITIONS_CONCEPT = {
  "schema-change": new THREE.Vector3( 0,  0,   0),
  "user-model":    new THREE.Vector3( 7,  1,  -2),
  "users-api":     new THREE.Vector3(13,  3,  -8),
  "billing-api":   new THREE.Vector3(13, -2,   6),
  "badge-ui":      new THREE.Vector3(20,  4, -12),
  "billing-test":  new THREE.Vector3(20, -4,  10),
};

// File positions (file-tree mode): one column per CONCEPT, files stacked
// vertically inside their concept column. This keeps related files visually
// clustered so the user can read each cluster as a unit.
function computeFilePositions() {
  const out = {};
  const cols = CONCEPTS.length;
  CONCEPTS.forEach((concept, colIdx) => {
    const x = (colIdx - (cols - 1) / 2) * 5.5;
    // Centre each column vertically based on its file count.
    const rows = concept.files.length;
    const yStart = (rows - 1) * 1.5;
    concept.files.forEach((fileId, rowIdx) => {
      out[fileId] = new THREE.Vector3(x, yStart - rowIdx * 3.0, 0);
    });
  });
  return out;
}
const POSITIONS_FILE = computeFilePositions();

// ─── Change-set sizing ─────────────────────────────────────────────────────

function changeSetSize(node) {
  return node.code
    ? node.code.reduce((n, l) => n + (l.type === "add" || l.type === "del" ? 1 : 0), 0)
    : node.files.reduce((n, fid) => n + changeSetSize(FILE_BY_ID[fid]), 0);
}
const conceptChanges = CONCEPTS.map(changeSetSize);
const fileChanges = FILES.map(changeSetSize);

function scaleFor(node, all) {
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const t = (changeSetSize(node) - min) / span;
  const s = 0.85 + t * 1.05;
  return node.isEpicenter ? Math.max(s, 1.4) : s;
}

// ─── Three.js setup ────────────────────────────────────────────────────────

const canvas = document.getElementById("gl");
const overlay = document.getElementById("overlay");
const stage = document.getElementById("stage");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const labelRenderer = new CSS2DRenderer({ element: overlay });
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.inset = "0";
labelRenderer.domElement.style.pointerEvents = "none";

const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.FogExp2(0x031814, 0.020);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 250);
camera.position.set(8, 10, 28);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(8, 0, 0);

// Monochrome phosphor palette — all 3D geometry uses this hue, with brightness
// and alpha doing the work of distinguishing state.
const PHOSPHOR = 0x5dffc4;

// Unlit materials, so no directional lights — light comes from the emission itself.
scene.add(new THREE.AmbientLight(0xffffff, 0.0)); // placeholder; effectively no lights

// Ambient point cloud — fills the void with floating data motes.
function buildAmbientPoints() {
  const N = 1400;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // Distribute in a flattened slab around the action volume.
    positions[i*3]     = (Math.random() - 0.5) * 110;
    positions[i*3 + 1] = (Math.random() - 0.5) * 36 + 2;
    positions[i*3 + 2] = (Math.random() - 0.5) * 110;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: PHOSPHOR,
    size: 0.07,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Points(geom, mat);
}
scene.add(buildAmbientPoints());

// ─── Node sets ─────────────────────────────────────────────────────────────

// Each node entry: { mesh, label, labelEl, ring?, node, kind, target, baseScale }

const conceptNodes = new Map();
const fileNodes = new Map();

// Each node is a single low-poly wireframe icosahedron — no inner solid.
// Phosphor, additive blending; opacity drives state.
// Subdivision 1 = 80 faces — sparse enough to read as a "wireframe sketch"
// without becoming a dense triangle mat.
const wireGeom = new THREE.IcosahedronGeometry(0.82, 1);

// Equatorial orbital ring rendered as a Line (always 1px) instead of a Mesh
// band — true hairline rather than a thick disk.
const ringPoints = [];
const RING_SEGMENTS = 128;
const RING_RADIUS = 1.55;
for (let i = 0; i <= RING_SEGMENTS; i++) {
  const a = (i / RING_SEGMENTS) * Math.PI * 2;
  ringPoints.push(new THREE.Vector3(Math.cos(a) * RING_RADIUS, Math.sin(a) * RING_RADIUS, 0));
}
const ringGeom = new THREE.BufferGeometry().setFromPoints(ringPoints);

function buildNode(node, kind, position, baseScale) {
  const domainKey = node.domain ?? CONCEPT_BY_ID[node.conceptId].domain;
  node.domain = domainKey;

  // Anchor group holds the node's position/scale. Labels, ring, and the
  // attached fragment card sit on the anchor so they stay still. The
  // wireframe mesh is a separate child that can rotate independently
  // without dragging anything else with it.
  const anchor = new THREE.Group();
  anchor.position.copy(position);
  anchor.scale.setScalar(baseScale);
  anchor.userData = { id: node.id, kind };
  scene.add(anchor);

  const wireMat = new THREE.MeshBasicMaterial({
    color: PHOSPHOR,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const wireMesh = new THREE.Mesh(wireGeom, wireMat);
  wireMesh.userData = { id: node.id, kind };
  anchor.add(wireMesh);

  // Concept nodes get a subtle dashed orbital ring → "this is a cluster".
  // Hairline Line (always 1px) lying in the horizontal plane; the dashes
  // appear to drift because the ring slowly spins around its own normal.
  let ring = null;
  if (kind === "concept") {
    const ringMat = new THREE.LineDashedMaterial({
      color: PHOSPHOR,
      transparent: true,
      opacity: 0.5,
      dashSize: 0.06,
      gapSize: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    ring = new THREE.Line(ringGeom, ringMat);
    ring.computeLineDistances(); // required for LineDashedMaterial
    ring.rotation.x = Math.PI / 2;       // lie flat in XZ plane
    ring.rotation.z = Math.random() * Math.PI * 2; // randomize start phase
    anchor.add(ring);
  }

  const labelEl = document.createElement("div");
  labelEl.className = `node-label ${kind}`;
  const changes = changeSetSize(node);
  const suffix = kind === "concept" && node.files
    ? ` · ${node.files.length}f / ${changes}△`
    : ` · ${changes}△`;
  labelEl.textContent = node.label + suffix;
  const label = new CSS2DObject(labelEl);
  // Label is anchored at its left-centre, so its rectangle hangs to the
  // RIGHT of the pole like a flag.
  label.center.set(0, 0.5);
  label.position.set(0, 1.7, 0);
  anchor.add(label);

  // Flag pole: thin phosphor line from sphere top to label height. No end
  // caps — the label's left edge is the visible terminator.
  const poleMat = new THREE.LineBasicMaterial({
    color: PHOSPHOR,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const poleGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.82, 0),
    new THREE.Vector3(0, 1.7, 0),
  ]);
  const pole = new THREE.Line(poleGeom, poleMat);
  anchor.add(pole);

  const spawnDelay = Math.random() * 0.9;

  return {
    mesh: anchor,
    wireMesh,
    ring, label, labelEl,
    wireMat,
    pole, poleMat,
    node, kind,
    target: position.clone(),    // layout target — spring pulls here
    dragTarget: null,            // set while user drags
    velocity: new THREE.Vector3(),
    baseScale,
    spawnDelay,
  };
}

for (const c of CONCEPTS) {
  const baseScale = scaleFor(c, conceptChanges);
  conceptNodes.set(c.id, buildNode(c, "concept", POSITIONS_CONCEPT[c.id], baseScale));
}

for (const f of FILES) {
  const baseScale = scaleFor(f, fileChanges) * 0.7; // files smaller than concepts
  fileNodes.set(f.id, buildNode(f, "file", POSITIONS_FILE[f.id], baseScale));
}

// ─── Edges ─────────────────────────────────────────────────────────────────

function curveBetween(a, b) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y += Math.max(0.5, a.distanceTo(b) * 0.18);
  return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
}

function buildEdges(spec, nodes) {
  const out = [];
  for (const e of spec) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (!a || !b) continue;
    const curve = curveBetween(a.mesh.position, b.mesh.position);
    const pts = curve.getPoints(40);
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: PHOSPHOR,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geom, mat);
    scene.add(line);
    out.push({ line, from: e.from, to: e.to, mat, geom, kind: e.kind, curve });
  }
  return out;
}

// Traveling particles along each edge → "execution traffic" pulses.
// Tuned small + slow + faint so they read as ambient flow, not "boxes".
const PARTICLES_PER_EDGE = 5;
const PARTICLE_SPEED = 0.06;   // t units per second
const PARTICLE_SIZE = 0.07;

function buildEdgeParticles(edges) {
  const total = edges.length * PARTICLES_PER_EDGE;
  const positions = new Float32Array(total * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const particles = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = 0; j < PARTICLES_PER_EDGE; j++) {
      particles.push({
        edgeIdx: i,
        t: j / PARTICLES_PER_EDGE + Math.random() * 0.02,
        idx: i * PARTICLES_PER_EDGE + j,
      });
    }
  }
  const mat = new THREE.PointsMaterial({
    color: PHOSPHOR,
    size: PARTICLE_SIZE,
    transparent: true,
    opacity: 0.0, // ramps based on edges' liveness
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geom, mat);
  scene.add(points);
  return { points, geom, mat, particles, positions, edges };
}

const conceptEdges = buildEdges(CONCEPT_EDGES, conceptNodes);
const fileEdges = buildEdges(FILE_EDGES, fileNodes);
const conceptParticles = buildEdgeParticles(conceptEdges);
const fileParticles = buildEdgeParticles(fileEdges);

// ─── State ─────────────────────────────────────────────────────────────────

const STEP_BY_CONCEPT = new Map(STEPS.map((s, i) => [s.conceptId, i]));
const activeDomains = new Set(Object.keys(DOMAINS));

const state = {
  mode: "flow",       // "flow" | "tree"
  stepIdx: 0,
  activeFileId: null, // which file's diff is shown in the card
};

// ─── Camera tween ──────────────────────────────────────────────────────────

const cameraTween = {
  fromPos: camera.position.clone(),
  toPos: camera.position.clone(),
  fromLook: new THREE.Vector3(8, 0, 0),
  toLook: new THREE.Vector3(8, 0, 0),
  t: 1,
  duration: 1.2,
};

function flyTo(focusPos, opts = {}) {
  const offset = opts.offset ?? new THREE.Vector3(5, 4, 9);
  cameraTween.fromPos.copy(camera.position);
  cameraTween.fromLook.copy(controls.target);
  cameraTween.toPos.copy(focusPos).add(offset);
  cameraTween.toLook.copy(focusPos);
  cameraTween.t = 0;
  cameraTween.duration = opts.duration ?? 1.1;
}

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ─── Mode switching ────────────────────────────────────────────────────────

function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  document.querySelectorAll(".toggle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.layout === mode);
  });
  recenter(1.5);
  showCardForCurrentStep();
}

// Panoramic frame of the active node set — flies the camera to look at the
// centroid from a layout-appropriate distance.
function recenter(duration = 1.1) {
  const nodes = activeNodes();
  const mid = new THREE.Vector3();
  for (const n of nodes.values()) mid.add(n.target);
  mid.divideScalar(nodes.size);
  const offset = state.mode === "tree"
    ? new THREE.Vector3(2, 0, 30)
    : new THREE.Vector3(6, 8, 30);
  flyTo(mid, { offset, duration });
}

function activeNodes() {
  return state.mode === "flow" ? conceptNodes : fileNodes;
}

// ─── Tour ──────────────────────────────────────────────────────────────────

function setStep(i, fileId = null) {
  state.stepIdx = (i + STEPS.length) % STEPS.length;
  const step = STEPS[state.stepIdx];
  const concept = CONCEPT_BY_ID[step.conceptId];
  state.activeFileId = fileId && concept.files.includes(fileId) ? fileId : concept.files[0];

  // camera: in flow, fly to concept node; in tree, fly to the active file node
  const focusObj = state.mode === "flow"
    ? conceptNodes.get(concept.id)
    : fileNodes.get(state.activeFileId);
  if (focusObj) {
    const offset = state.mode === "tree"
      ? new THREE.Vector3(3, 2, 11)
      : new THREE.Vector3(5, 4, 9);
    flyTo(focusObj.mesh.position, { offset });
  }

  // HUD + step list
  document.getElementById("step-num").textContent = String(state.stepIdx + 1);
  document.getElementById("step-title").textContent = step.title;
  document.getElementById("step-sub").textContent = step.sub;
  document.querySelectorAll(".step-row").forEach((el, idx) => {
    el.classList.toggle("active", idx === state.stepIdx);
  });

  showCardForCurrentStep();
}

function showCardForCurrentStep() {
  const step = STEPS[state.stepIdx];
  const concept = CONCEPT_BY_ID[step.conceptId];
  if (!state.activeFileId || !concept.files.includes(state.activeFileId)) {
    state.activeFileId = concept.files[0];
  }
  renderFragmentCard(concept, state.activeFileId, step.reason);
}

const nextStep = () => setStep(state.stepIdx + 1);
const prevStep = () => setStep(state.stepIdx - 1);

// ─── Fragment card ─────────────────────────────────────────────────────────

const TOK_CLASS = {
  kw: "tok-kw", fn: "tok-fn", str: "tok-str",
  num: "tok-num", cmt: "tok-cmt", type: "tok-type",
};

const escapeAttr = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderCode(lines) {
  return lines.map((line) => {
    const inner = (line.tokens ?? []).map(([kind, text]) => {
      const safe = escapeAttr(text);
      const cls = TOK_CLASS[kind];
      return cls ? `<span class="${cls}">${safe}</span>` : safe;
    }).join("");
    const prefix = line.type === "add" ? "+ " : line.type === "del" ? "- " : "  ";
    const body = `<span class="ln-prefix">${prefix}</span>${inner || " "}`;
    const cls = line.type === "add" ? "ln ln-add" : line.type === "del" ? "ln ln-del" : "ln";
    return `<div class="${cls}">${body}</div>`;
  }).join("");
}

let cardObj = null;
let cardAnchorMesh = null; // the mesh the current card is tethered to

function renderFragmentCard(concept, activeFileId, reasonHtml) {
  // Tear down previous card
  if (cardObj) {
    cardObj.element.remove();
    cardObj.parent?.remove(cardObj);
    cardObj = null;
  }

  const activeFile = FILE_BY_ID[activeFileId];
  const domain = DOMAINS[concept.domain];

  // The CSS2DObject anchor (positioned by CSS2DRenderer) wraps the card so
  // we can apply our own drag transform to .fragment-card freely.
  const anchor = document.createElement("div");
  anchor.className = "card-anchor";
  const wrap = document.createElement("div");
  wrap.className = "fragment-card";
  anchor.appendChild(wrap);

  const tabsHtml = concept.files.map((fid) => {
    const f = FILE_BY_ID[fid];
    const cls = fid === activeFileId ? "tab active" : "tab";
    return `<button class="${cls}" data-file="${fid}">${escapeAttr(f.label)} <span class="tab-changes">${changeSetSize(f)}△</span></button>`;
  }).join("");

  const showSummary = state.mode === "flow";

  wrap.innerHTML = `
    <div class="head">
      <span class="domain-pill" style="background:${domain.color}1f;color:${domain.color}">${domain.label}</span>
      <span class="concept-label">${escapeAttr(concept.label)}</span>
      ${concept.files.length > 1 ? `<span class="file-count">${concept.files.length} files</span>` : ""}
    </div>
    <button class="annotate-btn" title="Pin a note">📌</button>
    <div class="path">${escapeAttr(activeFile.path)}:${activeFile.line}</div>
    ${showSummary ? `<div class="reason">${reasonHtml}</div>` : ""}
    ${concept.files.length > 1 ? `<div class="file-tabs">${tabsHtml}</div>` : ""}
    <div class="code">${renderCode(activeFile.code)}</div>
    <div class="actions">
      <a class="primary" href="https://github.com/${PR.repo}/pull/${PR.number}/files#${activeFileId}" target="_blank" rel="noopener">View Full File on GitHub ↗</a>
      <button data-action="focus">Re-centre</button>
    </div>
  `;

  // Anchor the card to whichever node is shown in this mode.
  const anchorObj = state.mode === "flow"
    ? conceptNodes.get(concept.id)
    : fileNodes.get(activeFileId);

  // Tab click → swap active file (does NOT advance step)
  wrap.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeFileId = tab.dataset.file;
      // In tree mode, also fly the camera to the newly selected file
      if (state.mode === "tree") {
        const obj = fileNodes.get(state.activeFileId);
        if (obj) flyTo(obj.mesh.position, { offset: new THREE.Vector3(3, 2, 11) });
      }
      renderFragmentCard(concept, state.activeFileId, reasonHtml);
    });
  });

  wrap.querySelector('[data-action="focus"]').addEventListener("click", () => {
    if (anchorObj) flyTo(anchorObj.mesh.position);
  });

  wrap.querySelector(".annotate-btn").addEventListener("click", () => {
    addPin(anchorObj);
  });

  // Drag-by-header: the .head bar (domain pill, concept title, file count) acts
  // as the drag handle. Offsets are applied as CSS variables and reset on the
  // next renderFragmentCard call (i.e. when the step or active file changes).
  makeCardDraggable(wrap);

  const obj = new CSS2DObject(anchor);
  obj.position.set(1.2, 0, 0);
  anchorObj.mesh.add(obj);
  cardObj = obj;
  cardAnchorMesh = anchorObj.mesh;
}

function makeCardDraggable(cardEl) {
  const handle = cardEl.querySelector(".head");
  if (!handle) return;
  let dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0, dx = 0, dy = 0;
  handle.style.cursor = "grab";
  handle.style.touchAction = "none";

  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, a")) return;
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    handle.style.cursor = "grabbing";
    startX = e.clientX; startY = e.clientY;
    baseX = dx; baseY = dy;
    e.preventDefault();
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = baseX + (e.clientX - startX);
    dy = baseY + (e.clientY - startY);
    cardEl.style.setProperty("--drag-x", `${dx}px`);
    cardEl.style.setProperty("--drag-y", `${dy}px`);
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    handle.style.cursor = "grab";
    try { handle.releasePointerCapture(e.pointerId); } catch {}
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

// ─── Pins ──────────────────────────────────────────────────────────────────

const pinObjects = new Map(); // mesh.uuid → CSS2DObject

function addPin(anchor) {
  if (!anchor || pinObjects.has(anchor.mesh.uuid)) return;
  const el = document.createElement("div");
  el.className = "pin";
  el.innerHTML = `
    <div class="pin-bubble">
      <textarea placeholder="Drop a note…"></textarea>
      <div class="pin-actions">
        <button data-act="save">Save</button>
        <button data-act="del">Remove</button>
      </div>
    </div>
  `;
  const ta = el.querySelector("textarea");
  setTimeout(() => ta.focus(), 0);
  el.querySelector('[data-act="save"]').addEventListener("click", () => ta.blur());
  el.querySelector('[data-act="del"]').addEventListener("click", () => {
    const o = pinObjects.get(anchor.mesh.uuid);
    if (o) { o.element.remove(); o.parent?.remove(o); pinObjects.delete(anchor.mesh.uuid); }
  });
  const obj = new CSS2DObject(el);
  obj.position.set(0, 1.6, 0);
  anchor.mesh.add(obj);
  pinObjects.set(anchor.mesh.uuid, obj);
}

// ─── Sidebar ───────────────────────────────────────────────────────────────

function buildSidebar() {
  const dEl = document.getElementById("domains");
  dEl.innerHTML = "";
  for (const [key, d] of Object.entries(DOMAINS)) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.innerHTML = `<span class="dot" style="background:${d.color}"></span>${d.label}`;
    chip.addEventListener("click", () => {
      if (activeDomains.has(key)) activeDomains.delete(key);
      else activeDomains.add(key);
      chip.classList.toggle("off", !activeDomains.has(key));
    });
    dEl.appendChild(chip);
  }

  document.querySelectorAll(".toggle button").forEach((b) => {
    b.addEventListener("click", () => setMode(b.dataset.layout));
  });

  const sEl = document.getElementById("steps");
  sEl.innerHTML = "";
  STEPS.forEach((s, i) => {
    const concept = CONCEPT_BY_ID[s.conceptId];
    const row = document.createElement("div");
    row.className = "step-row";
    row.innerHTML = `
      <div class="idx">${i + 1}</div>
      <div class="label">${s.title}<small>${escapeAttr(concept.label)} · ${concept.files.length} file${concept.files.length > 1 ? "s" : ""}</small></div>
    `;
    row.addEventListener("click", () => setStep(i));
    sEl.appendChild(row);
  });
  document.getElementById("step-total").textContent = String(STEPS.length);

  document.getElementById("next").addEventListener("click", nextStep);
  document.getElementById("prev").addEventListener("click", prevStep);

  document.querySelector(".pr-num").textContent = `${PR.repo} · PR #${PR.number}`;
  document.querySelector(".pr-title").textContent = PR.title;
}

// ─── Frame loop ────────────────────────────────────────────────────────────

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();

function updateNodeSet(nodes, isActive, focusIds, bridgeIds, bootMul) {
  for (const obj of nodes.values()) {
    const wanted = activeDomains.has(obj.node.domain) && isActive;
    const isFocus = focusIds.has(obj.node.id);
    const isBridge = bridgeIds.has(obj.node.id);

    // Importance encoded as luminance: focus → bright; bridge → mid; idle → faint.
    const domainOk = activeDomains.has(obj.node.domain);
    const wireT = !isActive ? 0
      : !domainOk ? 0.03
      : isFocus ? 0.75
      : isBridge ? 0.42
      : 0.16;

    // Boot cascade: each node ramps in with its own delay.
    const boot = bootMul(obj.spawnDelay);
    obj.wireMat.opacity = THREE.MathUtils.lerp(obj.wireMat.opacity, wireT * boot, 0.14);
    obj.wireMesh.visible = obj.wireMat.opacity > 0.005;

    // Flag-pole tether — slightly dimmer than the wireframe, brighter on focus.
    const poleT = isFocus ? 0.8 : isBridge ? 0.5 : 0.28;
    obj.poleMat.opacity = THREE.MathUtils.lerp(obj.poleMat.opacity, (isActive && domainOk ? poleT : 0.04) * boot, 0.14);
    obj.pole.visible = obj.wireMesh.visible;

    // Brighten the wire on focus (white-hot tint via material.color shift).
    const targetCol = isFocus ? new THREE.Color(0xc4ffe6) : new THREE.Color(PHOSPHOR);
    obj.wireMat.color.lerp(targetCol, 0.1);

    if (obj.ring) {
      const ringT = !isActive ? 0 : isFocus ? 0.7 : 0.28;
      obj.ring.material.opacity = THREE.MathUtils.lerp(obj.ring.material.opacity, ringT, 0.12);
      // Gentle drift — slightly faster on focus so the active node feels alive.
      obj.ring.rotation.z += isFocus ? 0.0035 : 0.0015;
    }

    const scaleTarget = obj.baseScale * (isFocus ? 1.25 : 1.0);
    const s = THREE.MathUtils.lerp(obj.mesh.scale.x, scaleTarget, 0.1);
    obj.mesh.scale.setScalar(s);

    // Very slow autonomous rotation on focus — only the wireframe rotates,
    // so labels and the attached fragment card stay put.
    if (isFocus) {
      obj.wireMesh.rotation.y += 0.0006;
      obj.wireMesh.rotation.x += 0.0002;
    }

    // Elastic positioning: spring toward (dragTarget while held, layout target
    // otherwise). Stiffer/less-damped during a drag for snappy tracking; more
    // bounce after release for the rubber-band feel.
    const goal = obj.dragTarget ?? obj.target;
    const isDragged = obj.dragTarget != null;
    // Snappy while dragged; very gentle, near-critically-damped return on release.
    const k = isDragged ? 0.28 : 0.045;
    const damp = isDragged ? 0.65 : 0.74;
    _springForce.copy(goal).sub(obj.mesh.position).multiplyScalar(k);
    obj.velocity.add(_springForce);
    obj.velocity.multiplyScalar(damp);
    obj.mesh.position.add(obj.velocity);

    obj.labelEl.classList.toggle("dim", !wanted || (!isFocus && !isBridge));
    obj.labelEl.classList.toggle("focus", isFocus);
    // CSS2DRenderer drives style.display from object.visible, so toggle that
    // instead of style.display directly (which would be clobbered next frame).
    obj.label.visible = isActive && domainOk;
  }
}

function updateEdgeSet(edges, nodes, isActive, focusIds) {
  for (const e of edges) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (!a || !b) continue;
    const aLive = activeDomains.has(a.node.domain);
    const bLive = activeDomains.has(b.node.domain);
    const touchesFocus = focusIds.has(e.from) || focusIds.has(e.to);
    const sibling = e.kind === "sibling";

    const op = !isActive ? 0
      : (!aLive || !bLive) ? 0.02
      : touchesFocus ? (sibling ? 0.55 : 0.85)
      : sibling ? 0.12 : 0.22;

    e.mat.opacity = THREE.MathUtils.lerp(e.mat.opacity ?? 0, op, 0.12);
    const targetColor = touchesFocus ? new THREE.Color(0xc4ffe6) : new THREE.Color(PHOSPHOR);
    e.mat.color.lerp(targetColor, 0.15);
    e.line.visible = e.mat.opacity > 0.005;

    // recompute curve in case nodes have moved
    e.curve = curveBetween(a.mesh.position, b.mesh.position);
    const pts = e.curve.getPoints(40);
    const positions = e.geom.attributes.position;
    for (let i = 0; i < pts.length; i++) positions.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
    positions.needsUpdate = true;
  }
}

function updateEdgeParticles(set, dt, isActive, focusIds) {
  set.mat.opacity = THREE.MathUtils.lerp(set.mat.opacity, isActive ? 0.45 : 0, 0.12);
  if (!isActive) return;
  for (const p of set.particles) {
    p.t += PARTICLE_SPEED * dt;
    if (p.t >= 1) p.t -= 1;
    const e = set.edges[p.edgeIdx];
    if (!e || !e.curve) continue;
    const pt = e.curve.getPoint(p.t);
    // Particles on focused edges travel; on idle edges fade out by clamping size.
    const live = focusIds.has(e.from) || focusIds.has(e.to);
    const off = live ? 0 : 200; // shove idle-edge particles offscreen
    set.positions[p.idx * 3]     = pt.x + off;
    set.positions[p.idx * 3 + 1] = pt.y;
    set.positions[p.idx * 3 + 2] = pt.z;
  }
  set.geom.attributes.position.needsUpdate = true;
}

const bootStart = performance.now();
function bootMul(delay) {
  const elapsed = (performance.now() - bootStart) / 1000;
  return Math.max(0, Math.min(1, (elapsed - delay) / 0.5));
}

function update(dt) {
  const step = STEPS[state.stepIdx];
  const concept = CONCEPT_BY_ID[step.conceptId];

  // Compute focus + bridge sets per node set
  let conceptFocus, conceptBridge, fileFocus, fileBridge;
  if (state.mode === "flow") {
    conceptFocus = new Set([concept.id]);
    conceptBridge = new Set();
    for (const e of CONCEPT_EDGES) if (e.to === concept.id) conceptBridge.add(e.from);
    fileFocus = new Set();
    fileBridge = new Set();
  } else {
    fileFocus = new Set(concept.files);
    fileBridge = new Set();
    for (const e of FILE_EDGES) {
      if (concept.files.includes(e.to) && !concept.files.includes(e.from)) fileBridge.add(e.from);
    }
    conceptFocus = new Set();
    conceptBridge = new Set();
  }

  updateNodeSet(conceptNodes, state.mode === "flow", conceptFocus, conceptBridge, bootMul);
  updateNodeSet(fileNodes, state.mode === "tree", fileFocus, fileBridge, bootMul);
  updateEdgeSet(conceptEdges, conceptNodes, state.mode === "flow", conceptFocus);
  updateEdgeSet(fileEdges, fileNodes, state.mode === "tree", fileFocus);
  updateEdgeParticles(conceptParticles, dt, state.mode === "flow", conceptFocus);
  updateEdgeParticles(fileParticles, dt, state.mode === "tree", fileFocus);

  // camera tween
  if (cameraTween.t < 1) {
    cameraTween.t = Math.min(1, cameraTween.t + dt / cameraTween.duration);
    const k = easeInOutCubic(cameraTween.t);
    camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, k);
    controls.target.lerpVectors(cameraTween.fromLook, cameraTween.toLook, k);
  }
  controls.update();
}

// ─── Umbilical cord ────────────────────────────────────────────────────────

const cordEl = document.getElementById("cord");
const cordGlow = cordEl.querySelector(".cord-glow");
const cordLine = cordEl.querySelector(".cord-line");
const cordCapNode = cordEl.querySelector(".cord-cap-node");
const cordCapCard = cordEl.querySelector(".cord-cap-card");
const _cordVec = new THREE.Vector3();

function updateCord() {
  if (!cardObj || !cardAnchorMesh) { cordEl.classList.remove("visible"); return; }

  // Node screen position (centre of the anchor group).
  cardAnchorMesh.getWorldPosition(_cordVec);
  _cordVec.project(camera);
  const sR = canvas.getBoundingClientRect();
  const nx = sR.left + sR.width  * (_cordVec.x * 0.5 + 0.5);
  const ny = sR.top  + sR.height * (-_cordVec.y * 0.5 + 0.5);
  const nodeBehind = _cordVec.z > 1; // behind the camera

  // Card position: ask the rendered .fragment-card for its closest perimeter
  // point to the node. The card's bounding rect already includes drag offsets.
  const cardEl = cardObj.element.querySelector(".fragment-card");
  if (!cardEl || nodeBehind) { cordEl.classList.remove("visible"); return; }
  const r = cardEl.getBoundingClientRect();

  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const dx = nx - cx, dy = ny - cy;
  const halfW = r.width / 2, halfH = r.height / 2;
  // Scale (dx, dy) so the longer component touches the rect boundary.
  const sx = halfW / (Math.abs(dx) || 1);
  const sy = halfH / (Math.abs(dy) || 1);
  const k = Math.min(sx, sy);
  const tx = cx + dx * k;
  const ty = cy + dy * k;

  // Slight Bezier sag for "umbilical" feel — control point pulled toward the
  // midpoint with a vertical droop proportional to span.
  const mx = (nx + tx) / 2;
  const my = (ny + ty) / 2 + Math.min(40, Math.hypot(dx, dy) * 0.08);

  // Position relative to the SVG, which is offset to #stage. Since #stage is
  // inset:0 from the viewport, viewport coords work directly.
  const stageRect = stage.getBoundingClientRect();
  const N = { x: nx - stageRect.left, y: ny - stageRect.top };
  const T = { x: tx - stageRect.left, y: ty - stageRect.top };
  const M = { x: mx - stageRect.left, y: my - stageRect.top };

  const d = `M ${N.x.toFixed(1)} ${N.y.toFixed(1)} Q ${M.x.toFixed(1)} ${M.y.toFixed(1)} ${T.x.toFixed(1)} ${T.y.toFixed(1)}`;
  cordGlow.setAttribute("d", d);
  cordLine.setAttribute("d", d);
  cordCapNode.setAttribute("cx", N.x);
  cordCapNode.setAttribute("cy", N.y);
  cordCapCard.setAttribute("cx", T.x);
  cordCapCard.setAttribute("cy", T.y);
  cordEl.classList.add("visible");
}

// Keep the top edge of the card visible. The card's CSS transform is
//   translate(20px, -50%) + drag + clamp
// — the `-50%` centres the card on the node, which can push the top above
// the viewport when the node is high. We measure each frame and apply a
// downward `--clamp-y` offset when needed.
const TOP_MARGIN = 16;
function updateCardClamp() {
  if (!cardObj) return;
  const cardEl = cardObj.element.querySelector(".fragment-card");
  if (!cardEl) return;
  const currentClamp = parseFloat(cardEl.style.getPropertyValue("--clamp-y")) || 0;
  const rect = cardEl.getBoundingClientRect();
  const unclampedTop = rect.top - currentClamp;
  const desired = unclampedTop < TOP_MARGIN ? TOP_MARGIN - unclampedTop : 0;
  if (Math.abs(desired - currentClamp) > 0.5) {
    cardEl.style.setProperty("--clamp-y", `${desired}px`);
  }
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  updateCord();
  updateCardClamp();
  requestAnimationFrame(loop);
}

// ─── Click + drag navigation ───────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const _springForce = new THREE.Vector3();
const _planeHit = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const dragPlane = new THREE.Plane();

const dragState = {
  pointerId: null,
  obj: null,
  mode: null,        // null | "checking" | "dragging"
  startX: 0, startY: 0,
};
let suppressNextClick = false;

function pickNode(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const meshes = [...activeNodes().values()]
    .filter((o) => o.wireMesh.visible)
    .map((o) => o.wireMesh);
  const hits = raycaster.intersectObjects(meshes, false);
  return hits[0]?.object.userData ?? null;
}

function nodeObjForHit(hit) {
  if (!hit) return null;
  return hit.kind === "concept" ? conceptNodes.get(hit.id) : fileNodes.get(hit.id);
}

canvas.addEventListener("pointerdown", (e) => {
  const hit = pickNode(e.clientX, e.clientY);
  if (!hit) return;
  const obj = nodeObjForHit(hit);
  if (!obj) return;
  dragState.pointerId = e.pointerId;
  dragState.obj = obj;
  dragState.hit = hit;
  dragState.mode = "checking";
  dragState.startX = e.clientX;
  dragState.startY = e.clientY;
});

canvas.addEventListener("pointermove", (e) => {
  // Hover cursor — only meaningful when not dragging
  if (!dragState.mode) {
    canvas.style.cursor = pickNode(e.clientX, e.clientY) ? "grab" : "";
    return;
  }

  if (dragState.mode === "checking") {
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (dx * dx + dy * dy > 25) {
      // Promote to drag — freeze camera, build a camera-facing plane through the node
      dragState.mode = "dragging";
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      controls.enabled = false;
      camera.getWorldDirection(_camDir).negate();
      dragPlane.setFromNormalAndCoplanarPoint(_camDir, dragState.obj.mesh.position);
      canvas.style.cursor = "grabbing";
    }
  }

  if (dragState.mode === "dragging") {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(dragPlane, _planeHit)) {
      // Lazily allocate the dragTarget vector so subsequent frames reuse it
      if (!dragState.obj.dragTarget) dragState.obj.dragTarget = new THREE.Vector3();
      dragState.obj.dragTarget.copy(_planeHit);
    }
  }
});

const endDrag = () => {
  if (dragState.mode === "dragging") {
    suppressNextClick = true;
    dragState.obj.dragTarget = null; // spring back to layout position
    try { canvas.releasePointerCapture(dragState.pointerId); } catch {}
    controls.enabled = true;
    canvas.style.cursor = "";
  }
  dragState.mode = null;
  dragState.obj = null;
  dragState.hit = null;
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener("click", (e) => {
  if (suppressNextClick) { suppressNextClick = false; return; }
  const hit = pickNode(e.clientX, e.clientY);
  if (!hit) return;
  if (hit.kind === "concept") {
    const idx = STEP_BY_CONCEPT.get(hit.id);
    if (idx != null) setStep(idx);
  } else if (hit.kind === "file") {
    const file = FILE_BY_ID[hit.id];
    const idx = STEP_BY_CONCEPT.get(file.conceptId);
    if (idx != null) setStep(idx, file.id);
  }
});

// Double-click on empty space → fly to a panoramic frame of the layout.
canvas.addEventListener("dblclick", (e) => {
  const hit = pickNode(e.clientX, e.clientY);
  if (hit) return;
  recenter(0.9);
});

// ─── Keyboard ──────────────────────────────────────────────────────────────

window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA") return;
  if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); nextStep(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); prevStep(); }
});

// ─── Boot ──────────────────────────────────────────────────────────────────

buildSidebar();
setStep(0);
loop();
