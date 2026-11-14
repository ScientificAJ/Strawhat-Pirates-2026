import * as THREE from "three";
import type { SceneResources } from "./chamber";

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// The shell is an illustration, not a chemistry, temperature, or stand-off model.
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vWorldPosition;
  uniform float uTime;
  uniform float uDiameterRatio;

  vec2 sphereRange(vec3 origin, vec3 direction, float radius) {
    float b = dot(origin, direction);
    float discriminant = b * b - dot(origin, origin) + radius * radius;
    if (discriminant < 0.0) return vec2(1.0, -1.0);
    float halfChord = sqrt(discriminant);
    return vec2(-b - halfChord, -b + halfChord);
  }

  void main() {
    vec3 direction = normalize(vWorldPosition - cameraPosition);
    vec2 bounds = sphereRange(cameraPosition, direction, 1.3);
    float nearDistance = max(0.0, bounds.x);
    float farDistance = bounds.y;
    vec2 droplet = sphereRange(cameraPosition, direction, 0.42 * uDiameterRatio);
    if (droplet.x > 0.0 && droplet.y > droplet.x) {
      farDistance = min(farDistance, droplet.x);
    }
    if (farDistance <= nearDistance) discard;

    float stepLength = (farDistance - nearDistance) / 32.0;
    float distanceAlongRay = nearDistance + 0.5 * stepLength;
    float transmittance = 1.0;
    vec3 radiance = vec3(0.0);
    float shellRadius = 0.42 + 0.47 * uDiameterRatio;
    for (int index = 0; index < 32; index++) {
      vec3 point = cameraPosition + direction * distanceAlongRay;
      float texture = sin(point.x * 6.5 + uTime * 0.6)
        * cos(point.y * 5.2 - uTime * 0.5)
        * sin(point.z * 5.8 + uTime * 0.4);
      float shellDistance = length(point) - shellRadius + texture * 0.018;
      float shellDensity = exp(-pow(shellDistance / 0.07, 2.0));
      float stepAlpha = 1.0 - exp(-shellDensity * stepLength * 2.4);
      vec3 shellColor = mix(vec3(0.13, 0.43, 1.0), vec3(0.4, 0.88, 1.0),
        clamp(0.5 + shellDistance * 5.0, 0.0, 1.0));
      radiance += transmittance * shellColor * stepAlpha * 1.6;
      transmittance *= 1.0 - stepAlpha;
      distanceAlongRay += stepLength;
    }
    float alpha = 1.0 - transmittance;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(radiance / max(alpha, 0.001), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createIllustrativeFlame(resources: SceneResources) {
  const uniforms = {
    uTime: { value: 0 },
    uDiameterRatio: { value: 1 },
  };
  const material = resources.material(
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  );
  const mesh = new THREE.Mesh(
    resources.geometry(new THREE.BoxGeometry(2.6, 2.6, 2.6)),
    material,
  );
  mesh.renderOrder = 2;
  return { mesh, uniforms };
}
