import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';

type UniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number];

interface Props {
  frag: string;
  uniforms?: Record<string, UniformValue>;
  className?: string;
  maxDpr?: number;
}

const VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export function ShaderCanvas({ frag, uniforms, className, maxDpr = 2 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const uniformsRef = useRef<Record<string, UniformValue>>(uniforms ?? {});
  uniformsRef.current = uniforms ?? {};
  const reducedMotion = usePrefersReducedMotion();

  // Snapshot the uniform *keys+types* at mount so we can emit the right GLSL declarations.
  // Runtime value changes are fine; swapping a uniform from float→vec3 would require remount.
  const initialUniformTypes = useRef<Record<string, 'float' | 'vec2' | 'vec3' | 'vec4'>>({});
  if (Object.keys(initialUniformTypes.current).length === 0) {
    for (const [k, v] of Object.entries(uniforms ?? {})) {
      initialUniformTypes.current[k] = uniformTypeOf(v);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, alpha: false });
    if (!gl) {
      console.error('[ShaderCanvas] WebGL2 not supported');
      return;
    }

    const wrappedFrag = wrapFrag(frag, initialUniformTypes.current);
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, wrappedFrag);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[ShaderCanvas] link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      // oversize triangle covering the NDC viewport
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const loc = {
      iResolution: gl.getUniformLocation(program, 'iResolution'),
      iTime: gl.getUniformLocation(program, 'iTime'),
      iMouse: gl.getUniformLocation(program, 'iMouse'),
    };
    const customLocs: Record<string, WebGLUniformLocation | null> = {};
    for (const name of Object.keys(initialUniformTypes.current)) {
      customLocs[name] = gl.getUniformLocation(program, name);
    }

    let mouseX = 0;
    let mouseY = 0;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, maxDpr);
      mouseX = (e.clientX - rect.left) * dpr;
      mouseY = (rect.height - (e.clientY - rect.top)) * dpr;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, maxDpr);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    gl.useProgram(program);

    let raf = 0;
    let running = true;
    const start = performance.now();

    // Under prefers-reduced-motion the loop draws a single static frame at a
    // representative iTime and stops. On ResizeObserver resize we manually
    // re-draw (handled by forcing viewport in the static-frame path via an
    // additional resize listener below).
    const STATIC_FRAME_TIME = 2.0;

    const render = () => {
      if (!running) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (loc.iResolution) gl.uniform3f(loc.iResolution, canvas.width, canvas.height, 1);
      if (loc.iTime) {
        gl.uniform1f(loc.iTime, reducedMotion ? STATIC_FRAME_TIME : (performance.now() - start) / 1000);
      }
      if (loc.iMouse) gl.uniform4f(loc.iMouse, mouseX, mouseY, 0, 0);

      for (const [name, u] of Object.entries(uniformsRef.current)) {
        const ul = customLocs[name];
        if (!ul) continue;
        if (typeof u === 'number') gl.uniform1f(ul, u);
        else if (u.length === 2) gl.uniform2f(ul, u[0], u[1]);
        else if (u.length === 3) gl.uniform3f(ul, u[0], u[1], u[2]);
        else if (u.length === 4) gl.uniform4f(ul, u[0], u[1], u[2], u[3]);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reducedMotion) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    // When reduced-motion is on, the RAF loop won't self-repaint on resize.
    // Re-kick a single frame so the canvas matches the new viewport.
    const onResize = () => {
      if (!reducedMotion) return;
      raf = requestAnimationFrame(render);
    };
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(vbo);
    };
  }, [frag, maxDpr, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className ?? 'fixed inset-0 w-full h-full block'}
    />
  );
}

function uniformTypeOf(v: UniformValue): 'float' | 'vec2' | 'vec3' | 'vec4' {
  if (typeof v === 'number') return 'float';
  if (v.length === 2) return 'vec2';
  if (v.length === 3) return 'vec3';
  return 'vec4';
}

function wrapFrag(userBody: string, types: Record<string, 'float' | 'vec2' | 'vec3' | 'vec4'>): string {
  const customDecl = Object.entries(types)
    .map(([name, t]) => `uniform ${t} ${name};`)
    .join('\n');

  return `#version 300 es
precision highp float;
precision highp int;

uniform vec3 iResolution;
uniform float iTime;
uniform vec4 iMouse;
${customDecl}

out vec4 outColor;

${userBody}

void main() {
  vec4 col;
  mainImage(col, gl_FragCoord.xy);
  outColor = col;
}
`;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[ShaderCanvas] compile error:\n' + gl.getShaderInfoLog(s) + '\n--- source ---\n' + src);
    gl.deleteShader(s);
    return null;
  }
  return s;
}
