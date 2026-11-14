import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createChamber, type SceneResources } from "./chamber";
import { createIllustrativeFlame } from "./flame";

export type SceneState = {
  diameterRatio: number;
  playing: boolean;
  reducedMotion: boolean;
};
export type CameraView = "front" | "top" | "reset";
export type SimulationView = {
  update: (state: SceneState) => void;
  camera: (view: CameraView) => void;
  dispose: () => void;
};

const frameIntervalMilliseconds = 50;

export function createSimulationView(
  canvas: HTMLCanvasElement,
  onFailure: () => void,
): SimulationView {
  let renderer: THREE.WebGLRenderer | null = null;
  let context: WebGL2RenderingContext | null = null;
  let controls: OrbitControls | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let frame = 0;
  let timer = 0;
  let disposed = false;
  let visible = false;
  let previousFrame = -Infinity;
  let previousMotionFrame: number | null = null;
  let phaseSeconds = 0;
  let shaderFailed = false;
  let state: SceneState = {
    diameterRatio: 1,
    playing: false,
    reducedMotion: true,
  };
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const resources: SceneResources = {
    geometry: (value) => {
      geometries.add(value);
      return value;
    },
    material: (value) => {
      materials.add(value);
      return value;
    },
  };
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cancelFrame = () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    frame = 0;
    timer = 0;
    previousMotionFrame = null;
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelFrame();
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    document.removeEventListener("visibilitychange", refresh);
    media.removeEventListener("change", refresh);
    canvas.removeEventListener("webglcontextlost", contextLost);
    controls?.removeEventListener("change", requestFrame);
    controls?.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    renderer?.dispose();
    if (context && !context.isContextLost())
      context.getExtension("WEBGL_lose_context")?.loseContext();
    geometries.clear();
    materials.clear();
  }
  function fail() {
    if (disposed) return;
    dispose();
    onFailure();
  }
  function contextLost(event: Event) {
    event.preventDefault();
    fail();
  }
  function animate() {
    return state.playing && !state.reducedMotion && !media.matches;
  }
  function refresh() {
    cancelFrame();
    requestFrame();
  }
  function requestFrame() {
    if (disposed || !visible || document.hidden || frame || timer) return;
    const delay =
      frameIntervalMilliseconds - (performance.now() - previousFrame);
    if (delay > 0) {
      timer = window.setTimeout(() => {
        timer = 0;
        requestFrame();
      }, delay);
      return;
    }
    frame = requestAnimationFrame(draw);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(41, 1.6, 0.1, 40);
  let droplet: THREE.Mesh;
  let flame: ReturnType<typeof createIllustrativeFlame>;

  function draw(timestamp: number) {
    frame = 0;
    if (disposed || !visible || document.hidden || !renderer) return;
    try {
      if (animate()) {
        if (previousMotionFrame !== null)
          phaseSeconds += Math.min(
            (timestamp - previousMotionFrame) / 1000,
            0.1,
          );
        previousMotionFrame = timestamp;
      } else {
        previousMotionFrame = null;
      }
      droplet.visible = state.diameterRatio > 0;
      droplet.scale.setScalar(Math.max(state.diameterRatio, 0.00001));
      flame.mesh.visible = state.diameterRatio > 0;
      flame.uniforms.uDiameterRatio.value = state.diameterRatio;
      flame.uniforms.uTime.value = phaseSeconds;
      renderer.render(scene, camera);
      if (shaderFailed) {
        fail();
        return;
      }
      previousFrame = timestamp;
      if (animate()) requestFrame();
    } catch (reason) {
      console.warn("The 3D illustration could not render a frame.", reason);
      fail();
    }
  }
  function cameraView(view: CameraView) {
    if (disposed || !controls) return;
    if (view === "front") camera.position.set(0, 0.5, 8.6);
    if (view === "top") camera.position.set(0, 8.5, 0.1);
    if (view === "reset") camera.position.set(4.8, 2.8, 7);
    controls.target.set(0, -0.05, 0);
    controls.update();
    requestFrame();
  }
  try {
    context = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!context) throw new Error("WebGL2 is unavailable");
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x0b111b);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.debug.onShaderError = () => {
      shaderFailed = true;
    };
    scene.add(createChamber(resources));
    const hemisphere = new THREE.HemisphereLight(0xc9dfff, 0x17131b, 2.3);
    const key = new THREE.DirectionalLight(0xffead9, 3.2);
    key.position.set(3, 5, 4);
    const fill = new THREE.DirectionalLight(0x8eb5f1, 1.7);
    fill.position.set(-4, 1, -2);
    scene.add(hemisphere, key, fill);
    droplet = new THREE.Mesh(
      resources.geometry(new THREE.SphereGeometry(0.42, 32, 20)),
      resources.material(
        new THREE.MeshStandardMaterial({
          color: 0xc4ad7b,
          metalness: 0.05,
          roughness: 0.2,
        }),
      ),
    );
    scene.add(droplet);
    flame = createIllustrativeFlame(resources);
    scene.add(flame.mesh);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.autoRotate = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    canvas.style.touchAction = "pan-y";
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.addEventListener("change", requestFrame);
    cameraView("reset");
    const resize = () => {
      if (!renderer || disposed) return;
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.min(640, Math.round(bounds.width)));
      const height = Math.max(1, Math.min(400, Math.round(bounds.height)));
      renderer.setSize(width, height, false);
      camera.aspect = bounds.width / Math.max(1, bounds.height);
      camera.updateProjectionMatrix();
      requestFrame();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      refresh();
    });
    intersectionObserver.observe(canvas);
    document.addEventListener("visibilitychange", refresh);
    media.addEventListener("change", refresh);
    canvas.addEventListener("webglcontextlost", contextLost);
    resize();
  } catch (reason) {
    dispose();
    console.warn("The 3D illustration could not initialize.", reason);
    throw new Error("The 3D illustration could not be initialized");
  }
  return {
    update(next) {
      if (disposed) return;
      if (
        !Number.isFinite(next.diameterRatio) ||
        next.diameterRatio < 0 ||
        next.diameterRatio > 1
      ) {
        fail();
        return;
      }
      const motionChanged =
        state.playing !== next.playing ||
        state.reducedMotion !== next.reducedMotion;
      state = next;
      if (motionChanged) cancelFrame();
      requestFrame();
    },
    camera: cameraView,
    dispose,
  };
}
