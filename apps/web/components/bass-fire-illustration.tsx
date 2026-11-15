"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { BassFireIllustration as BassFireArtifact } from "../lib/bass-fire-illustration";
import styles from "./simulation-scene.module.css";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// A procedural illustration: no flame size, color or motion is derived from the record.
const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x),
               mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y);
  }
  float turbulence(vec2 p) {
    float v = 0.;
    v += 0.5 * noise(p); p = p * 2.03 + 7.1;
    v += 0.25 * noise(p); p = p * 2.01 + 3.7;
    v += 0.125 * noise(p); p = p * 2.04 + 1.8;
    v += 0.0625 * noise(p);
    return v;
  }
  void main() {
    vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
    vec3 color = vec3(0.015, 0.023, 0.038);
    float y = (p.y + 0.24) / 0.62;
    float distort = turbulence(vec2(p.x * 8.0 + uTime * .20, y * 4.2 - uTime * .42));
    float flicker = turbulence(vec2(p.x * 15.0 - uTime * .17, y * 7.0 - uTime * .64));
    float width = 0.37 * pow(clamp(1.0-y,0.0,1.0), 0.7);
    float tongues = (distort - .42) * .19 + (flicker - .42) * .08;
    float edge = width - abs(p.x) + tongues * smoothstep(0.0, 0.30, y);
    float body = smoothstep(-.08,.035, edge) * smoothstep(-.025,.045,y) * (1.0-smoothstep(.78,1.08,y));
    float texture = clamp(.58 + .8 * (distort-.4) + .5 * (flicker-.4),0.,1.);
    float heat = clamp((1.0-y) * .70 + texture * .43,0.,1.);
    vec3 flame = mix(vec3(.55,.035,.005),vec3(1.0,.23,.015),smoothstep(.15,.7,heat));
    flame = mix(flame,vec3(1.0,.76,.18),smoothstep(.62,.95,heat));
    flame = mix(flame,vec3(1.0,.95,.65),smoothstep(.9,1.0,heat)*.7);
    float glow = exp(-max(-edge,0.0)*17.0) * smoothstep(-.07,.02,y) * (1.0-smoothstep(.7,1.1,y));
    color += vec3(.25,.035,.006) * glow * .45;
    color = mix(color, flame * (.55 + texture*.5), body * .9);
    float fuelSurface = (1.0-smoothstep(.37,.39,abs(p.x))) * smoothstep(-.305,-.295,p.y) * (1.0-smoothstep(-.24,-.225,p.y));
    color = mix(color, vec3(.36,.39,.39) + .06*noise(p*90.), fuelSurface);
    float edgeLight = fuelSurface * smoothstep(-.25,-.235,p.y);
    color += vec3(.5,.15,.03) * edgeLight;
    gl_FragColor = vec4(color,1.0);
  }
