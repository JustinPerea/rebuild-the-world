// The film's dot globe as a live canvas. No dependencies: plain WebGL.
//
//   import { mountEarthGlobe } from "./earth-globe.js";
//   const globe = mountEarthGlobe(canvas, window.RTW_LAND);   // land.js sets RTW_LAND: [lon, lat, lon, lat, ...]
//   globe.destroy();
//
// The canvas is transparent, so the page's background shows around the sphere. Size it with CSS (square works best).
// Dragging turns the globe; it eases back to its slow spin. With prefers-reduced-motion it draws one still frame.

const SPHERE_VS = `attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0.0, 1.0); }`;
const SPHERE_FS = `precision highp float;
varying vec2 v; uniform vec3 cam, fwd, right, up; uniform float tanHalf, aspect, px;
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 dir = normalize(fwd + right * v.x * tanHalf * aspect + up * v.y * tanHalf);
  float b = dot(cam, dir), d2 = dot(cam, cam) - b * b, dist = sqrt(max(d2, 0.0));
  float a = clamp((1.0 - dist) / px + 0.5, 0.0, 1.0);
  if (a <= 0.0) discard;
  vec3 n = normalize(cam + (-b - sqrt(max(1.0 - d2, 0.0))) * dir);
  vec3 albedo = lin(vec3(0.137, 0.251, 0.435)) / 3.14159;
  vec3 hemi = mix(lin(vec3(0.165, 0.204, 0.345)), lin(vec3(0.557, 0.651, 0.878)), n.y * 0.5 + 0.5) * 1.0;
  vec3 l = normalize(vec3(4.5, 1.6, -2.2)), sun = lin(vec3(1.0, 0.78, 0.612)) * 3.2;
  float ndl = max(dot(n, l), 0.0);
  vec3 h = normalize(l - dir);
  float spec = pow(max(dot(n, h), 0.0), 9.0) * 0.045 * ndl;
  vec3 col = albedo * (hemi + sun * ndl) + sun * spec;
  gl_FragColor = vec4(pow(aces(col), vec3(1.0 / 2.2)), a);
}`;
const DOT_VS = `attribute vec3 pos; attribute float lit;
uniform mat3 rot; uniform mat4 view, proj; uniform vec3 cam; uniform float time, px;
varying float k; varying float fade;
void main(){
  vec3 w = rot * pos;
  vec4 mv = view * vec4(w * 1.004, 1.0);
  k = clamp((time - lit) / 0.45, 0.0, 1.0);
  float pop = 1.0 + 0.9 * k * (1.0 - k) * 2.0;
  fade = smoothstep(0.0, 0.1, dot(w, normalize(cam - w)));
  gl_PointSize = max(1.5, px * (0.0125 + 0.0075 * k) * pop / -mv.z);
  gl_Position = fade > 0.0 ? proj * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`;
const DOT_FS = `precision mediump float; varying float k; varying float fade;
void main(){
  float a = 1.0 - smoothstep(0.38, 0.5, length(gl_PointCoord - 0.5));
  if (a < 0.02) discard;
  vec3 col = mix(vec3(0.561, 0.651, 0.839), vec3(1.0, 0.76, 0.37), k);
  gl_FragColor = vec4(col, a * mix(0.75, 1.0, k) * fade);
}`;

const hash = (a, b = 0, c = 0) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

