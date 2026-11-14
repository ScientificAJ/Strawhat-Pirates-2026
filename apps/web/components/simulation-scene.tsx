"use client";

import { useEffect, useRef, useState } from "react";
import {
  createSimulationView,
  type CameraView,
  type SimulationView,
} from "./simulation-scene/view";
import styles from "./simulation-scene.module.css";

/** Only droplet scale follows the supplied diameter ratio; the chamber and shell are illustrative. */
export function SimulationScene({
  diameterRatio,
  playing,
  reducedMotion,
  onFailure,
}: {
  diameterRatio: number;
  playing: boolean;
  reducedMotion: boolean;
  onFailure?: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<SimulationView | null>(null);
  const failureHandler = useRef(onFailure);
  const state = useRef({ diameterRatio, playing, reducedMotion });
  const [failed, setFailed] = useState(false);
  failureHandler.current = onFailure;
  state.current = { diameterRatio, playing, reducedMotion };

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    // Each effect owns a fresh canvas, including React's development remount.
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Illustrative three-dimensional chamber with a liquid droplet and flame shell. Droplet scale follows the calculated diameter ratio.",
    );
    container.append(canvas);
    const failure = () => {
      setFailed(true);
      failureHandler.current?.();
    };
    try {
      const scene = createSimulationView(canvas, failure);
      view.current = scene;
      scene.update(state.current);
      return () => {
        scene.dispose();
        view.current = null;
        canvas.remove();
      };
    } catch {
      canvas.remove();
      failure();
    }
  }, []);
  useEffect(() => {
    view.current?.update({ diameterRatio, playing, reducedMotion });
  }, [diameterRatio, playing, reducedMotion]);

  function changeCamera(cameraView: CameraView) {
    view.current?.camera(cameraView);
  }
  return (
    <div className={styles.scene}>
      <div className={styles.viewport}>
        <div ref={mount} className={styles.canvasMount} hidden={failed} />
        {failed && (
          <p className={styles.fallback} role="status">
            The 3D view is unavailable. The calculated values and playback
            controls remain available.
          </p>
        )}
      </div>
      <div
        className={styles.controls}
        role="group"
        aria-label="3D camera views"
      >
        <span className={styles.hint}>Drag the view to orbit</span>
        <button
          type="button"
          disabled={failed}
          onClick={() => changeCamera("front")}
        >
          Front view
        </button>
        <button
          type="button"
          disabled={failed}
          onClick={() => changeCamera("top")}
        >
          Top view
        </button>
        <button
          type="button"
          disabled={failed}
          onClick={() => changeCamera("reset")}
        >
          Reset view
        </button>
      </div>
    </div>
  );
}
