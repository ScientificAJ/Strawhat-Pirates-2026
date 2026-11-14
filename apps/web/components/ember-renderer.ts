// A decorative volume adapted from the supplied flame visualizer, not a
// combustion simulation. Its fixed preset has no relationship to source data.
const vertexSource = `#version 300 es
  const vec2 positions[3] = vec2[3](
    vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0)
  );
  out vec2 uv;
  void main() {
    vec2 position = positions[gl_VertexID];
    uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentSource = `#version 300 es
  precision highp float;
  in vec2 uv;
  out vec4 color;
  uniform float time;

  float hash(vec3 point) {
    point = fract(point * 0.1031);
    point += dot(point, point.yzx + 33.33);
    return fract((point.x + point.y) * point.z);
  }

  float noise(vec3 point) {
    vec3 cell = floor(point);
    vec3 blend = fract(point);
    blend = blend * blend * (3.0 - 2.0 * blend);
    return mix(
      mix(mix(hash(cell), hash(cell + vec3(1, 0, 0)), blend.x),
          mix(hash(cell + vec3(0, 1, 0)), hash(cell + vec3(1, 1, 0)), blend.x), blend.y),
      mix(mix(hash(cell + vec3(0, 0, 1)), hash(cell + vec3(1, 0, 1)), blend.x),
          mix(hash(cell + vec3(0, 1, 1)), hash(cell + vec3(1, 1, 1)), blend.x), blend.y),
      blend.z
    ) * 2.0 - 1.0;
  }

  float turbulence(vec3 point) {
    return noise(point) * 0.52 + noise(point * 2.07) * 0.25;
  }

  vec3 sampleFlame(vec3 point) {
    float height = (point.y + 0.85) / 2.05;
    if (height < -0.06 || height > 1.08) return vec3(0.0);
    float h = clamp(height, 0.0, 1.0);
    float base = smoothstep(-0.05, 0.13, height);
    float radius = 0.44 * base * (0.20 + 0.80 * pow(1.0 - h, 0.78));
    vec3 flow = point * vec3(1.55, 1.1, 1.55) - vec3(0.0, time * 0.72, 0.0);
    float coarse = turbulence(flow);
    float detail = turbulence(point * 3.2 - vec3(0.0, time * 1.2, 0.0));
    vec2 sway = vec2(coarse, detail) * (0.02 + 0.09 * h);
    float radial = length(point.xz - sway) / max(radius, 0.001);
    float field = 1.0 - radial + detail * (0.05 + 0.12 * h);
    float density = smoothstep(-0.22, 0.92, field);
    density *= smoothstep(-0.05, 0.07, height);
    density *= 1.0 - smoothstep(0.50, 1.02 + detail * 0.05, height);
    float core = (1.0 - smoothstep(0.05, 0.78, radial)) * (1.0 - 0.48 * h);
    float temperature = clamp(density * 0.52 + core * 0.50 + detail * 0.05, 0.0, 1.1);
    return vec3(density, temperature, h);
  }

  vec3 palette(float temperature, float height) {
    vec3 result = mix(vec3(0.68, 0.04, 0.005), vec3(1.0, 0.32, 0.015),
      smoothstep(0.05, 0.42, temperature));
    result = mix(result, vec3(1.0, 0.75, 0.18), smoothstep(0.42, 0.78, temperature));
    result = mix(result, vec3(1.08, 0.96, 0.78), smoothstep(0.78, 1.1, temperature));
    return mix(result, vec3(0.08, 0.46, 1.08),
      (1.0 - smoothstep(0.01, 0.20, height)) * 0.65);
  }

  void main() {
    // An orthographic ray crosses the actual volume; no background or bloom
    // buffers are needed at the wordmark's small display size.
    vec2 position = (uv - 0.5) * vec2(1.65, 2.5);
    vec3 radiance = vec3(0.0);
    float transmittance = 1.0;
    const float stepLength = 1.3 / 24.0;
    for (int step = 0; step < 24; step++) {
      vec3 point = vec3(position.x, position.y + 0.15, 0.65 - float(step) * stepLength);
      vec3 flame = sampleFlame(point);
      float alpha = 1.0 - exp(-flame.x * 3.2 * stepLength);
      radiance += transmittance * palette(flame.y, flame.z) * alpha;
      transmittance *= 1.0 - alpha;
    }
    // Premultiplied output preserves transparent edges on both app themes.
    color = vec4(radiance, 1.0 - transmittance);
  }
`;

export interface EmberRenderer {
  render: (timeSeconds: number) => boolean;
  dispose: () => void;
}

/** Creates one bounded decorative render target, or returns null for fallback. */
export function createEmberRenderer(
  canvas: HTMLCanvasElement,
): EmberRenderer | null {
  let gl: WebGL2RenderingContext | null = null;
  let program: WebGLProgram | null = null;
  const shaders: WebGLShader[] = [];
  let disposed = false;

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (gl) {
      for (const shader of shaders) gl.deleteShader(shader);
      if (program) gl.deleteProgram(program);
    }
  }

  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });
    if (!gl) return null;
    canvas.width = 48;
    canvas.height = 72;
    program = gl.createProgram();
    if (!program) return null;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, fragmentSource],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Flame shader unavailable");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error("Flame shader did not compile");
      }
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Flame shader did not link");
    }
    const timeLocation = gl.getUniformLocation(program, "time");
    gl.useProgram(program);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const context = gl;
    return {
      render(timeSeconds) {
        if (disposed || context.isContextLost()) return false;
        context.uniform1f(timeLocation, timeSeconds);
        context.drawArrays(context.TRIANGLES, 0, 3);
        return true;
      },
      dispose,
    };
  } catch {
    dispose();
    return null;
  }
}
