// Curved 3D project reel: scroll (sticky) + drag + keys drive a damped phase; cards are bent planes on a horizontal track.
import * as THREE from './vendor/three.module.min.js';

export function mountReel(root) {
  const data = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
  const N = data.length;
  const stage = root.querySelector('.reel__stage');
  const desc = root.querySelector('[data-reel-desc]');
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = rm.matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { root.classList.add('reel--fallback'); return () => {}; }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.className = 'reel__canvas';
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  stage.append(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65.7, 1, 0.1, 40);
  camera.position.set(0, 0, 8.1);

  const W = 2.38, H = 1.5771, SX = 48, SY = 24, HALF = W / 2;
  const vert = `
    varying vec2 vUv; varying float vShade;
    uniform float uBend;
    void main() {
      vUv = uv;
      vec3 p = position;
      float ang = (p.x / ${HALF.toFixed(3)}) * uBend;
      float r = ${HALF.toFixed(3)} / max(uBend, 0.0001);
      vShade = cos(ang);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const frag = `
    precision highp float;
    varying vec2 vUv; varying float vShade;
    uniform sampler2D uTex; uniform vec2 uTexScale; uniform vec2 uTexOff; uniform float uOpacity; uniform float uAspect;
    float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    void main() {
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      float d = sdRound(p, vec2(uAspect * 0.5, 0.5), 0.035);
      float aa = fwidth(d);
      float mask = 1.0 - smoothstep(-aa, aa, d);
      vec4 c = texture2D(uTex, vUv * uTexScale + uTexOff);
      float shade = mix(0.82, 1.0, pow(vShade, 3.0));
      gl_FragColor = vec4(c.rgb * shade, c.a * mask * uOpacity);
      if (gl_FragColor.a < 0.003) discard;
    }`;

  const loader = new THREE.TextureLoader();
  const cards = data.map((d, i) => {
    const geo = new THREE.PlaneGeometry(W, H, SX, SY);
    const base = geo.attributes.position.array.slice();
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, side: THREE.FrontSide,
      uniforms: { uTex: { value: null }, uTexScale: { value: new THREE.Vector2(1, 1) }, uTexOff: { value: new THREE.Vector2(0, 0) }, uOpacity: { value: 0 }, uBend: { value: 0.3 }, uAspect: { value: W / H } },
      extensions: { derivatives: true },
    });
    loader.load(d.cover, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const ia = tex.image.width / tex.image.height, pa = W / H;
      if (ia > pa) { mat.uniforms.uTexScale.value.set(pa / ia, 1); mat.uniforms.uTexOff.value.set((1 - pa / ia) / 2, 0); }
      else { mat.uniforms.uTexScale.value.set(1, ia / pa); mat.uniforms.uTexOff.value.set(0, 1 - ia / pa); }
      mat.uniforms.uTex.value = tex; mat.uniforms.uOpacity.value = 1; dirty = true;
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { mesh, geo, base, mat, i };
  });

  const bendGeo = (c, bend, t) => {
    const pos = c.geo.attributes.position.array, b = c.base, r = HALF / bend;
    for (let k = 0; k < pos.length; k += 3) {
      const x = b[k], y = b[k + 1];
      const a = (x / HALF) * bend;
      pos[k] = Math.sin(a) * r;
      pos[k + 1] = y;
      pos[k + 2] = (Math.cos(a) - 1) * r + (reduced ? 0 : 0.006 * Math.sin(t * 0.6 + x * 1.7 + y * 2.3 + c.i));
    }
    c.geo.attributes.position.needsUpdate = true;
  };

  // track size adapts to the viewport: central card ~37% of desktop width, ~77% on phones
  let trackR = 3, trackD = 5, pitch = 0.52, vw = 1, vh = 1;
  const resize = () => {
    const r = stage.getBoundingClientRect(); vw = Math.max(1, r.width); vh = Math.max(1, r.height);
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh; camera.updateProjectionMatrix();
    const f = vw <= 420 ? 0.77 : vw >= 1200 ? 0.37 : 0.77 + (0.37 - 0.77) * ((vw - 420) / 780);
    const visW = W / f;
    const dist = visW / (2 * Math.tan(THREE.MathUtils.degToRad(65.7 / 2)) * camera.aspect);
    trackD = 8.1 - dist + 0.28;
    trackR = visW * (0.78 + 0.4 * Math.min(1, Math.max(0, (f - 0.37) / 0.4)));
    dirty = true;
  };

  // phase: damped floating project index
  let phase = 0, target = 0, vel = 0, dirty = true, time = 0;
  const wrapRel = v => { let r = ((v % N) + N) % N; if (r >= N / 2) r -= N; return r; };

  const range = () => { const r = root.getBoundingClientRect(); return { top: r.top + scrollY, span: Math.max(1, root.offsetHeight - innerHeight) }; };
  const fromScroll = () => { const { top, span } = range(); const p = Math.min(1, Math.max(0, (scrollY - top) / span)); return p * (N - 1); };
  const scrollToPhase = (ph, smooth) => { const { top, span } = range(); window.scrollTo({ top: top + (ph / (N - 1)) * span, behavior: smooth && !reduced ? 'smooth' : 'auto' }); };

  const setDesc = () => {
    const i = ((Math.round(target) % N) + N) % N, d = data[i];
    const txt = `${root.dataset.title || 'Sitios web de clientes'}. ${(root.dataset.project || 'Proyecto {i} de {n}').replace('{i}', i + 1).replace('{n}', N)}: ${d.name}, ${d.category}. ${d.description}`;
    if (canvas.getAttribute('aria-label') !== txt) { canvas.setAttribute('aria-label', txt); if (desc) desc.textContent = `${d.name}: ${d.description}`; }
  };

  const onScroll = () => { if (!dragging) { target = fromScroll(); if (reduced) phase = target; setDesc(); wake(); } };

  // drag: left or down advances; release settles to the nearest project
  let dragging = false, dragId = null, sx = 0, sy = 0, startT = 0;
  const onDown = e => { dragging = true; dragId = e.pointerId; sx = e.clientX; sy = e.clientY; startT = target; canvas.setPointerCapture(dragId); };
  const onMove = e => {
    if (!dragging || e.pointerId !== dragId) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    const t = startT + (-dx / (vw * 0.35)) + (e.pointerType === 'mouse' ? dy / (vh * 0.5) : 0);
    target = Math.min(N - 1, Math.max(0, t)); if (reduced) phase = target; setDesc(); wake();
  };
  const onUp = e => {
    if (!dragging || (e && e.pointerId !== dragId)) return;
    dragging = false; try { canvas.releasePointerCapture(dragId); } catch (_) {}
    dragId = null; target = Math.round(target); scrollToPhase(target, true); setDesc();
  };
  const onKey = e => {
    let t = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') t = Math.round(target) + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') t = Math.round(target) - 1;
    else if (e.key === 'Home') t = 0;
    else if (e.key === 'End') t = N - 1;
    if (t === null) return;
    e.preventDefault(); target = Math.min(N - 1, Math.max(0, t)); if (reduced) phase = target; scrollToPhase(target, true); setDesc(); wake();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', () => { if (dragging) onUp(); });
  canvas.addEventListener('keydown', onKey);
  addEventListener('scroll', onScroll, { passive: true });

  const place = () => {
    const speed = Math.min(1, Math.abs(vel) * 0.9);
    const bend = reduced ? 0.3 : 0.3 + 0.12 * speed;
    const order = [];
    for (const c of cards) {
      const rel = wrapRel(c.i - phase);
      const th = rel * 0.73;
      c.mesh.position.set(Math.sin(th) * trackR, rel * pitch, Math.cos(th) * trackD - 0.28);
      c.mesh.rotation.set(rel * -0.01 + (reduced ? 0 : vel * 0.015), Math.atan2(trackD * Math.sin(th), trackR * Math.cos(th)), reduced ? 0 : -vel * 0.02);
      c.mesh.visible = Math.abs(th) < 1.45;
      c.mat.uniforms.uBend.value = bend;
      bendGeo(c, bend, time);
      order.push(c);
    }
    order.sort((a, b) => a.mesh.position.z - b.mesh.position.z).forEach((c, k) => { c.mesh.renderOrder = k; });
  };

  let raf = 0, last = 0, onScreen = false;
  const running = () => onScreen && !document.hidden;
  const tick = now => {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    time += dt;
    const prev = phase;
    phase = reduced ? target : phase + (target - phase) * (1 - Math.exp(-13 * dt));
    vel = dt > 0 ? (phase - prev) / dt : 0;
    place();
    renderer.render(scene, camera);
    const settled = Math.abs(target - phase) < 0.0005;
    raf = running() && (!settled || !reduced) ? requestAnimationFrame(tick) : 0;
    if (!raf) last = 0;
  };
  const wake = () => { if (running() && !raf) { last = 0; raf = requestAnimationFrame(tick); } else if (!running() && dirty) { place(); renderer.render(scene, camera); dirty = false; } };
  const io = new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; if (!onScreen && raf) { cancelAnimationFrame(raf); raf = 0; last = 0; } wake(); }, { rootMargin: '100px' });
  io.observe(root);
  const onVis = () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; last = 0; } wake(); };
  document.addEventListener('visibilitychange', onVis);
  const onRm = () => { reduced = rm.matches; phase = target; wake(); };
  rm.addEventListener('change', onRm);
  const ro = new ResizeObserver(() => { resize(); wake(); });
  ro.observe(stage);
  resize(); target = phase = fromScroll(); setDesc(); place(); renderer.render(scene, camera);

  return () => {
    cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
    removeEventListener('scroll', onScroll); document.removeEventListener('visibilitychange', onVis); rm.removeEventListener('change', onRm);
    for (const c of cards) { c.geo.dispose(); c.mat.uniforms.uTex.value?.dispose(); c.mat.dispose(); }
    renderer.dispose(); canvas.remove();
  };
}

for (const el of document.querySelectorAll('[data-reel]')) mountReel(el);