`;

export function BassFireIllustration({ value }: { value: BassFireArtifact }) {
  const mount = useRef<HTMLDivElement>(null);
  const playingRef = useRef(true);
  const redraw = useRef<() => void>(() => {});
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failed, setFailed] = useState(false);
  playingRef.current = playing;

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    const element = document.createElement("canvas");
    element.className = styles.canvas;
    element.style.cursor = "default";
    element.setAttribute("role", "img");
    element.setAttribute(
      "aria-label",
      "Generated illustration of a flame over a solid fuel sample",
    );
    container.append(element);
    let renderer: THREE.WebGLRenderer | undefined;
    let geometry: THREE.PlaneGeometry | undefined;
    let material: THREE.ShaderMaterial | undefined;
    let context: WebGL2RenderingContext | null = null;
    let frame = 0;
    let disposed = false;
    let broken = false;
    let visible = true;
    let time = 0;
    let previous: number | null = null;
    let lastDraw = 0;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let resize: ResizeObserver | undefined;
    let intersection: IntersectionObserver | undefined;
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = null;
    };
    const request = () => {
      if (!disposed && !broken && visible && !document.hidden && !frame)
        frame = requestAnimationFrame(draw);
    };
    function draw(now: number) {
      frame = 0;
      if (disposed || !renderer || !material || !visible || document.hidden)
        return;
      const animate = playingRef.current && !motion.matches;
      if (animate && now - lastDraw < 1000 / 30) {
        request();
        return;
      }
      if (animate && previous !== null)
        time += Math.min((now - previous) / 1000, 0.05);
      previous = animate ? now : null;
      material.uniforms.uTime.value = time;
      try {
        renderer.render(scene, camera);
        lastDraw = now;
      } catch {
        broken = true;
        setFailed(true);
        return;
      }
      if (animate) request();
    }
    function refresh() {
      stop();
      setReducedMotion(motion.matches);
      request();
    }
    function lost(event: Event) {
      event.preventDefault();
      broken = true;
      stop();
      setFailed(true);
    }
    try {
      context = element.getContext("webgl2", {
        alpha: false,
        antialias: false,
      });
      if (!context) throw new Error("WebGL2 unavailable");
      renderer = new THREE.WebGLRenderer({
        canvas: element,
        context,
        antialias: false,
      });
      renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
        console.error(
          "BASS flame shader",
          gl.getProgramInfoLog(program),
          gl.getShaderInfoLog(vertex),
          gl.getShaderInfoLog(fragment),
        );
        broken = true;
        stop();
        setFailed(true);
      };
      renderer.setPixelRatio(1);
      geometry = new THREE.PlaneGeometry(2, 2);
      material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uTime: { value: 0 }, uAspect: { value: 1.6 } },
      });
      scene.add(new THREE.Mesh(geometry, material));
      resize = new ResizeObserver(() => {
        const bounds = element.getBoundingClientRect();
        renderer?.setSize(
          Math.max(1, Math.min(640, Math.round(bounds.width))),
          Math.max(1, Math.min(400, Math.round(bounds.height))),
          false,
        );
        if (material)
          material.uniforms.uAspect.value =
            bounds.width / Math.max(1, bounds.height);
        request();
      });
      resize.observe(element);
      intersection = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        refresh();
      });
      intersection.observe(element);
      motion.addEventListener("change", refresh);
      document.addEventListener("visibilitychange", refresh);
      element.addEventListener("webglcontextlost", lost);
      redraw.current = refresh;
      refresh();
    } catch (error) {
      console.error("BASS flame setup", error);
      setFailed(true);
    }
    return () => {
      disposed = true;
      stop();
      redraw.current = () => {};
      resize?.disconnect();
      intersection?.disconnect();
      motion.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      element.removeEventListener("webglcontextlost", lost);
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
      if (context && !context.isContextLost())
        context.getExtension("WEBGL_lose_context")?.loseContext();
      element.remove();
    };
  }, []);

  useEffect(() => {
    redraw.current();
  }, [playing]);
  const record = encodeURIComponent(
    JSON.stringify([
      value.accession,
      value.asset_id,
      value.asset_sha256,
      value.source_row,
    ]),
  );
  return (
    <section className="artifact-record" aria-label={value.title}>
      <h3>{value.title}</h3>
      <div className={styles.viewport}>
        <div ref={mount} className={styles.canvasMount} hidden={failed} />
        {failed && (
          <p className={styles.fallback} role="status">
            The flame view is unavailable; the source conditions remain below.
          </p>
        )}
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          disabled={failed || reducedMotion}
          onClick={() => setPlaying((current) => !current)}
        >
          {reducedMotion
            ? "Motion reduced"
            : playing
              ? "Pause flame"
              : "Play flame"}
        </button>
      </div>
      <p>
        Illustrative flame · source conditions from BASS-II, row{" "}
        {value.source_row}.
      </p>
      <dl>
        {value.conditions.map((condition, index) => (
          <div key={index}>
            <dt>{condition.label}</dt>
            <dd>{condition.value}</dd>
          </div>
        ))}
      </dl>
      <a
        href={`/app/runs/${record}?snapshot=${encodeURIComponent(value.snapshot_id)}`}
      >
        Inspect the source record
      </a>
    </section>
  );
}
