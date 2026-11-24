/**
 * The reusable 3D muscle figure plugin.
 *
 * One panel, two hosts: the Muscle tab's check-in form (where clicking a muscle selects it through the page's
 * bridge) and the activity detail's "Muscles worked" card (where clicking a muscle deep-links into a check-in
 * on exactly that muscle). The figure itself — real BodyParts3D anatomy with the procedural sculpt as the
 * catch-path, orbit/zoom/hover/heat — is identical everywhere; only the interaction mode and the list tab's
 * text representation come from the host.
 *
 * The panel is tabbed by design: a **3D figure** tab and a **list** tab. The list is the text representation —
 * the muscle tab shows the grouped checkbox list, the worked card shows primary/secondary chips — so the page
 * stays honest and fully usable without JavaScript or WebGL (both panels render stacked; with script the tab
 * strip takes over). The old flat SVG figure is retired: the figure is 3D, the text is the list.
 *
 * Rendering contract: everything with state stays server-rendered around the plugin (heat fills, selections,
 * status text), the plugin only paints and forwards. The module script resolves three.js through the pinned
 * import map (`/static/three.module.js`), so no runtime npm dependency, and it degrades to the list tab when
 * WebGL cannot start.
 */
import { MUSCLE_CATALOG } from "./muscles";
import { MUSCLE_RIG, RIG_BODY, type RigShape } from "./muscle-rig";

/** One muscle's painted state on the figure: tint, care pulse and the hover-note. */
export interface MuscleViewerRegion {
  /** Resting tint for the muscle's material (heat fill or worked emphasis). */
  fill: string;
  /** True when the region needs care: a low red pulse on top of the tint. */
  dashed?: boolean;
  /** Hover tooltip text after the muscle name, e.g. "5/10 noticeable today" or "primary mover". */
  note?: string;
}

export type MuscleViewerMode =
  /** The host page owns selection state through a named window bridge (peek/has/toggle). */
  | { kind: "bridge"; bridgeName: string }
  /** Clicking a muscle navigates to `href + encodeURIComponent(muscleId)` — the report deep-link. */
  | { kind: "link"; href: string }
  /** Purely decorative: hover names the muscle, clicking does nothing. */
  | { kind: "none" };

export interface MuscleViewerPanelInput {
  /** Id prefix for every element of this panel: tabs, panels, viewer, controls, tooltip. */
  panelId: string;
  /** Per-muscle painted state; muscles without an entry keep the figure's base colour. */
  regions: Readonly<Record<string, MuscleViewerRegion>>;
  /** The interaction mode: bridge (muscle tab) or link (worked card). */
  mode: MuscleViewerMode;
  /** The list tab's HTML — the caller's text representation. */
  listHtml: string;
  /** Tab labels; the figure tab is the default active one. */
  figureTabLabel: string;
  listTabLabel: string;
  /** Spoken label for the tab strip. */
  tablistLabel: string;
  /** Spoken label for the viewer container. */
  viewerLabel: string;
  /** The one-line usage note under the viewer. */
  viewerNote: string;
  /** Text inside the container before (or instead of) the canvas: the no-script surface. */
  noScriptHint: string;
  /** Optional HTML after the viewer (the heat legend on the muscle tab). */
  legendHtml?: string;
  /** "tall" (default, the check-in form) or "compact" (the worked card). */
  height?: "tall" | "compact";
}

/** Inline JSON that cannot close the surrounding script element. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The tabbed panel: tab strip (3D figure | list), the viewer with its controls and tooltip, and the caller's
 * list content. A small classic script wires the tabs and hides the inactive panel only when script runs, so
 * the no-script page keeps every muscle reachable in the list.
 */
