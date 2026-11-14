"use client";

import { useEffect, useRef, useState } from "react";
import { createEmberRenderer, type EmberRenderer } from "./ember-renderer";
import styles from "./brand-ember.module.css";

/** A decorative, briefly animated accent; never represents scientific data. */
export function BrandEmber({
  active,
  reducedMotion,
  className = "",
}: {
  active: boolean;
  reducedMotion: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<EmberRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setSystemReducedMotion(media.matches);
    const updateVisibility = () => setDocumentVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(canvas);
    const lost = (event: Event) => {
      event.preventDefault();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setReady(false);
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      canvas.removeEventListener("webglcontextlost", lost);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!visible || !documentVisible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!rendererRef.current) {
      rendererRef.current = createEmberRenderer(canvas);
      setReady(rendererRef.current?.render(0) ?? false);
    }
    const renderer = rendererRef.current;
    if (!renderer || !active || reducedMotion || systemReducedMotion) return;
    let frame = 0;
    let start: number | null = null;
    let previous = -Infinity;
    function animate(timestamp: number) {
      start ??= timestamp;
      const elapsed = timestamp - start;
      if (elapsed > 1400 || document.hidden) return;
      if (timestamp - previous >= 50) {
        if (!renderer?.render(elapsed / 1000)) {
          setReady(false);
          return;
        }
        previous = timestamp;
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [active, reducedMotion, systemReducedMotion, visible, documentVisible]);

  return (
    <span
      className={`${styles.ember} ${ready ? styles.ready : ""} ${className}`}
      aria-hidden="true"
    >
      <span className={styles.fallback} />
      <canvas ref={canvasRef} className={styles.canvas} />
    </span>
  );
}