export function mountEarthGlobe(canvas, land, options = {}) {
  const o = { tilt: 0.28, rotation: -0.25, speed: 0.07, distance: 5.35, fill: 0.94, clusters: 46, lightUpSeconds: 6, ...options };
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl || !land || !land.length) return null;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // land dots, and seeded clusters that light up: places where people have started building
  const n = land.length / 2, pos = new Float32Array(n * 3), lit = new Float32Array(n).fill(1e6);
  for (let i = 0; i < n; i++) {
    const lon = (land[i * 2] * Math.PI) / 180, lat = (land[i * 2 + 1] * Math.PI) / 180;
    pos.set([Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)], i * 3);
  }
  for (let c = 0; c < o.clusters; c++) {
    const ci = Math.floor(hash(c, 7, 1) * n) * 3, cx = pos[ci], cy = pos[ci + 1], cz = pos[ci + 2];
    if (Math.abs(cy) > 0.9) continue;
    const rad = 0.035 + hash(c, 7, 2) * 0.075, t0 = hash(c, 7, 3) * 5.6;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(pos[i * 3] - cx, pos[i * 3 + 1] - cy, pos[i * 3 + 2] - cz);
      if (d < rad && hash(i, c, 9) < 0.8 - (d / rad) * 0.5) lit[i] = Math.min(lit[i], t0 + (d / rad) * 0.9 + hash(i, 5, 5) * 0.25);
    }
  }

  const sphere = program(gl, SPHERE_VS, SPHERE_FS), dots = program(gl, DOT_VS, DOT_FS);
  const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
  const quad = buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])), posBuf = buf(pos), litBuf = buf(lit);
  const U = (p, name) => gl.getUniformLocation(p, name), A = (p, name) => gl.getAttribLocation(p, name);

  // camera: slightly above the equator, looking at the centre; field of view chosen so the sphere fills `fill` of the height
  const d = o.distance, cam = [0, d * 0.12, d], len = Math.hypot(...cam);
  const tanHalf = Math.tan(Math.asin(1 / len)) / o.fill;
  const fwd = cam.map((x) => -x / len), right = [1, 0, 0];
  const up = [0, -fwd[2], fwd[1]]; // cross(right, fwd)
  const view = new Float32Array([right[0], up[0], -fwd[0], 0, right[1], up[1], -fwd[1], 0, right[2], up[2], -fwd[2], 0,
    -(right[0] * cam[0] + right[1] * cam[1] + right[2] * cam[2]), -(up[0] * cam[0] + up[1] * cam[1] + up[2] * cam[2]), fwd[0] * cam[0] + fwd[1] * cam[1] + fwd[2] * cam[2], 1]);

  let rot = o.rotation, tilt = o.tilt, vel = o.speed, clock = still ? 100 : 0, last = 0, raf = 0, visible = true, dragging = null, w = 0, h = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * dpr)); h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    draw();
  }

  function draw() {
    if (!w) return;
    const aspect = w / h, near = 0.05, far = 100, f = 1 / tanHalf;
    const proj = new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
    const cy = Math.cos(rot), sy = Math.sin(rot), cx = Math.cos(tilt), sx = Math.sin(tilt);
    const R = new Float32Array([cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy]); // Rx(tilt) * Ry(rot), column-major
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);

    gl.disable(gl.BLEND); gl.useProgram(sphere);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(A(sphere, "p")); gl.vertexAttribPointer(A(sphere, "p"), 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(U(sphere, "cam"), cam); gl.uniform3fv(U(sphere, "fwd"), fwd); gl.uniform3fv(U(sphere, "right"), right); gl.uniform3fv(U(sphere, "up"), up);
    gl.uniform1f(U(sphere, "tanHalf"), tanHalf); gl.uniform1f(U(sphere, "aspect"), aspect); gl.uniform1f(U(sphere, "px"), (2 * tanHalf * len) / h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(dots);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.enableVertexAttribArray(A(dots, "pos")); gl.vertexAttribPointer(A(dots, "pos"), 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, litBuf); gl.enableVertexAttribArray(A(dots, "lit")); gl.vertexAttribPointer(A(dots, "lit"), 1, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix3fv(U(dots, "rot"), false, R); gl.uniformMatrix4fv(U(dots, "view"), false, view); gl.uniformMatrix4fv(U(dots, "proj"), false, proj);
    gl.uniform3fv(U(dots, "cam"), cam); gl.uniform1f(U(dots, "time"), clock); gl.uniform1f(U(dots, "px"), h / (2 * tanHalf));
    gl.drawArrays(gl.POINTS, 0, n);
  }

  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0)); last = now;
    clock += dt * (7.2 / o.lightUpSeconds);
    if (!dragging) { vel += (o.speed - vel) * (1 - Math.exp(-dt * 2.2)); tilt += (o.tilt - tilt) * (1 - Math.exp(-dt * 3)); rot += vel * dt; }
    draw();
    raf = visible ? requestAnimationFrame(frame) : 0;
  }
  const start = () => { if (!raf && !still && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  // drag to turn, with the release speed carried over
  const down = (e) => { dragging = { x: e.clientX, y: e.clientY, t: performance.now(), v: 0 }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; };
  const move = (e) => {
    if (!dragging) return;
    const s = 2.6 / canvas.getBoundingClientRect().width, now = performance.now(), dx = (e.clientX - dragging.x) * s, dy = (e.clientY - dragging.y) * s;
    rot += dx; tilt = Math.max(-0.5, Math.min(0.9, tilt + dy * 0.6));
    dragging.v = dx / Math.max(0.008, (now - dragging.t) / 1000); dragging.x = e.clientX; dragging.y = e.clientY; dragging.t = now;
    if (still) draw();
  };
  const upEv = () => { if (!dragging) return; vel = Math.max(-4, Math.min(4, dragging.v)); dragging = null; canvas.style.cursor = "grab"; };
  canvas.style.cursor = "grab"; canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", upEv); canvas.addEventListener("pointercancel", upEv);

  const ro = new ResizeObserver(resize); ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }); io.observe(canvas);
  const vis = () => { visible = !document.hidden; if (visible) start(); };
  document.addEventListener("visibilitychange", vis);
  resize(); start();

  return {
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vis);
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", upEv); canvas.removeEventListener("pointercancel", upEv);
    },
    get rotation() { return rot; },
    get time() { return clock; },
    // for a still capture or a test: jump to a moment with every cluster lit
    settle(rotation = rot) { rot = rotation; clock = 100; draw(); },
  };
}