export function renderMuscleViewerPanel(input: MuscleViewerPanelInput): string {
  const id = input.panelId;
  const heightClass = input.height === "compact" ? " compact" : "";
  const modeKind = input.mode.kind;
  const bridgeName = input.mode.kind === "bridge" ? input.mode.bridgeName : "";
  const linkHref = input.mode.kind === "link" ? input.mode.href : "";
  const regions: Record<string, { fill: string; dashed?: boolean; note?: string }> = {};
  for (const [muscleId, region] of Object.entries(input.regions)) {
    regions[muscleId] = { fill: region.fill, ...(region.dashed === true ? { dashed: true } : {}), ...(region.note === undefined ? {} : { note: region.note }) };
  }
  return `<div class="muscle-plugin" id="${id}-plugin">
    <div class="muscle-plugin-tabs" role="tablist" aria-label="${escapeHtml(input.tablistLabel)}">
      <button type="button" class="muscle-plugin-tab" role="tab" id="${id}-tab-figure" aria-controls="${id}-figure" aria-selected="true">${escapeHtml(input.figureTabLabel)}</button>
      <button type="button" class="muscle-plugin-tab" role="tab" id="${id}-tab-list" aria-controls="${id}-list" aria-selected="false">${escapeHtml(input.listTabLabel)}</button>
    </div>
    <div class="muscle-plugin-panel" role="tabpanel" id="${id}-figure" aria-labelledby="${id}-tab-figure">
      <div class="muscle-viewer-wrap">
        <div id="${id}-viewer" class="muscle-viewer${heightClass}" aria-label="${escapeHtml(input.viewerLabel)}"><p class="muted small muscle-viewer-hint">${escapeHtml(input.noScriptHint)}</p></div>
        <div class="viewer-controls">
          <button type="button" class="chip" id="${id}-rotation" aria-pressed="true">Pause rotation</button>
          <button type="button" class="chip" id="${id}-front">Front</button>
          <button type="button" class="chip" id="${id}-back">Back</button>
          <button type="button" class="chip" id="${id}-reset">Reset</button>
        </div>
        <div id="${id}-tooltip" class="viewer-tooltip" role="status" hidden></div>
        <p class="muted small muscle-viewer-note">${input.viewerNote}</p>
      </div>
      ${input.legendHtml ?? ""}
    </div>
    <div class="muscle-plugin-panel" role="tabpanel" id="${id}-list" aria-labelledby="${id}-tab-list">
      ${input.listHtml}
    </div>
  </div>
  ${renderPanelTabScript(id)}
  ${renderMuscleViewerScript(id, modeKind, bridgeName, linkHref, regions)}`;
}

/** The tab strip wiring: click or arrow keys switch panels; with script the inactive panel is hidden. */
function renderPanelTabScript(id: string): string {
  return `<script>
  (() => {
    const root = document.getElementById('${id}-plugin');
    if (root === null) return;
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    if (tabs.length === 0) return;
    const panels = [...root.querySelectorAll('[role="tabpanel"]')];
    const select = (tab) => {
      for (const other of tabs) other.setAttribute('aria-selected', other === tab ? 'true' : 'false');
      for (const panel of panels) panel.hidden = panel.id !== tab.getAttribute('aria-controls');
    };
    for (const tab of tabs) {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : tabs.length - 1;
        const next = tabs[(tabs.indexOf(tab) + step) % tabs.length];
        next.focus();
        select(next);
      });
    }
    select(root.querySelector('[role="tab"][aria-selected="true"]'));
  })();
  </script>`;
}

/**
 * The 3D viewer itself: three.js over the rig data, physically rendered, running as a module script behind the
 * pinned import map. Real anatomy first (BodyParts3D GLB, one RegionMuscle material per catalog region), the
 * procedural sculpt as the catch-path, orbit + zoom + hover + click, and the same heat semantics on both
 * hosts. Selection flows through the host's bridge on the muscle tab; on the worked card a click navigates to
 * the report deep-link.
 */
