import * as THREE from "three";

export type SceneResources = {
  geometry: <T extends THREE.BufferGeometry>(value: T) => T;
  material: <T extends THREE.Material>(value: T) => T;
};

/** Illustrative optical chamber, without experiment-specific instruments. */
export function createChamber(resources: SceneResources) {
  const root = new THREE.Group();
  const metal = resources.material(
    new THREE.MeshStandardMaterial({
      color: 0x263447,
      metalness: 0.6,
      roughness: 0.4,
    }),
  );
  const steel = resources.material(
    new THREE.MeshStandardMaterial({
      color: 0x9baabd,
      metalness: 0.65,
      roughness: 0.3,
    }),
  );
  const baseProfile = [
    [0, 0],
    [2.25, 0],
    [2.25, 0.12],
    [2.08, 0.24],
    [1.85, 0.24],
    [1.78, 0.31],
    [0, 0.31],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  const base = new THREE.Mesh(
    resources.geometry(new THREE.LatheGeometry(baseProfile, 12)),
    metal,
  );
  base.position.y = -1.8;
  root.add(base);

  const rimGeometry = resources.geometry(
    new THREE.TorusGeometry(1.81, 0.07, 8, 48),
  );
  for (const height of [-1.47, 1.6]) {
    const rim = new THREE.Mesh(rimGeometry, steel);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = height;
    root.add(rim);
  }
  const crown = new THREE.Mesh(
    resources.geometry(
      new THREE.CylinderGeometry(1.94, 1.94, 0.15, 48, 1, true),
    ),
    metal,
  );
  crown.position.y = 1.6;
  root.add(crown);

  const pillarGeometry = resources.geometry(
    new THREE.CylinderGeometry(0.04, 0.04, 3.06, 10),
  );
  const collarGeometry = resources.geometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.12, 12),
  );
  for (let index = 0; index < 4; index++) {
    const angle = Math.PI / 4 + (index * Math.PI) / 2;
    const x = Math.cos(angle) * 1.9;
    const z = Math.sin(angle) * 1.9;
    const pillar = new THREE.Mesh(pillarGeometry, steel);
    pillar.position.set(x, 0.065, z);
    root.add(pillar);
    for (const height of [-1.45, 1.6]) {
      const collar = new THREE.Mesh(collarGeometry, metal);
      collar.position.set(x, height, z);
      root.add(collar);
    }
  }

  const vessel = new THREE.Mesh(
    resources.geometry(
      new THREE.CylinderGeometry(1.75, 1.75, 2.96, 40, 1, true),
    ),
    resources.material(
      new THREE.MeshBasicMaterial({
        color: 0x8caac8,
        transparent: true,
        opacity: 0.035,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ),
  );
  vessel.position.y = 0.065;
  vessel.renderOrder = 3;
  root.add(vessel);
  return root;
}