function renderMuscleViewerScript(
  id: string,
  modeKind: "bridge" | "link" | "none",
  bridgeName: string,
  linkHref: string,
  regions: Readonly<Record<string, { fill: string; dashed?: boolean; note?: string }>>,
): string {
  const rig = {
    body: RIG_BODY.map((part) => ({ mirror: part.mirror, shape: part.shape as RigShape })),
    muscles: MUSCLE_RIG.map((entry) => ({ id: entry.muscleId, mirror: entry.mirror, shapes: entry.shapes })),
  };
  const names: Record<string, string> = {};
  for (const muscle of MUSCLE_CATALOG) names[muscle.id] = muscle.name;
  return `<script type="importmap">{"imports":{"three":"/static/three.module.js"}}</script>
  <script type="module">
  import * as THREE from 'three';
  import { OrbitControls } from '/static/orbit-controls.js';
  (async () => {
    const MODE = ${jsonForScript(modeKind)};
    const LINK_HREF = ${jsonForScript(linkHref)};
    const BRIDGE_NAME = ${jsonForScript(bridgeName)};
    const RIG = ${jsonForScript(rig)};
    const REGIONS = ${jsonForScript(regions)};
    const NAMES = ${jsonForScript(names)};
    const container = document.getElementById('${id}-viewer');
    const tooltip = document.getElementById('${id}-tooltip');
    const rotationButton = document.getElementById('${id}-rotation');
    if (container === null || tooltip === null) return;
    const bridge = MODE === 'bridge' ? window[BRIDGE_NAME] : null;
    if (MODE === 'bridge' && (bridge === undefined || bridge === null)) return;
    const revealList = () => {
      const root = document.getElementById('${id}-plugin');
      if (root === null) return;
      for (const tab of root.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected', tab.getAttribute('aria-controls') === '${id}-list' ? 'true' : 'false');
      for (const panel of root.querySelectorAll('[role="tabpanel"]')) panel.hidden = panel.id !== '${id}-list';
    };
    const showFallback = (reason) => {
      container.textContent = reason;
      container.classList.add('muscle-viewer-failed');
      revealList();
    };
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (error) {
      showFallback('The 3D figure could not start here; the list tab carries every muscle.');
      return;
    }
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const labelFor = (value) => {
      if (value <= 0) return 'Nothing';
      if (value <= 2) return 'Barely there';
      if (value <= 3) return 'Mild';
      if (value <= 5) return 'Noticeable';
      if (value <= 6) return 'Clear DOMS';
      if (value <= 7) return 'Sore to touch';
      if (value <= 8) return 'Strong';
      return 'Severe';
    };
    const hasTag = (region) => bridge !== null && typeof bridge.has === 'function' ? bridge.has(region) : false;
    const peekTag = (region) => bridge !== null && typeof bridge.peek === 'function' ? bridge.peek(region) : null;
    const activate = (region) => {
      if (MODE === 'bridge') {
        if (bridge === null || typeof bridge.toggle !== 'function') return;
        bridge.toggle(region);
        tooltip.hidden = true;
        return;
      }
      if (MODE === 'link') location.href = LINK_HREF + encodeURIComponent(region);
    };

    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#fbf1e3');
    scene.fog = new THREE.Fog('#fbf1e3', 9, 18);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    const defaultView = { radius: 7.4, polar: 1.42, azimuth: 0.5 };
    const setCamera = (radius, polar, azimuth) => {
      camera.position.set(
        Math.sin(polar) * Math.sin(azimuth) * radius,
        Math.cos(polar) * radius + 2.35,
        Math.sin(polar) * Math.cos(azimuth) * radius,
      );
      camera.lookAt(0, 2.35, 0);
    };
    setCamera(defaultView.radius, defaultView.polar, defaultView.azimuth);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2.35, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 3.6;
    controls.maxDistance = 11;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.autoRotateSpeed = 1.0;
    let running = !reduced;
    controls.autoRotate = running;
    if (rotationButton !== null) {
      rotationButton.setAttribute('aria-pressed', running ? 'true' : 'false');
      rotationButton.textContent = running ? 'Pause rotation' : 'Play rotation';
      rotationButton.addEventListener('click', () => {
        running = !running;
        controls.autoRotate = running;
        rotationButton.setAttribute('aria-pressed', running ? 'true' : 'false');
        rotationButton.textContent = running ? 'Pause rotation' : 'Play rotation';
      });
    }

    scene.add(new THREE.HemisphereLight(0xfff4e4, 0xd9c2a8, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(3.6, 6.4, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = 0;
    key.shadow.bias = -0.0008;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
    fill.position.set(-4.2, 3.2, 2.4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffb37a, 0.85);
    rim.position.set(-1.2, 4.4, -5.2);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 48),
      new THREE.MeshStandardMaterial({ color: '#f2dfc4', roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const figure = new THREE.Group();
    scene.add(figure);

    // One interaction layer for both hosts: the region's shared material, its base colour, its meshes.
    const regionMaterials = new Map();
    const baseColors = new Map();
    const pickMeshes = [];

    const buildShape = (shape, mirrored, material) => {
      const at = shape.at;
      let geometry;
      if (shape.kind === 'sphere') geometry = new THREE.SphereGeometry(shape.radius, 28, 20);
      else if (shape.kind === 'capsule') geometry = new THREE.CapsuleGeometry(shape.radius, shape.length, 6, 18);
      else if (shape.kind === 'box') geometry = new THREE.BoxGeometry(shape.size[0], shape.size[1], shape.size[2]);
      else {
        const points = shape.profile.map((point) => new THREE.Vector2(point[0], point[1]));
        const top = shape.profile[shape.profile.length - 1];
        points.push(new THREE.Vector2(0, top[1] + 0.03));
        geometry = new THREE.LatheGeometry(points, 44);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(mirrored ? -at[0] : at[0], at[1], at[2]);
      if (shape.scale !== undefined) mesh.scale.set(shape.scale[0], shape.scale[1], shape.scale[2]);
      if (shape.scaleZ !== undefined) mesh.scale.z = shape.scaleZ;
      if (shape.tilt !== undefined) mesh.rotation.z = (mirrored ? -1 : 1) * shape.tilt * Math.PI / 180;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    // The real figure first: BodyParts3D muscles over bones, one RegionMuscle material per catalog region.
    const buildAnatomy = async () => {
      const { GLTFLoader } = await import('/static/gltf-loader.js');
      const gltf = await new GLTFLoader().loadAsync('/static/anatomy-muscles.glb');
      gltf.scene.traverse((child) => {
        if (child.isMesh !== true) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const materialName = child.material !== null && typeof child.material.name === 'string' ? child.material.name : '';
        if (!materialName.startsWith('RegionMuscle-')) return; // bones stay visible but unpickable
        const region = String(child.name).split('__')[0];
        child.userData.region = region;
        if (!regionMaterials.has(region)) {
          regionMaterials.set(region, child.material);
          baseColors.set(region, child.material.color.clone());
        }
        pickMeshes.push(child);
      });
      figure.add(gltf.scene);
    };

    // The procedural sculpt stays as the catch-path when the asset or WebGL cannot deliver.
    const buildProcedural = () => {
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: '#c8b193',
        roughness: 0.55,
        metalness: 0,
        clearcoat: 0.25,
        clearcoatRoughness: 0.55,
        sheen: 0.4,
        sheenColor: new THREE.Color('#ffe6c8'),
      });
      const muscleMatBase = {
        roughness: 0.42,
        metalness: 0,
        clearcoat: 0.35,
        clearcoatRoughness: 0.5,
        sheen: 0.3,
        sheenColor: new THREE.Color('#ffd9b8'),
      };
      for (const part of RIG.body) {
        figure.add(buildShape(part.shape, false, bodyMat));
        if (part.mirror) figure.add(buildShape(part.shape, true, bodyMat));
      }
      for (const muscle of RIG.muscles) {
        const material = new THREE.MeshPhysicalMaterial({ ...muscleMatBase, color: '#cfa173' });
        const group = new THREE.Group();
        group.userData.region = muscle.id;
        const addShapes = (mirrored) => {
          for (const shape of muscle.shapes) {
            const mesh = buildShape(shape, mirrored, material);
            mesh.userData.region = muscle.id;
            group.add(mesh);
            pickMeshes.push(mesh);
          }
        };
        addShapes(false);
        if (muscle.mirror) addShapes(true);
        figure.add(group);
        regionMaterials.set(muscle.id, material);
        baseColors.set(muscle.id, new THREE.Color('#cfa173'));
      }
    };

    let hoveredId = null;
    // Hover and selection share one ember: the muscle under the cursor changes colour exactly like a
    // click-select does — one obvious signal, not a subtle half-tint that is easy to miss.
    const EMBER = '#ff5a1f';
    const syncMuscle = (id, tag) => {
      const material = regionMaterials.get(id);
      if (material === undefined) return; // a region with no mesh here (lats in the anatomy build) simply does not paint
      const heat = REGIONS[id];
      const selected = hasTag(id);
      const warning = heat !== undefined && heat.dashed === true;
      const base = baseColors.get(id);
      const baseHex = base === undefined ? '#cfa173' : '#' + base.getHexString();
      const hovered = id === hoveredId && !selected;
      // The region fill is the server's truth (today's status heat, or the worked emphasis); it paints whether
      // or not the muscle is selected. Only hover and selection take the ember on top of it.
      const resting = heat !== undefined ? heat.fill : baseHex;
      material.color.set(hovered || selected ? EMBER : resting);
      if (hovered || selected) {
        material.emissive.set(EMBER);
        material.emissiveIntensity = 0.4;
      } else if (warning) {
        material.emissive.set('#c03a2b');
        material.emissiveIntensity = 0.32;
      } else {
        material.emissive.set('#000000');
        material.emissiveIntensity = 0;
      }
    };
    // The host page repaints through this handle; on the bridge host it is part of the page's contract.
    if (MODE === 'bridge') window.__muscleViewer = { syncMuscle };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickMeshes, false);
      return hits.length > 0 ? hits[0].object.userData.region : null;
    };
    let downAt = null;
    renderer.domElement.addEventListener('pointerdown', (event) => {
      downAt = { x: event.clientX, y: event.clientY };
    });
    renderer.domElement.addEventListener('pointerup', (event) => {
      if (downAt === null) return;
      const moved = Math.abs(event.clientX - downAt.x) + Math.abs(event.clientY - downAt.y);
      downAt = null;
      if (moved > 7) return;
      const id = pick(event);
      if (id === null || id === undefined) return;
      activate(id);
      if (MODE === 'link') tooltip.hidden = true;
    });
    let moveAt = 0;
    let trailingHover = null;
    const stateText = (id) => {
      const heat = REGIONS[id];
      if (MODE === 'bridge') {
        const tag = peekTag(id);
        if (tag !== null) return tag.soreness + '/10 · ' + labelFor(tag.soreness) + (heat !== undefined && heat.dashed === true ? ' · needs care' : '');
        return heat === undefined || heat.note === undefined ? 'not tagged yet' : heat.note;
      }
      return heat === undefined || heat.note === undefined || heat.note.length === 0 ? 'tap to report how it feels' : heat.note;
    };
    const applyHover = (event) => {
      const id = pick(event);
      if (id === hoveredId) {
        if (id !== null && id !== undefined) positionTip(event);
        return;
      }
      const previous = hoveredId;
      hoveredId = id === undefined ? null : id;
      if (previous !== null) syncMuscle(previous, peekTag(previous));
      if (hoveredId === null) {
        tooltip.hidden = true;
        renderer.domElement.style.cursor = 'grab';
        return;
      }
      syncMuscle(hoveredId, peekTag(hoveredId));
      renderer.domElement.style.cursor = 'pointer';
      tooltip.textContent = NAMES[hoveredId] + ' — ' + stateText(hoveredId);
      positionTip(event);
      tooltip.hidden = false;
    };
    renderer.domElement.addEventListener('pointermove', (event) => {
      const now = Date.now();
      if (now - moveAt < 60) {
        // A glide that stops between throttle windows must still land its resting position: the trailing
        // edge re-picks the last event, so the muscle under the still cursor is always the highlighted one.
        if (trailingHover !== null) clearTimeout(trailingHover);
        trailingHover = setTimeout(() => { trailingHover = null; applyHover(event); }, 60);
        return;
      }
      moveAt = now;
      if (trailingHover !== null) { clearTimeout(trailingHover); trailingHover = null; }
      applyHover(event);
    });
    renderer.domElement.addEventListener('pointerleave', () => {
      const previous = hoveredId;
      hoveredId = null;
      if (previous !== null) syncMuscle(previous, peekTag(previous));
      tooltip.hidden = true;
    });
    const positionTip = (event) => {
      const rect = container.getBoundingClientRect();
      const x = Math.min(event.clientX - rect.left + 14, rect.width - 170);
      const y = event.clientY - rect.top + 14;
      tooltip.style.left = Math.max(4, x) + 'px';
      tooltip.style.top = Math.max(4, y) + 'px';
    };

    // Front, Back and Reset tween the camera once around the figure, then hand control back.
    let orbitTween = null;
    const tweenTo = (azimuth) => {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      let from = spherical.theta;
      let to = azimuth;
      while (to - from > Math.PI) to -= Math.PI * 2;
      while (to - from < -Math.PI) to += Math.PI * 2;
      orbitTween = { fromTheta: from, toTheta: to, fromPhi: spherical.phi, toPhi: defaultView.polar, fromR: spherical.radius, toR: defaultView.radius, at: 0 };
    };
    const front = document.getElementById('${id}-front');
    const back = document.getElementById('${id}-back');
    const reset = document.getElementById('${id}-reset');
    if (front !== null) front.addEventListener('click', () => tweenTo(0));
    if (back !== null) back.addEventListener('click', () => tweenTo(Math.PI));
    if (reset !== null) reset.addEventListener('click', () => tweenTo(defaultView.azimuth));

    const clock = new THREE.Clock();
    let frame = 0;
    let elapsed = 0;
    const animate = () => {
      frame = 0;
      // Stop scheduling entirely while the tab is hidden: a background tab should not keep a 3D scene rendering.
      if (document.hidden) return;
      elapsed += clock.getDelta();
      if (orbitTween !== null) {
        orbitTween.at = Math.min(1, orbitTween.at + 0.035);
        const eased = orbitTween.at * orbitTween.at * (3 - 2 * orbitTween.at);
        const theta = orbitTween.fromTheta + (orbitTween.toTheta - orbitTween.fromTheta) * eased;
        const phi = orbitTween.fromPhi + (orbitTween.toPhi - orbitTween.fromPhi) * eased;
        const radius = orbitTween.fromR + (orbitTween.toR - orbitTween.fromR) * eased;
        setCamera(radius, phi, theta);
        controls.autoRotate = false;
        if (orbitTween.at >= 1) {
          orbitTween = null;
          controls.autoRotate = running;
        }
      } else if (running) {
        const breathe = 1 + Math.sin(elapsed * 1.7) * 0.008;
        figure.scale.set(breathe, 1, breathe);
        for (const [id, heat] of Object.entries(REGIONS)) {
          if (heat.dashed !== true) continue;
          const material = regionMaterials.get(id);
          if (material === undefined || hasTag(id)) continue;
          material.emissiveIntensity = 0.24 + Math.sin(elapsed * 2.6) * 0.14;
        }
        controls.update();
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    const resume = () => {
      if (document.hidden || frame !== 0) return;
      // Drop the time spent hidden so the breathing phase does not jump when the tab returns.
      clock.getDelta();
      frame = requestAnimationFrame(animate);
    };
    document.addEventListener('visibilitychange', resume);
    animate();

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(container);
    else window.addEventListener('resize', resize);
    resize();

    // Real anatomy first; the procedural sculpt catches whatever fails. Only then mark the viewer ready, so a
    // fixture capture can never fire before a figure is on screen.
    try {
      await buildAnatomy();
    } catch (error) {
      buildProcedural();
    }
    for (const id of Object.keys(NAMES)) syncMuscle(id, peekTag(id));
    container.dataset.viewerReady = '1';
  })();
  </script>`;
}
