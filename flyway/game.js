// Flyway — rendering, input and UI. Economy lives in econ.js.
(function () {
  'use strict';
  const F = window.Flyway;
  const { CITIES, BIRDS, UPGRADES, fmt, fmtTime } = F;
  const $ = (id) => document.getElementById(id);
  const D2R = Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const SAVE_KEY = 'flyway.save.v1';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ======================================================================
  // World map: one equirectangular canvas is both the globe texture and the
  // land/sea lookup the side view uses.
  // ======================================================================
  const TW = 2048, TH = 1024;
  const mask = document.createElement('canvas'); mask.width = TW; mask.height = TH;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  const px = (lon) => (lon + 180) / 360 * TW, py = (lat) => (90 - lat) / 180 * TH;
  // Rings that cross the date line are unwrapped (longitudes kept continuous)
  // and drawn at -360/0/+360 so the canvas clips them cleanly. A ring that
  // circles a pole (Antarctica) is closed along that pole's edge.
  const unwrapped = window.FLY_LAND.map((poly) => poly.map((r) => {
    const out = [r[0], r[1]]; let shift = 0;
    for (let i = 2; i < r.length; i += 2) {
      const d = r[i] - r[i - 2];
      if (d > 180) shift -= 360; else if (d < -180) shift += 360;
      out.push(r[i] + shift, r[i + 1]);
    }
    if (shift !== 0) {
      const pole = r[1] < 0 ? -90 : 90, lastLon = out[out.length - 2];
      out.push(lastLon, pole, r[0], pole);
    }
    return out;
  }));
  function pathPolys(ctx, poly) {
    for (const off of [-360, 0, 360]) for (const r of poly) {
      ctx.moveTo(px(r[0] + off), py(r[1]));
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(px(r[i] + off), py(r[i + 1]));
      ctx.closePath();
    }
  }
  function tracePolys(ctx) {
    for (const poly of unwrapped) { ctx.beginPath(); pathPolys(ctx, poly); ctx.fill('evenodd'); }
  }
  mctx.fillStyle = '#000'; mctx.fillRect(0, 0, TW, TH);
  mctx.fillStyle = '#fff'; tracePolys(mctx);
  const maskData = mctx.getImageData(0, 0, TW, TH).data;
  function isLand(lat, lon) {
    const x = clamp(Math.floor(px(((lon + 540) % 360) - 180)), 0, TW - 1);
    const y = clamp(Math.floor(py(lat)), 0, TH - 1);
    return maskData[(y * TW + x) * 4] > 127;
  }

  // Cheap value noise for terrain colour and hill shapes.
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
  }
  const fbm = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.1;

  // Very rough biomes: enough for the land to read right from orbit.
  function biome(lat, lon) {
    const a = Math.abs(lat), jt = (fbm(lon / 5 + 40, lat / 5) - 0.5) * 10;
    if (a + jt > 72 || lat < -60) return 'ice';
    if (a + jt > 62) return 'tundra';
    // ragged edges: jitter the latitude by noise so deserts don't read as boxes
    const j = (fbm(lon / 6, lat / 6) - 0.5) * 9, L = lat + j, O = lon + j;
    const desert = (L > 15 && L < 31 && O > -15 && O < 58) ||
      (L > 37 && L < 45 && O > 78 && O < 110) ||
      (L > -30 && L < -20 && O > 120 && O < 142);
    if (desert) return 'desert';
    // the great mountain ranges: Rockies, Andes, Himalaya and Tibet, Alps
    const alpine = (L > 36 && L < 58 && O > -124 && O < -106) || (L > -48 && L < 6 && O > -79 && O < -66) ||
      (L > 27 && L < 38 && O > 72 && O < 98) || (L > 44 && L < 48 && O > 6 && O < 15);
    if (alpine) return 'alpine';
    if (a + jt * 0.6 < 14) return 'tropic';
    if (a + jt * 0.8 > 50) return 'boreal';
    return 'temperate';
  }
  const BIOME_RGB = {
    ice: [233, 238, 243], tundra: [128, 132, 104], desert: [210, 178, 122], tropic: [40, 98, 44], boreal: [74, 104, 72], temperate: [104, 146, 74], alpine: [112, 118, 96],
  };

  // The globe's painted texture. Painting every land pixel's biome is the slowest thing at
  // startup, so: draw the sea and a plain land fill instantly, paint the biomes at half size
  // in small slices between frames, then remember the finished picture for next launch.
  const EARTH_KEY = 'flyway.earth.v3';
  function buildEarthTexture() {
    const c = document.createElement('canvas'); c.width = TW; c.height = TH;
    const g = c.getContext('2d');
    const sea = g.createLinearGradient(0, 0, 0, TH);
    sea.addColorStop(0, '#2a4b72'); sea.addColorStop(0.3, '#1c5b98'); sea.addColorStop(0.5, '#1f6cae');
    sea.addColorStop(0.7, '#1c5b98'); sea.addColorStop(1, '#2a4b72');
    g.fillStyle = sea; g.fillRect(0, 0, TW, TH);
    // shallow-water halo around every coast
    g.save(); g.strokeStyle = 'rgba(120,200,230,.45)'; g.lineWidth = 7; g.lineJoin = 'round';
    for (const poly of unwrapped) { g.beginPath(); pathPolys(g, poly); g.stroke(); }
    g.restore();
    g.fillStyle = '#6f8f55'; tracePolys(g); // plain land until the painted version is ready
    return c;
  }
  function refineEarth(c, tex) {
    const g = c.getContext('2d');
    const done = () => { tex.needsUpdate = true; };
    // a picture from an earlier launch: use it straight away
    let cached = null; try { cached = localStorage.getItem(EARTH_KEY); } catch (e) {}
    if (cached) {
      const img = new Image();
      img.onload = () => { g.drawImage(img, 0, 0, TW, TH); done(); };
      img.src = cached; return;
    }
    const W = TW / 2, H = TH / 2, small = document.createElement('canvas'); small.width = W; small.height = H;
    const sg = small.getContext('2d'), img = sg.createImageData(W, H), d = img.data;
    let y = 0;
    const slice = () => {
      const t0 = performance.now();
      for (; y < H && performance.now() - t0 < 8; y++) {
        const lat = 90 - (y + 0.5) / H * 180;
        for (let x = 0; x < W; x++) {
          const k = (y * W + x) * 4;
          if (maskData[((y * 2) * TW + x * 2) * 4] < 128) continue;
          const lon = (x + 0.5) / W * 360 - 180, rgb = BIOME_RGB[biome(lat, lon)], n = 0.82 + fbm(x / 20, y / 20) * 0.36;
          d[k] = rgb[0] * n; d[k + 1] = rgb[1] * n; d[k + 2] = rgb[2] * n; d[k + 3] = 255;
        }
      }
      if (y < H) { setTimeout(slice, 0); return; }
      sg.putImageData(img, 0, 0);
      // scale the painted land up and keep it inside the crisp full-size coastline
      const land = document.createElement('canvas'); land.width = TW; land.height = TH;
      const lg = land.getContext('2d'); lg.drawImage(small, 0, 0, TW, TH);
      lg.globalCompositeOperation = 'destination-in'; lg.fillStyle = '#fff'; tracePolys(lg);
      g.drawImage(land, 0, 0); done();
      try { localStorage.setItem(EARTH_KEY, c.toDataURL('image/jpeg', 0.86)); } catch (e) {}
    };
    setTimeout(slice, 0);
  }

  function buildCloudTexture() {
    const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 160; i++) {
      // clouds bunch at the equator and the storm tracks around ±50°
      const band = [0, 50, -50, 25, -25][Math.floor(rnd() * 5)];
      const cy = (90 - (band + (rnd() - 0.5) * 30)) / 180 * H, cx = rnd() * W;
      const n = 4 + Math.floor(rnd() * 9);
      for (let j = 0; j < n; j++) {
        const x = cx + (rnd() - 0.5) * 70, y = cy + (rnd() - 0.5) * 18, r = 6 + rnd() * 20;
        for (const ox of [0, -W, W]) {
          const gr = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
          gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y, r, 0, Math.PI * 2); g.fill();
        }
      }
    }
    return c;
  }

  // ======================================================================
  // Globe (three.js)
  // ======================================================================
  const stage = $('stage');
  const glCanvas = $('globe');
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false });
  renderer.setClearColor(0x060c1f, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 200);

  function geoVec(lat, lon, r = 1) {
    const phi = (lon + 180) * D2R, th = lat * D2R;
    return new THREE.Vector3(-Math.cos(phi) * Math.cos(th) * r, Math.sin(th) * r, Math.sin(phi) * Math.cos(th) * r);
  }

  const earthCanvas = buildEarthTexture();
  const earthTex = new THREE.CanvasTexture(earthCanvas);
  earthTex.anisotropy = 4; earthTex.colorSpace = THREE.SRGBColorSpace;
  refineEarth(earthCanvas, earthTex);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 80),
    new THREE.MeshPhongMaterial({ map: earthTex, shininess: 14, specular: 0x1a2a40 }));
  scene.add(earth);

  const cloudTex = new THREE.CanvasTexture(buildCloudTexture()); cloudTex.colorSpace = THREE.SRGBColorSpace;
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 64),
    new THREE.MeshLambertMaterial({ map: cloudTex, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(clouds);

  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float i = pow(clamp(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 0.0, 1.0), 3.0); gl_FragColor = vec4(0.38,0.68,1.0,1.0) * i * 1.6; }',
  }));
  scene.add(atmo);

  // ---- globe beauty: shiny seas, cloud shadows, an inner rim glow, and city lights in the real night ----
  {
    // oceans catch the light; land stays matte
    const sc = document.createElement('canvas'); sc.width = TW / 2; sc.height = TH / 2;
    const sg = sc.getContext('2d'), si = sg.createImageData(sc.width, sc.height);
    for (let y = 0; y < sc.height; y++) for (let x = 0; x < sc.width; x++) {
      const v = maskData[((y * 2) * TW + x * 2) * 4] < 128 ? 255 : 18, k = (y * sc.width + x) * 4;
      si.data[k] = si.data[k + 1] = si.data[k + 2] = v; si.data[k + 3] = 255;
    }
    sg.putImageData(si, 0, 0);
    earth.material.specularMap = new THREE.CanvasTexture(sc);
    earth.material.specular = new THREE.Color(0x6f8fb0); earth.material.shininess = 38; earth.material.needsUpdate = true;
  }
  const cloudShadow = new THREE.Mesh(new THREE.SphereGeometry(1.004, 96, 64),
    new THREE.MeshBasicMaterial({ color: 0x0a1a30, alphaMap: cloudTex, transparent: true, opacity: 0.28, depthWrite: false }));
  scene.add(cloudShadow);
  const rimGlow = new THREE.Mesh(new THREE.SphereGeometry(1.003, 64, 48), new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float f = pow(1.0 - clamp(dot(vN, vec3(0.0,0.0,1.0)), 0.0, 1.0), 2.6); gl_FragColor = vec4(0.45,0.75,1.0,1.0) * f * 0.75; }',
  }));
  scene.add(rimGlow);
  // City lights glow where it is really night right now on Earth (from the actual time and the sun's real position)
  const lightsTex = (() => {
    const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const land = (x, y) => maskData[((Math.floor(y) * TW) + Math.floor(x)) * 4] >= 128;
    const dot = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,214,140,${a})`); gr.addColorStop(1, 'rgba(255,170,80,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    for (const ct of CITIES) {
      const cx = (ct.lon + 180) / 360 * W, cy = (90 - ct.lat) / 180 * H;
      dot(cx, cy, 7, 0.95);
      for (let i = 0; i < 40; i++) { const x = cx + (rnd() - 0.5) * 60 * rnd(), y = cy + (rnd() - 0.5) * 40 * rnd(); if (land(x, y)) dot(x, y, 1.5 + rnd() * 2.5, 0.5 + rnd() * 0.4); }
    }
    for (let i = 0; i < 9000; i++) { const x = rnd() * W, y = H * (0.15 + rnd() * 0.55); if (land(x, y) && rnd() < 0.5) dot(x, y, 1 + rnd() * 1.4, 0.25 + rnd() * 0.35); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const nightU = { map: { value: lightsTex }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, k: { value: 1 } };
  const cityLights = new THREE.Mesh(new THREE.SphereGeometry(1.0015, 128, 64), new THREE.ShaderMaterial({
    uniforms: nightU, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = normalize((modelMatrix * vec4(position,1.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 sunDir; uniform float k; varying vec2 vUv; varying vec3 vW; void main(){ float night = smoothstep(0.05, -0.15, dot(vW, sunDir)); vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb * c.a * night * 0.9 * k, 1.0); }',
  }));
  scene.add(cityLights);
  // where the real sun is overhead right now (good to a degree or two)
  function realSunDir() {
    const now = new Date(), day = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5;
    const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (day + 10));
    const lon = -((now.getUTCHours() + now.getUTCMinutes() / 60) - 12) * 15;
    return geoVec(decl, lon, 1);
  }
  nightU.sunDir.value.copy(realSunDir());
  setInterval(() => nightU.sunDir.value.copy(realSunDir()), 60000);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.7); scene.add(sun);

  // stars + a moon, so the far zoom really is "from the moon"
  {
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(80 + Math.random() * 30);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.4, sizeAttenuation: false })));
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 24), new THREE.MeshPhongMaterial({ color: 0xc9c6bd, shininess: 2 }));
  moon.position.set(-22, 9, -26); scene.add(moon);

  function dotTexture(inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, inner); gr.addColorStop(0.5, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // Route: the full loop dimly, legs already flown in gold, the live leg growing.
  const routeGroup = new THREE.Group(); scene.add(routeGroup);
  const ROUTE_R = 1.004;
  // Legs arc up off the globe like flight paths: higher for longer hops.
  // Nonstop circles (open-sky waypoints) hold a steady altitude instead.
  function legLift(a, b, t) {
    if (a.v || b.v) return 0.04;
    const d = F.distKm(a, b) / 6371;
    return Math.min(0.14, d * 0.12) * Math.sin(Math.PI * clamp(t, 0, 1));
  }
  function arcPoints(a, b, r = ROUTE_R, tEnd = 1) {
    const n = Math.max(8, Math.ceil(F.distKm(a, b) / 120 * tEnd));
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = (i / n) * tEnd, g = F.lerpGeo(a, b, t); pts.push(geoVec(g.lat, g.lon, r + legLift(a, b, t))); }
    return pts;
  }
  let loopLine = null, doneLine = null;
  // The bird's tail on the globe: a gold line along the path just flown,
  // ending at the centre of the bird's dot and fading out behind it.
  const TAIL_MAX = 6000, TAIL_LEN = 0.3, TAIL_R = ROUTE_R + 0.004; // same height as the bird's dot
  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TAIL_MAX * 3), 3));
  tailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TAIL_MAX * 4), 4));
  const tailLine = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  tailLine.frustumCulled = false; routeGroup.add(tailLine);
  let tailDone = []; // points for the legs already flown this lap (rebuilt at each stop)
  function updateTail(t) {
    let pts = tailDone.concat(arcPoints(F.legFrom(S), F.legTo(S), TAIL_R, Math.max(0.001, t)));
    // keep only the last TAIL_LEN (in globe radii) of the path
    let len = 0, cut = 0;
    for (let k = pts.length - 1; k > 0; k--) { len += pts[k].distanceTo(pts[k - 1]); if (len > TAIL_LEN) { cut = k; break; } }
    if (cut) pts = pts.slice(cut);
    const n = Math.min(pts.length, TAIL_MAX), off = pts.length - n;
    const pa = tailGeo.attributes.position, ca = tailGeo.attributes.color;
    for (let k = 0; k < n; k++) {
      const p = pts[off + k], u = n > 1 ? k / (n - 1) : 1;
      // strongest at the bird, fading steadily to nothing at the tail's end
      const a = 0.95 * u * u;
      pa.setXYZ(k, p.x, p.y, p.z); ca.setXYZW(k, 1, 0.83, 0.42, a);
    }
    pa.needsUpdate = true; ca.needsUpdate = true; tailGeo.setDrawRange(0, n);
  }
  let cityPoints = null;
  const birdSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('#fff3c9', 'rgba(227,165,43,.7)'), depthTest: false, transparent: true }));
  birdSprite.renderOrder = 5; scene.add(birdSprite);
  const nextSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('#ffffff', 'rgba(207,46,58,.8)'), depthTest: true, transparent: true }));
  scene.add(nextSprite);

  function rebuildRoute() {
    for (const l of [loopLine, doneLine, cityPoints]) if (l) { routeGroup.remove(l); l.geometry.dispose(); }
    const all = [];
    for (let k = 0; k < S.route.length - 1; k++) all.push(...arcPoints(F.routePt(S, k), F.routePt(S, k + 1)));
    loopLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(all),
      new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, dashSize: 0.012, gapSize: 0.01 }));
    loopLine.computeLineDistances(); loopLine.visible = false; // no dotted route ahead: the next stop's dot is enough
    routeGroup.add(loopLine);
    tailDone = [];
    for (let k = Math.max(0, S.ri - 3); k < S.ri; k++) tailDone.push(...arcPoints(F.routePt(S, k), F.routePt(S, k + 1), TAIL_R));
    doneLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]), new THREE.LineBasicMaterial({ visible: false }));
    routeGroup.add(doneLine);
    const pos = [], col = [];
    for (const c of CITIES) {
      const v = geoVec(c.lat, c.lon, 1.006); pos.push(v.x, v.y, v.z);
      const got = S.visited.includes(c.i);
      col.push(...(got ? [0.89, 0.65, 0.17] : [0.92, 0.95, 1]));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    cityPoints = new THREE.Points(g, new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true,
      map: dotTexture('#fff', 'rgba(255,255,255,.4)'), transparent: true, depthWrite: false }));
    routeGroup.add(cityPoints);
  }


  // ======================================================================
  // Close-up: 3D flight view, elevated side profile.
  // ======================================================================
  // The close-up is its own small 3D world: the bird at the origin flying +x,
  // the camera raised above it and off to its side, and the ground 40 units
  // below, built in strips from whatever is actually under the route.
  const sideCanvas = $('side');
  const fr = new THREE.WebGLRenderer({ canvas: sideCanvas, antialias: true });
  let SW = 0, SH = 0, DPR = 1;
  const side = { flap: 0, flapRate: 2, t: 0, cityLeg: -1, bug: null, burst: 0, bugT: 20, threat: null, threatT: 45 };

  const SKY = [ // hour, top, bottom
    [0, '#0a1332', '#1c2a55'], [4.5, '#141c46', '#3a3a6e'], [5.6, '#2c3470', '#d9787a'], [6.4, '#4a5296', '#ffae6b'],
    [7.2, '#5a8fd0', '#ffd9a8'], [8.5, '#4f8fd6', '#cfe7f7'], [12, '#3a86d9', '#b4e2ff'], [16.2, '#4a7fc9', '#f6dcb0'],
    [17.4, '#5468b4', '#ffc27a'], [18.4, '#463a86', '#ff8e5a'], [19.2, '#2a2662', '#d9607a'], [20.2, '#18204c', '#3a3768'],
    [24, '#0a1332', '#1c2a55'],
  ];
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
  function skyAt(hour) {
    let i = 0; while (i < SKY.length - 2 && SKY[i + 1][0] <= hour) i++;
    const [h0, t0, b0] = SKY[i], [h1, t1, b1] = SKY[i + 1], t = (hour - h0) / (h1 - h0);
    return [mix(hex(t0), hex(t1), t), mix(hex(b0), hex(b1), t)];
  }
  const localHour = (lon) => ((new Date().getUTCHours() + new Date().getUTCMinutes() / 60 + lon / 15) % 24 + 24) % 24;
  // The sky in the close-up follows the local hour under the bird, but moves
  // at most a quarter hour per second so it never blinks. Once a lap takes
  // under two minutes it settles on the player's own time of day instead.
  let skyH = null;
  function skyHour(dt, cur) {
    if (side.forceHour != null) return (side.skyHour = side.forceHour); // debug/photo: pin the time of day
    const v = F.speed(S), lapSecs = (F.lapLegs(S) * F.legLen(S)) / Math.max(v, 1e-6);
    const now = new Date(), mine = now.getHours() + now.getMinutes() / 60;
    const want = lapSecs < 120 ? mine : localHour(cur.lon);
    if (skyH == null) skyH = want;
    const d = ((want - skyH + 36) % 24) - 12, step = 0.25 * dt;
    skyH = (skyH + clamp(d, -step, step) + 24) % 24;
    side.skyHour = skyH;
    return skyH;
  }

  const fscene = new THREE.Scene();
  const fcam = new THREE.PerspectiveCamera(48, 1, 0.5, 1400);
  fscene.fog = new THREE.Fog(0xbfe0f5, 160, 640);
  const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x56663f, 1.1); fscene.add(hemi);
  const fsun = new THREE.DirectionalLight(0xfff1d6, 2.2); fsun.position.set(-60, 90, 70); fscene.add(fsun);

  // sky dome: a two-colour gradient, plus stars that only show at night
  const skyU = { top: { value: new THREE.Color(0x3a86d9) }, bottom: { value: new THREE.Color(0xb4e2ff) } };
  fscene.add(new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.02, 0.45, h)), 1.0); }',
  })));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.1; v.normalize().multiplyScalar(1100);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fscene.add(new THREE.Points(g, starMat));
  }
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('#fff6dc', 'rgba(255,226,160,.35)'), fog: false, depthWrite: false, transparent: true }));
  sunDisc.scale.set(120, 120, 1); fscene.add(sunDisc);
  // golden hour: a wide warm halo round the low sun, and its path of light across the sea
  const goldHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('rgba(255,214,150,.9)', 'rgba(255,160,90,.25)'), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  goldHalo.scale.set(600, 600, 1); fscene.add(goldHalo);
  const glintTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * 256, w = 6 + Math.random() * 30 * (1 - y / 300), a = 0.25 + Math.random() * 0.6;
      g.fillStyle = `rgba(255,${200 + Math.floor(Math.random() * 40)},150,${a * (0.3 + 0.7 * (1 - y / 256))})`; g.fillRect(32 - w / 2 + (Math.random() - 0.5) * 8, y, w, 1.5);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sunPath = new THREE.Mesh(new THREE.PlaneGeometry(70, 560), new THREE.MeshBasicMaterial({ map: glintTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
  sunPath.rotation.x = -Math.PI / 2; fscene.add(sunPath);

  const GROUND = -24, CW = 80, DEPTH = 420, ZC = -150; // strip width, depth and centre z
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x2468a6, roughness: 0.35, metalness: 0.15 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, GROUND + 0.6, -300); fscene.add(water);

  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x8a97ad, roughness: 0.7, emissive: 0x000000 });
  const towerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const world = { chunks: [], cursor: 0, nextType: null, clouds: [], u: 10, viewW: 14 };
  // ---- depth: far mountain ranges in layers, each hazier and slower than the one in front ----
  const RANGES = [
    { z: -560, h: 130, col: '#4f6884', haze: 0.45, par: 0.05, seed: 3 },
    { z: -760, h: 180, col: '#6f88a6', haze: 0.62, par: 0.03, seed: 7 },
    { z: -980, h: 250, col: '#93a9c2', haze: 0.78, par: 0.018, seed: 11 },
  ].map((r) => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
    // a tileable ridge line from whole-number harmonics, sharpened into peaks
    const ridge = (x) => { let y = 0; for (const [f, a, p] of [[2, 0.35, r.seed], [5, 0.22, r.seed * 2], [11, 0.12, r.seed * 3], [23, 0.06, r.seed * 5], [47, 0.03, r.seed]]) y += a * Math.sin((x / 1024) * Math.PI * 2 * f + p); return y; };
    const gr = g.createLinearGradient(0, 40, 0, 256); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d8e2ec');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 256);
    for (let x = 0; x <= 1024; x += 4) { const v = ridge(x); g.lineTo(x, 150 - Math.sign(v) * Math.pow(Math.abs(v), 0.8) * 110); }
    g.lineTo(1024, 256); g.closePath(); g.fill();
    // snow on the higher peaks of the far ranges
    if (r.haze > 0.6) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, 0, 1024, 70); g.globalCompositeOperation = 'source-over'; }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3600, r.h), new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false, depthWrite: false }));
    m.position.set(0, GROUND - 14 + r.h / 2, r.z); m.renderOrder = -2; fscene.add(m);
    return { ...r, m, t, base: new THREE.Color(r.col) };
  });
  side.landK = 1;
  function updateRanges(dx, fogCol, night) {
    // the ranges only belong over land: they fade out over open ocean
    const ahead = world.chunks.filter((c) => c.grp.position.x > -CW);
    const land = ahead.length ? ahead.filter((c) => c.kind !== 'sea').length / ahead.length : 1;
    side.landK = lerp(side.landK, land, 0.02);
    for (const r of RANGES) {
      r.t.offset.x = (r.t.offset.x + dx * r.par / 1200) % 1;
      r.m.material.color.copy(r.base).lerp(fogCol, r.haze).multiplyScalar(lerp(1, 0.45, night));
      r.m.material.opacity = smooth(0.4, 0.85, side.landK); // no mountain ranges standing in the open ocean
      r.m.visible = r.m.material.opacity > 0.01;
    }
  }

  // land height at a world position; heights are continuous across strips
  function landHeight0(wx, z) {
    const far = smooth(-60, -330, z);
    const n = fbm(wx / 70, z / 70 + 9);
    const ridge = Math.pow(fbm(wx / 160 + 40, z / 160), 2.2) * 40 * far;
    return 3 + n * (12 + far * 18) + ridge;
  }
  // How far across a strip its own landscape has taken over from the previous strip's: 0 at the
  // left edge, 1 well before the right, with a ragged noisy front so the change isn't a straight line.
  const biomeBlend = (dl, wx, z) => smooth(0, 1, clamp((dl / CW) * 1.6 - 0.3 + (fbm(wx / 28 + 11, z / 28) - 0.5) * 0.5, 0, 1));
  function vertColor(b, h, wx, z, pb, t) {
    if (pb && pb !== b && t < 1) {
      const a = vertColor(pb, h, wx, z), c2 = vertColor(b, h, wx, z);
      return a.map((v, i) => lerp(v, c2[i], t));
    }
    let c = BIOME_RGB[b];
    if (b !== 'ice' && h > 30) c = [128, 124, 118];              // bare rock
    if (b === 'ice' || h > 46) c = [236, 240, 244];               // snow
    const k = 0.85 + fbm(wx / 25, z / 25) * 0.3;
    return c.map((v) => Math.pow(v / 255 * k, 2.2)); // sRGB → linear for vertex colours
  }
  // the ground height a strip actually uses at local x / depth z, coast slopes included,
  // so trees, lakes and clouds sit on (or above) the same surface the mesh draws
  // ---- roads and traffic ----
  let curRoad = null, curHwy = null; // the roads of the strip being built, so its trees and towers keep clear
  let liteBuild = false; // true while building strips at extreme speed: far less scenery, since it flashes past
  const roadTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#4a4c52'; g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#d9d9d2'; g.fillRect(2, 0, 3, 128); g.fillRect(59, 0, 3, 128);
    g.fillStyle = '#f2c94c'; g.fillRect(30, 0, 4, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const carGeo = new THREE.BoxGeometry(2, 0.75, 1).translate(0, 0.6, 0);
  const cabGeo = new THREE.BoxGeometry(1, 0.55, 0.9).translate(-0.1, 1.2, 0);
  const CAR_MATS = ['#d6453d', '#f2f2f2', '#2f6fd1', '#f0b429', '#3a3d45', '#3fa36b', '#9aa3ad'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4e8, roughness: 0.2 });
  // One ribbon of road along a path of points, with traffic. fade: cars shrink away at the ends
  // (used where a highway runs on into the next strip, so they don't pop at the seam).
  function roadMesh(grp, pts, width, hAt, wide, seed, nCars, fade, yAdj) {
    let len = 0; const lens = [0];
    for (let i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i - 1]); lens.push(len); }
    const pos = [], uv = [], idx = [];
    pts.forEach((p, i) => {
      const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)], tx = q.x - o.x, tz = q.z - o.z, tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl * width / 2, nz = tx / tl * width / 2;
      let y = GROUND + Math.max(hAt(p.x, p.z), hAt(p.x + nx, p.z + nz), hAt(p.x - nx, p.z - nz)) + 0.5;
      if (yAdj) y = yAdj(p, y);
      p.y = y;
      pos.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz); uv.push(0, lens[i] / (wide ? 10 : 7), 1, lens[i] / (wide ? 10 : 7));
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    grp.add(new THREE.Mesh(g, roadMat));
    const cars = [];
    for (let i = 0; i < nCars; i++) {
      const car = new THREE.Group(), mat = CAR_MATS[Math.floor(hash(seed + i, 73) * CAR_MATS.length)];
      const body = new THREE.Mesh(carGeo, mat), cab = new THREE.Mesh(cabGeo, glassMat);
      body.userData.shared = cab.userData.shared = true; car.add(body, cab); grp.add(car);
      const dir = i % 2 ? 1 : -1, lanes = wide ? 2 : 1, lane = (0.5 + Math.floor(hash(i, seed) * lanes)) / lanes;
      cars.push({ car, s: hash(seed, i + 80) * len, dir, off: dir * lane * width / 2 * 0.9, v: (wide ? 9 : 6) + hash(i, seed + 81) * 4 });
    }
    return { pts, lens, len, cars, width, fade };
  }
  // A country road (or a city avenue) from behind the camera, curving left into the distance.
  // It meets the highway square-on at a proper T junction, or runs right to the back of the land,
  // so its end never shows. Planned first (pure x/z) so the ground can carve a valley for it.
  const GRID_X = 24; // ground mesh columns per strip (fine enough for the road valleys)
  const ROAD_M = 16; // roads keep this far from a strip's sides, so their valley stays inside it
  function planRoad(seed, wide, hw) {
    let bend = Math.min(44, 30 + hash(seed, 72) * 25);
    const width = wide ? 7 : 4, lo0 = -CW / 2 + ROAD_M, hi0 = CW / 2 - ROAD_M;
    if (!hw) {
      const xs = lerp(lo0 + bend, hi0, hash(seed, 71));
      return { xs, bend, zEnd: -356, width, wide, ease: (t) => Math.pow(t, 1.6) };
    }
    // join only where the highway runs straight along the valley (not where it sweeps away)
    const straight = hw.filter((p) => Math.abs(p.z - HWY_Z) < 0.01).map((p) => p.x);
    if (!straight.length) return null;
    const lo = Math.max(lo0, Math.min(...straight) + width + 2), hi = Math.min(hi0, Math.max(...straight) - width - 2);
    if (hi < lo) return null;
    const xe = lerp(lo, hi, hash(seed, 71)); bend = Math.min(bend, hi0 - xe);
    const ease = (t) => { const u = Math.min(1, t / 0.8); return u * u * (3 - 2 * u); }; // straight for the last stretch
    return { xs: xe + bend, bend, xe, zEnd: HWY_Z + 3.2, width, wide, ease, join: true };
  }
  const roadX = (r, z) => r.xs - r.bend * r.ease(clamp((z - 45) / (r.zEnd - 45), 0, 1));
  function addRoad(grp, seed, hAt, r, hwy) {
    const n = 56, pts = [];
    for (let i = 0; i <= n; i++) { const z = 45 + (r.zEnd - 45) * i / n; pts.push(new THREE.Vector3(roadX(r, z), 0, z)); }
    let hy = null;
    if (r.join && hwy) { // level the last stretch with the highway, then pave the junction
      const hp = hwy.pts; let i = 1; while (i < hp.length - 1 && hp[i].x < r.xe) i++;
      hy = lerp(hp[i - 1].y, hp[i].y, clamp((r.xe - hp[i - 1].x) / (hp[i].x - hp[i - 1].x || 1), 0, 1));
    }
    const road = roadMesh(grp, pts, r.width, hAt, r.wide, seed, r.wide ? 10 : 5, r.join, hy == null ? null : (p, y) => lerp(y, hy, smooth(HWY_Z + 16, HWY_Z + 4, p.z)));
    if (hy != null) {
      const zA = HWY_Z + 2.3, zB = HWY_Z + 3.5 + 3, wa = r.width / 2 + 2.2, wb = r.width / 2 + 0.05;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([r.xe - wa, hy + 0.03, zA, r.xe + wa, hy + 0.03, zA, r.xe - wb, hy + 0.03, zB, r.xe + wb, hy + 0.03, zB], 3));
      g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals();
      grp.add(new THREE.Mesh(g, junctionMat));
    }
    return road;
  }
  const junctionMat = new THREE.MeshStandardMaterial({ color: 0x4a4c52, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  // The highway: runs along the bird's direction of travel, joined up strip to strip. Where the
  // highway country starts or ends it sweeps in from (or away to) the far distance.
  const HWY_Z = -95;
  const hwyFlag = (wx0) => fbm(wx0 * 0.0021 + 5.3, 3.7) > 0.47;
  // early: the next strip is sea, so turn away inland well before the shore
  const hwyZ = (lx, prevHw, nextHw, early) => {
    const t = (lx + CW / 2) / CW; let z = HWY_Z;
    if (!prevHw) z = lerp(-356, HWY_Z, smooth(0, 0.6, t));
    if (!nextHw) z = lerp(z, -356, early ? smooth(0.05, 0.5, t) : smooth(0.4, 1, t));
    return z;
  };
  function planHighway(prevHw, nextHw, early) {
    const pts = [], n = 40;
    for (let i = 0; i <= n; i++) {
      const x = -CW / 2 + CW * i / n;
      if (early && i > n * 0.5) break; // it has already gone off into the distance
      pts.push(new THREE.Vector3(x, 0, hwyZ(x, prevHw, nextHw, early)));
    }
    return pts;
  }
  function addHighway(grp, seed, hAt, pts, prevHw, nextHw) {
    return roadMesh(grp, pts, 7, hAt, true, seed + 999, 6, prevHw || nextHw);
  }
  // Roads never climb over a mountain: the ground sinks into a valley along them, with a flat
  // floor under the road and slopes rising to the hills either side.
  const valleyFloor = (wx, z) => 1.8 + fbm(wx / 70 + 9.1, z / 70 + 2.3) * 2.2;
  function makeCarve(wx0, road, hw) {
    if (!road && !hw) return null;
    return (lx, z, h) => {
      const dl = lx + CW / 2, dr = CW / 2 - lx, outer = 12 + 12 * smooth(-60, -330, z);
      let k = 0;
      if (road && z > road.zEnd - 2) {
        const x0 = roadX(road, z), s = (roadX(road, z - 1) - roadX(road, z + 1)) / 2;
        const d = Math.abs(lx - x0) / Math.sqrt(1 + s * s);
        k = Math.max(k, (1 - smooth(road.width / 2 + 1.5, road.width / 2 + outer, d)) * smooth(0, 12, dl) * smooth(0, 12, dr));
      }
      if (hw && !(hw.early && lx > 0)) {
        const z0 = hwyZ(lx, hw.prev, hw.next, hw.early), s = (hwyZ(lx + 0.5, hw.prev, hw.next, hw.early) - hwyZ(lx - 0.5, hw.prev, hw.next, hw.early));
        const d = Math.abs(z - z0) / Math.sqrt(1 + s * s);
        // the near side opens out into a broad, low valley, so the hills in front don't hide the highway
        const reach = z > z0 ? 60 : outer;
        k = Math.max(k, (1 - smooth(5, 3.5 + reach, d)) * (hw.prev ? 1 : smooth(0, 12, dl)) * (hw.next ? 1 : smooth(0, 12, dr)));
      }
      if (k <= 0) return h;
      const f = Math.min(h, valleyFloor(wx0 + dl, z));
      return h + (f - h) * k;
    };
  }
  // keep trees, lakes and buildings off the road and the highway
  function segDist(px, pz, a, b) {
    const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz || 1;
    const t = clamp(((px - a.x) * vx + (pz - a.z) * vz) / l2, 0, 1);
    return Math.hypot(px - (a.x + vx * t), pz - (a.z + vz * t));
  }
  function nearRoad(x, z, r) {
    for (const road of [curRoad, curHwy]) {
      if (!road) continue;
      const pts = road.pts, need = r + road.width / 2 + 1;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (Math.min(a.z, b.z) - need > z || Math.max(a.z, b.z) + need < z) continue;
        if (segDist(x, z, a, b) < need) return true;
      }
    }
    return false;
  }
  function updateTraffic(road, dt) {
    const { pts, lens, len } = road;
    for (const c of road.cars) {
      c.s = (c.s + c.dir * c.v * dt + len) % len;
      let i = 1; while (i < lens.length - 1 && lens[i] < c.s) i++;
      const a = pts[i - 1], b = pts[i], k = (c.s - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
      c.car.position.set(lerp(a.x, b.x, k) - tz / tl * c.off, lerp(a.y, b.y, k), lerp(a.z, b.z, k) + tx / tl * c.off);
      c.car.rotation.y = -Math.atan2(tz * c.dir, tx * c.dir);
      if (road.fade) c.car.scale.setScalar(clamp(Math.min(c.s, len - c.s) / 4, 0.001, 1)); // slip out of sight at a strip's edge
    }
  }
  const HARBOUR = 10; // width of the harbour basin between a seaside city's quay and the open sea
  // Where land meets open sea the coastline wanders: at each depth it sits a little out into
  // the sea strip or a little back into the land strip, so the shore is a ragged natural line
  // all the way to the horizon instead of a straight seam where two strips join. Both strips
  // read the same offset for their shared edge (keyed on the edge's world x), so they agree.
  // clamped so a cove never eats so far into a land strip that its slope reaches the strip's other edge
  const coastOff = (edgeX, z) => clamp((fbm(edgeX * 0.0137 + 3.1, z / 70 + 1.7) - 0.5) * 70, -20, 35); // + = out into the sea
  const shoreRise = (t) => t * t * (3 - 2 * t); // a soft beach at the bottom, a rounded brow at the top
  const shoreWidth = (z) => 22 + 34 * smooth(-60, -330, z); // gentler slopes in the far, high country
  // How tall the land is: mountain regions get much bigger relief. Each strip blends from the
  // previous strip's relief at its left edge to its own at the right, so the ground stays continuous.
  const reliefOf = (b) => (b === 'alpine' ? 2.2 : b === 'tropic' ? 1.15 : 1);
  function stripHeight(kind, prevKind, nextKind, wx0, lx, z, ampL = 1, ampR = 1, carve = null) {
    const wx = wx0 + lx + CW / 2;
    const dl = lx + CW / 2, dr = CW / 2 - lx;
    const amp = lerp(ampL, ampR, dl / CW), landHeight = (x, zz) => 3 + (landHeight0(x, zz) - 3) * amp;
    if (kind === 'sea') {
      // headlands and spits from a neighbouring land strip can reach into the sea strip
      let reach = 0;
      if (prevKind === 'land') reach = Math.max(reach, coastOff(wx0, z) - dl);
      if (nextKind === 'land') reach = Math.max(reach, coastOff(wx0 + CW, z) - dr);
      if (reach <= 0) return -6;
      const t = shoreRise(smooth(0, shoreWidth(z), reach));
      return -6 + (landHeight(wx, z) + 6) * t;
    }
    let h = landHeight(wx, z);
    // a city sits on a plain that rises smoothly into the hills on either side, so the
    // ground runs unbroken into and out of town instead of stepping down at the edge
    if (kind === 'city') {
      const dLand = Math.min(prevKind === 'sea' ? Infinity : dl, nextKind === 'sea' ? Infinity : dr);
      h = lerp(h, 2 + fbm(wx / 30, z / 30) * 3, smooth(0, 24, dLand));
    }
    if (carve) h = carve(lx, z, h);
    let t = 1;
    if (kind === 'city') {
      // a city on the water ends in a harbour quay
      const shore = (d) => smooth(HARBOUR - 1.5, HARBOUR, d);
      if (prevKind === 'sea') t = Math.min(t, shore(dl));
      if (nextKind === 'sea') t = Math.min(t, shore(dr));
    } else {
      // open land slopes down to a ragged shoreline that may sit inside this strip or out past its edge
      const w = shoreWidth(z);
      if (prevKind === 'sea') t = Math.min(t, smooth(0, w, dl + coastOff(wx0, z)));
      if (nextKind === 'sea') t = Math.min(t, smooth(0, w, dr + coastOff(wx0 + CW, z)));
      t = shoreRise(t);
    }
    return -6 + (h + 6) * t;
  }
  function buildChunk(kind, geo, prevKind, nextKind, name, atWx, ampL, prevBiome, hwIn) {
    const wx0 = atWx ?? world.cursor; if (atWx == null) world.cursor += CW;
    const b = geo ? biome(geo.lat, geo.lon) : 'temperate', ampR = reliefOf(b), pb = prevBiome || b;
    if (ampL == null) ampL = ampR;
    // Plan the roads before shaping the ground, so it can carve valleys for them.
    // The highway never runs beside the sea (no road off the edge of a cliff); it only carries
    // on into a sea-side strip if the strip before already brought it this far.
    const prevHw = kind === 'land' && !!(hwIn && hwIn.prev);
    const haveHw = prevHw || (kind === 'land' && prevKind !== 'sea' && nextKind !== 'sea' && hwyFlag(wx0));
    const nextHw = haveHw && (hwIn && hwIn.next != null ? hwIn.next : nextKind === 'land' && hwyFlag(wx0 + CW));
    const early = nextKind === 'sea';
    const hwPts = haveHw ? planHighway(prevHw, nextHw, early) : null;
    const fly = kind === 'city' && name && world.u <= 60 && hash(wx0, 77) < 0.5;
    const lite = world.u > 120;
    const rPlan = !lite && kind !== 'sea' && prevKind !== 'sea' && nextKind !== 'sea' && !fly && (kind === 'city' ? hash(wx0, 70) < 0.7 : hwPts ? hash(wx0, 70) < 0.6 : hash(wx0, 70) < 0.3)
      ? planRoad(wx0, kind === 'city', hwPts) : null;
    const carve = makeCarve(wx0, rPlan, haveHw ? { prev: prevHw, next: nextHw, early } : null);
    const g = new THREE.PlaneGeometry(CW, DEPTH, GRID_X, 60); g.rotateX(-Math.PI / 2); g.translate(0, 0, ZC);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), z = p.getZ(i), wx = wx0 + lx + CW / 2;
      // cities sit on a plain; open land gets hills and far ranges, sloping down to any sea beside it
      const h = stripHeight(kind, prevKind, nextKind, wx0, lx, z, ampL, ampR, carve);
      p.setY(i, GROUND + h);
      col.set(h < -1.5 ? [0.26, 0.21, 0.13] : h < 1.2 ? [0.78, 0.71, 0.52].map((v) => Math.pow(v, 2.2)) : vertColor(b, h, wx, z, pb, biomeBlend(lx + CW / 2, wx, z)), i * 3); // seabed, sandy beach, land (blending in from the last strip's landscape)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, landMat));
    const hAt = (lx, z) => stripHeight(kind, prevKind, nextKind, wx0, lx, z, ampL, ampR, carve);
    liteBuild = lite; // a strip crosses the screen in well under a second
    // a paved road (a highway through cities) running away from you and curving off to the left
    curHwy = hwPts ? addHighway(grp, wx0, hAt, hwPts, prevHw, nextHw) : null;
    curRoad = rPlan ? addRoad(grp, wx0, hAt, rPlan, curHwy) : null;
    if (kind === 'city') addCity(grp, name, wx0, hAt, prevKind === 'sea', nextKind === 'sea');
    // now and then the bird swoops right down between the towers of a city it passes
    if (fly) addCanyon(grp, wx0, hAt);
    if (kind !== 'sea') { addTrees(grp, b, wx0, kind, hAt, pb); if (kind === 'land' && b !== 'ice') addLake(grp, b, wx0, hAt); }
    else addSea(grp, wx0);
    addProps(grp, b, kind, wx0, hAt, geo);
    const road = curRoad, hwy = curHwy; curRoad = curHwy = null;
    return { grp, kind, wx0, hAt, fly, road, hwy, hwyNext: nextHw, geo, name, prevKind, nextKind, ampL, ampR, biome: b, prevBiome: pb };
  }
  // a seaside city's waterfront: wooden piers into the basin, boats tied up, and dock cranes on the quay
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.9 });
  let CRANE_MAT = null;
  function addHarbour(grp, seed, seaL, seaR) {
    CRANE_MAT = CRANE_MAT || sceneryMat(paintTex(160, 256, (g, W, H) => {
      g.strokeStyle = '#e07a26'; g.lineWidth = 7; g.lineCap = 'square';
      g.beginPath(); g.moveTo(W * 0.3, H); g.lineTo(W * 0.3, H * 0.18); g.moveTo(W * 0.55, H); g.lineTo(W * 0.55, H * 0.18); g.stroke();
      g.lineWidth = 3; for (let y = H * 0.25; y < H; y += H * 0.12) { g.beginPath(); g.moveTo(W * 0.3, y); g.lineTo(W * 0.55, y + H * 0.1); g.stroke(); }
      g.lineWidth = 8; g.beginPath(); g.moveTo(W * 0.05, H * 0.16); g.lineTo(W * 0.98, H * 0.16); g.stroke();
      g.fillStyle = '#c45f18'; g.fillRect(W * 0.24, H * 0.06, W * 0.36, H * 0.1);
      g.strokeStyle = '#333'; g.lineWidth = 2; g.beginPath(); g.moveTo(W * 0.88, H * 0.18); g.lineTo(W * 0.88, H * 0.5); g.stroke();
      g.fillStyle = '#3d6fb0'; g.fillRect(W * 0.8, H * 0.5, W * 0.16, H * 0.07);
    }), { fog: true });
    const sides = [];
    if (seaL) sides.push(-1); if (seaR) sides.push(1);
    const y = GROUND + 1.1;
    for (const sd of sides) {
      const edge = sd * CW / 2, quay = edge - sd * HARBOUR; // basin runs from the quay out to the strip edge
      const piers = [], m = new THREE.Matrix4();
      for (let z = -12; z > -170; z -= 14 + hash(seed, z) * 10) piers.push(z);
      const inst = new THREE.InstancedMesh(towerGeo, pierMat, piers.length);
      piers.forEach((z, i) => {
        const len = 6 + hash(z, seed) * 4;
        m.compose(new THREE.Vector3(quay + sd * len / 2, y - 0.6, z), new THREE.Quaternion(), new THREE.Vector3(len, 0.6, 1.4)); inst.setMatrixAt(i, m);
        // a boat moored alongside most piers
        if (hash(seed, i + 30) < 0.7) {
          const big = hash(seed, i + 40) < 0.25, sh = big ? SHIPS.target : SHIPS.fishing, sp = new THREE.Sprite(sh.mat);
          sp.center.set(0.5, 0.12); sp.scale.set(sh.w * (big ? 0.8 : 0.8), sh.h * 0.8, 1);
          sp.position.set(quay + sd * len * 0.55, GROUND + 0.5, z - 2.2); grp.add(sp);
        }
      });
      grp.add(inst);
      // a couple of cranes standing on the quay, arms out over the water
      for (let k = 0; k < 2; k++) {
        const sp = new THREE.Sprite(CRANE_MAT); sp.center.set(0.5, 0); sp.scale.set(sd * 9, 14, 1);
        sp.position.set(quay - sd * 2, GROUND + 2.5, -30 - k * 45 - hash(seed, k) * 20); grp.add(sp);
      }
    }
  }
  function addCity(grp, name, seed, hAt, seaL, seaR) {
    if (seaL || seaR) addHarbour(grp, seed, seaL, seaR);
    // a few buildings right in the foreground, between you and the bird: their roofs show when it dips low
    {
      const spots = [];
      for (let x = -CW / 2 + 8; x < CW / 2 - 8; x += 9 + hash(seed, x) * 9) if (hash(x, seed + 21) < 0.6) spots.push(x);
      const fi = new THREE.InstancedMesh(towerGeo, canyonMat, Math.max(1, spots.length)), fm = new THREE.Matrix4(), col = new THREE.Color();
      spots.forEach((x, i) => {
        const z = 4 + hash(seed + i, 23) * 4, h0 = hAt(x, z);
        const ok = h0 > 1.5 && !nearRoad(x, z, 4), w = 3 + hash(i, seed + 24) * 2.5, top = GROUND + h0 + 6 + hash(seed, i + 25) * 9;
        fm.compose(new THREE.Vector3(x, GROUND + h0 - 0.6, z), new THREE.Quaternion(), new THREE.Vector3(w, ok ? top - (GROUND + h0 - 0.6) : 0.001, w * 0.9));
        fi.setMatrixAt(i, fm); fi.setColorAt(i, col.setStyle(TOWER_TINTS[Math.floor(hash(seed + i, 26) * TOWER_TINTS.length)]));
      });
      if (spots.length) grp.add(fi);
    }
    const n = 90, inst = new THREE.InstancedMesh(towerGeo, towerMat, n), m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = (hash(seed, i) - 0.5) * (CW - 10), z = -30 - hash(i, seed) * 130;
      const core = 1 - Math.min(1, Math.hypot(x / (CW * 0.5), (z + 95) / 65));
      const h = hAt(x - 2, z) < 1.5 || hAt(x + 2, z) < 1.5 || nearRoad(x, z, 6) ? 0 : 3 + core * core * 30 * (0.4 + hash(i * 3, seed) * 0.9); // nothing built in the harbour
      const w = 2.2 + hash(i, i + seed) * 3;
      m.compose(new THREE.Vector3(x, GROUND + hAt(x, z) - 0.6, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w * (0.7 + hash(seed, i * 7) * 0.6)));
      inst.setMatrixAt(i, m);
    }
    grp.add(inst);
    if (name) {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
      const g = c.getContext('2d');
      g.font = "800 112px 'Bricolage Grotesque', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 18; g.strokeStyle = 'rgba(6,12,31,.55)'; g.strokeText(name, 512, 100);
      g.fillStyle = '#fff'; g.fillText(name, 512, 100);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, transparent: true, depthWrite: false }));
      sp.scale.set(36, 6.75, 1); sp.position.set(0, GROUND + 36, -95); grp.add(sp);
    }
  }
  // the street the bird swoops down: tall towers just behind its line of flight, shorter
  // ones just in front, so it reads as flying through the city rather than over it
  const SWOOP = 11; // how far the bird drops into the street
  // close-up towers get window bands and a few tints so they read as buildings, not grey walls
  const winTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 512);
    for (let y = 6; y < 512; y += 12) for (let x = 5; x < 64; x += 11) { g.fillStyle = Math.random() < 0.25 ? '#fff2c0' : '#6f86a6'; g.fillRect(x, y, 7, 7); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const canyonMat = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.6, emissive: 0x000000, emissiveMap: winTex });
  const TOWER_TINTS = ['#d9dee6', '#c9d6e8', '#e6dccb', '#b9c7d9', '#d6d0c4', '#aebfd2'];
  function addCanyon(grp, seed, hAt) {
    const spots = [];
    for (let x = -CW / 2 + 12; x < CW / 2 - 12; x += 7 + hash(seed, x) * 4) {
      spots.push([x, -6 - hash(x, seed) * 8, -2 + hash(seed + 1, x) * 12, 3 + hash(x, seed + 2) * 1.6]);     // back row rises past the bird
    }
    for (let x = -CW / 2 + 15; x < CW / 2 - 15; x += 10 + hash(seed + 3, x) * 7) {
      if (hash(x, seed + 4) < 0.3) continue;                                                              // gaps to see through
      spots.push([x, 4 + hash(seed + 5, x) * 2, -SWOOP - 5 + hash(x, seed + 6) * 4.5, 2.2 + hash(seed + 7, x) * 1.2]); // front row, mostly below the bird
    }
    const inst = new THREE.InstancedMesh(towerGeo, canyonMat, spots.length), m = new THREE.Matrix4(), col = new THREE.Color();
    spots.forEach(([x, z, top, w], i) => {
      if (hAt(x, z) < 1.5) top = -999; // never in the harbour
      const base = GROUND + hAt(x, z) - 0.6;
      m.compose(new THREE.Vector3(x, base, z), new THREE.Quaternion(), new THREE.Vector3(w, top < -500 ? 0.01 : Math.max(2, top - base), w * 0.9));
      inst.setMatrixAt(i, m); inst.setColorAt(i, col.setStyle(TOWER_TINTS[Math.floor(hash(seed + i, 9) * TOWER_TINTS.length)]));
    });
    grp.add(inst);
  }
  // how far into a flythrough street the bird is right now (0 none … 1 deepest)
  function swoopNow() {
    if (side.threat || side.bug) return 0;
    for (const c of world.chunks) {
      if (!c.fly) continue;
      const p = -c.grp.position.x / (CW / 2); // −1 entering … 1 leaving
      if (p < -1.6 || p > 1.6) continue;
      return smooth(-1.45, -0.6, p) * (1 - smooth(0.6, 1.45, p));
    }
    return 0;
  }
  function disposeChunk(c) {
    c.grp.traverse((o) => {
      if (o.userData.shared || (o.material && o.material.userData && o.material.userData.shared)) return; // shared scenery stays loaded
      if (o.isMesh || o.isSprite) { if (o.geometry && o.geometry !== towerGeo && o.geometry !== lakeGeo) o.geometry.dispose(); if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }
    });
    fscene.remove(c.grp);
  }

  // What will be under the bird by the time a strip now at world x reaches it.
  // uses a smoothed speed, so a quick flap or a gust doesn't throw the whole road ahead off
  // At high speed a strip laid at the edge of the view can be several legs ahead, so this walks
  // on through the following legs of the route instead of stopping at the next city (which used
  // to paint land ahead long after the globe had the bird back out over the ocean).
  function lookahead(sec) {
    let km = S.legKm + (side.vS || F.speed(S)) * sec, k = S.ri;
    const R = S.route || [];
    let a = F.routePt(S, k), b = F.routePt(S, k + 1), L = F.distKm(a, b);
    while (km > L && k + 2 < R.length) {
      km -= L; k++;
      a = b; b = F.routePt(S, k + 1); L = F.distKm(a, b);
    }
    return F.lerpGeo(a, b, L > 0 ? Math.min(1, km / L) : 1);
  }
  const kindAt = (g) => (isLand(g.lat, g.lon) ? 'land' : 'sea');
  function pushChunk(x, kind, geo, name) {
    const prev = world.chunks[world.chunks.length - 1];
    const nextGeo = lookahead(Math.max(0, (x + CW) / unitsPerSec(side.vS || F.speed(S))));
    world.nextType = kindAt(nextGeo);
    // The strip before this one was shaped for a guess of what would come next (it slopes to
    // a shore only if it expects sea). If the guess was wrong, its edge wouldn't meet this one:
    // a cliff or a straight seam. Rebuild it to match while it's still far off.
    // Likewise if it ran its highway up to this edge and this strip can't carry it on.
    if (prev && (prev.nextKind !== kind || (prev.hwyNext && kind !== 'land'))) {
      if (world.building || prev.grp.position.x > (world.viewW || 14) * 2 + CW / 2) {
        const pp = world.chunks[world.chunks.length - 2];
        const r = buildChunk(prev.kind, prev.geo, prev.prevKind, kind, prev.name, prev.wx0, prev.ampL, prev.prevBiome, { prev: !!(pp && pp.hwyNext) });
        r.grp.position.x = prev.grp.position.x; fscene.add(r.grp);
        world.chunks[world.chunks.length - 1] = r; disposeChunk(prev);
      } else if (prev.nextKind !== kind && kind !== 'city') kind = prev.nextKind; // it's already on screen: carry on what it expects for one more strip
    }
    const p2 = world.chunks[world.chunks.length - 1];
    const c = buildChunk(kind, geo, p2 ? p2.kind : kind, world.nextType, name, undefined, p2 ? p2.ampR : undefined, p2 ? p2.biome : undefined, { prev: !!(p2 && p2.hwyNext) });
    c.grp.position.x = x; fscene.add(c.grp); world.chunks.push(c);
  }

  // ---------- painted 2D scenery: clouds, trees, lakes, planes, distant birds ----------
  // Everything here is a flat painted cutout (a sprite that always faces the
  // camera), the same style as the birds, sitting in the 3D world.
  function paintTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  const sceneryMats = []; // shared materials, dimmed together at night
  function sceneryMat(tex, opts) {
    const m = new THREE.SpriteMaterial(Object.assign({ map: tex, transparent: true, alphaTest: 0.03, depthWrite: false }, opts));
    m.userData.shared = true; sceneryMats.push(m); return m;
  }
  // clouds: soft cartoon puffs, white on top, cool grey underneath
  const CLOUD_MATS = [0, 1, 2, 3].map((v) => sceneryMat(paintTex(512, 256, (g, W, H) => {
    let seed = 11 + v * 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const puffs = [], n = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), r = H * (0.18 + Math.sin(t * Math.PI) * 0.17 + rnd() * 0.06);
      puffs.push([W * (0.14 + t * 0.72), H * 0.66 - r * 0.55 - rnd() * H * 0.05, r]);
    }
    const base = H * 0.72;
    const fill = () => { g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); } g.rect(W * 0.14, base - H * 0.12, W * 0.72, H * 0.12); g.fill(); };
    g.save(); g.beginPath(); g.rect(0, 0, W, base); g.clip();
    const grd = g.createLinearGradient(0, H * 0.1, 0, base);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.65, '#f4f7fb'); grd.addColorStop(1, '#c9d4e2');
    g.fillStyle = grd; fill();
    // sunlit highlights on the upper puffs
    g.globalAlpha = 0.6; g.fillStyle = '#ffffff';
    for (const [x, y, r] of puffs) { g.beginPath(); g.arc(x - r * 0.2, y - r * 0.25, r * 0.55, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }), { fog: true, opacity: 0.96 }));
  function makeCloud(x) {
    // is there land anywhere under (or behind) where this cloud would hang?
    const samples = [-0.5, -0.25, 0, 0.25, 0.5].map((k) => chunkAtX(x + k * 56));
    const overLand = samples.some((c) => c && c.kind !== 'sea');
    // the small near-lens clouds only drift over open water, where nothing below can poke through them
    const far = Math.random() < 0.9 || overLand;
    const sp = new THREE.Sprite(CLOUD_MATS[Math.floor(Math.random() * CLOUD_MATS.length)]);
    const w = far ? 22 + Math.random() * 34 : 8 + Math.random() * 6;
    sp.scale.set(w, w / 2, 1);
    // keep clouds off the camera's lens: well behind the bird, or small and low
    let z = far ? -40 - Math.random() * 280 : -14 - Math.random() * 18;
    let y = far ? -6 + Math.random() * 36 : -15 + Math.random() * 5;
    if (overLand) {
      // over land the clouds hang far off in the background, above the skyline: from the camera,
      // the cloud's flat base must sit higher than every hill top between it and the camera
      z = -340 - Math.random() * 130;
      const camY = 4, camZ = 16;
      let maxA = -Infinity;
      for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const cx = x + k * w, c = chunkAtX(cx);
        for (let zz = -30; zz >= -360; zz -= 30) {
          const h = c && c.kind !== 'sea' ? GROUND + c.hAt(cx - c.grp.position.x, zz) : GROUND - 6;
          maxA = Math.max(maxA, (h - camY) / (camZ - zz));
        }
      }
      const base = camY + maxA * (camZ - z) + 4;      // the puff's flat bottom, just above the skyline
      y = base + 0.11 * w + Math.random() * 5;        // the base is 22% of the sprite up from its centre
    }
    sp.position.set(x, y, z);
    fscene.add(sp); world.clouds.push(sp);
  }
  // trees for each kind of land
  const TREE_KINDS = {
    // jungle giant: a tall pale trunk under layered dark canopies, with hanging vines
    jungle: (g, W, H) => {
      g.fillStyle = '#8a7a5a'; g.fillRect(W * 0.45, H * 0.35, W * 0.1, H * 0.65);
      const blob = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fill(); };
      blob(W * 0.5, H * 0.3, W * 0.46, '#1f5a2a'); blob(W * 0.3, H * 0.24, W * 0.26, '#2a6e34'); blob(W * 0.7, H * 0.22, W * 0.26, '#2a6e34'); blob(W * 0.5, H * 0.13, W * 0.24, '#3a8a40');
      g.strokeStyle = '#2f6a2a'; g.lineWidth = 3; for (const x of [0.22, 0.36, 0.64, 0.78]) { g.beginPath(); g.moveTo(W * x, H * 0.36); g.quadraticCurveTo(W * (x + 0.04), H * 0.55, W * x, H * (0.6 + x * 0.2)); g.stroke(); }
    },
    fern: (g, W, H) => {
      g.strokeStyle = '#2f7a34'; g.lineWidth = W * 0.05; g.lineCap = 'round';
      for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.32; g.beginPath(); g.moveTo(W / 2, H); g.quadraticCurveTo(W / 2 + Math.cos(a) * W * 0.3, H * 0.75 + Math.sin(a) * H * 0.2, W / 2 + Math.cos(a) * W * 0.48, H * 0.5 + Math.sin(a) * H * 0.42); g.stroke(); }
    },
    snowpine: (g, W, H) => {
      g.fillStyle = '#5a3d24'; g.fillRect(W * 0.46, H * 0.78, W * 0.08, H * 0.22);
      for (let k = 0; k < 4; k++) {
        const y0 = H * (0.08 + k * 0.19), w = W * (0.22 + k * 0.08);
        g.fillStyle = k % 2 ? '#2a5240' : '#33604a'; g.beginPath(); g.moveTo(W / 2, y0); g.lineTo(W / 2 + w, y0 + H * 0.3); g.lineTo(W / 2 - w, y0 + H * 0.3); g.closePath(); g.fill();
        g.fillStyle = '#f4f8fb'; g.beginPath(); g.moveTo(W / 2, y0); g.lineTo(W / 2 + w * 0.55, y0 + H * 0.15); g.lineTo(W / 2 - w * 0.55, y0 + H * 0.15); g.closePath(); g.fill();
      }
    },
    pine: (g, W, H) => {
      g.fillStyle = '#5a3d24'; g.fillRect(W * 0.46, H * 0.78, W * 0.08, H * 0.22);
      for (let k = 0; k < 4; k++) {
        const y0 = H * (0.08 + k * 0.19), w = W * (0.22 + k * 0.08);
        g.fillStyle = k % 2 ? '#2f5d3a' : '#3a6e44';
        g.beginPath(); g.moveTo(W / 2, y0); g.lineTo(W / 2 + w, y0 + H * 0.3); g.lineTo(W / 2 - w, y0 + H * 0.3); g.closePath(); g.fill();
      }
    },
    round: (g, W, H) => {
      g.fillStyle = '#6b4a2e'; g.fillRect(W * 0.45, H * 0.6, W * 0.1, H * 0.4);
      const blob = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
      blob(W * 0.36, H * 0.48, W * 0.24, '#4e8a3e'); blob(W * 0.64, H * 0.46, W * 0.24, '#4e8a3e'); blob(W * 0.5, H * 0.3, W * 0.28, '#5c9a48');
      blob(W * 0.44, H * 0.24, W * 0.12, 'rgba(255,255,255,.18)');
    },
    palm: (g, W, H) => {
      g.strokeStyle = '#8a6a44'; g.lineWidth = W * 0.07; g.lineCap = 'round';
      g.beginPath(); g.moveTo(W * 0.5, H); g.quadraticCurveTo(W * 0.62, H * 0.55, W * 0.52, H * 0.22); g.stroke();
      g.fillStyle = '#3f8a46';
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.55;
        g.save(); g.translate(W * 0.52, H * 0.22); g.rotate(a); g.beginPath(); g.ellipse(W * 0.2, 0, W * 0.22, H * 0.035, 0.35, 0, Math.PI * 2); g.fill(); g.restore();
      }
    },
    cactus: (g, W, H) => {
      g.fillStyle = '#5b8f4a'; const rr = (x, y, w, h) => { g.beginPath(); g.roundRect(x, y, w, h, w / 2); g.fill(); };
      rr(W * 0.42, H * 0.2, W * 0.16, H * 0.8); rr(W * 0.22, H * 0.42, W * 0.12, H * 0.3); rr(W * 0.22, H * 0.62, W * 0.26, W * 0.12);
      rr(W * 0.66, H * 0.34, W * 0.12, H * 0.28); rr(W * 0.52, H * 0.56, W * 0.26, W * 0.12);
    },
  };
  // ---- batched billboards: many flat cutouts drawn as ONE mesh (one draw call) ----
  // Each cutout is a quad whose four corners share its base point; the vertex shader pushes
  // the corners out in view space, so every quad faces the camera like a sprite.
  // Per-corner data: bb = (corner x, corner y, width, height); extra per-batch shader code can animate it.
  function billboardMat(tex, { anim = '', uniforms = {}, alphaTest = 0.35, depthWrite = true } = {}) {
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest, depthWrite, fog: true });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'attribute vec4 bb;\nattribute vec4 wv;\n' + Object.keys(uniforms).map((k) => `uniform float ${k};\n`).join('') +
        sh.vertexShader.replace('#include <project_vertex>', `
          vec2 bbSize = bb.zw; vec3 base = transformed;
          ${anim}
          vec4 mvPosition = modelViewMatrix * vec4(base, 1.0);
          mvPosition.xy += bb.xy * bbSize;
          gl_Position = projectionMatrix * mvPosition;`);
    };
    m.customProgramCacheKey = () => 'bb:' + anim + Object.keys(uniforms).join(); // each animation is its own program
    m.userData.shared = true; sceneryMats.push(m);
    return m;
  }
  // items: [{ x, y, z, w, h, u0, u1, cy, wv: [4 numbers] }] → one mesh. cy = how far below the base the quad starts (0..1).
  function billboardMesh(items, mat) {
    const n = items.length, pos = new Float32Array(n * 12), bb = new Float32Array(n * 16), wv = new Float32Array(n * 16), uv = new Float32Array(n * 8), idx = [];
    items.forEach((it, i) => {
      const cy = it.cy || 0, corners = [[-0.5, -cy, it.u0, 0], [0.5, -cy, it.u1, 0], [0.5, 1 - cy, it.u1, 1], [-0.5, 1 - cy, it.u0, 1]];
      corners.forEach(([cx, cyy, u, v], k) => {
        const j = i * 4 + k;
        pos.set([it.x, it.y, it.z], j * 3); bb.set([cx, cyy, it.w, it.h], j * 4); uv.set([u, v], j * 2);
        if (it.wv) wv.set(it.wv, j * 4);
      });
      const a = i * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('bb', new THREE.BufferAttribute(bb, 4));
    g.setAttribute('wv', new THREE.BufferAttribute(wv, 4)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
  }
  // all four tree kinds side by side in one texture, so a whole strip of trees is a single draw
  const TREE_KEYS = Object.keys(TREE_KINDS);
  const treeAtlas = paintTex(128 * TREE_KEYS.length, 192, (g) => TREE_KEYS.forEach((k, i) => { g.save(); g.translate(i * 128, 0); g.beginPath(); g.rect(0, 0, 128, 192); g.clip(); TREE_KINDS[k](g, 128, 192); g.restore(); }));
  const treeMat = billboardMat(treeAtlas);
  const TREES_FOR = { temperate: ['round', 'round', 'pine'], boreal: ['pine', 'pine', 'snowpine'], tundra: ['snowpine', 'pine'], tropic: ['jungle', 'jungle', 'palm', 'fern'], desert: ['cactus'], alpine: ['snowpine', 'pine', 'pine'] };
  function addTrees(grp, b, wx0, kind, hAt, pb = b) {
    const kinds0 = TREES_FOR[b], prevKinds = TREES_FOR[pb]; if (!kinds0 && !prevKinds) return;
    const kinds = kinds0 || prevKinds;
    // some stretches of land are proper forest: dense, and the trees grow bigger
    // jungle is almost always thick; elsewhere some stretches are forest
    const forest = kind === 'land' && (b === 'temperate' || b === 'boreal' || b === 'tropic' || b === 'alpine') && hash(wx0, 60) < (b === 'tropic' ? 0.8 : 0.3);
    let n = kind === 'city' ? 6 : b === 'desert' ? 8 : b === 'tundra' ? 10 : forest ? (b === 'tropic' ? 230 : 160) : b === 'tropic' ? 70 : 34;
    if (liteBuild) n = Math.ceil(n / 4); // at extreme speed a tree is on screen for a blink: plant far fewer
    const items = [];
    for (let i = 0; i < n; i++) {
      const lx = (hash(wx0, i) - 0.5) * (CW - 4), z = -6 - hash(i, wx0 + 3) * 170;
      if (kind === 'city' && z > -140) continue;
      // read the height the way the mesh draws it (straight lines between its grid points),
      // so a tree on a sloping island shore stands on the ground instead of floating beside it
      const sx = CW / GRID_X, i0 = Math.floor((lx + CW / 2) / sx), fx = (lx + CW / 2) / sx - i0;
      const sz = DEPTH / 60, zr = (ZC + DEPTH / 2 - z) / sz, j0 = Math.floor(zr), fz = zr - j0;
      const X0 = -CW / 2 + i0 * sx, Z0 = ZC + DEPTH / 2 - j0 * sz;
      const h = lerp(lerp(hAt(X0, Z0), hAt(X0 + sx, Z0), fx), lerp(hAt(X0, Z0 - sz), hAt(X0 + sx, Z0 - sz), fx), fz);
      if (h > 30 || h < 0.5 || nearRoad(lx, z, 3.5)) continue; // no trees on bare rock and snow, at the waterline or on the road
      // trees change over gradually too: near the left edge they belong to the last strip's landscape
      const own = hash(i + 3, wx0 + 1) < biomeBlend(lx + CW / 2, wx0 + lx + CW / 2, z), set = own ? kinds0 : prevKinds;
      if (!set) continue; // e.g. no trees on the ice
      const ki = TREE_KEYS.indexOf(set[Math.floor(hash(i, wx0) * set.length)]);
      const size = (3 + hash(wx0 + i, 7) * 4) * (forest ? 1.25 : 1);
      items.push({ x: lx, y: GROUND + h - 0.25, z, w: size * 0.67, h: size, cy: 0.02, u0: ki / TREE_KEYS.length + 0.002, u1: (ki + 1) / TREE_KEYS.length - 0.002 });
    }
    // now and then a tree or two right in the foreground, between you and the bird: seen when the
    // bird dips low (catching a bug, swooping), they frame the view
    if (kind === 'land' && !liteBuild && hash(wx0, 61) < 0.55) {
      const fn = 1 + Math.floor(hash(wx0, 62) * 3);
      for (let i = 0; i < fn; i++) {
        const lx = (hash(wx0 + 7, i) - 0.5) * (CW - 10), z = 3 + hash(i, wx0 + 9) * 6, h = hAt(lx, z);
        if (h < 0.8 || nearRoad(lx, z, 4)) continue;
        const ki = TREE_KEYS.indexOf(kinds[Math.floor(hash(i + 5, wx0) * kinds.length)]), size = 7 + hash(wx0 + i, 11) * 5;
        items.push({ x: lx, y: GROUND + h - 0.4, z, w: size * 0.67, h: size, cy: 0.02, u0: ki / TREE_KEYS.length + 0.002, u1: (ki + 1) / TREE_KEYS.length - 0.002 });
      }
    }
    if (items.length) { items.sort((a, b) => a.z - b.z); grp.add(billboardMesh(items, treeMat)); }
  }
  // ---- creatures and ice for each climate: one batched mesh per strip ----
  const PROP_KINDS = {
    goat: (g, W, H) => {
      g.fillStyle = '#f2efe8'; g.beginPath(); g.ellipse(W * 0.48, H * 0.55, W * 0.26, H * 0.14, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(W * 0.28, H * 0.6, W * 0.05, H * 0.3); g.fillRect(W * 0.38, H * 0.6, W * 0.05, H * 0.3); g.fillRect(W * 0.56, H * 0.6, W * 0.05, H * 0.3); g.fillRect(W * 0.64, H * 0.6, W * 0.05, H * 0.3);
      g.beginPath(); g.ellipse(W * 0.76, H * 0.42, W * 0.08, H * 0.09, -0.4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.74, H * 0.35); g.lineTo(W * 0.7, H * 0.24); g.stroke();
    },
    bear: (g, W, H) => {
      g.fillStyle = '#f4f1e6'; g.beginPath(); g.ellipse(W * 0.46, H * 0.56, W * 0.3, H * 0.18, 0, 0, Math.PI * 2); g.fill();
      for (const x of [0.24, 0.34, 0.56, 0.66]) { g.beginPath(); g.ellipse(W * x, H * 0.76, W * 0.05, H * 0.13, 0, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.ellipse(W * 0.8, H * 0.5, W * 0.11, H * 0.09, 0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(W * 0.9, H * 0.5, W * 0.018, 0, Math.PI * 2); g.fill();
    },
    penguin: (g, W, H) => {
      for (const [x, s] of [[0.3, 0.9], [0.5, 1], [0.7, 0.85]]) {
        g.fillStyle = '#1b1d24'; g.beginPath(); g.ellipse(W * x, H * (0.62 + (1 - s) * 0.2), W * 0.08 * s, H * 0.28 * s, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f6f4ee'; g.beginPath(); g.ellipse(W * (x + 0.02), H * (0.66 + (1 - s) * 0.2), W * 0.05 * s, H * 0.2 * s, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f08a2e'; g.fillRect(W * (x + 0.05), H * (0.44 + (1 - s) * 0.2), W * 0.04, H * 0.02);
      }
    },
    seal: (g, W, H) => {
      g.fillStyle = '#6a6e76'; g.beginPath(); g.moveTo(W * 0.1, H * 0.8); g.quadraticCurveTo(W * 0.4, H * 0.55, W * 0.72, H * 0.52); g.quadraticCurveTo(W * 0.86, H * 0.5, W * 0.86, H * 0.62);
      g.quadraticCurveTo(W * 0.6, H * 0.86, W * 0.1, H * 0.8); g.fill(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(W * 0.8, H * 0.56, 2.5, 0, Math.PI * 2); g.fill();
    },
    iceberg: (g, W, H) => {
      g.fillStyle = '#eaf6fc'; g.beginPath(); g.moveTo(W * 0.04, H); g.lineTo(W * 0.2, H * 0.4); g.lineTo(W * 0.36, H * 0.5); g.lineTo(W * 0.52, H * 0.1); g.lineTo(W * 0.7, H * 0.35); g.lineTo(W * 0.82, H * 0.3); g.lineTo(W * 0.96, H); g.fill();
      g.fillStyle = '#b8dcef'; g.beginPath(); g.moveTo(W * 0.52, H * 0.1); g.lineTo(W * 0.7, H * 0.35); g.lineTo(W * 0.82, H * 0.3); g.lineTo(W * 0.96, H); g.lineTo(W * 0.6, H); g.fill();
      g.fillStyle = 'rgba(120,190,225,.6)'; g.fillRect(W * 0.04, H * 0.9, W * 0.92, H * 0.1);
    },
    floe: (g, W, H) => {
      g.fillStyle = '#f2f8fb'; g.beginPath(); g.ellipse(W * 0.5, H * 0.82, W * 0.46, H * 0.12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c4e2f0'; g.beginPath(); g.ellipse(W * 0.5, H * 0.88, W * 0.46, H * 0.07, 0, 0, Math.PI); g.fill();
    },
    glacier: (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#9fd0ea');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, H); g.lineTo(W * 0.08, H * 0.3); g.lineTo(W * 0.3, H * 0.2); g.lineTo(W * 0.55, H * 0.28); g.lineTo(W * 0.8, H * 0.15); g.lineTo(W, H * 0.35); g.lineTo(W, H); g.fill();
      g.strokeStyle = 'rgba(80,150,200,.55)'; g.lineWidth = 3; for (let i = 0; i < 7; i++) { const x = W * (0.12 + i * 0.12); g.beginPath(); g.moveTo(x, H * 0.4); g.lineTo(x + 6, H * 0.95); g.stroke(); }
    },
  };
  const PROP_KEYS = Object.keys(PROP_KINDS);
  const propAtlas = paintTex(160 * PROP_KEYS.length, 160, (g) => PROP_KEYS.forEach((k, i) => { g.save(); g.translate(i * 160, 0); g.beginPath(); g.rect(0, 0, 160, 160); g.clip(); PROP_KINDS[k](g, 160, 160); g.restore(); }));
  const propMat = billboardMat(propAtlas);
  const prop = (k, x, y, z, w, h) => { const i = PROP_KEYS.indexOf(k); return { x, y, z, w, h, cy: 0.02, u0: i / PROP_KEYS.length + 0.002, u1: (i + 1) / PROP_KEYS.length - 0.002 }; };
  function addProps(grp, b, kind, wx0, hAt, geo) {
    if (liteBuild) return;
    const items = [], south = geo && geo.lat < 0, R = (i, k) => hash(wx0 + k, i);
    if (kind === 'sea' && (b === 'ice' || b === 'tundra')) {
      // polar sea: icebergs and floes, some with seals, penguins or a bear riding them
      const nb = 2 + Math.floor(R(1, 3) * 4);
      for (let i = 0; i < nb; i++) { const w = 8 + R(i, 4) * 16; items.push(prop('iceberg', (R(i, 5) - 0.5) * CW, GROUND + 0.1, -20 - R(i, 6) * 230, w, w * 0.65)); }
      const nf = 3 + Math.floor(R(2, 7) * 5);
      for (let i = 0; i < nf; i++) {
        const x = (R(i, 8) - 0.5) * CW, z = -10 - R(i, 9) * 120, w = 5 + R(i, 10) * 4;
        items.push(prop('floe', x, GROUND + 0.2, z, w, w * 0.5));
        const who = R(i, 11);
        if (who < 0.6) items.push(prop(south ? 'penguin' : who < 0.3 ? 'bear' : 'seal', x, GROUND + 0.75, z + 0.05, 3, 2.2));
      }
    } else if (kind === 'land' && b === 'ice') {
      // the ice: glaciers in the distance, polar bears or penguin colonies up close
      for (let i = 0; i < 4; i++) { const x = (R(i, 12) - 0.5) * CW, z = -70 - R(i, 13) * 150, w = 20 + R(i, 14) * 18; items.push(prop('glacier', x, GROUND + hAt(x, z) - 1, z, w, w * 0.45)); }
      for (let i = 0; i < 5; i++) { const x = (R(i, 15) - 0.5) * (CW - 10), z = -10 - R(i, 16) * 60, h = hAt(x, z); if (h > 1) items.push(prop(south ? 'penguin' : 'bear', x, GROUND + h - 0.2, z, 3.4, 2.5)); }
    } else if (kind === 'land' && b === 'alpine') {
      // mountain goats up on the slopes
      for (let i = 0; i < 4; i++) { const x = (R(i, 17) - 0.5) * (CW - 10), z = -15 - R(i, 18) * 90, h = hAt(x, z); if (h > 6 && h < 40 && !nearRoad(x, z, 2)) items.push(prop('goat', x, GROUND + h - 0.2, z, 2.6, 2.2)); }
    }
    if (items.length) { items.sort((a, c) => a.z - c.z); grp.add(billboardMesh(items, propMat)); }
  }
  // lakes: flat water in a hollow, some land strips get one
  const lakeMat = new THREE.MeshStandardMaterial({ color: 0x3a7fc0, roughness: 0.25, metalness: 0.1 });
  const lakeGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  function addLake(grp, b, wx0, hAt) {
    if (b === 'desert' || b === 'ice' || hash(wx0, 99) > 0.4) return;
    const lx = (hash(wx0, 5) - 0.5) * (CW - 30), z = -40 - hash(wx0, 6) * 90, r = 6 + hash(wx0, 7) * 8;
    let lo = Infinity;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; lo = Math.min(lo, hAt(lx + Math.cos(a) * r, z + Math.sin(a) * r * 0.6)); }
    if (lo < 1 || nearRoad(lx, z, r)) return; // too near the shore (or a road) for a lake
    const m = new THREE.Mesh(lakeGeo, lakeMat); m.scale.set(r, 1, r * 0.6);
    m.position.set(lx, GROUND + lo + 0.4, z); m.userData.shared = true; grp.add(m);
  }
  // an airliner crossing far in the background, with a fading contrail
  const planeMat = sceneryMat(paintTex(512, 96, (g, W, H) => {
    const cy = H * 0.5, x1 = W * 0.86;
    const tr = g.createLinearGradient(0, 0, x1 - W * 0.12, 0);
    tr.addColorStop(0, 'rgba(255,255,255,0)'); tr.addColorStop(1, 'rgba(255,255,255,.85)');
    g.fillStyle = tr; g.fillRect(0, cy - 3, x1 - W * 0.12, 6);
    g.fillStyle = '#f2f4f7'; g.beginPath(); g.ellipse(x1 - W * 0.06, cy, W * 0.08, H * 0.09, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9d1dc'; g.beginPath(); g.moveTo(x1 - W * 0.07, cy); g.lineTo(x1 - W * 0.11, cy + H * 0.3); g.lineTo(x1 - W * 0.05, cy); g.fill();
    g.beginPath(); g.moveTo(x1 - W * 0.13, cy); g.lineTo(x1 - W * 0.145, cy - H * 0.28); g.lineTo(x1 - W * 0.12, cy - H * 0.04); g.fill();
    g.fillStyle = '#2557a7'; g.fillRect(x1 - W * 0.12, cy - 1, W * 0.12, 3);
  }), { fog: false });
  // a distant flock: a loose V of tiny birds, two wing poses
  const flockMats = [0, 1].map((f) => sceneryMat(paintTex(256, 128, (g, W, H) => {
    g.strokeStyle = '#2b2f3a'; g.lineWidth = 3; g.lineCap = 'round';
    // leader out front on the right, the rest trailing back: the flock is heading the same way as you
    const pts = [[0.86, 0.45], [0.72, 0.36], [0.7, 0.58], [0.57, 0.28], [0.55, 0.68], [0.42, 0.2], [0.4, 0.78]];
    for (const [x, y] of pts) {
      const X = x * W, Y = y * H + 6, d = f ? 7 : -5;
      g.beginPath(); g.moveTo(X - 9, Y + d); g.quadraticCurveTo(X - 4, Y - 2, X, Y); g.quadraticCurveTo(X + 4, Y - 2, X + 9, Y + d); g.stroke();
    }
  }), { fog: false }));
  // ---- the open sea: wave crests, ships, and the occasional leaping dolphin or whale ----
  const WAVE_MAT = sceneryMat(paintTex(96, 32, (g, W, H) => {
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(6, H - 8); g.quadraticCurveTo(W * 0.35, 4, W * 0.62, H - 12); g.quadraticCurveTo(W * 0.8, H - 18, W - 6, H - 9); g.stroke();
  }), { fog: true });
  // wv = (phase, rate, drift, amp); uWT is the sea clock
  const waveClock = { value: 0 };
  const waveMat = billboardMat(WAVE_MAT.map, { uniforms: { uWT: waveClock }, alphaTest: 0.05, depthWrite: false, anim: `
    float k = fract(uWT * wv.y + wv.x);
    float rise = sin(3.14159 * k);
    bbSize = vec2(bb.z * (0.7 + 0.5 * k), bb.w * (0.15 + 1.1 * rise));
    base.x += mod(uWT * wv.z, 6.0) - 3.0 + k * 1.2;
    base.y += 0.25 * wv.w * sin(uWT * 1.7 + wv.x * 3.0);` });
  const hull = (g, x0, x1, top, bot, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x0, top); g.lineTo(x1, top); g.lineTo(x1 - (x1 - x0) * 0.08, bot); g.lineTo(x0 + (x1 - x0) * 0.04, bot); g.closePath(); g.fill(); };
  const SHIPS = {
    fishing: { w: 7, h: 4.2, tex: paintTex(160, 96, (g, W, H) => {
      hull(g, W * 0.1, W * 0.9, H * 0.66, H * 0.92, '#c8322f'); g.fillStyle = '#ffffff'; g.fillRect(W * 0.1, H * 0.62, W * 0.8, H * 0.06);
      g.fillStyle = '#f2efe6'; g.fillRect(W * 0.52, H * 0.4, W * 0.24, H * 0.22); g.fillStyle = '#2b3a55'; g.fillRect(W * 0.56, H * 0.45, W * 0.07, H * 0.07); g.fillRect(W * 0.66, H * 0.45, W * 0.07, H * 0.07);
      g.strokeStyle = '#3a3a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.3, H * 0.62); g.lineTo(W * 0.3, H * 0.1); g.lineTo(W * 0.1, H * 0.5); g.stroke();
    }) },
    cruise: { w: 30, h: 9, tex: paintTex(512, 160, (g, W, H) => {
      hull(g, W * 0.03, W * 0.97, H * 0.62, H * 0.92, '#1f2f4f'); g.fillStyle = '#ffffff';
      g.fillRect(W * 0.06, H * 0.3, W * 0.86, H * 0.32); g.fillRect(W * 0.14, H * 0.16, W * 0.62, H * 0.16);
      g.fillStyle = '#7fb6e6'; for (let r = 0; r < 3; r++) for (let x = W * 0.08; x < W * 0.9; x += 14) if (r || (x > W * 0.15 && x < W * 0.74)) g.fillRect(x, H * (0.2 + r * 0.12), 8, 6);
      g.fillStyle = '#cf2e3a'; g.fillRect(W * 0.6, H * 0.04, W * 0.06, H * 0.14);
    }) },
    warship: { w: 18, h: 7, tex: paintTex(384, 160, (g, W, H) => {
      hull(g, W * 0.04, W * 0.98, H * 0.6, H * 0.9, '#6d7680'); g.fillStyle = '#7f8892';
      g.beginPath(); g.moveTo(W * 0.32, H * 0.6); g.lineTo(W * 0.38, H * 0.3); g.lineTo(W * 0.6, H * 0.3); g.lineTo(W * 0.66, H * 0.6); g.fill();
      g.fillRect(W * 0.46, H * 0.08, W * 0.03, H * 0.24); g.fillRect(W * 0.42, H * 0.14, W * 0.11, H * 0.03);
      g.fillStyle = '#5c646d'; g.beginPath(); g.arc(W * 0.8, H * 0.56, H * 0.08, Math.PI, 0); g.fill(); g.fillRect(W * 0.8, H * 0.5, W * 0.12, H * 0.03);
      g.beginPath(); g.arc(W * 0.2, H * 0.56, H * 0.07, Math.PI, 0); g.fill();
      g.fillStyle = '#ffffff'; g.font = 'bold 20px sans-serif'; g.fillText('71', W * 0.12, H * 0.8);
    }) },
  };
  // the ship a warship is shooting at: a rusty dark freighter
  SHIPS.target = { w: 13, h: 6, tex: paintTex(320, 150, (g, W, H) => {
    hull(g, W * 0.04, W * 0.96, H * 0.58, H * 0.9, '#2d2a2a'); g.fillStyle = '#8c2f22'; g.fillRect(W * 0.06, H * 0.8, W * 0.86, H * 0.05);
    g.fillStyle = '#4a4440'; g.fillRect(W * 0.08, H * 0.36, W * 0.2, H * 0.22); g.fillStyle = '#c8a24a'; g.fillRect(W * 0.12, H * 0.42, W * 0.04, H * 0.05); g.fillRect(W * 0.2, H * 0.42, W * 0.04, H * 0.05);
    g.fillStyle = '#6b3b2a'; for (let k = 0; k < 4; k++) g.fillRect(W * (0.34 + k * 0.15), H * 0.44, W * 0.12, H * 0.14);
    g.fillStyle = '#3a3533'; g.fillRect(W * 0.16, H * 0.14, W * 0.05, H * 0.22);
  }) };
  for (const k in SHIPS) SHIPS[k].mat = sceneryMat(SHIPS[k].tex, { fog: true });
  // gunfire pieces, shared: muzzle flash, shell, explosion and the white water column of a miss
  const fxMat = (inner, outer) => { const m = new THREE.SpriteMaterial({ map: dotTexture(inner, outer), transparent: true, depthWrite: false, fog: false }); m.userData.shared = true; return m; };
  const FLASH_MAT = fxMat('#fffbe0', 'rgba(255,190,60,.8)'), SHELL_MAT = fxMat('#fff3c0', 'rgba(255,160,40,.6)');
  const BOOM_MAT = fxMat('#fff2b0', 'rgba(255,110,30,.9)'), SMOKE_MAT = fxMat('rgba(70,62,58,.9)', 'rgba(60,55,52,.5)');
  const SPLASH_MAT = sceneryMat(paintTex(64, 128, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(220,235,245,.9)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(W * 0.2, H); g.quadraticCurveTo(W * 0.3, H * 0.2, W * 0.5, 0); g.quadraticCurveTo(W * 0.7, H * 0.2, W * 0.8, H); g.fill();
  }), { fog: true });
  const fx = (mat, grp, x, y, z, w, h = w) => { const sp = new THREE.Sprite(mat); sp.scale.set(w, h, 1); sp.position.set(x, y, z); sp.userData.shared = true; grp.add(sp); return sp; };
  function addSea(grp, wx0) {
    const y = GROUND + 0.6, items = [];
    // some stretches of ocean are rough: more crests, taller and quicker
    const rough = hash(wx0, 50) < 0.3, amp = rough ? 2.2 : 1;
    const count = (rough ? 48 : 34) >> (liteBuild ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const w = (1.6 + hash(wx0, i) * 2.4) * (rough ? 1.3 : 1);
      // each crest swells, breaks and drops on its own clock, rolling forward as it goes (animated in the shader)
      items.push({ x: (hash(i, wx0) - 0.5) * CW, y, z: -4 - hash(wx0 + 1, i) * 200, w, h: w / 3 * amp, cy: 0.1, u0: 0, u1: 1,
        wv: [hash(wx0 + 2, i) * 7, (0.55 + hash(wx0 + 3, i) * 0.5) * (rough ? 1.4 : 1), 0.6 + hash(wx0 + 4, i) * 0.8, amp] });
    }
    items.sort((a, b) => a.z - b.z);
    grp.add(billboardMesh(items, waveMat)); grp.userData.rough = rough;
    // ships are rare: fishing boats most often, cruise liners now and then, warships seldom
    const r = hash(wx0, 41);
    const kind = liteBuild ? null : r < 0.2 ? 'fishing' : r < 0.27 ? 'cruise' : r < 0.285 ? 'warship' : null;
    if (kind) {
      const sh = SHIPS[kind], sp = new THREE.Sprite(sh.mat);
      sp.center.set(0.5, 0.12); sp.scale.set(sh.w, sh.h, 1); sp.userData = { ship: kind, baseY: y };
      sp.position.set((hash(wx0, 42) - 0.5) * (CW - sh.w), y, -14 - hash(wx0, 43) * (kind === 'fishing' ? 60 : 140)); grp.add(sp);
      if (kind === 'warship') {
        // a warship fires its guns to the right; usually there's a ship out there it's shelling
        const n = { ship: sp, t: 0.6 + hash(wx0, 44) * 1.5, shells: [], fx: [], hits: 0, target: null, sinking: 0 };
        sp.position.x = -CW / 2 + 6 + hash(wx0, 42) * 12;
        if (hash(wx0, 45) < 0.75) {
          const tg = new THREE.Sprite(SHIPS.target.mat); tg.center.set(0.5, 0.12); tg.scale.set(SHIPS.target.w, SHIPS.target.h, 1);
          tg.position.set(sp.position.x + 30 + hash(wx0, 46) * 14, y, sp.position.z - 6); tg.userData = { ship: 'target', baseY: y }; grp.add(tg); n.target = tg;
        }
        grp.userData.naval = n;
      }
    }
  }
  const JUMPERS = {
    dolphin: { w: 4.5, h: 2.2, secs: 1.5, height: 4, tex: paintTex(192, 96, (g, W, H) => {
      g.fillStyle = '#7b8b9c'; g.beginPath(); g.moveTo(W * 0.06, H * 0.58);
      g.quadraticCurveTo(W * 0.4, H * 0.18, W * 0.86, H * 0.5); g.lineTo(W * 0.98, H * 0.55); g.lineTo(W * 0.86, H * 0.6);
      g.quadraticCurveTo(W * 0.45, H * 0.82, W * 0.06, H * 0.58); g.fill();
      g.fillStyle = '#d9e1e8'; g.beginPath(); g.ellipse(W * 0.52, H * 0.64, W * 0.24, H * 0.07, 0.05, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6a7a8a'; g.beginPath(); g.moveTo(W * 0.46, H * 0.32); g.lineTo(W * 0.38, H * 0.1); g.lineTo(W * 0.56, H * 0.3); g.fill();
      g.beginPath(); g.moveTo(W * 0.08, H * 0.58); g.lineTo(W * 0.0, H * 0.4); g.lineTo(W * 0.03, H * 0.6); g.lineTo(W * 0.0, H * 0.78); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(W * 0.8, H * 0.47, 3, 0, Math.PI * 2); g.fill();
    }) },
    whale: { w: 16, h: 7, secs: 2.8, height: 7, tex: paintTex(384, 168, (g, W, H) => {
      g.fillStyle = '#3c4c66'; g.beginPath(); g.moveTo(W * 0.12, H * 0.5);
      g.quadraticCurveTo(W * 0.45, H * 0.12, W * 0.92, H * 0.42); g.quadraticCurveTo(W * 0.98, H * 0.55, W * 0.88, H * 0.66);
      g.quadraticCurveTo(W * 0.45, H * 0.86, W * 0.12, H * 0.5); g.fill();
      g.fillStyle = '#e8edf2'; g.beginPath(); g.ellipse(W * 0.6, H * 0.68, W * 0.26, H * 0.08, 0.05, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(W * (0.48 + k * 0.05), H * 0.62); g.lineTo(W * (0.46 + k * 0.05), H * 0.75); g.stroke(); }
      g.fillStyle = '#34445c'; g.beginPath(); g.moveTo(W * 0.14, H * 0.5); g.lineTo(W * 0.02, H * 0.26); g.lineTo(W * 0.08, H * 0.48); g.lineTo(W * 0.0, H * 0.7); g.fill();
      g.beginPath(); g.ellipse(W * 0.58, H * 0.74, W * 0.1, H * 0.04, 0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(W * 0.86, H * 0.52, 4, 0, Math.PI * 2); g.fill();
    }) },
  };
  // a whale's tail flukes lifting out of the water as it dives
  JUMPERS.tail = { w: 6, h: 4.6, secs: 4.2, height: 3.4, tail: true, tex: paintTex(192, 150, (g, W, H) => {
    g.fillStyle = '#34445c';
    g.beginPath(); g.moveTo(W * 0.44, H); g.lineTo(W * 0.47, H * 0.42); g.lineTo(W * 0.53, H * 0.42); g.lineTo(W * 0.56, H); g.fill(); // the tail stock
    g.beginPath(); g.moveTo(W * 0.5, H * 0.46);
    g.bezierCurveTo(W * 0.36, H * 0.4, W * 0.14, H * 0.3, W * 0.03, H * 0.08); g.bezierCurveTo(W * 0.2, H * 0.2, W * 0.36, H * 0.16, W * 0.5, H * 0.3);
    g.bezierCurveTo(W * 0.64, H * 0.16, W * 0.8, H * 0.2, W * 0.97, H * 0.08); g.bezierCurveTo(W * 0.86, H * 0.3, W * 0.64, H * 0.4, W * 0.5, H * 0.46); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(W * (0.08 + i * 0.105), H * (0.14 + (i % 3) * 0.06), 2.5, 0, Math.PI * 2); g.fill(); } // water streaming off
  }) };
  for (const k in JUMPERS) JUMPERS[k].mat = sceneryMat(JUMPERS[k].tex, { fog: true });
  const seaLife = { list: [], t: 8, rogue: null, rogueT: 14 };
  // A giant wave, drawn as a 2D flipbook in the same cartoon style as the little crests:
  // flat blue body, a thick white curling crest, foam dots. 16 frames: it swells, curls over,
  // crashes in a burst of spray and settles into foam.
  // Painted fresh every frame (a small 320x200 canvas), so the wave moves smoothly at full frame rate.
  // The wave is drawn in a 320x200 box, inside a padded canvas (room for the spray and the crest
  // to fly past the box's edges) at twice the resolution, so it stays crisp up close.
  const GW = { w: 320, h: 200, padX: 48, padTop: 70, padBot: 10, res: 2 };
  GW.cw = GW.w + GW.padX * 2; GW.ch = GW.h + GW.padTop + GW.padBot;
  const giantCanvas = document.createElement('canvas'); giantCanvas.width = GW.cw * GW.res; giantCanvas.height = GW.ch * GW.res;
  const giantG = giantCanvas.getContext('2d');
  const giantTex = new THREE.CanvasTexture(giantCanvas); giantTex.colorSpace = THREE.SRGBColorSpace;
  function paintGiant(f, time) {
    const g = giantG, W = GW.w, H = GW.h;
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // same foam layout every frame; time makes it boil
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, giantCanvas.width, giantCanvas.height);
    g.setTransform(GW.res, 0, 0, GW.res, GW.padX * GW.res, GW.padTop * GW.res);
    const rise = smooth(0, 0.45, f), curl = smooth(0.3, 0.7, f), fall = smooth(0.72, 1, f);
    const bob = Math.sin(time * 3.1) * 2.5, sway = Math.sin(time * 2.3) * 3;
    const top = H * (0.86 - 0.5 * rise * (1 - 0.8 * fall)) + bob; // crest height
    const cx = W * (0.5 + 0.12 * curl) + sway;                      // crest position, leaning forward as it curls
    const base = H * 0.94;
    // the body of water
    const gr = g.createLinearGradient(0, top, 0, base); gr.addColorStop(0, '#3f9ad6'); gr.addColorStop(1, '#1f5f9e');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, base);
    g.bezierCurveTo(W * 0.3, base, W * 0.34, top + (base - top) * 0.15, cx, top); // a long rolling back
    const lipX = cx + W * 0.22 * curl, lipY = top + (base - top) * 0.45 * curl + Math.sin(time * 5) * 2 * curl;
    g.bezierCurveTo(cx + W * 0.12, top - 4, lipX + 6, top + (lipY - top) * 0.2, lipX, lipY);   // over the top and curling down
    g.bezierCurveTo(lipX - W * 0.08 * curl, lipY - 6, cx + W * 0.02, top + (base - top) * 0.5, cx + W * 0.16, base); // the hollow face
    g.closePath(); g.fill(); // closes along the waterline: the sea itself carries on below, no box edges
    // lighter, glassy face under the curl, shimmering
    g.fillStyle = `rgba(140,220,240,${0.3 + 0.1 * Math.sin(time * 6)})`; g.beginPath(); g.moveTo(cx + W * 0.02, top + 8);
    g.quadraticCurveTo(cx + W * 0.04, top + (base - top) * 0.6, cx + W * 0.16, base); g.lineTo(cx - W * 0.1, base); g.quadraticCurveTo(cx - W * 0.06, top + (base - top) * 0.4, cx + W * 0.02, top + 8); g.fill();
    // white streaks rolling up the back of the swell, like the little wave crests
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const ph = (time * 0.6 + k / 5) % 1, yy = lerp(base - 4, top + 14, ph), x0 = W * (0.04 + ph * 0.28) + k * 6;
      g.globalAlpha = Math.sin(Math.PI * ph); g.beginPath(); g.moveTo(x0, yy + 4); g.quadraticCurveTo(x0 + W * 0.08, yy - 6, x0 + W * 0.18, yy + 2); g.stroke();
    }
    g.globalAlpha = 1;
    // the white crest line, thick like the little waves
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - W * 0.25, top + (base - top) * 0.22); g.bezierCurveTo(cx - W * 0.08, top - 6, cx + W * 0.12, top - 6, lipX, lipY); g.stroke();
    // swirl inside the curl, turning
    if (curl > 0.3) { g.lineWidth = 4; const a0 = time * 4; g.beginPath(); g.arc(lipX - W * 0.05, lipY - 2, W * 0.035 * curl, a0, a0 + 3.8); g.stroke(); }
    // foam: dots along the crest that boil and drift, more as it breaks, a carpet once it crashes
    g.fillStyle = 'rgba(255,255,255,.9)';
    const nf = Math.floor(6 + 30 * curl + 34 * fall);
    for (let k = 0; k < nf; k++) {
      const t = rnd(), j1 = rnd(), j2 = rnd(), r0 = 2 + rnd() * 5;
      const x = lerp(cx - W * 0.2, lipX + W * 0.1, t) + (fall ? (j1 - 0.5) * W * 0.6 * fall : 0) + Math.sin(time * 4 + k) * 2.5;
      const y = (fall > 0.2 ? base - j2 * 18 * (1 - fall * 0.5) : lerp(top, lipY, t) + (j2 - 0.5) * 8) + Math.cos(time * 5 + k * 1.3) * 2;
      g.beginPath(); g.arc(x, y, r0 * (0.75 + 0.25 * Math.sin(time * 7 + k)), 0, Math.PI * 2); g.fill();
    }
    // spray thrown up as the lip slams down, flying outward
    if (f > 0.6 && f < 0.97) {
      const sp = smooth(0.6, 0.78, f) * (1 - smooth(0.85, 0.97, f)), out = smooth(0.6, 0.97, f);
      for (let k = 0; k < 26; k++) { const a = -Math.PI * (0.12 + rnd() * 0.76), r = 10 + rnd() * 70 * out; g.globalAlpha = 0.85 * sp; g.beginPath(); g.arc(lipX + Math.cos(a) * r, lipY + Math.sin(a) * r + out * out * 30, 2 + rnd() * 4, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }
    giantTex.needsUpdate = true;
  }
  const giantMat = new THREE.SpriteMaterial({ map: giantTex, transparent: true, depthWrite: false, fog: true });
  // ---- the far horizon: distant sailboats, ships and whale spouts out where the sea meets the sky ----
  // Kept just inside the haze and tinted toward the sky colour by hand, so they read as far away.
  const FAR = {
    sail: { w: 3.2, h: 4, tex: paintTex(96, 120, (g, W, H) => {
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(W * 0.5, H * 0.04); g.lineTo(W * 0.52, H * 0.78); g.lineTo(W * 0.14, H * 0.78); g.fill();
      g.fillStyle = '#e8e2d4'; g.beginPath(); g.moveTo(W * 0.56, H * 0.12); g.lineTo(W * 0.56, H * 0.78); g.lineTo(W * 0.86, H * 0.78); g.fill();
      g.fillStyle = '#3a4250'; g.beginPath(); g.moveTo(W * 0.08, H * 0.8); g.lineTo(W * 0.92, H * 0.8); g.lineTo(W * 0.8, H * 0.94); g.lineTo(W * 0.18, H * 0.94); g.fill();
    }) },
    tanker: { w: 14, h: 3, tex: paintTex(320, 72, (g, W, H) => {
      g.fillStyle = '#3a4250'; g.fillRect(W * 0.04, H * 0.55, W * 0.92, H * 0.35);
      g.fillStyle = '#8a3a2a'; g.fillRect(W * 0.04, H * 0.82, W * 0.92, H * 0.08);
      g.fillStyle = '#e8e4dc'; g.fillRect(W * 0.78, H * 0.18, W * 0.12, H * 0.38);
      const cols = ['#c8504a', '#3a7ac8', '#e8b43a', '#4aa86a']; for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % 4]; g.fillRect(W * (0.08 + i * 0.075), H * (0.32 + (i % 2) * 0.08), W * 0.065, H * 0.24); }
    }) },
    spout: { w: 3, h: 4.5, tex: paintTex(96, 144, (g, W, H) => {
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 22; i++) { const t = i / 21, r = 3 + t * 14; g.globalAlpha = 0.9 - t * 0.5; g.beginPath(); g.arc(W / 2 + Math.sin(i * 1.7) * t * 22, H * (0.95 - t * 0.8), r, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = '#34445c'; g.beginPath(); g.ellipse(W / 2, H * 0.97, W * 0.32, H * 0.04, 0, 0, Math.PI * 2); g.fill();
    }) },
  };
  for (const k in FAR) FAR[k].mat = new THREE.SpriteMaterial({ map: FAR[k].tex, transparent: true, depthWrite: false, fog: false });
  const farSea = { list: [], t: 3 };
  function updateFarSea(dt, dx) {
    // only out over open water (not with land filling the view)
    const open = side.landK < 0.35;
    farSea.t -= dt;
    if (open && farSea.t <= 0 && farSea.list.length < 5) {
      farSea.t = 4 + Math.random() * 7;
      const r = Math.random(), kind = r < 0.45 ? 'sail' : r < 0.75 ? 'tanker' : 'spout', D = FAR[kind];
      const sp = new THREE.Sprite(D.mat.clone()); sp.center.set(0.5, 0.05);
      const z = -380 - Math.random() * 140, sc = 1 + Math.abs(z) / 140;
      sp.scale.set(D.w * sc, D.h * sc, 1);
      sp.userData = { kind, t: 0, z, x: 260 + Math.random() * 200, sc, D };
      fscene.add(sp); farSea.list.push(sp);
    }
    const fogC = fscene.fog.color;
    for (let k = farSea.list.length - 1; k >= 0; k--) {
      const sp = farSea.list[k], d = sp.userData; d.t += dt;
      d.x -= dx * 0.2 + (d.kind === 'tanker' ? 1.2 : d.kind === 'sail' ? 0.6 : 0) * dt; // far away, so it barely moves
      let h = 1, a = 1;
      if (d.kind === 'spout') { const f = (d.t % 3) / 3; h = smooth(0, 0.25, f) * (1 - smooth(0.6, 1, f)); a = h; if (d.t > 9) a = 0; } // a puff of spray, then again
      sp.scale.y = d.D.h * d.sc * Math.max(0.01, h);
      sp.position.set(d.x, GROUND + 0.6, d.z);
      // haze toward the horizon colour, so they sit far off
      sp.material.color.copy(fogC).lerp(new THREE.Color(1, 1, 1), 0.45);
      sp.material.opacity = a * (open ? 0.9 : 0.9 * (1 - smooth(0.35, 0.6, side.landK)));
      if (d.x < -320 || (d.kind === 'spout' && d.t > 9.5)) { fscene.remove(sp); sp.material.dispose(); farSea.list.splice(k, 1); }
    }
  }
  function updateRogue(dt, dx, under) {
    seaLife.rogueT -= dt * (under && under.grp.userData.rough ? 2.5 : 1);
    if (!seaLife.rogue && under && under.kind === 'sea' && seaLife.rogueT <= 0) {
      const sp = new THREE.Sprite(giantMat); sp.center.set(0.5, (GW.padBot + GW.h * 0.06) / GW.ch); // anchored at the waterline
      const W = world.viewW || 14, w = 34 + Math.random() * 12;
      // usually it rolls the same way as the bird (sometimes lagging well behind); now and then it comes the other way
      let dir = Math.random() < 0.3 ? -1 : 1;
      // don't start one already on top of a shore: it should have open water to build up over
      const openAt = (x) => { const c = chunkAtX(x); return !c || (c.kind === 'sea' && c.hAt(x - c.grp.position.x, -30) < -3); };
      const x0 = W * 0.95;
      if (!openAt(x0 + dir * w * 0.9)) dir = -dir;
      sp.userData = { t: 0, T: 6, x: W * (0.75 + Math.random() * 0.4), z: -24 - Math.random() * 12, w, crashed: false, dir, drift: dir > 0 ? 0.25 + Math.random() * 0.5 : 1.08 };
      fscene.add(sp); seaLife.rogue = sp; seaLife.rogueT = 30 + Math.random() * 40;
      // often there's a boat right in its path
      const bx = sp.userData.x + dir * w * (0.6 + Math.random() * 0.3), host = chunkAtX(bx);
      if (host && host.kind === 'sea' && Math.random() < 0.7) {
        const kind = Math.random() < 0.75 ? 'fishing' : 'cruise', sh = SHIPS[kind], b = new THREE.Sprite(sh.mat);
        b.center.set(0.5, 0.12); b.scale.set(sh.w, sh.h, 1); b.userData = { ship: kind, baseY: GROUND + 0.6 };
        b.position.set(bx - host.grp.position.x, GROUND + 0.6, sp.userData.z + (Math.random() - 0.5) * 6); host.grp.add(b);
      }
    }
    const sp = seaLife.rogue; if (!sp) return;
    const d = sp.userData; d.t += dt;
    d.x -= dx * (d.landed ? 1 : d.drift); // once it has hit the shore it stays put with the land
    // rolling into land: it breaks right there on the shore instead of sliding on over the ground
    if (!d.landed && d.t < 0.62 * d.T) {
      const fx = d.x + d.dir * d.w * 0.35, c = chunkAtX(fx);
      if (c && (c.kind !== 'sea' || c.hAt(fx - c.grp.position.x, d.z) > -2)) {
        d.landed = true; d.t = Math.max(d.t, 0.62 * d.T);
        splash(new THREE.Vector3(fx, GROUND + 4, d.z + 1), 2.6); side.shake = Math.max(side.shake, 0.2); Sound.hit();
      }
    }
    const k = d.t / d.T;
    paintGiant(Math.min(1, k), d.t); // smooth: a fresh picture every frame
    sp.scale.set(d.w * GW.cw / GW.w, d.w * GW.ch / GW.w, 1);
    giantTex.repeat.x = d.dir; giantTex.offset.x = d.dir < 0 ? 1 : 0; // mirrored when it comes the other way (sprites ignore a negative scale)
    sp.position.set(d.x + d.dir * k * 3, GROUND + 0.2, d.z);
    sp.material.opacity = 1 - smooth(0.88, 1, k);
    if (!d.crashed && k > 0.66) { d.crashed = true; splash(new THREE.Vector3(d.x + d.dir * d.w * 0.15, GROUND + d.w * 0.25, d.z + 1), 2.2); side.shake = Math.max(side.shake, 0.12); }
    waveHitsShips(d, k, dt);
    if (k >= 1) { fscene.remove(sp); seaLife.rogue = null; }
  }
  // Boats caught by the giant wave ride up its face, get shoved along and tipped; small boats
  // under the crashing lip capsize and sink, big ones list hard and are pushed sideways.
  function waveHitsShips(d, k, dt) {
    const rise = smooth(0, 0.45, k), curl = smooth(0.3, 0.7, k), fall = smooth(0.72, 1, k);
    const crestX = d.x + d.dir * (k * 3 + d.w * (0.1 + 0.12 * curl)), reach = d.w * 0.5, peak = d.w * 0.32 * rise * (1 - 0.8 * fall);
    for (const c of world.chunks) {
      if (c.kind !== 'sea') continue;
      for (const sp of c.grp.children) {
        const u = sp.userData; if (!u || !u.ship || u.sunk) continue;
        const wx = c.grp.position.x + sp.position.x, rel = d.dir * (wx - crestX) / reach; // measured along the wave's travel
        if (Math.abs(rel) > 1.2 || Math.abs(sp.position.z - d.z) > 22) continue;
        if (!u.own) { sp.material = sp.material.clone(); sp.userData.shared = true; u.own = true; u.rot = 0; }
        const big = u.ship === 'cruise' || u.ship === 'warship';
        const lift = peak * Math.max(0, 1 - rel * rel) * (big ? 0.6 : 1);
        if (!u.capsize && k > 0.6 && k < 0.85 && Math.abs(rel) < 0.35 && !big) { u.capsize = 0.001; u.dir = Math.random() < 0.5 ? -1 : 1; splash(new THREE.Vector3(wx, GROUND + 2, sp.position.z), 1.6); Sound.hit(); }
        if (u.capsize) continue; // the capsize animation (below) takes over
        sp.position.y = u.baseY + lift;
        sp.position.x += d.dir * (1 - Math.abs(rel)) * (big ? 3 : 7) * dt * (rel < 0.4 ? 1 : 0.3); // shoved along with the water
        u.rot = lerp(u.rot, -d.dir * rel * (big ? 0.35 : 0.8) * rise, 1 - Math.exp(-dt * 6)); // bow up on the face, down on the back
        sp.material.rotation = u.rot;
      }
    }
  }
  // capsized boats roll over, wallow, and slide under; others settle back level once the wave has passed
  function updateShipsAfterWave(dt) {
    for (const c of world.chunks) {
      if (c.kind !== 'sea') continue;
      for (const sp of c.grp.children) {
        const u = sp.userData; if (!u || !u.own || u.sunk) continue;
        if (u.capsize) {
          u.capsize += dt; const t = u.capsize;
          sp.material.rotation = u.dir * Math.min(2.7, t * 3.2) + Math.sin(t * 4) * 0.08;
          sp.position.y = u.baseY + 1.2 * Math.max(0, 1 - t * 1.4) - smooth(1.2, 5, t) * 4;
          sp.position.x -= 1.5 * dt;
          if (t > 1 && !u.foam) { u.foam = true; splash(new THREE.Vector3(c.grp.position.x + sp.position.x, GROUND + 1, sp.position.z), 1.1); }
          if (t > 5.5) { u.sunk = true; sp.visible = false; }
        } else if (!seaLife.rogue) {
          sp.position.y = lerp(sp.position.y, u.baseY, 1 - Math.exp(-dt * 2));
          u.rot = lerp(u.rot || 0, 0, 1 - Math.exp(-dt * 2)); sp.material.rotation = u.rot;
        }
      }
    }
  }


  function updateSeaLife(dt, dx) {
    const under = chunkAtX(world.viewW ? world.viewW * 0.4 : 6);
    updateRogue(dt, dx, under); updateShipsAfterWave(dt); updateFarSea(dt, dx);
    seaLife.t -= dt;
    if (under && under.kind === 'sea' && seaLife.t <= 0 && seaLife.list.length < 2) {
      // dolphins are a nice surprise; a whale's tail now and then; a full breach is rare
      const r = Math.random(), kind = r < 0.6 ? 'dolphin' : r < 0.88 ? 'tail' : 'whale', J = JUMPERS[kind];
      const sp = new THREE.Sprite(J.mat); sp.scale.set(J.w, J.h, 1);
      const x = (world.viewW || 14) * (0.25 + Math.random() * 0.4), z = kind === 'dolphin' ? -8 - Math.random() * 20 : -26 - Math.random() * 30;
      sp.position.set(x, GROUND, z); sp.userData = { J, t: 0, x, z, splashed: false };
      fscene.add(sp); seaLife.list.push(sp);
      seaLife.t = kind === 'dolphin' ? 12 + Math.random() * 18 : 20 + Math.random() * 25;
      if (J.tail) sp.center.set(0.5, 0);
      splash(new THREE.Vector3(x, GROUND + 0.8, z), kind === 'whale' ? 1.4 : 0.8);
    }
    for (let k = seaLife.list.length - 1; k >= 0; k--) {
      const sp = seaLife.list[k], d = sp.userData, J = d.J;
      d.t += dt; d.x -= dx;
      const f = d.t / J.secs; // 0..1 along the leap
      if (J.tail) {
        // the flukes rise slowly, hang a moment with water pouring off, then slide back under
        const up = smooth(0, 0.35, f) * (1 - smooth(0.65, 1, f));
        sp.position.set(d.x, GROUND + 0.5 - J.h * (1 - up) * 0.95, d.z); sp.material.rotation = Math.sin(f * Math.PI) * 0.12;
        if (!d.splashed && f > 0.8) { d.splashed = true; splash(new THREE.Vector3(d.x, GROUND + 0.8, d.z), 1.2); }
        if (f >= 1) { fscene.remove(sp); seaLife.list.splice(k, 1); }
        continue;
      }
      sp.position.set(d.x + f * J.w * 0.8, GROUND + 0.4 + Math.sin(Math.PI * clamp(f, 0, 1)) * J.height, d.z);
      if (!d.splashed && f > 0.95) { d.splashed = true; splash(new THREE.Vector3(sp.position.x, GROUND + 0.8, d.z), J === JUMPERS.whale ? 1.6 : 0.9); }
      if (f >= 1) { fscene.remove(sp); seaLife.list.splice(k, 1); }
      else sp.material.rotation = (0.5 - f) * 1.3; // nose up on the way out, down on the way back in
    }
  }
  function updateNaval(c, n, dt) {
    const grp = c.grp, sh = n.ship, y0 = GROUND + 0.7;
    const gun = new THREE.Vector3(sh.position.x + SHIPS.warship.w * 0.38, y0 + SHIPS.warship.h * 0.48, sh.position.z + 0.2);
    // fire on a timer while the ship is on screen
    n.t -= dt;
    const onScreen = grp.position.x + sh.position.x > -40 && grp.position.x + sh.position.x < (world.viewW || 14) * 1.6 + 40;
    if (n.t <= 0 && onScreen) {
      n.t = 1.4 + Math.random() * 1.6;
      const alive = n.target && !n.sinking;
      const to = alive ? n.target.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, SHIPS.target.h * 0.35, 0))
        : gun.clone().add(new THREE.Vector3(26 + Math.random() * 20, 0, -4 - Math.random() * 8)).setY(y0);
      // shots after the first one or two start landing; a miss throws up a column of water
      const hit = alive && (n.hits > 0 || Math.random() < 0.55);
      if (alive && !hit) to.add(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3), 0, 0)).setY(y0);
      n.shells.push({ sp: fx(SHELL_MAT, grp, gun.x, gun.y, gun.z, 0.9), from: gun.clone(), to, t: 0, T: 0.9 + to.distanceTo(gun) / 60, hit });
      n.fx.push({ sp: fx(FLASH_MAT, grp, gun.x + 1, gun.y, gun.z + 0.2, 4), t: 0, T: 0.18, grow: 1.8 });
      n.fx.push({ sp: fx(SMOKE_MAT, grp, gun.x + 1.2, gun.y + 0.4, gun.z, 2), t: 0, T: 1.6, grow: 3, rise: 1.5 });
      sh.position.x -= 0.25; // recoil
    }
    sh.position.x = lerp(sh.position.x, n.baseX ?? (n.baseX = sh.position.x), 1 - Math.exp(-dt * 3));
    for (let i = n.shells.length - 1; i >= 0; i--) {
      const s = n.shells[i]; s.t += dt; const k = Math.min(1, s.t / s.T);
      s.sp.position.lerpVectors(s.from, s.to, k); s.sp.position.y += Math.sin(Math.PI * k) * (4 + s.from.distanceTo(s.to) * 0.12);
      if (k < 1) continue;
      grp.remove(s.sp); n.shells.splice(i, 1);
      if (s.hit) {
        n.hits++;
        const big = n.hits >= 3;
        n.fx.push({ sp: fx(BOOM_MAT, grp, s.to.x, s.to.y + 1, s.to.z + 0.5, big ? 5 : 3), t: 0, T: big ? 1.1 : 0.5, grow: big ? 4 : 2.2 });
        n.fx.push({ sp: fx(SMOKE_MAT, grp, s.to.x, s.to.y + 2, s.to.z, 3), t: 0, T: big ? 4 : 2, grow: big ? 5 : 3, rise: 2.5 });
        if (big) {
          // the third hit: the freighter goes up and starts to sink
          n.sinking = 0.001;
          n.fx.push({ sp: fx(BOOM_MAT, grp, s.to.x - 3, s.to.y + 2, s.to.z + 0.6, 4), t: -0.15, T: 0.9, grow: 3.5 });
          n.fx.push({ sp: fx(BOOM_MAT, grp, s.to.x + 3, s.to.y + 1.5, s.to.z + 0.6, 4), t: -0.3, T: 0.9, grow: 3.5 });
          const at = new THREE.Vector3(grp.position.x + s.to.x, s.to.y + 1, s.to.z);
          const sp = sparks.geometry.attributes.position;
          for (let j = 0; j < 30; j++) { sp.setXYZ(j, at.x, at.y, at.z); sparkV[j].set((Math.random() - 0.5) * 9, 3 + Math.random() * 8, (Math.random() - 0.5) * 3); }
          sp.needsUpdate = true; side.burst = 1.4; side.burstG = 9; sparks.material.color.setStyle('#ffb347'); sparks.material.size = 0.7;
          side.shake = Math.max(side.shake, 0.2); Sound.hit();
        }
      } else {
        n.fx.push({ sp: fx(SPLASH_MAT, grp, s.to.x, y0 - 0.3, s.to.z, 2, 6), t: 0, T: 1.2, grow: 0, splash: true });
      }
    }
    for (let i = n.fx.length - 1; i >= 0; i--) {
      const e = n.fx[i]; e.t += dt; const k = e.t / e.T;
      if (k < 0) { e.sp.visible = false; continue; }
      e.sp.visible = true;
      if (k >= 1) { grp.remove(e.sp); n.fx.splice(i, 1); continue; }
      if (e.splash) { e.sp.scale.y = 6 * Math.sin(Math.PI * Math.min(1, k * 1.4)); e.sp.center.set(0.5, 0); continue; }
      if (!e.w0) e.w0 = e.sp.scale.x;
      e.sp.scale.setScalar(e.w0 * (1 + e.grow * k) * (1 - (e.rise ? 0 : k * k * 0.9)));
      if (e.rise) e.sp.position.y += e.rise * dt;
    }
    // the freighter lists, then slips under
    if (n.sinking > 0 && n.target) {
      n.sinking += dt;
      n.target.material = SHIPS.target.mat;
      n.target.position.y = y0 - smooth(0.8, 6, n.sinking) * SHIPS.target.h * 1.1;
      if (n.sinking > 6) { grp.remove(n.target); n.target = null; }
    }
  }
  function updateWaves(dt = 0) {
    const t = side.t;
    for (const c of world.chunks) {
      if (c.grp.userData.naval) updateNaval(c, c.grp.userData.naval, dt);
      if (c.road) updateTraffic(c.road, dt);
      if (c.hwy) updateTraffic(c.hwy, dt);
    }
    waveClock.value = t; // every wave crest in every strip animates on the GPU from this one number
  }
  // a shockwave ring and a vapour cone when the bird breaks the sound barrier (golden-white for light speed)
  const boomRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintTex(256, 256, (g, W, H) => {
    for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(255,255,255,${0.9 - i * 0.28})`; g.lineWidth = 10 - i * 3; g.beginPath(); g.arc(W / 2, H / 2, W * 0.42 - i * 14, 0, Math.PI * 2); g.stroke(); }
  }), transparent: true, depthWrite: false, opacity: 0 }));
  const boomCone = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintTex(256, 128, (g, W, H) => {
    const gr = g.createLinearGradient(W, 0, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(W * 0.98, H / 2); g.quadraticCurveTo(W * 0.5, 0, 0, H * 0.05); g.lineTo(0, H * 0.95); g.quadraticCurveTo(W * 0.5, H, W * 0.98, H / 2); g.fill();
  }), transparent: true, depthWrite: false, opacity: 0 }));
  fscene.add(boomRing, boomCone);
  function updateBoom(dt) {
    if (side.boomT == null) { boomRing.visible = boomCone.visible = false; return; }
    side.boomT += dt; const t = side.boomT;
    boomRing.visible = boomCone.visible = t < 1.6;
    if (t >= 1.6) { side.boomT = null; return; }
    const col = side.boomLight ? '#fff2c0' : '#ffffff';
    boomRing.material.color.setStyle(col); boomCone.material.color.setStyle(col);
    boomRing.position.copy(hero.position).add(new THREE.Vector3(-0.5, 0, 0.5)); boomRing.scale.setScalar(2 + t * 16); boomRing.material.opacity = Math.max(0, 1 - t / 1.2);
    boomCone.position.copy(hero.position).add(new THREE.Vector3(-2.6, 0, 0.3)); boomCone.scale.set(6 + t * 4, 3 + t * 2, 1); boomCone.material.opacity = Math.max(0, 0.85 - t / 1.6);
  }
  function splash(at, size) {
    const sp = sparks.geometry.attributes.position;
    for (let i = 0; i < 30; i++) { sp.setXYZ(i, at.x + (Math.random() - 0.5) * size, at.y, at.z); sparkV[i].set((Math.random() - 0.5) * 3 * size, 3 + Math.random() * 4 * size, (Math.random() - 0.5) * size); }
    sp.needsUpdate = true; side.burst = 1.1; side.burstG = 9; sparks.material.color.setStyle('#ffffff'); sparks.material.size = 0.45 * size;
  }

  const sky = { plane: null, flock: null, planeT: 6, flockT: 3 };
  function updateSkyLife(dt, dx) {
    // airliner: one at a time, crossing slowly high up
    sky.planeT -= dt;
    if (!sky.plane && sky.planeT <= 0) {
      const sp = new THREE.Sprite(planeMat); sp.scale.set(40, 7.5, 1);
      sp.position.set(220, 24 + Math.random() * 14, -240 - Math.random() * 60); sp.userData.v = 14 + Math.random() * 10;
      fscene.add(sp); sky.plane = sp;
    }
    if (sky.plane) {
      sky.plane.position.x -= dx * 0.25 + sky.plane.userData.v * dt;
      if (sky.plane.position.x < -260) { fscene.remove(sky.plane); sky.plane = null; sky.planeT = 18 + Math.random() * 20; }
    }
    // a distant flock drifting the same way the bird flies
    sky.flockT -= dt;
    if (!sky.flock && sky.flockT <= 0) {
      const sp = new THREE.Sprite(flockMats[0]); sp.scale.set(12, 6, 1);
      sp.position.set(160, 6 + Math.random() * 16, -90 - Math.random() * 80); fscene.add(sp); sky.flock = sp;
    }
    if (sky.flock) {
      sky.flock.position.x -= dx * 0.35;
      sky.flock.material = flockMats[Math.floor(side.t * 3) % 2];
      if (sky.flock.position.x < -180) { fscene.remove(sky.flock); sky.flock = null; sky.flockT = 8 + Math.random() * 14; }
    }
  }

  // speed streaks
  const STREAKS = 48;
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false }));
  fscene.add(streaks);
  const streakData = Array.from({ length: STREAKS }, () => ({ x: Math.random() * 80 - 20, y: Math.random() * 16 - 7, z: Math.random() * 14 - 10 }));

  // ---------- weather ----------
  // Drawn in a box around the bird rather than on the ground, so rain, snow
  // and wind look the same at 1 km/s or 10,000 km/s.
  const RAIN = 420, SNOW = 260, GUST = 26;
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN * 6), 3));
  const rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfe0f5, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  const drops = Array.from({ length: RAIN }, () => ({ x: Math.random() * 90 - 45, y: Math.random() * 44 - 18, z: Math.random() * 46 - 34 }));
  const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW * 3), 3));
  const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.32, transparent: true, opacity: 0, depthWrite: false }));
  const flakes = Array.from({ length: SNOW }, () => ({ x: Math.random() * 90 - 45, y: Math.random() * 44 - 18, z: Math.random() * 40 - 30, p: Math.random() * 6 }));
  const gustGeo = new THREE.BufferGeometry(); gustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GUST * 6), 3));
  const gustLines = new THREE.LineSegments(gustGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false, depthTest: false }));
  gustLines.renderOrder = 4;
  const gusts = Array.from({ length: GUST }, () => ({ x: Math.random() * 90 - 45, y: Math.random() * 14 - 6, z: Math.random() * 8 - 4, l: 4 + Math.random() * 8 }));
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xf4f7ff, transparent: true, opacity: 0, fog: false }));
  for (const o of [rainLines, snowPts, gustLines, bolt]) fscene.add(o);
  const wxK = { rain: 0, snow: 0, storm: 0, wind: 0, dir: 1, flash: 0 };
  // a lightning strike: a jagged bolt far off and a flash over the whole sky
  function lightning() {
    const p = boltGeo.attributes.position, x0 = (Math.random() - 0.3) * 160, z0 = -260 - Math.random() * 120;
    let x = x0, y = 90;
    for (let i = 0; i < 10; i++) { p.setXYZ(i, x, y, z0); x += (Math.random() - 0.5) * 18; y -= (90 - GROUND) / 9; }
    p.needsUpdate = true; wxK.flash = 1;
  }
  // ---- sky spectacle: auroras on polar nights, a rainbow when rain clears in daylight ----
  const auroraU = { t: { value: 0 }, k: { value: 0 } };
  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(1400, 260, 1, 1), new THREE.ShaderMaterial({
    uniforms: auroraU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float t; uniform float k; varying vec2 vUv;
      float n(float x){ return sin(x) * 0.5 + sin(x * 2.3 + 1.7) * 0.3 + sin(x * 5.1 + 0.4) * 0.2; }
      void main(){
        float x = vUv.x * 14.0, wave = n(x + t * 0.25) * 0.12 + n(x * 0.5 - t * 0.12) * 0.1;
        float base = 0.25 + wave, y = vUv.y - base;
        float curtain = smoothstep(0.0, 0.06, y) * exp(-y * 3.2) * (0.55 + 0.45 * n(x * 3.0 + t * 0.6));
        float rays = 0.6 + 0.4 * sin(vUv.x * 220.0 + n(x) * 6.0 + t);
        vec3 c = mix(vec3(0.2, 1.0, 0.55), vec3(0.65, 0.3, 1.0), smoothstep(0.15, 0.55, y));
        gl_FragColor = vec4(c * curtain * rays * k, 1.0);
      }`,
  }));
  aurora.position.set(0, 120, -620); aurora.renderOrder = -3; fscene.add(aurora);
  const rainbow = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    const cols = ['#ff3b3b', '#ff9a2e', '#ffe14a', '#4fd36b', '#3ea0ff', '#6a5bff', '#b04cff'];
    g.lineWidth = 9; g.globalAlpha = 0.55;
    cols.forEach((col, i) => { g.strokeStyle = col; g.beginPath(); g.arc(256, 256, 230 - i * 9, Math.PI, 0); g.stroke(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })(), transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  rainbow.scale.set(700, 350, 1); rainbow.position.set(120, 40, -650); fscene.add(rainbow);
  function updateSkyFx(dt, night, cur, wx, isDay) {
    // aurora: high latitudes, after dark, clear-ish skies
    const polar = smooth(52, 64, Math.abs(cur.lat));
    auroraU.t.value += dt; auroraU.k.value = lerp(auroraU.k.value, polar * smooth(0.5, 0.9, night) * (1 - wxK.storm) * 1.4, 1 - Math.exp(-dt));
    aurora.visible = auroraU.k.value > 0.01;
    // rainbow: shows up for a while when rain or a storm gives way to clear skies in daylight
    const wet = wx === 'rain' || wx === 'storm';
    if (side.wasWet && !wet && isDay) side.rainbowT = 28;
    side.wasWet = wet;
    side.rainbowT = Math.max(0, (side.rainbowT || 0) - dt);
    const want = side.rainbowT > 0 ? Math.min(1, side.rainbowT / 4, (28 - side.rainbowT) / 3) : 0;
    rainbow.material.opacity = lerp(rainbow.material.opacity, want * 0.8, 1 - Math.exp(-dt * 2));
    rainbow.visible = rainbow.material.opacity > 0.01;
  }
  function updateWeather(dt, v, cur, wx) {
    const ease = (k, t) => lerp(k, t, 1 - Math.exp(-dt * 1.5));
    const cold = ['ice', 'boreal', 'tundra'].includes(biome(cur.lat, cur.lon));
    const wet = wx === 'rain' ? 0.55 : wx === 'storm' ? 1 : 0;
    // over the ice caps a light snow drifts down even on a clear day
    const icy = biome(cur.lat, cur.lon) === 'ice' ? 0.3 : 0;
    wxK.rain = ease(wxK.rain, cold ? 0 : wet); wxK.snow = ease(wxK.snow, cold ? Math.max(wet, icy) : 0);
    wxK.storm = ease(wxK.storm, wx === 'storm' ? 1 : wx === 'rain' ? 0.35 : 0);
    wxK.wind = ease(wxK.wind, wx === 'tailwind' || wx === 'headwind' ? 1 : wx === 'storm' ? 0.5 : 0);
    if (wx === 'tailwind') wxK.dir = 1; else if (wx === 'headwind' || wx === 'storm') wxK.dir = -1;
    // relative airflow: the faster the bird, the more the rain slants back at it
    const slant = 8 + Math.log10(1 + v) * 5;
    const rp = rainGeo.attributes.position, nRain = Math.round(RAIN * wxK.rain);
    for (let i = 0; i < nRain; i++) {
      const d = drops[i]; d.y -= 34 * dt; d.x -= slant * dt;
      if (d.y < -18 || d.x < -45) { d.y = 26; d.x = Math.random() * 90 - 40; }
      rp.setXYZ(i * 2, d.x, d.y, d.z); rp.setXYZ(i * 2 + 1, d.x + slant * 0.04, d.y + 1.4, d.z);
    }
    rp.needsUpdate = true; rainGeo.setDrawRange(0, nRain * 2); rainLines.material.opacity = 0.55 * Math.min(1, wxK.rain * 2);
    const sp = snowGeo.attributes.position, nSnow = Math.round(SNOW * wxK.snow);
    for (let i = 0; i < nSnow; i++) {
      const f = flakes[i]; f.p += dt; f.y -= 4 * dt; f.x -= slant * 0.35 * dt + Math.sin(f.p * 1.7) * 0.03;
      if (f.y < -18 || f.x < -45) { f.y = 26; f.x = Math.random() * 90 - 40; }
      sp.setXYZ(i, f.x, f.y, f.z);
    }
    sp.needsUpdate = true; snowGeo.setDrawRange(0, nSnow); snowPts.material.opacity = 0.9 * Math.min(1, wxK.snow * 2);
    // wind: long gust lines. A tailwind pushes them along with the bird, a headwind drives them back at it.
    const gp = gustGeo.attributes.position, nG = Math.round(GUST * wxK.wind), gsp = wxK.dir > 0 ? 22 : -46;
    for (let i = 0; i < nG; i++) {
      const g = gusts[i]; g.x += gsp * dt;
      if (g.x > 50 || g.x < -50) { g.x = gsp > 0 ? -45 : 45; g.y = Math.random() * 14 - 6; g.z = Math.random() * 8 - 4; }
      const wob = Math.sin(side.t * 2 + i) * 0.3;
      gp.setXYZ(i * 2, g.x, g.y + wob, g.z); gp.setXYZ(i * 2 + 1, g.x + g.l, g.y - wob * 0.4, g.z);
      gustLines.material.color.setStyle(wxK.dir > 0 ? '#e9fff2' : '#fff2df');
    }
    gp.needsUpdate = true; gustGeo.setDrawRange(0, nG * 2); gustLines.material.opacity = 0.8 * wxK.wind;
    // storm light: the sky darkens and closes in; lightning lights it up for a moment
    if (wxK.flash > 0) wxK.flash = Math.max(0, wxK.flash - dt * 3.5);
    bolt.material.opacity = wxK.flash > 0.5 ? 1 : 0;
    const k = wxK.storm * 0.75;
    if (k > 0.01) {
      const grey = new THREE.Color(0x4a5060);
      skyU.top.value.lerp(grey, k); skyU.bottom.value.lerp(new THREE.Color(0x7d8594), k);
      fscene.fog.color.lerp(new THREE.Color(0x7d8594), k);
    }
    if (wxK.flash > 0) { const w = new THREE.Color(0xdfe6ff); skyU.top.value.lerp(w, wxK.flash * 0.7); skyU.bottom.value.lerp(w, wxK.flash * 0.7); }
    fscene.fog.near = lerp(160, 60, wxK.storm); fscene.fog.far = lerp(640, 300, wxK.storm);
    hemi.intensity *= lerp(1, 0.7, wxK.storm); hemi.intensity += wxK.flash * 1.2;
    fsun.intensity *= lerp(1, 0.35, wxK.storm);
    sunDisc.material.opacity = 1 - wxK.storm * 0.9;
    cloudTint.setScalar(lerp(1, 0.62, wxK.storm));
  }
  const cloudTint = new THREE.Color(1, 1, 1);

  // ---------- 2D cutouts in the 3D world ----------
  // Birds (and the hawk, owl and hunter) are painted once into flipbook atlases
  // and shown as camera-facing cutouts, so they always read as a clean side
  // profile while the world around them is 3D.
  // FW x FH is the box a bird is drawn in. A full wingbeat reaches above and
  // below that box, so bird frames get PAD pixels of headroom on each side.
  const FW = 384, FH = 240, PAD = 90;
  function makeAtlas(draw, frames, cols, rows, fh = FH) {
    const c = document.createElement('canvas'); c.width = FW * cols; c.height = fh * rows;
    const g = c.getContext('2d');
    for (let i = 0; i < frames; i++) {
      g.save(); g.translate((i % cols) * FW, Math.floor(i / cols) * fh);
      g.beginPath(); g.rect(0, 0, FW, fh); g.clip();
      draw(g, i, frames); g.restore();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    t.repeat.set(1 / cols, 1 / rows);
    return { tex: t, frames, cols, rows, fh };
  }
  function cutout(atlas, width) {
    const tex = atlas.tex.clone(); // shares the uploaded image; only the offset differs
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * atlas.fh / FW), mat);
    m.userData = { atlas, tex, roll: 0 };
    return m;
  }
  function setFrame(m, i) {
    const a = m.userData.atlas; i = ((i % a.frames) + a.frames) % a.frames;
    m.userData.tex.offset.set((i % a.cols) / a.cols, 1 - (Math.floor(i / a.cols) + 1) / a.rows);
  }
  const phaseFrame = (ph, n) => Math.floor((((ph / (Math.PI * 2)) % 1) + 1) % 1 * n);

  // A side-on bird. ph is the wingbeat phase: sin(ph) = 1 is the top of the
  // upstroke, -1 the bottom of the downstroke. opt adds raptor or owl features.
  function drawBirdHD(g, ph, b, opt0 = {}) {
    const opt = Object.assign({}, b, opt0); // species flags live on the bird itself
    if (opt.stubby && !opt0.span) opt.span = 0.62;
    const S = FW * 0.19, cx = FW * 0.47, cy = FH * 0.56, a = Math.sin(ph);
    const shade = (h, k) => { const c = hex(h); return `rgb(${c.map((v) => clamp(Math.round(v * k), 0, 255)).join(',')})`; };
    const feather = (x, y, ang, len, wid, col, tip) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      const gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, col); gr.addColorStop(1, tip);
      g.fillStyle = gr; g.beginPath(); g.ellipse(len / 2, 0, len / 2, wid / 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(2, 0); g.lineTo(len * 0.9, 0); g.stroke();
      g.restore();
    };
    const wing = (k, dark) => {
      const span = opt.span || 1;
      const P0 = [cx + 0.05 * S, cy - 0.22 * S];
      const P1 = [P0[0] - 0.32 * S * span, P0[1] - S * (1.0 * a + 0.12) * k * span];
      const P2 = [P1[0] - (0.95 - 0.28 * Math.abs(a)) * S * span, P1[1] - S * (0.5 * a + 0.06) * k * span];
      const arm = Math.atan2(P2[1] - P1[1], P2[0] - P1[0]);
      // trailing side: away from the leading edge, toward the tail
      const trail = (ang) => { const c1 = ang + Math.PI / 2, c2 = ang - Math.PI / 2; return Math.cos(c1) < Math.cos(c2) ? c1 : c2; };
      const wcol = shade(b.wing, dark), tip = shade(b.wing, dark * 0.55);
      // secondaries along the arm
      for (let i = 0; i < 7; i++) {
        const t = i / 6, x = lerp(P0[0], P1[0], t), y = lerp(P0[1], P1[1], t);
        const ang = trail(Math.atan2(P1[1] - P0[1], P1[0] - P0[0])) * 0.75 + Math.PI * 0.25 * 0;
        feather(x, y, ang, S * (0.55 - t * 0.08) * span, S * 0.2, wcol, tip);
      }
      // primaries fanning out from the wrist toward the tip
      for (let i = 0; i < 8; i++) {
        const t = i / 7, x = lerp(P1[0], P2[0], t * 0.55), y = lerp(P1[1], P2[1], t * 0.55);
        const ang = lerp(trail(arm), arm, 0.25 + t * 0.75);
        feather(x, y, ang, S * (0.65 + t * 0.35) * span, S * 0.17, wcol, tip);
      }
      // coverts: the smooth shoulder of the wing
      g.fillStyle = shade(b.wing, dark * 1.12);
      g.beginPath(); g.moveTo(P0[0] + 0.12 * S, P0[1] + 0.05 * S);
      g.quadraticCurveTo((P0[0] + P1[0]) / 2, Math.min(P0[1], P1[1]) - 0.12 * S * Math.sign(a || 1), P1[0], P1[1]);
      g.lineTo(lerp(P1[0], P2[0], 0.3), lerp(P1[1], P2[1], 0.3));
      g.quadraticCurveTo((P0[0] + P1[0]) / 2 - 0.1 * S, (P0[1] + P1[1]) / 2 + 0.22 * S, P0[0] - 0.25 * S, P0[1] + 0.12 * S);
      g.closePath(); g.fill();
    };
    g.lineJoin = 'round';
    wing(0.72, 0.62);                                   // far wing, behind the body
    // tail fan
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI + (i - 2) * 0.12 + 0.06;
      feather(cx - 0.7 * S, cy - 0.02 * S, ang, S * (opt.longTail ? 1.0 : 0.72), S * 0.2, shade(b.wing, 0.95 - i * 0.03), shade(b.wing, 0.55));
    }
    // talons
    if (opt.talons) {
      g.strokeStyle = '#d9a52b'; g.lineWidth = S * 0.07; g.lineCap = 'round';
      for (const o of [0, 0.14]) { g.beginPath(); g.moveTo(cx + (0.05 + o) * S, cy + 0.25 * S); g.lineTo(cx + (0.35 + o) * S, cy + 0.55 * S); g.lineTo(cx + (0.5 + o) * S, cy + 0.5 * S); g.stroke(); }
    }
    // body: back and belly with a soft drop shadow
    g.save(); g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
    g.fillStyle = b.body; g.beginPath(); g.ellipse(cx, cy, 0.86 * S, 0.38 * S, -0.06, 0, Math.PI * 2); g.fill();
    g.restore();
    const belly = g.createLinearGradient(0, cy - 0.1 * S, 0, cy + 0.38 * S);
    belly.addColorStop(0, shade(b.belly, 0.92)); belly.addColorStop(1, b.belly);
    g.fillStyle = belly; g.beginPath(); g.ellipse(cx + 0.1 * S, cy + 0.12 * S, 0.66 * S, 0.24 * S, -0.04, 0, Math.PI * 2); g.fill();
    // scalloped breast feathers
    g.strokeStyle = shade(b.belly, 0.78); g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { const x = cx + (0.45 - i * 0.1) * S, y = cy + (0.06 + (i % 3) * 0.08) * S; g.beginPath(); g.arc(x, y, 0.06 * S, 0.2, Math.PI - 0.2); g.stroke(); }
    // back shading
    const back = g.createLinearGradient(0, cy - 0.38 * S, 0, cy);
    back.addColorStop(0, shade(b.body, 0.8)); back.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = back; g.beginPath(); g.ellipse(cx, cy - 0.05 * S, 0.8 * S, 0.3 * S, -0.06, Math.PI, Math.PI * 2); g.fill();
    // dragon: a spade-tipped tail and a row of spines down the back; phoenix: tongues of flame trailing the tail
    if (opt.dragon) {
      g.fillStyle = shade(b.body, 0.8);
      g.beginPath(); g.moveTo(cx - 0.75 * S, cy - 0.06 * S); g.quadraticCurveTo(cx - 1.35 * S, cy + 0.05 * S, cx - 1.75 * S, cy - 0.12 * S);
      g.lineTo(cx - 1.72 * S, cy - 0.02 * S); g.quadraticCurveTo(cx - 1.3 * S, cy + 0.16 * S, cx - 0.72 * S, cy + 0.08 * S); g.fill();
      g.beginPath(); g.moveTo(cx - 1.7 * S, cy - 0.08 * S); g.lineTo(cx - 2.0 * S, cy - 0.3 * S); g.lineTo(cx - 1.95 * S, cy - 0.02 * S); g.lineTo(cx - 2.02 * S, cy + 0.14 * S); g.closePath(); g.fill();
    }
    if (opt.flame) {
      const fl = (x, y, len, w, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x, y - w); g.quadraticCurveTo(x - len * 0.6, y - w * 1.6 + Math.sin(ph * 2 + x) * w, x - len, y + Math.sin(ph * 3 + y) * w * 0.8); g.quadraticCurveTo(x - len * 0.5, y + w * 1.2, x, y + w); g.fill(); };
      g.save(); g.globalAlpha = 0.85;
      for (let i = 0; i < 4; i++) fl(cx - 1.25 * S, cy + (i - 1.5) * 0.12 * S, S * (0.9 + 0.3 * Math.sin(ph + i)), 0.08 * S, i % 2 ? '#ffd23a' : '#ff6a1a');
      g.restore();
    }
    // head
    const hr = (opt.owl ? 0.44 : opt.bigBeak ? 0.38 : 0.32) * S, hx = cx + (opt.owl ? 0.62 : 0.78) * S, hy = cy - 0.3 * S;
    if (opt.dragon) {
      // spines along the back, horns sweeping back from the head
      g.fillStyle = b.belly;
      for (let i = 0; i < 6; i++) { const x = cx + (0.5 - i * 0.22) * S, y = cy - 0.34 * S + Math.abs(i - 1) * 0.015 * S; g.beginPath(); g.moveTo(x - 0.08 * S, y + 0.04 * S); g.lineTo(x - 0.02 * S, y - 0.16 * S); g.lineTo(x + 0.06 * S, y + 0.04 * S); g.fill(); }
      g.fillStyle = '#e8e0c0';
      for (const o of [0, 0.18]) { g.beginPath(); g.moveTo(hx - hr * (0.1 + o), hy - hr * 0.7); g.quadraticCurveTo(hx - hr * (0.9 + o), hy - hr * 1.5, hx - hr * (1.4 + o), hy - hr * 1.3); g.quadraticCurveTo(hx - hr * (0.8 + o), hy - hr * 1.1, hx - hr * (0.3 + o), hy - hr * 0.4); g.fill(); }
    }
    // crest (cardinal) and comb (rooster) sit behind the head
    if (opt.crest) { g.fillStyle = b.cap; g.beginPath(); g.moveTo(hx - hr * 0.6, hy - hr * 0.5); g.lineTo(hx - hr * 0.55, hy - hr * 1.7); g.lineTo(hx + hr * 0.35, hy - hr * 0.75); g.fill(); }
    if (opt.comb) { g.fillStyle = '#d8242c'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(hx - hr * 0.35 + i * hr * 0.32, hy - hr * 0.95, hr * 0.26, 0, Math.PI * 2); g.fill(); } }
    g.fillStyle = opt.head || b.body; g.beginPath(); g.arc(hx, hy, hr, 0, Math.PI * 2); g.fill();
    if (opt.owl) {
      g.fillStyle = shade(b.belly, 0.95); g.beginPath(); g.ellipse(hx + hr * 0.25, hy + hr * 0.05, hr * 0.62, hr * 0.78, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = b.body; for (const o of [-0.3, 0.15]) { g.beginPath(); g.moveTo(hx + o * hr, hy - hr * 0.8); g.lineTo(hx + (o + 0.12) * hr, hy - hr * 1.35); g.lineTo(hx + (o + 0.35) * hr, hy - hr * 0.85); g.fill(); }
    } else {
      if (!opt.head) { g.fillStyle = b.cap; g.beginPath(); g.arc(hx, hy, hr, Math.PI * 1.02, Math.PI * 1.98); g.fill(); }
      if (!opt.head) { g.fillStyle = shade(b.belly, 1); g.globalAlpha = 0.55; g.beginPath(); g.ellipse(hx + hr * 0.1, hy + hr * 0.45, hr * 0.55, hr * 0.32, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      if (opt.mask) { g.fillStyle = opt.mask; g.beginPath(); g.ellipse(hx + hr * 0.62, hy + hr * 0.05, hr * 0.42, hr * 0.36, 0, 0, Math.PI * 2); g.fill(); }
      if (opt.cheek) { g.fillStyle = opt.cheek; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(hx - hr * 0.15, hy + hr * 0.25, hr * 0.32, hr * 0.42, 0.3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
    }
    // eye
    const er = hr * (opt.owl ? 0.3 : 0.2), ex = hx + hr * (opt.owl ? 0.42 : 0.38), ey = hy - hr * 0.12;
    if (opt.eye) { g.fillStyle = opt.eye; g.globalAlpha = 0.35; g.beginPath(); g.arc(ex, ey, er * 2.2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
    g.fillStyle = opt.eye || (opt.owl || opt.talons || opt.hook ? '#f2c230' : '#ffffff'); g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(ex + er * 0.15, ey, er * 0.62, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + er * 0.35, ey - er * 0.3, er * 0.22, 0, Math.PI * 2); g.fill();
    if (opt.blink) {
      // eyelid shut: feathers over the eye and a soft lash line
      g.fillStyle = opt.head || b.cap; g.beginPath(); g.arc(ex, ey, er * 1.12, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = Math.max(1.5, er * 0.28); g.lineCap = 'round';
      g.beginPath(); g.arc(ex, ey - er * 0.35, er * 0.95, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
    }
    // beak (hooked for raptors)
    const bx = hx + hr * 0.9, by = hy + hr * 0.02;
    g.fillStyle = b.beak; g.beginPath(); g.moveTo(bx, by - hr * 0.22);
    if (opt.bigBeak) { g.moveTo(bx - hr * 0.1, by - hr * 0.35); g.quadraticCurveTo(bx + hr * 1.5, by - hr * 0.45, bx + hr * 1.25, by + hr * 0.45); g.quadraticCurveTo(bx + hr * 0.6, by + hr * 0.3, bx - hr * 0.1, by + hr * 0.3); }
    else if (opt.longBeak) { g.lineTo(bx + hr * 2.4, by + hr * 0.35); g.lineTo(bx + hr * 2.4, by + hr * 0.42); g.lineTo(bx, by + hr * 0.16); }
    else if (opt.talons || opt.owl || opt.hook) { g.quadraticCurveTo(bx + hr * 0.75, by - hr * 0.2, bx + hr * 0.6, by + hr * 0.3); g.lineTo(bx, by + hr * 0.12); }
    else { g.lineTo(bx + hr * 1.0, by + hr * 0.02); g.lineTo(bx, by + hr * 0.2); }
    g.closePath(); g.fill();
    if (opt.comb) { g.fillStyle = '#d8242c'; g.beginPath(); g.ellipse(bx + hr * 0.1, by + hr * 0.55, hr * 0.18, hr * 0.32, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + hr * 0.6, by + hr * 0.02); g.stroke();
    wing(1, 1);                                          // near wing, in front
    if (opt.wingBar) { g.fillStyle = opt.wingBar; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(cx - 0.35 * S, cy - (0.3 + 0.55 * a) * S, 0.3 * S, 0.08 * S, -0.5 * a, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  }

  const HAWK = { body: '#6b4a2e', wing: '#5a3d24', belly: '#efe2cc', beak: '#2a2a2a', cap: '#4e3420' };
  const OWL = { body: '#7c6a55', wing: '#5f5141', belly: '#e9dcc4', beak: '#3a3328', cap: '#7c6a55' };
  const birdAtlases = {};
  const BIRD_FRAMES = 12;
  function atlasFor(b, opt) {
    const key = b.id || JSON.stringify(b);
    // frames 0-11 are the wingbeat; 12-23 are the same wingbeat with the eyes shut, for blinking
    // predators never blink on screen, so their atlases skip the closed-eye frames (half the memory)
    const blinks = !(opt && (opt.talons || opt.owl));
    return birdAtlases[key] || (birdAtlases[key] = makeAtlas((g, i) => {
      g.translate(0, PAD); drawBirdHD(g, ((i % BIRD_FRAMES) / BIRD_FRAMES) * Math.PI * 2, b, i >= BIRD_FRAMES ? { ...(opt || {}), blink: true } : opt);
    }, BIRD_FRAMES * (blinks ? 2 : 1), 4, blinks ? 6 : 3, FH + PAD * 2));
  }
  // the hunter: two frames, aiming and firing
  const hunterAtlas = makeAtlas((g, i) => {
    const x = FW * 0.42, base = FH * 0.95, h = FH * 0.78;
    g.fillStyle = '#3d5a2a'; // grass tuft
    g.beginPath(); g.ellipse(x, base, FW * 0.22, FH * 0.06, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3b3328'; g.fillRect(x - h * 0.09, base - h * 0.45, h * 0.08, h * 0.45); g.fillRect(x + h * 0.02, base - h * 0.45, h * 0.08, h * 0.45); // legs
    g.fillStyle = '#e8641f'; g.beginPath(); g.roundRect(x - h * 0.14, base - h * 0.82, h * 0.28, h * 0.42, h * 0.05); g.fill(); // vest
    g.fillStyle = '#d9a383'; g.beginPath(); g.arc(x + h * 0.02, base - h * 0.9, h * 0.08, 0, Math.PI * 2); g.fill(); // face
    g.fillStyle = '#e8641f'; g.fillRect(x - h * 0.08, base - h * 1.0, h * 0.2, h * 0.06); g.fillRect(x + h * 0.02, base - h * 0.975, h * 0.14, h * 0.025); // cap
    // rifle aimed up and to the left, at the sky
    g.save(); g.translate(x + h * 0.04, base - h * 0.72); g.rotate(-2.35);
    g.fillStyle = '#2a2420'; g.fillRect(0, -h * 0.025, h * 0.55, h * 0.05); g.fillStyle = '#6b4a2e'; g.fillRect(-h * 0.12, -h * 0.04, h * 0.16, h * 0.08);
    if (i === 1) { g.fillStyle = '#ffe07a'; g.beginPath(); g.moveTo(h * 0.55, 0); g.lineTo(h * 0.75, -h * 0.07); g.lineTo(h * 0.82, 0); g.lineTo(h * 0.75, h * 0.07); g.fill(); }
    g.restore();
  }, 2, 2, 1);

  let hero = null, flock = [], heroBirdId = null;
  function setBirds() {
    const b = F.birdOf(S);
    if (heroBirdId !== b.id || !hero) {
      if (hero) fscene.remove(hero);
      hero = cutout(atlasFor(b), 6.4); hero.renderOrder = 3; fscene.add(hero); heroBirdId = b.id;
      for (const f of flock) fscene.remove(f); flock = [];
    }
    const want = Math.min(S.levels.flock, 8);
    while (flock.length < want) {
      const f = cutout(atlasFor(b), 6.4 * 0.62), i = flock.length, row = Math.floor(i / 2) + 1, sgn = i % 2 ? 1 : -1;
      // both arms of the V trail away from the camera so the lead bird stays clear
      f.userData.home = new THREE.Vector3(-row * 2.6, -0.4 * row, sgn > 0 ? row * 0.8 - 1.4 : -row * 2.3 - 0.6);
      f.userData.phase = Math.random() * 6;
      fscene.add(f); flock.push(f);
    }
    while (flock.length > want) fscene.remove(flock.pop());
  }
  // Cutouts face the camera; roll tips the nose up or down.
  function faceCamera(m) { m.quaternion.copy(fcam.quaternion); m.rotateZ(m.userData.roll || 0); } // scale.x = -1 mirrors

  // ---------- predators (visuals; rules live in econ.js, timing in game state) ----------
  const hawkMesh = cutout(atlasFor({ id: 'hawk', ...HAWK }, { talons: true, span: 1.25, longTail: true }), 7.5);
  const owlMesh = cutout(atlasFor({ id: 'owl', ...OWL }, { owl: true, talons: true, span: 1.2 }), 7);
  const hunterMesh = cutout(hunterAtlas, 13);
  for (const m of [hawkMesh, owlMesh, hunterMesh]) { m.visible = false; fscene.add(m); }
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0 }));
  fscene.add(tracer);
  function chunkAtX(x) { return world.chunks.find((c) => x >= c.grp.position.x - CW / 2 && x < c.grp.position.x + CW / 2); }
  function groundYAt(x, z) {
    const c = chunkAtX(x); if (!c || c.kind === 'sea') return GROUND;
    return GROUND + c.hAt(x - c.grp.position.x, z);
  }
  // ---- the sky battle ----
  // Phases (game logic sets th.phase): 'warn' while the player acts, then a
  // 5-second 'battle' whose outcome is already fixed but hidden, then 'done'
  // while the winner leaves the frame. Everything here is just choreography.
  const BATTLE = 5;
  const bt = (th) => th.t - th.warn;                 // seconds into the battle
  // the fight happens just behind the lead bird, where the camera can frame it
  const flockCentre = () => hero.position.clone().add(new THREE.Vector3(-1.2, -0.3, -1.2));
  let carried = null;                                // the follower a predator makes off with
  function dropCarried() { if (carried) { fscene.remove(carried); carried = null; } }

  // the hero's extra height from predators: climbing from a hunter, jinking in a fight
  function threatOffset() {
    const th = side.threat; if (!th) return 0;
    const b = bt(th);
    if (th.type === 'hunter') {
      const up = 5.5 * clamp(th.meter, 0, 1), weave = b > 0 && b < BATTLE ? Math.sin(b * 4.2) * 0.9 : 0;
      return (b < BATTLE + 0.4 ? up : up * (1 - smooth(BATTLE + 0.4, BATTLE + 2, b))) + weave;
    }
    if (b < 0 || b > BATTLE || isDuel(th)) return 0;
    return Math.sin(b * 5.3) * 1.3 * (1 - smooth(4.4, BATTLE, b));
  }
  // A lone bird doesn't just take it: it duels the predator. The two circle each other,
  // slam together every CLASH seconds (feathers fly), the bird throws a barrel roll to dodge,
  // and at the end whoever won finishes on top. Positions are in the flight scene's units.
  const CLASH = 1.1;
  const isDuel = (th) => th && th.type !== 'hunter' && !flock.length;
  function duel(b, ok) {
    const C = new THREE.Vector3(0.9, -0.4, -0.8);
    const clash = Math.pow(Math.max(0, Math.cos(b * Math.PI * 2 / CLASH)), 8); // 1 at each impact
    const a = b * 3.3, r = 2.6 - 2.2 * clash;
    const hero = C.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 1.4) * 0.9 * (1 - clash), Math.sin(a) * r * 0.45));
    const pred = C.clone().add(new THREE.Vector3(Math.cos(a + Math.PI) * r, Math.sin(a * 1.4 + 2) * 0.9 * (1 - clash) + 0.3, Math.sin(a + Math.PI) * r * 0.45));
    // bank into the turn; the bird adds a full barrel roll mid-fight
    let heroRoll = -Math.sin(a) * 0.7, predRoll = Math.sin(a) * 0.7;
    heroRoll += Math.PI * 2 * smooth(2.3, 2.85, b);
    // the finish: the winner rises over the loser and strikes down
    const fin = smooth(4.2, 4.85, b);
    if (fin > 0) {
      hero.lerp(C.clone().add(new THREE.Vector3(ok ? -0.2 : -0.4, ok ? 1.9 : -1.3, 0)), fin);
      pred.lerp(C.clone().add(new THREE.Vector3(ok ? 0.5 : 0.1, ok ? -0.9 : 1.2, 0.1)), fin);
      heroRoll = lerp(heroRoll, ok ? -0.5 : 0.6, fin); predRoll = lerp(predRoll, ok ? 0.8 : -0.5, fin);
    }
    return { hero, pred, heroRoll, predRoll, clash, at: hero.clone().lerp(pred, 0.5) };
  }
  // where the lone bird is during a duel, blended in from and back out to its normal spot
  function duelHero(base, baseRoll) {
    const th = side.threat; if (!isDuel(th)) return null;
    const b = bt(th);
    if (b < -0.3 || b > BATTLE + 0.9) return null;
    const d = duel(Math.min(b, BATTLE), th.ok);
    const k = smooth(-0.3, 0.25, b) * (1 - smooth(BATTLE, BATTLE + 0.9, b));
    return { pos: base.clone().lerp(d.hero, k), roll: lerp(baseRoll, d.heroRoll, k) };
  }
  // where follower i flies during the fight (null = its normal slot)
  function battleSlot(i, f) {
    const th = side.threat; if (!th) return null;
    const b = bt(th), home = f.userData.home.clone().add(hero.position.clone().setY(0)).setY(f.userData.home.y + hero.position.y * 0.5);
    if (b < -0.3) return null;
    const isVictim = !th.ok && i === flock.length - 1;
    if (th.type === 'hunter') {
      if (b > BATTLE) return null;
      const k = smooth(-0.3, 0.4, b) * (1 - smooth(4.5, BATTLE, b));
      return home.add(new THREE.Vector3(Math.sin(b * 3.1 + i * 1.7) * 1.6 * k, Math.cos(b * 4.3 + i) * 1.4 * k, 0));
    }
    const P = th.pPos || flockCentre();
    if (b > BATTLE) return isVictim ? null : home;
    // mob the predator: orbit it at different radii, darting in and out
    const a = b * (2.6 + (i % 4) * 0.45) + i * 1.9, r = 1.5 + (i % 3) * 0.8 + Math.sin(b * 6 + i) * 0.5;
    const orbit = P.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 1.6) * 0.9, Math.sin(a) * r * 0.6));
    let k = smooth(-0.3, 0.6, b);
    if (!isVictim) k *= 1 - smooth(4.4, BATTLE, b);       // everyone else regroups at the end
    else if (b > 4.2) orbit.lerp(P.clone().add(new THREE.Vector3(0.2, -1.5, 0)), smooth(4.2, 4.9, b)); // into the talons
    return home.lerp(orbit, k);
  }
  function updatePredators(dt) {
    const th = side.threat;
    hawkMesh.visible = owlMesh.visible = hunterMesh.visible = false; tracer.material.opacity = 0;
    if (side.shake > 0) side.shake = Math.max(0, side.shake - dt);
    if (!th) { dropCarried(); return; }
    const W = world.viewW || 14, t = th.t, b = bt(th);
    // a burst of feathers every so often while they fight
    const contact = (period, at) => {
      const n = Math.floor(b / period);
      if (b > 0.4 && b < BATTLE && n !== th.lastHit) { th.lastHit = n; featherBurst(at, Math.random() < 0.5 ? '#f4ece0' : '#8a6a48'); side.shake = 0.25; Sound.hit(); }
    };
    if (th.type === 'hunter') {
      // walks in, plants himself, fires a volley through the battle, then leaves
      const walk = lerp(W * 1.1, W * 0.45, smooth(0, th.warn, t));
      const hx = b < BATTLE + 0.6 ? walk : lerp(W * 0.45, -W * 0.5, clamp((b - BATTLE - 0.6) / 1.6, 0, 1)), hz = -60;
      hunterMesh.visible = true;
      hunterMesh.position.set(hx, groundYAt(hx, hz) + 3.9, hz);
      const muzzle = hunterMesh.position.clone().add(new THREE.Vector3(-3, 3, 0));
      const shots = [0.35, 1.25, 2.1, 2.95, 3.8, 4.75];
      let firing = false;
      shots.forEach((st, k) => {
        const dtS = b - st;
        if (dtS < 0 || dtS > 0.32) return;
        firing = dtS < 0.12;
        const last = k === shots.length - 1;
        const targets = flock.length ? flock : [hero];
        const tgt = targets[(k * 3) % targets.length].position.clone();
        // every shot but the last misses; the last one hits only if the player failed
        const hitNow = last && !th.ok;
        const aim = hitNow ? (flock.length ? flock[flock.length - 1].position.clone() : hero.position.clone())
          : tgt.add(new THREE.Vector3(1.2 + Math.random() * 0.6, (k % 2 ? 1 : -1) * (1.2 + Math.random()), 0));
        tracerGeo.setFromPoints([muzzle, aim]); tracer.material.opacity = 1 - dtS / 0.32;
        if (dtS < dt * 1.5) { side.shake = 0.12; Sound.hit(); }
      });
      setFrame(hunterMesh, firing ? 1 : 0);
      return;
    }
    const m = th.type === 'owl' ? owlMesh : hawkMesh;
    m.visible = true;
    const C = flockCentre();
    m.material.opacity = 1;
    if (b < 0) {
      // flies in from far off in the distance, circles high and ahead during the warning, then stoops at the flock
      const k = smooth(-0.55, 0, b), arrive = smooth(0, 1.6, t);
      const high = new THREE.Vector3(W * 0.3 + Math.sin(t * 1.3) * 1.2, 2.8 + Math.sin(t * 2.1) * 0.6, -4);
      high.lerp(new THREE.Vector3(W * 1.1, 14, -90), 1 - arrive);
      m.material.opacity = smooth(0, 0.5, t);
      m.position.copy(high.lerp(C.clone().add(new THREE.Vector3(1.5, 1.5, 0)), k));
      m.userData.roll = -0.55 * k;
      setFrame(m, b < -0.55 ? phaseFrame(t * 5, BIRD_FRAMES) : 3);
    } else if (b <= BATTLE && isDuel(th)) {
      // one on one: the bird and the predator duel it out
      const d = duel(b, th.ok);
      m.position.copy(d.pred); th.pPos = d.pred.clone();
      m.userData.roll = d.predRoll;
      setFrame(m, phaseFrame(b * 11, BIRD_FRAMES));
      const n = Math.floor((b + CLASH / 2) / CLASH); // fires as each clash peaks
      if (b > 0.3 && b < BATTLE && n !== th.lastHit) {
        th.lastHit = n;
        featherBurst(d.at, th.fire ? '#ff9a2a' : '#f4ece0'); featherBurst(d.at.clone().add(new THREE.Vector3(0.3, 0.2, 0)), th.fire ? '#ff4a1a' : '#8a6a48');
        side.shake = 0.35; Sound.hit();
      }
    } else if (b <= BATTLE) {
      // the dogfight: a tight figure-eight through the flock, wings working hard
      const P = C.clone().add(new THREE.Vector3(Math.sin(b * 2.1) * 3.2, 0.6 + Math.sin(b * 4.2) * 1.2, Math.cos(b * 2.1) * 1.4));
      if (b > 4.2) {
        const tgt = !th.ok ? (flock.length ? C : hero.position.clone().add(new THREE.Vector3(0, 1.4, 0))) : C.clone().add(new THREE.Vector3(2, 2.5, 0));
        P.lerp(tgt, smooth(4.2, 4.9, b));
      }
      m.position.copy(P); th.pPos = P.clone();
      m.userData.roll = Math.cos(b * 2.1) * 0.5 + (b > 4.2 && th.ok ? (b - 4.2) * 2 : 0);
      setFrame(m, phaseFrame(b * 9, BIRD_FRAMES));
      contact(0.7, P.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 0.3)));
    } else {
      const a = b - BATTLE, P = th.pEnd || (th.pEnd = m.position.clone());
      // either way it leaves the whole way: off into the distance, fading as it goes
      m.material.opacity = 1 - smooth(1.4, 2.8, a);
      if (th.ok) {
        // beaten: tumbles, recovers, then flees low and far off to the left
        const tumble = new THREE.Vector3(-a * 5, -Math.min(a, 0.8) * 3, 0);
        const flee = new THREE.Vector3(-a * 6, 1.5 * Math.max(0, a - 0.8), -40 * smooth(0.8, 2.8, a));
        m.position.copy(P).add(tumble).add(flee.multiplyScalar(smooth(0.6, 1.2, a)));
        m.userData.roll = a < 0.8 ? a * 9 : lerp(0.8 * 9, Math.PI * 2 * 3, smooth(0.8, 1.2, a)); setFrame(m, a < 0.9 ? 3 : phaseFrame(t * 9, BIRD_FRAMES));
      } else {
        // wins: climbs away up and to the right and off into the distance, with a follower in its talons
        m.position.copy(P).add(new THREE.Vector3(a * 4.5, a * 2.6, -a * a * 9));
        m.userData.roll = -0.35; setFrame(m, phaseFrame(t * 7, BIRD_FRAMES));
        if (carried) {
          carried.material.opacity = m.material.opacity;
          carried.position.copy(m.position).add(new THREE.Vector3(0.3, -1.6, 0.2));
          carried.userData.roll = Math.sin(t * 9) * 0.5; setFrame(carried, phaseFrame(t * 14, BIRD_FRAMES));
        }
      }
    }
  }
  // called by game logic the moment the result is announced
  function showOutcome(th, r) {
    if (th.ok || !hero) return;
    if (r.lost === 'follower') {
      const from = flock.length ? flock[flock.length - 1].position.clone() : hero.position.clone();
      if (th.type === 'hunter') {
        featherBurst(from, '#f4ece0');
        // the hit follower tumbles down out of frame
        carried = cutout(atlasFor(F.birdOf(S)), 6.4 * 0.62); carried.position.copy(from); fscene.add(carried);
        carried.userData.fall = { v: 0, spin: 0 };
      } else {
        carried = cutout(atlasFor(F.birdOf(S)), 6.4 * 0.62); carried.position.copy(from); fscene.add(carried);
      }
    } else {
      // seeds spill from the bird and fall away
      featherBurst(hero.position.clone(), '#e3a52b', 9);
    }
  }
  function updateCarried(dt) {
    if (!carried || !carried.userData.fall) return;
    const f = carried.userData.fall; f.v += 18 * dt; f.spin += dt * 8;
    carried.position.y -= f.v * dt; carried.position.x -= world.u * 0.2 * dt; carried.userData.roll = f.spin;
    if (carried.position.y < GROUND - 5) dropCarried();
  }
  function featherBurst(at, color = '#f4ece0', gravity = 2) {
    const sp = sparks.geometry.attributes.position;
    for (let i = 0; i < 30; i++) { sp.setXYZ(i, at.x, at.y, at.z); sparkV[i].randomDirection().multiplyScalar(1.5 + Math.random() * 3); }
    sp.needsUpdate = true; side.burst = 1.1; side.burstG = gravity; sparks.material.color.setStyle(color); sparks.material.size = 0.55;
  }


  // ---------- the bug (Bug Catcher upgrade) ----------
  const SPH = new THREE.SphereGeometry(1, 16, 12);
  // A fat glowing beetle that crosses below the bird's line; the bird dips to
  // meet it at the beak, then climbs back. Timings live in game state (side.bug).
  const DIVE = 2.2, CLIMB = 1.4, DIP = -3.6;
  const bugMesh = (() => {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(SPH, new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.3, metalness: 0.4, flatShading: true }));
    shell.scale.set(0.42, 0.28, 0.3); g.add(shell);
    const head = new THREE.Mesh(SPH, new THREE.MeshStandardMaterial({ color: 0x1b1b1b, flatShading: true }));
    head.scale.setScalar(0.17); head.position.x = 0.4; g.add(head);
    const wingM = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const wings = [1, -1].map((sgn) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.26), wingM); w.position.set(-0.05, 0.22, 0.14 * sgn); g.add(w); return w; });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('#fff8c4', 'rgba(255,214,90,.55)'), transparent: true, depthWrite: false, fog: false }));
    glow.scale.setScalar(3.2); g.add(glow);
    g.userData = { wings, glow }; g.visible = false; fscene.add(g);
    return g;
  })();
  const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3)),
    new THREE.PointsMaterial({ color: 0xffe08a, size: 0.35, transparent: true, opacity: 0, depthWrite: false }));
  fscene.add(sparks);
  const sparkV = Array.from({ length: 30 }, () => new THREE.Vector3());
  const BEAK_TIP = new THREE.Vector3(1.55, -0.2, 0); // beak tip on the 2D cutout (frame has headroom above)
  // vertical offset of the hero during a dive episode
  function diveOffset(t) {
    if (t < DIVE) return DIP * smooth(0.2, DIVE, t);
    return DIP * (1 - smooth(DIVE, DIVE + CLIMB, t));
  }
  function updateBug(dt) {
    const e = side.bug;
    if (!e) { bugMesh.visible = false; } else {
      const t = e.t;
      if (t < DIVE) {
        bugMesh.visible = true;
        // from up ahead and below, on a gentle wobble, to the beak at the moment of the catch
        const k = t / DIVE, from = new THREE.Vector3(2 + (world.viewW || 14) * 0.45, DIP + 0.6, -1.2);
        const to = BEAK_TIP.clone().add(new THREE.Vector3(0, DIP, 0));
        bugMesh.position.lerpVectors(from, to, k);
        bugMesh.position.y += Math.sin(t * 9) * 0.25 * (1 - k); bugMesh.position.z += Math.sin(t * 5) * 0.3 * (1 - k);
        for (const w of bugMesh.userData.wings) w.rotation.x = Math.sin(side.t * 70) * 0.9;
        bugMesh.userData.glow.material.opacity = 0.7 + Math.sin(side.t * 12) * 0.3;
      } else bugMesh.visible = false;
    }
    // little burst of sparks at the catch
    const sp = sparks.geometry.attributes.position;
    if (side.burst > 0) {
      side.burst -= dt;
      sparks.material.opacity = clamp(side.burst / 0.8, 0, 1);
      for (let i = 0; i < 30; i++) { sparkV[i].y -= (side.burstG || 0) * dt; const p = new THREE.Vector3().fromBufferAttribute(sp, i).addScaledVector(sparkV[i], dt); sp.setXYZ(i, p.x, p.y, p.z); }
      sp.needsUpdate = true;
    } else sparks.material.opacity = 0;
  }
  function burstAtBeak() {
    const sp = sparks.geometry.attributes.position, at = hero.position.clone().add(BEAK_TIP);
    for (let i = 0; i < 30; i++) { sp.setXYZ(i, at.x, at.y, at.z); sparkV[i].randomDirection().multiplyScalar(2 + Math.random() * 4); }
    sp.needsUpdate = true; side.burst = 0.8; side.burstG = 0; sparks.material.color.setStyle('#ffe08a'); sparks.material.size = 0.35;
  }

  // Resolution safety net: if frames run slow for a couple of seconds the drawing resolution
  // steps down a notch (never below a floor), and steps back up once there's headroom again.
  const QUALITY = [1, 0.85, 0.72, 0.6];
  let qLevel = 0, qT = 0, qSlow = 0, qFast = 0;
  function adaptQuality(dt) {
    qT += dt; if (dt > 1 / 45) qSlow += dt; else if (dt < 1 / 55) qFast += dt;
    if (qT < 2) return;
    const slow = qSlow / qT, fast = qFast / qT; qT = qSlow = qFast = 0;
    if (slow > 0.5 && qLevel < QUALITY.length - 1) { qLevel++; sizeSide(); }
    else if (fast > 0.9 && qLevel > 0 && (side.qUpT = (side.qUpT || 0) + 1) >= 3) { side.qUpT = 0; qLevel--; sizeSide(); }
  }
  function sizeSide() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1) * QUALITY[qLevel]); // floor: never below 1x
    const r = stage.getBoundingClientRect();
    SW = r.width; SH = r.height;
    renderer.setPixelRatio(DPR); renderer.setSize(SW, SH, false);
    camera.aspect = SW / SH; camera.updateProjectionMatrix();
    fr.setPixelRatio(DPR); fr.setSize(SW, SH, false);
    if (side.pipOn) { side.pipOn = false; setPip(true); } // keep the inset's own size and shape
    fcam.aspect = SW / SH; fcam.updateProjectionMatrix();
  }

  const unitsPerSec = (v) => clamp(10 + 30 * Math.log10(1 + v), 10, 230) * (reduceMotion ? 0.5 : 1);

  function resetSide() {
    for (const c of world.chunks) disposeChunk(c); world.chunks = [];
    for (const c of world.clouds) fscene.remove(c); world.clouds = [];
    world.u = unitsPerSec(F.speed(S)); side.vS = side.vF = F.speed(S);
    const here = F.legFrom(S);
    // start over the departure city so take-off reads right
    world.cursor = 0;
    let x = -CW * 3 + 30; // puts the departure city in frame at take-off
    world.building = true; // nothing is on screen yet, so any strip may be reshaped to fit its neighbour
    for (let i = 0; i < 2; i++) { pushChunk(x, kindAt(here), here); x += CW; }
    pushChunk(x, 'city', here, here.name); x += CW;
    while (x < 620) { const g = lookahead(Math.max(0, x / world.u)); pushChunk(x, kindAt(g), g); x += CW; }
    world.building = false;
    for (let i = 0; i < 16; i++) makeCloud(-150 + Math.random() * 760);
    side.cityLeg = S.leg;
    setBirds();
  }

  // Strips are laid down well ahead of the bird using a guess of when it will reach them.
  // When the bird speeds up or slows down that guess goes stale (land drawn over what is
  // really ocean, or the other way round), so every half second the strips still out of
  // close view are checked against where the bird will really be, and relaid if wrong.
  function checkStrips(dt, v) {
    side.geoT = (side.geoT || 0) - dt;
    if (side.geoT > 0) return;
    side.geoT = 0.5;
    const near = (world.viewW || 14) * 2 + CW / 2, u = unitsPerSec(side.vS), cs = world.chunks;
    let lastCity = -1; cs.forEach((c, i) => { if (c.kind === 'city') lastCity = i; });
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], x = c.grp.position.x;
      if (x < near || i <= lastCity) continue;
      const want = kindAt(lookahead(Math.max(0, x / u)));
      if (want === c.kind) { c.miss = 0; continue; }
      c.miss = (c.miss || 0) + 1; if (c.miss < 2) continue; // must be wrong on two checks running
      // relay from here on (one strip earlier too, if it's also out of view, so the shoreline joins)
      let j = i; if (j - 1 > lastCity && cs[j - 1].grp.position.x >= near) j--;
      while (cs.length > j) disposeChunk(cs.pop());
      world.nextType = null;
      world.cursor = cs[cs.length - 1].wx0 + CW; // carry on the ground exactly where the kept strip ends
      return; // the strip loop in updateFlight refills ahead on the next frame
    }
  }
  function updateFlight(dt) {
    const v = F.speed(S);
    // The ground scrolls in step with the kilometres the bird really flies: a fixed-ish number of
    // world units per km (set by a slow average of the speed), times the actual speed. So a strip
    // laid for "N km ahead" arrives under the bird when the globe has the bird N km on, even when
    // the speed changes sharply on the way (which used to leave land under a bird over the ocean).
    side.vS = lerp(side.vS || v, v, 1 - Math.exp(-dt / 2.5));
    side.vF = lerp(side.vF ?? v, v, 1 - Math.exp(-dt * 6));
    const U = unitsPerSec(side.vS);
    world.u = side.vS > 1e-6 ? Math.min(U * side.vF / side.vS, 400) : unitsPerSec(v);
    const fighting = side.threat && side.threat.phase === 'battle';
    const u = world.u, dx = u * dt * (fighting ? 0.35 : 1);
    side.t += dt;
    // ground strips: slide back, recycle behind, add ahead
    for (const c of world.chunks) c.grp.position.x -= dx;
    while (world.chunks.length && world.chunks[0].grp.position.x < -CW * 3.5) disposeChunk(world.chunks.shift());
    // build at most one new strip per frame (they're laid well ahead), so building never causes a hitch;
    // only if the strips ahead are nearly used up does it catch up several at once
    let last = world.chunks[world.chunks.length - 1], guard = 0;
    const maxBuilds = last.grp.position.x < (world.viewW || 14) * 1.5 + CW ? 12 : 1;
    while (last.grp.position.x < 620 - CW && guard++ < maxBuilds) {
      const nx = last.grp.position.x + CW, sec = Math.max(0, nx / U);
      const left = (F.legLen(S) - S.legKm) / Math.max(v, 1e-6);
      // skip the skyline when legs fly by in a blink; the ticket shows lap progress instead
      if (side.cityLeg !== S.leg + 1 && left < sec + CW / U && left > 1.0 && F.legLen(S) / v >= 3 && !F.legTo(S).v) {
        side.cityLeg = S.leg + 1;
        const to = F.legTo(S); pushChunk(nx, 'city', to, to.name);
      } else { const g = lookahead(sec); pushChunk(nx, world.nextType || kindAt(g), g); }
      last = world.chunks[world.chunks.length - 1];
    }
    checkStrips(dt, v);
    for (const c of world.clouds) {
      c.position.x -= dx;
      if (c.position.x < -220) { fscene.remove(c); c.userData.recycle = true; }
    }
    world.clouds = world.clouds.filter((c) => !c.userData.recycle);
    while (world.clouds.length < 16) makeCloud(560 + Math.random() * 120);
    updateSkyLife(dt, dx); updateSeaLife(dt, dx); updateWaves(dt); updateBoom(dt);

    // streaks show once things get fast
    const want = clamp(Math.floor(Math.log10(1 + v) * 9 - 8) + (S.rush > 0 ? 14 : 0), 0, STREAKS);
    const sp = streakGeo.attributes.position, len = 2 + Math.log10(1 + v) * 3;
    for (let i = 0; i < want; i++) {
      const d = streakData[i]; d.x -= u * 2.5 * dt;
      if (d.x < -30) { d.x = 50 + Math.random() * 30; d.y = Math.random() * 16 - 7; d.z = Math.random() * 14 - 10; }
      sp.setXYZ(i * 2, d.x, d.y, d.z); sp.setXYZ(i * 2 + 1, d.x + len, d.y, d.z);
    }
    sp.needsUpdate = true; streakGeo.setDrawRange(0, want * 2);

    // wing beat: quick when boosting, lazy glide-and-flap when not
    // a headwind makes the bird work harder
    const target = 1.5 + S.boost * 6 + Math.min(2, Math.log10(1 + v) * 0.35) + (S.wx && S.wx.type === 'headwind' ? 1.2 : 0);
    side.flapRate = lerp(side.flapRate, target, 1 - Math.exp(-dt * 4));
    side.flap += dt * side.flapRate * Math.PI * 2;
    const glide = S.boost < 0.05 ? smooth(0.2, 0.9, Math.sin(side.t * 0.45)) * 0.8 : 0;
    setBirds();
    // gliding holds the wings level; otherwise play the flap flipbook
    const heroPh = glide > 0.55 ? 0.35 : side.flap;
    setFrame(hero, phaseFrame(heroPh, BIRD_FRAMES));
    // now and then the bird drops low on its own for a while (a scenic stretch, or keeping under a
    // circling predator's eye), bringing the foreground trees and rooftops into view
    side.lowT = (side.lowT ?? 25) - dt;
    if (side.lowT <= 0 && !side.low) { side.low = { t: 0, T: 7 + Math.random() * 6, depth: 0.5 + Math.random() * 0.3 }; side.lowT = 40 + Math.random() * 50; }
    let lowK = 0;
    if (side.low) { const L = side.low; L.t += dt; lowK = smooth(0, 1.6, L.t) * (1 - smooth(L.T - 1.6, L.T, L.t)) * L.depth; if (L.t > L.T) side.low = null; }
    if (side.threat && side.threat.phase === 'warn') lowK = Math.max(lowK, 0.4); // duck low when a predator shows up
    if (side.bug || (side.threat && side.threat.phase !== 'warn')) lowK = 0;
    side.swoop = lerp(side.swoop || 0, Math.max(swoopNow(), lowK), 1 - Math.exp(-dt * 3));
    const dive = (side.bug ? diveOffset(side.bug.t) : 0) + threatOffset() - SWOOP * side.swoop;
    const wobble = S.stun > 0 ? Math.sin(side.t * 14) * 0.25 : 0;
    hero.position.set(0, Math.sin(side.t * 1.6) * 0.35 * (dive ? 0.3 : 1) - Math.sin(side.flap) * 0.08 + dive + wobble, 0);
    // nose down into the dive, up on the climb
    const pitch = side.bug ? (side.bug.t < DIVE ? -0.28 * Math.sin(Math.PI * clamp(side.bug.t / DIVE, 0, 1)) : 0.22 * Math.sin(Math.PI * clamp((side.bug.t - DIVE) / CLIMB, 0, 1))) : 0;
    hero.userData.roll = 0.04 + Math.sin(side.t * 1.6 + 0.6) * 0.04 + pitch + wobble * 0.3;
    // blinks now and then, and squashes and stretches with each wingbeat
    side.blinkT = (side.blinkT ?? 3) - dt;
    if (side.blinkT < -0.13) side.blinkT = 2.2 + Math.random() * 3.5;
    const blink = side.blinkT < 0 ? BIRD_FRAMES : 0;
    if (blink) setFrame(hero, phaseFrame(heroPh, BIRD_FRAMES) + blink);
    const st = glide > 0.55 ? 0 : Math.sin(side.flap) * Math.min(1, 0.35 + S.boost * 0.9);
    hero.scale.set(1 - 0.045 * st, 1 + 0.07 * st, 1);
    const dh = duelHero(hero.position, hero.userData.roll);
    if (dh) { hero.position.copy(dh.pos); hero.userData.roll = dh.roll; setFrame(hero, phaseFrame(side.t * 11, BIRD_FRAMES)); }
    updateBug(dt);
    updatePredators(dt); updateCarried(dt);
    // golden streaks while a bug rush is on
    streaks.material.color.setStyle(S.rush > 0 ? '#ffd36b' : '#ffffff');
    flock.forEach((f, i) => {
      const h = f.userData.home, slot = battleSlot(i, f);
      const want = slot || new THREE.Vector3(h.x + Math.sin(side.t * 0.5 + i) * 0.4, h.y + Math.sin(side.t * 1.4 + i * 1.3) * 0.4 - SWOOP * (side.swoop || 0), h.z);
      // ease toward the slot so scattering and regrouping read as flight, not teleporting
      f.position.lerp(want, slot ? 1 - Math.exp(-dt * 9) : 1 - Math.exp(-dt * 3));
      f.userData.roll = 0.04 + Math.sin(side.t * 0.8 + i) * 0.05;
      setFrame(f, phaseFrame(glide > 0.55 ? 0.35 : side.flap * 1.05 + f.userData.phase, BIRD_FRAMES));
    });

    // sky, light and fog by the local hour under the bird
    const cur = currentGeo(), hour = skyHour(dt, cur);
    const night = clamp(1 - smooth(5.5, 7.5, hour) + smooth(18.5, 20.5, hour), 0, 1);
    const [top, bot] = skyAt(hour);
    skyU.top.value.setStyle(top); skyU.bottom.value.setStyle(bot);
    fscene.fog.color.setStyle(bot);
    updateRanges(dx, fscene.fog.color, night);
    starMat.opacity = night * 0.9;
    const dayT = clamp((hour - 6) / 12, 0, 1), elev = Math.sin(dayT * Math.PI);
    const isDay = hour > 6 && hour < 18;
    // the light comes from the camera's side so the bird's visible flank is lit;
    // the sun you see sits ahead in the sky on the mirrored bearing
    fsun.position.set(-260 + dayT * 520, 60 + elev * 220, 200);
    fsun.color.setStyle(elev < 0.35 && isDay ? '#ffc08a' : isDay ? '#fff1d6' : '#9fb4ff');
    fsun.intensity = isDay ? 1.1 + elev * 1.4 : 0.45;
    hemi.intensity = lerp(1.1, 0.4, night);
    sunDisc.position.set(fsun.position.x, fsun.position.y * 0.5, -fsun.position.z).normalize().multiplyScalar(1000);
    sunDisc.material.color.setStyle(isDay ? (elev < 0.3 ? '#ffd9a0' : '#ffffff') : '#c9d4f5');
    sunDisc.scale.setScalar(isDay ? 130 + (1 - elev) * 40 : 70);
    // golden hour: strongest when the sun is low, fading out by mid-morning and back in late afternoon
    const golden = isDay ? 1 - smooth(0.12, 0.55, elev) : 0;
    side.golden = golden;
    goldHalo.position.copy(sunDisc.position).multiplyScalar(0.98);
    goldHalo.material.opacity = 0.15 + golden * 0.75; goldHalo.scale.setScalar(420 + golden * 380);
    // the sun's road on the water, running from under the sun toward you
    const sx = sunDisc.position.x / Math.max(1, -sunDisc.position.z) * 600;
    sunPath.position.set(clamp(sx, -400, 400) * 0.5, GROUND + 0.65, -330);
    sunPath.material.opacity = golden * 0.85 * (1 - (wxK.storm || 0));
    hemi.color.setStyle(golden > 0.3 ? '#ffe2c4' : '#ffffff');
    fsun.intensity *= 1 + golden * 0.25;
    water.material.color.setStyle(night > 0.5 ? '#183461' : '#2468a6');
    towerMat.emissive.setStyle(night > 0.4 ? '#b8862e' : '#000000');
    towerMat.emissiveIntensity = night * 0.55;
    canyonMat.emissive.setStyle(night > 0.4 ? '#8a6420' : '#000000'); canyonMat.emissiveIntensity = night * 0.7;
    updateWeather(dt, v, cur, (S.wx && S.wx.type) || 'clear');
    updateSkyFx(dt, night, cur, (S.wx && S.wx.type) || 'clear', isDay);
    if (side.golden > 0) cloudTint.lerp(new THREE.Color('#ffc99a'), side.golden * 0.55); // sunlit pink-gold clouds
    for (const m of CLOUD_MATS) m.color.copy(cloudTint);

    // camera: raised and off to the near side, framed so the bird sits left of centre
    const f = smooth(SIDE_A, 1, Z);
    const hfov = 2 * Math.atan(Math.tan(fcam.fov * D2R / 2) * fcam.aspect);
    // during a predator fight the camera pulls back and centres on the action
    const th = side.threat, tb = th ? th.t - th.warn : -9;
    const fightOn = th && tb > -0.6 && tb < BATTLE + 1.6 ? 1 : 0;
    side.fightK = lerp(side.fightK || 0, fightOn, 1 - Math.exp(-dt * 2.5));
    const wantW = lerp(60, 10, f) * Math.max(1, fcam.aspect * 1.25) * (1 + 0.45 * side.fightK); world.viewW = wantW;
    // a milestone moment: the camera eases back and up for a wide shot, then settles again
    let ck = 0;
    if (side.cine) { side.cine.t += dt; ck = Math.sin(Math.PI * clamp(side.cine.t / side.cine.T, 0, 1)); if (side.cine.t > side.cine.T) side.cine = null; }
    const d = (wantW / 2) / Math.tan(hfov / 2) * (1 + 0.7 * ck);
    // ~12° above the bird keeps the horizon in the upper third of the frame
    const elevA = (lerp(22, 12, f) + 9 * ck) * D2R, sway = Math.sin(side.t * 0.12) * 0.12 + ck * 0.35;
    fcam.position.set(d * 0.18 + Math.sin(sway) * d * 0.15, Math.sin(elevA) * d, Math.cos(elevA) * d);
    // follow the bird part-way down into a bug dive
    fcam.position.y += hero.position.y * 0.6;
    if (side.shake > 0) fcam.position.add(new THREE.Vector3((Math.random() - 0.5) * side.shake, (Math.random() - 0.5) * side.shake, 0));
    fcam.lookAt(wantW * 0.14 - side.fightK * 2.4, 0.4 + hero.position.y * 0.7 + side.fightK * 0.6, 0);
    // cutouts dim a little at night, like everything else
    const lit = lerp(1, 0.6, night);
    for (const m of sceneryMats) if (!CLOUD_MATS.includes(m)) m.color.setScalar(lerp(1, 0.45, night));
    for (const m of [hero, ...flock, hawkMesh, owlMesh, hunterMesh]) { faceCamera(m); m.material.color.setScalar(lit); }
    fr.render(fscene, fcam);
  }

  // ======================================================================
  // Space: a separate scene the close-up switches to while the bird is off
  // Earth. Earth shrinks away behind, the destination grows ahead, and the
  // bird rides a little shuttle.
  // ======================================================================
  const sscene = new THREE.Scene();
  sscene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const ssun = new THREE.DirectionalLight(0xfff4e0, 2.4); ssun.position.set(-300, 120, 200); sscene.add(ssun);
  // Background stars in two layers. Both drift slowly left while the ship flies (the nearer,
  // dimmer layer a little faster), so space feels like it's sliding past.
  const starLayers = [[1800, 1.7, 1, 0.006], [500, 1.2, 0.55, 0.014]].map(([n, size, bright, rate]) => {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(900);
      pos.set([v.x, v.y, v.z], i * 3);
      const w = (0.7 + Math.random() * 0.3) * bright, tint = Math.random();
      col.set(tint < 0.15 ? [w, w * 0.85, w * 0.7] : tint > 0.85 ? [w * 0.8, w * 0.9, w] : [w, w, w], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true }));
    pts.userData.rate = rate; sscene.add(pts); return pts;
  });
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('#fff8e0', 'rgba(255,214,140,.35)'), depthWrite: false, transparent: true }));
  sunGlow.position.set(-700, 260, 420); sunGlow.scale.setScalar(160); sscene.add(sunGlow);

  function bodyTexture(b) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d'), base = hex(b.color);
    g.fillStyle = b.color; g.fillRect(0, 0, 512, 256);
    const img = g.getImageData(0, 0, 512, 256), d = img.data;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
      const k = (y * 512 + x) * 4;
      let n = b.bands ? 0.75 + 0.35 * Math.sin(y / 9 + fbm(x / 60, y / 20) * 4) : 0.8 + fbm(x / 40, y / 40) * 0.4;
      if (b.id === 'mars') n *= 0.85 + fbm(x / 25 + 9, y / 25) * 0.3;
      if (b.id === 'neptune' || b.id === 'uranus') n = 0.9 + 0.15 * Math.sin(y / 20 + fbm(x / 80, y / 40) * 2);
      d[k] = clamp(base[0] * n, 0, 255); d[k + 1] = clamp(base[1] * n, 0, 255); d[k + 2] = clamp(base[2] * n, 0, 255);
    }
    g.putImageData(img, 0, 0);
    if (b.id === 'moon' || b.id === 'pluto') { // craters
      for (let i = 0; i < 70; i++) {
        const x = hash(i, 3) * 512, y = 30 + hash(i, 7) * 196, r = 3 + hash(i, 11) * 14;
        g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.7, 0, Math.PI * 2); g.fill();
      }
    }
    if (b.id === 'jupiter') { g.fillStyle = 'rgba(176,82,52,.75)'; g.beginPath(); g.ellipse(330, 160, 26, 14, 0, 0, Math.PI * 2); g.fill(); }
    if (b.id === 'pluto') { g.fillStyle = 'rgba(245,232,214,.55)'; g.beginPath(); g.ellipse(260, 140, 70, 55, 0, 0, Math.PI * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const spaceEarth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshPhongMaterial({ map: earthTex, shininess: 12 }));
  const spaceEarthAtmo = new THREE.Mesh(new THREE.SphereGeometry(1.04, 48, 32), new THREE.MeshBasicMaterial({ color: 0x6fb6ff, transparent: true, opacity: 0.18, side: THREE.BackSide }));
  spaceEarth.add(spaceEarthAtmo); sscene.add(spaceEarth);
  const targetMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const target = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), targetMat); sscene.add(target);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.3, 96), new THREE.MeshBasicMaterial({ color: 0xd9c690, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2.3; target.add(ring);
  const starGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('#fffbe8', 'rgba(255,220,140,.5)'), depthWrite: false, transparent: true }));
  starGlow.scale.setScalar(3.4); target.add(starGlow);
  const bodyTex = {};
  let targetId = null;
  function setTarget(b) {
    if (targetId === b.id) return; targetId = b.id;
    targetMat.map = bodyTex[b.id] || (bodyTex[b.id] = bodyTexture(b));
    targetMat.emissive = new THREE.Color(b.star ? 0xffe9a8 : 0x000000); targetMat.emissiveIntensity = b.star ? 1.2 : 0;
    targetMat.needsUpdate = true;
    ring.visible = !!b.ring; starGlow.visible = !!b.star;
  }

  // the shuttle: white hull, the bird in a glass bubble at the window, flame frames
  let shuttleBirdDef = BIRDS[0];
  function drawShuttle(g, i) {
    const cx = FW * 0.5, cy = FH * 0.55, L = FW * 0.62, H = FH * 0.24, x0 = cx - L / 2;
    // flame
    const fl = 0.75 + (i % 2) * 0.35;
    const fg = g.createLinearGradient(x0 - L * 0.45 * fl, 0, x0, 0);
    fg.addColorStop(0, 'rgba(255,120,40,0)'); fg.addColorStop(0.5, 'rgba(255,170,60,.85)'); fg.addColorStop(1, '#fff6d0');
    g.fillStyle = fg; g.beginPath(); g.moveTo(x0, cy - H * 0.32); g.quadraticCurveTo(x0 - L * 0.3 * fl, cy, x0, cy + H * 0.32);
    g.quadraticCurveTo(x0 - L * 0.45 * fl, cy, x0, cy - H * 0.32); g.fill();
    // wing and tail fin
    g.fillStyle = '#cfd6df';
    g.beginPath(); g.moveTo(x0 + L * 0.25, cy + H * 0.3); g.lineTo(x0 + L * 0.08, cy + H * 1.05); g.lineTo(x0 + L * 0.55, cy + H * 0.35); g.fill();
    g.beginPath(); g.moveTo(x0 + L * 0.02, cy - H * 0.35); g.lineTo(x0 + L * 0.02, cy - H * 1.15); g.lineTo(x0 + L * 0.2, cy - H * 0.4); g.fill();
    // hull
    const hg = g.createLinearGradient(0, cy - H / 2, 0, cy + H / 2);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.6, '#e9edf2'); hg.addColorStop(1, '#b8c0cb');
    g.fillStyle = hg; g.beginPath(); g.moveTo(x0, cy - H / 2);
    g.lineTo(x0 + L * 0.78, cy - H / 2); g.quadraticCurveTo(x0 + L * 1.02, cy - H * 0.1, x0 + L, cy + H * 0.15);
    g.lineTo(x0 + L * 0.8, cy + H / 2); g.lineTo(x0, cy + H / 2); g.closePath(); g.fill();
    g.fillStyle = '#2b3442'; g.beginPath(); g.moveTo(x0 + L * 0.93, cy - H * 0.22); g.quadraticCurveTo(x0 + L * 1.02, cy - H * 0.05, x0 + L, cy + H * 0.15); g.lineTo(x0 + L * 0.9, cy + H * 0.12); g.fill();
    g.fillStyle = '#cf2e3a'; g.fillRect(x0 + L * 0.1, cy + H * 0.12, L * 0.6, H * 0.1); // stripe
    g.fillStyle = '#2557a7'; g.fillRect(x0 + L * 0.1, cy + H * 0.24, L * 0.6, H * 0.06);
    // window with the bird inside
    const wx = x0 + L * 0.68, wy = cy - H * 0.45, wr = H * 0.62;
    g.fillStyle = '#0f1a33'; g.beginPath(); g.arc(wx, wy, wr, Math.PI, 0); g.fill();
    g.save(); g.beginPath(); g.arc(wx, wy, wr * 0.95, Math.PI, 0); g.clip();
    const b = shuttleBirdDef;
    g.fillStyle = b.body; g.beginPath(); g.arc(wx - wr * 0.05, wy - wr * 0.08, wr * 0.55, 0, Math.PI * 2); g.fill();
    g.fillStyle = b.cap; g.beginPath(); g.arc(wx - wr * 0.05, wy - wr * 0.08, wr * 0.55, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(wx + wr * 0.18, wy - wr * 0.14, wr * 0.12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(wx + wr * 0.21, wy - wr * 0.14, wr * 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = b.beak; g.beginPath(); g.moveTo(wx + wr * 0.42, wy - wr * 0.12); g.lineTo(wx + wr * 0.75, wy - wr * 0.04); g.lineTo(wx + wr * 0.42, wy + wr * 0.02); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(200,230,255,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(wx, wy, wr, Math.PI, 0); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(wx - wr * 0.4, wy - wr * 0.55, wr * 0.18, wr * 0.08, -0.6, 0, Math.PI * 2); g.fill();
  }
  const shuttleAtlas = makeAtlas(drawShuttle, 2, 2, 1);
  const shuttle = cutout(shuttleAtlas, 9); sscene.add(shuttle);
  let shuttleBird = null;
  const SSTREAK = 60;
  const sstreakGeo = new THREE.BufferGeometry(); sstreakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SSTREAK * 6), 3));
  const sstreaks = new THREE.LineSegments(sstreakGeo, new THREE.LineBasicMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.7 }));
  sscene.add(sstreaks);
  const sstreakData = Array.from({ length: SSTREAK }, () => ({ x: Math.random() * 160 - 60, y: Math.random() * 60 - 30, z: Math.random() * 80 - 70 }));

  function updateSpace(dt) {
    const sp = S.space, body = F.SPACE[sp.dest];
    setTarget(body); labelsEl.style.display = 'none';
    // redraw the shuttle once per bird so the right bird is in the window
    if (shuttleBird !== S.bird) {
      shuttleBird = S.bird; shuttleBirdDef = F.birdOf(S);
      const c = shuttleAtlas.tex.image, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
      for (let i = 0; i < 2; i++) { g.save(); g.translate(i * FW, 0); g.beginPath(); g.rect(0, 0, FW, FH); g.clip(); drawShuttle(g, i); g.restore(); }
      shuttle.userData.tex.needsUpdate = true;
    }
    side.t += dt;
    const p = sp.arrived ? 1 : clamp(sp.km / body.km, 0, 1);
    const e = p * p * (3 - 2 * p), grow = Math.pow(p, 2.2);
    // the destination grows ahead and to the right; Earth falls away behind
    const tScale = body.star ? lerp(2, 16, grow) : lerp(3, body.id === 'moon' ? 22 : 34, grow);
    target.scale.setScalar(tScale);
    target.position.set(lerp(260, 34, grow), lerp(60, 4, grow), lerp(-700, -60, grow));
    target.rotation.y += dt * 0.05;
    const es = lerp(40, 1.5, e);
    spaceEarth.scale.setScalar(es);
    spaceEarth.position.set(lerp(-46, -500, e), lerp(-40, -60, e), lerp(-30, -600, e));
    spaceEarth.rotation.y += dt * 0.03;
    spaceEarth.visible = !sp.arrived || sp.dest === 0;
    if (sp.arrived) { spaceEarth.visible = sp.dest === 0; spaceEarth.scale.setScalar(1.5); spaceEarth.position.set(-500, -60, -600); }
    // shuttle: steady, a little bob; in orbit it drifts slowly around the planet's near side
    const bob = Math.sin(side.t * 1.3) * 0.4;
    shuttle.position.set(sp.arrived ? Math.sin(side.t * 0.2) * 3 : 0, bob, 0);
    shuttle.userData.roll = sp.arrived ? 0.05 : -0.04 + Math.sin(side.t * 0.9) * 0.02;
    setFrame(shuttle, sp.arrived ? 0 : Math.floor(side.t * 14) % 2);
    // speed streaks while travelling
    const sp2 = sstreakGeo.attributes.position, n = sp.arrived ? 0 : SSTREAK, speedK = 120 + 260 * (1 - p * 0.7);
    for (let i = 0; i < n; i++) {
      const d = sstreakData[i]; d.x -= speedK * dt;
      if (d.x < -80) { d.x = 90 + Math.random() * 40; d.y = Math.random() * 60 - 30; d.z = Math.random() * 80 - 70; }
      sp2.setXYZ(i * 2, d.x, d.y, d.z); sp2.setXYZ(i * 2 + 1, d.x + 6, d.y, d.z);
    }
    sp2.needsUpdate = true; sstreakGeo.setDrawRange(0, n * 2);
    // camera: same raised side view as on Earth
    fcam.position.set(3, 4.2, 22);
    fcam.lookAt(4, 0.5, 0);
    faceCamera(shuttle);
    fr.render(sscene, fcam);
  }

  // the zoomed-out view while in space: Earth, the destination, and the bird between
  const chartBody = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), targetMat);
  scene.add(chartBody); chartBody.visible = false;
  const chartLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const chartLine = new THREE.Line(chartLineGeo, new THREE.LineDashedMaterial({ color: 0xffd36b, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.85 }));
  scene.add(chartLine); chartLine.visible = false;
  const CHART_DIR = new THREE.Vector3(0.75, 0.22, -0.62).normalize();
  function updateSpaceChart(dt) {
    const sp = S.space, body = F.SPACE[sp.dest];
    setTarget(body);
    const D = sp.dest === 0 ? 7 : 12, r = body.star ? 1.2 : sp.dest === 0 ? 0.27 : 0.6;
    const P = CHART_DIR.clone().multiplyScalar(D);
    chartBody.visible = true; chartLine.visible = false; chartBody.scale.setScalar(r); chartBody.position.copy(P);
    moon.visible = false; routeGroup.visible = false; nextSprite.visible = false; labelsEl.style.display = 'none';
    const a = CHART_DIR.clone().multiplyScalar(1.02), b = P.clone().addScaledVector(CHART_DIR, -r * 1.05);
    chartLineGeo.setFromPoints([a, b]); chartLine.computeLineDistances();
    const p = sp.arrived ? 1 : clamp(sp.km / body.km, 0, 1);
    const at = a.clone().lerp(b, p);
    birdSprite.position.copy(at);
    // frame Earth and the destination together; only the last stretch of zoom closes in on the bird
    const q = clamp(Z / SIDE_B, 0, 1), dist = (D * 0.95 + 14 * Math.pow(1 - q, 2)) / Math.min(1, SW / SH + 0.15);
    birdSprite.scale.setScalar(0.05 + dist * 0.01);
    const side3 = new THREE.Vector3(0, 1, 0).cross(CHART_DIR).normalize();
    const focus = P.clone().multiplyScalar(0.5).lerp(at, smooth(0.75, 1, q));
    camera.position.copy(focus).addScaledVector(side3, -dist).add(new THREE.Vector3(0, dist * 0.35, 0));
    camera.lookAt(focus);
    sun.position.copy(camera.position).add(new THREE.Vector3(-2, 3, 0));
    renderer.render(scene, camera);
  }
  // ======================================================================
  // The Earth–Moon loop (close-up). Earth and the Moon take turns: one falls
  // away behind while the other grows ahead, swings past, and becomes the
  // one behind. Wingmates fly in their own pods; raiders attack in ships or
  // as hawks in space helmets.
  // ======================================================================
  const POD_W = 4.6;
  function drawPod(g, i, b, opts = {}) {
    const cx = FW * 0.5, cy = FH * 0.56, L = FW * (opts.raider ? 0.6 : 0.5), H = FH * (opts.raider ? 0.26 : 0.3), x0 = cx - L / 2;
    // exhaust
    const fl = 0.8 + (i % 2) * 0.3;
    const fg = g.createLinearGradient(x0 - L * 0.4 * fl, 0, x0, 0);
    const hot = opts.raider ? ['rgba(255,60,60,0)', 'rgba(255,90,80,.85)', '#ffe0d8'] : ['rgba(90,170,255,0)', 'rgba(120,200,255,.85)', '#e8f6ff'];
    fg.addColorStop(0, hot[0]); fg.addColorStop(0.5, hot[1]); fg.addColorStop(1, hot[2]);
    g.fillStyle = fg; g.beginPath(); g.moveTo(x0 + 4, cy - H * 0.22); g.quadraticCurveTo(x0 - L * 0.4 * fl, cy, x0 + 4, cy + H * 0.22); g.fill();
    if (opts.raider) {
      // a jagged dark-red hull with spikes
      g.fillStyle = '#5a1620';
      g.beginPath(); g.moveTo(x0, cy - H * 0.35); g.lineTo(x0 + L * 0.25, cy - H * 0.95); g.lineTo(x0 + L * 0.42, cy - H * 0.38);
      g.lineTo(x0 + L * 0.98, cy - H * 0.05); g.lineTo(x0 + L * 0.42, cy + H * 0.4); g.lineTo(x0 + L * 0.25, cy + H * 0.95); g.lineTo(x0, cy + H * 0.35); g.closePath(); g.fill();
      g.fillStyle = '#8c2430'; g.beginPath(); g.moveTo(x0 + L * 0.1, cy - H * 0.2); g.lineTo(x0 + L * 0.85, cy - H * 0.04); g.lineTo(x0 + L * 0.1, cy + H * 0.2); g.fill();
      g.fillStyle = '#ffb02e'; g.fillRect(x0 + L * 0.15, cy + H * 0.02, L * 0.5, H * 0.06);
    } else {
      const hg = g.createLinearGradient(0, cy - H / 2, 0, cy + H / 2);
      hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#b9c2cf');
      g.fillStyle = hg; g.beginPath(); g.ellipse(cx, cy + H * 0.1, L / 2, H * 0.42, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2557a7'; g.fillRect(x0 + L * 0.12, cy + H * 0.18, L * 0.7, H * 0.08);
      g.fillStyle = '#cfd6df'; g.beginPath(); g.moveTo(x0 + L * 0.15, cy + H * 0.3); g.lineTo(x0 + L * 0.02, cy + H * 0.75); g.lineTo(x0 + L * 0.42, cy + H * 0.35); g.fill();
    }
    // the dome, with the pilot's head inside
    const wx = x0 + L * (opts.raider ? 0.52 : 0.6), wy = cy - H * (opts.raider ? 0.22 : 0.18), wr = H * 0.55;
    g.fillStyle = '#0f1a33'; g.beginPath(); g.arc(wx, wy, wr, Math.PI, 0); g.fill();
    g.save(); g.beginPath(); g.arc(wx, wy, wr * 0.95, Math.PI, 0); g.clip();
    g.fillStyle = b.body; g.beginPath(); g.arc(wx - wr * 0.05, wy - wr * 0.1, wr * 0.55, 0, Math.PI * 2); g.fill();
    if (!b.head) { g.fillStyle = b.cap; g.beginPath(); g.arc(wx - wr * 0.05, wy - wr * 0.1, wr * 0.55, Math.PI * 1.05, Math.PI * 1.95); g.fill(); }
    g.fillStyle = opts.raider ? '#f2c230' : '#fff'; g.beginPath(); g.arc(wx + wr * 0.18, wy - wr * 0.16, wr * 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(wx + wr * 0.21, wy - wr * 0.16, wr * 0.075, 0, Math.PI * 2); g.fill();
    if (opts.raider) { // an angry brow
      g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(wx + wr * 0.02, wy - wr * 0.38); g.lineTo(wx + wr * 0.38, wy - wr * 0.25); g.stroke();
    }
    g.fillStyle = b.beak; g.beginPath(); g.moveTo(wx + wr * 0.42, wy - wr * 0.14);
    if (opts.raider) { g.quadraticCurveTo(wx + wr * 0.85, wy - wr * 0.12, wx + wr * 0.72, wy + wr * 0.18); g.lineTo(wx + wr * 0.42, wy + wr * 0.04); }
    else { g.lineTo(wx + wr * 0.78, wy - wr * 0.06); g.lineTo(wx + wr * 0.42, wy + wr * 0.02); }
    g.fill(); g.restore();
    g.strokeStyle = 'rgba(200,230,255,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(wx, wy, wr, Math.PI, 0); g.stroke();
  }
  const podAtlases = {};
  function podAtlas(b) { return podAtlases[b.id] || (podAtlases[b.id] = makeAtlas((g, i) => drawPod(g, i, b), 2, 2, 1)); }
  const raiderAtlas = makeAtlas((g, i) => drawPod(g, i, { id: 'raider', ...HAWK, beak: '#f2b630' }, { raider: true }), 2, 2, 1);
  // a hawk in a space helmet with a little jetpack
  const spaceHawkAtlas = makeAtlas((g, i, n) => {
    g.translate(0, PAD);
    drawBirdHD(g, (i / n) * Math.PI * 2, { id: 'spacehawk', ...HAWK }, { talons: true, span: 1.15, longTail: true });
    const S0 = FW * 0.19, hx = FW * 0.47 + 0.78 * S0, hy = FH * 0.56 - 0.3 * S0, hr = 0.32 * S0;
    g.fillStyle = 'rgba(190,225,255,.28)'; g.strokeStyle = 'rgba(220,240,255,.95)'; g.lineWidth = 3;
    g.beginPath(); g.arc(hx + hr * 0.3, hy, hr * 1.9, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(hx - hr * 0.4, hy - hr * 1.1, hr * 0.45, hr * 0.18, -0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6a7380'; g.fillRect(FW * 0.47 - S0 * 0.4, FH * 0.56 - S0 * 0.62, S0 * 0.5, S0 * 0.3);
    g.fillStyle = i % 2 ? '#ffb347' : '#ffe08a'; g.beginPath(); g.moveTo(FW * 0.47 - S0 * 0.4, FH * 0.56 - S0 * 0.58);
    g.lineTo(FW * 0.47 - S0 * 0.9, FH * 0.56 - S0 * 0.47); g.lineTo(FW * 0.47 - S0 * 0.4, FH * 0.56 - S0 * 0.36); g.fill();
  }, BIRD_FRAMES, 4, 3, FH + PAD * 2);
  const raiderShip = cutout(raiderAtlas, 8.5), spaceHawk = cutout(spaceHawkAtlas, 9);
  // raiders face back toward the flock: mirror the art rather than turning it upside down
  for (const m of [raiderShip, spaceHawk]) { m.visible = false; m.scale.x = -1; sscene.add(m); }
  const raiderGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('rgba(255,90,90,.9)', 'rgba(255,60,60,.25)'), transparent: true, depthWrite: false }));
  raiderGlow.scale.setScalar(9); raiderGlow.visible = false; sscene.add(raiderGlow);
  // wingmate pods: other birds, each in its own little craft
  const WING_BIRDS = ['sparrow', 'swallow', 'cardinal', 'pigeon', 'goose', 'tern', 'mockingbird', 'albatross'];
  let pods = [];
  function setPods() {
    const want = Math.min(F.shipLv(S, 'wing'), 6);
    while (pods.length < want) {
      const i = pods.length, b = BIRDS.find((x) => x.id === WING_BIRDS[i % WING_BIRDS.length]);
      const m = cutout(podAtlas(b), POD_W), row = Math.floor(i / 2) + 1, sgn = i % 2 ? 1 : -1;
      m.userData.home = new THREE.Vector3(-row * 3.4, sgn * (1.3 * row) - 0.4, sgn > 0 ? -row * 1.2 : -row * 2.6);
      m.userData.phase = Math.random() * 6; sscene.add(m); pods.push(m);
    }
    while (pods.length > want) sscene.remove(pods.pop());
  }
  // lasers and sparks
  const LASERS = 8;
  const laserGeo = new THREE.BufferGeometry();
  laserGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LASERS * 6), 3));
  laserGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(LASERS * 6), 3));
  const lasers = new THREE.LineSegments(laserGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
  sscene.add(lasers);
  const laserData = Array.from({ length: LASERS }, () => ({ t: 0 }));
  function fireLaser(from, to, color) {
    const k = laserData.findIndex((l) => l.t <= 0); if (k < 0) return;
    Object.assign(laserData[k], { t: 0.28, from: from.clone(), to: to.clone(), c: new THREE.Color(color) });
  }
  const sSparkV = Array.from({ length: 40 }, () => new THREE.Vector3());
  const sSparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3)),
    new THREE.PointsMaterial({ size: 0.5, transparent: true, opacity: 0, depthWrite: false }));
  sscene.add(sSparks);
  let sBurst = 0;
  function spaceBurst(at, color, speed = 4) {
    const p = sSparks.geometry.attributes.position;
    for (let i = 0; i < 40; i++) { p.setXYZ(i, at.x, at.y, at.z); sSparkV[i].randomDirection().multiplyScalar(speed * (0.4 + Math.random())); }
    p.needsUpdate = true; sBurst = 1.2; sSparks.material.color.setStyle(color);
  }
  let lostPod = null;

  function bodyPlace(m, phi, maxS) {
    // phi: 0 = the bird is at this body; up to 0.5 it falls away; from 0.5 it comes back and swings past
    if (phi < 0.5) {
      const t = smooth(0, 1, phi / 0.5);
      m.position.set(lerp(-40, -520, t), lerp(-34, -70, t), lerp(-40, -640, t)); m.scale.setScalar(lerp(maxS, 1.2, t));
    } else {
      const t = (phi - 0.5) / 0.5;
      if (t < 0.85) {
        const g = Math.pow(t / 0.85, 2.2);
        m.position.set(lerp(260, 40, g), lerp(60, -22, g), lerp(-700, -95, g)); m.scale.setScalar(lerp(2.5, maxS * 0.8, g));
      } else {
        const k = smooth(0.85, 1, t);
        m.position.set(lerp(40, -40, k), lerp(-22, -34, k), lerp(-95, -40, k)); m.scale.setScalar(lerp(maxS * 0.8, maxS, k));
      }
    }
  }

  function updateLoop(dt) {
    const sp = S.space, body = F.SPACE[sp.dest];
    setTarget(body); labelsEl.style.display = 'none';
    if (shuttleBird !== S.bird) {
      shuttleBird = S.bird; shuttleBirdDef = F.birdOf(S);
      const c = shuttleAtlas.tex.image, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
      for (let i = 0; i < 2; i++) { g.save(); g.translate(i * FW, 0); g.beginPath(); g.rect(0, 0, FW, FH); g.clip(); drawShuttle(g, i); g.restore(); }
      shuttle.userData.tex.needsUpdate = true;
    }
    side.t += dt;
    const fight = side.threat && side.threat.phase === 'battle';
    ring.visible = !!body.ring; starGlow.visible = !!body.star; spaceEarth.visible = true;
    bodyPlace(spaceEarth, sp.u % 1, 40);
    bodyPlace(target, (sp.u + 0.5) % 1, body.star ? 14 : sp.dest === 0 ? 24 : 34);
    updateAsteroids(dt); updateMoonGear(dt);
    // the star field slides left (radians per second; quicker with BOOST, solar wind and warp, slower in a fight)
    const drift = (1 + S.boost + (side.solarK || 0) + 6 * (side.warpK || 0)) * (fight ? 0.4 : 1);
    for (const l of starLayers) l.rotation.y += dt * l.userData.rate * drift;
    spaceEarth.rotation.y += dt * 0.03; target.rotation.y += dt * 0.02;
    // the shuttle, steady with a little bob
    const bob = Math.sin(side.t * 1.3) * 0.4, jink = fight ? Math.sin(side.t * 5.1) * 1.1 : 0;
    shuttle.position.set(0, bob + jink, 0);
    shuttle.userData.roll = -0.04 + Math.sin(side.t * 0.9) * 0.02 + (fight ? Math.cos(side.t * 5.1) * 0.12 : 0);
    setFrame(shuttle, Math.floor(side.t * 14) % 2);
    // wingmates hold formation; in a fight they break and swirl around the raider
    setPods();
    const th = side.threat, b = th ? th.t - th.warn : -9, R = th && th.rPos;
    pods.forEach((m, i) => {
      const h = m.userData.home;
      let want = new THREE.Vector3(h.x + Math.sin(side.t * 0.6 + i) * 0.5, h.y + Math.sin(side.t * 1.3 + i * 1.7) * 0.4, h.z);
      if (th && R && b > -0.2 && b < BATTLE && !(th.type === 'spacehawk' && i > 3)) {
        const a = b * (2.2 + (i % 3) * 0.5) + i * 2.1, r = 3 + (i % 3);
        want = want.lerp(R.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 1.4) * 1.6, Math.sin(a) * r * 0.5)), smooth(-0.2, 0.6, b) * (1 - smooth(4.3, BATTLE, b)));
      }
      m.position.lerp(want, 1 - Math.exp(-dt * 6));
      m.userData.roll = Math.sin(side.t * 0.8 + i) * 0.05;
      setFrame(m, Math.floor(side.t * 14 + i) % 2);
    });
    updateRaiders(dt, fight, b);
    // lost pod tumbling away
    if (lostPod) {
      const f = lostPod.userData.fall; f.v += 6 * dt;
      lostPod.position.add(new THREE.Vector3(-8 * dt, -f.v * dt, -4 * dt)); lostPod.userData.roll += dt * 6;
      if (lostPod.position.y < -40) { sscene.remove(lostPod); lostPod = null; }
    }
    // lasers fade out quickly
    const lp = laserGeo.attributes.position, lc = laserGeo.attributes.color;
    laserData.forEach((l, k) => {
      if (l.t > 0) {
        l.t -= dt; const a = Math.max(0, l.t / 0.28);
        lp.setXYZ(k * 2, l.from.x, l.from.y, l.from.z); lp.setXYZ(k * 2 + 1, l.to.x, l.to.y, l.to.z);
        lc.setXYZ(k * 2, l.c.r * a, l.c.g * a, l.c.b * a); lc.setXYZ(k * 2 + 1, l.c.r * a, l.c.g * a, l.c.b * a);
      } else { lp.setXYZ(k * 2, 0, -999, 0); lp.setXYZ(k * 2 + 1, 0, -999, 0); }
    });
    lp.needsUpdate = true; lc.needsUpdate = true;
    if (sBurst > 0) {
      sBurst -= dt; sSparks.material.opacity = clamp(sBurst, 0, 1);
      const p = sSparks.geometry.attributes.position;
      for (let i = 0; i < 40; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i).addScaledVector(sSparkV[i], dt); p.setXYZ(i, v.x, v.y, v.z); }
      p.needsUpdate = true;
    } else sSparks.material.opacity = 0;
    // star streaks
    const wk = side.warpK || 0, sp2 = sstreakGeo.attributes.position, speedK = 160 * (fight ? 0.4 : 1) * (1 + 7 * wk);
    for (let i = 0; i < SSTREAK; i++) {
      const d = sstreakData[i]; d.x -= speedK * dt;
      if (d.x < -80) { d.x = 90 + Math.random() * 40; d.y = Math.random() * 60 - 30; d.z = Math.random() * 80 - 70; }
      sp2.setXYZ(i * 2, d.x, d.y, d.z); sp2.setXYZ(i * 2 + 1, d.x + 6 + 40 * wk, d.y, d.z);
    }
    if (wk > 0.01) sstreaks.material.color.setRGB(lerp(0.81, 0.6, wk), lerp(0.89, 0.85, wk), 1);
    sp2.needsUpdate = true; sstreakGeo.setDrawRange(0, SSTREAK * 2);
    // camera pulls back a little during a fight
    side.fightK = lerp(side.fightK || 0, th && b > -0.6 && b < BATTLE + 1.6 ? 1 : 0, 1 - Math.exp(-dt * 2.5));
    const shake = side.shake > 0 ? (side.shake -= dt, side.shake) : 0;
    fcam.position.set(3 - side.fightK * 4 + (Math.random() - 0.5) * shake, 4.2 + side.fightK * 2 + (Math.random() - 0.5) * shake, 22 + side.fightK * 10);
    fcam.lookAt(4 - side.fightK * 3, 0.5, 0);
    // the warp jump stretches the view
    const fov = 48 + 16 * wk; if (Math.abs(fcam.fov - fov) > 0.05) { fcam.fov = fov; fcam.updateProjectionMatrix(); }
    for (const m of [shuttle, ...pods, raiderShip, spaceHawk]) faceCamera(m);
    if (lostPod) faceCamera(lostPod);
    fr.render(sscene, fcam);
  }

  function updateRaiders(dt, fight, b) {
    const th = side.threat;
    raiderShip.visible = spaceHawk.visible = raiderGlow.visible = false;
    if (!th || (th.type !== 'raider' && th.type !== 'spacehawk')) return;
    const m = th.type === 'raider' ? raiderShip : spaceHawk;
    m.visible = true; raiderGlow.visible = b < BATTLE + 0.4;
    // the fight happens right around the shuttle, where the camera is looking
    // below and ahead of the shuttle: the open part of the screen, clear of the ticket and banner
    const C = new THREE.Vector3(5.5, -3, 1.5);
    if (b < 0) {
      // closes in from ahead during the warning
      const k = smooth(-th.warn, 0, b);
      m.position.set(lerp(18, 7.5, k), lerp(-1, -2.5, k) + Math.sin(side.t * 2) * 0.4, 1);
      m.userData.roll = 0.08;
    } else if (b <= BATTLE) {
      const P = C.clone().add(new THREE.Vector3(Math.sin(b * 1.9) * 3.8, Math.sin(b * 3.8) * 1.4, Math.cos(b * 1.9) * 1.5));
      if (b > 4.3) P.lerp(th.ok ? C.clone().add(new THREE.Vector3(5, -2, 0)) : (pods.length ? pods[pods.length - 1].position.clone() : shuttle.position.clone()).add(new THREE.Vector3(1, 1, 0)), smooth(4.3, 4.9, b));
      m.position.copy(P); th.rPos = P.clone();
      m.userData.roll = Math.cos(b * 1.9) * 0.3;
      // exchange fire: the raider misses every shot until the end; wingmates shoot back
      const n = Math.floor(b / 0.45);
      if (n !== th.lastHit) {
        th.lastHit = n;
        const targets = pods.length ? pods : [shuttle], tg = targets[n % targets.length].position;
        fireLaser(P, tg.clone().add(new THREE.Vector3(1.5, (n % 2 ? 1.6 : -1.6), 0)), '#ff4d5e'); Sound.laser();
        if (pods.length) fireLaser(pods[(n + 1) % pods.length].position, P.clone().add(new THREE.Vector3(n % 2 ? 0.8 : -0.8, 0.6, 0)), '#6fd2ff');
        else fireLaser(shuttle.position, P.clone().add(new THREE.Vector3(0.9, -0.5, 0)), '#6fd2ff');
        side.shake = Math.max(side.shake || 0, 0.12);
      }
    } else {
      const a = b - BATTLE, P = th.pEnd || (th.pEnd = m.position.clone());
      if (th.ok) { m.position.copy(P).add(new THREE.Vector3(a * 9, -a * a * 6, -a * 3)); m.userData.roll = a * 8; }
      else { m.position.copy(P).add(new THREE.Vector3(a * 10, a * 5, -a * 2)); m.userData.roll = 0.3; }
    }
    raiderGlow.position.copy(m.position).add(new THREE.Vector3(0, 0, -0.5));
    if (m === spaceHawk) setFrame(m, phaseFrame(side.t * (fight ? 9 : 5), BIRD_FRAMES)); else setFrame(m, Math.floor(side.t * 14) % 2);
  }
  // the result, shown as the banner announces it
  function spaceOutcome(th, r) {
    const m = th.type === 'raider' ? raiderShip : spaceHawk;
    if (th.ok) { spaceBurst(m.position, '#ffb347', 6); return; }
    if (r.lost === 'wingmate' && pods.length) {
      lostPod = pods.pop(); lostPod.userData.fall = { v: 0 }; spaceBurst(lostPod.position, '#ff6b6b', 4);
    } else spaceBurst(shuttle.position, '#b9b4a8', 5); // spilled space rocks
  }

  // ---- zoomed out: the oval orbit around Earth and the Moon ----
  const loopGeo = new THREE.BufferGeometry();
  const moonOval = new THREE.LineLoop(loopGeo, new THREE.LineDashedMaterial({ color: 0xffd36b, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85 }));
  scene.add(moonOval); moonOval.visible = false;
  // The oval runs from just behind Earth out to the far world, and its far
  // end touches that world's surface, as if the shuttle skims or lands on it.
  let moonOvalKey = '';
  function ovalFor(dest) {
    const D = dest === 0 ? 7 : 12, r = F.SPACE[dest].star ? 1.2 : dest === 0 ? 0.27 : 0.6;
    const near = -1.45, far = D - r * 0.95; // the far end sits on the surface; the near end swings round behind the Earth
    return { D, r, A: (far - near) / 2, C: (far + near) / 2, B: dest === 0 ? 1.1 : 1.6, Bn: dest === 0 ? 2.05 : 2.5 };
  }
  // An egg-shaped loop: narrow at the far world, wide at the Earth end so the path wraps
  // around the planet (clear of its surface) instead of cutting through it.
  function loopPoint(theta, side3, o) {
    const c = Math.cos(theta), w = lerp(o.B, o.Bn, (1 - c) / 2);
    return CHART_DIR.clone().multiplyScalar(o.C + o.A * c).addScaledVector(side3, w * Math.sin(theta));
  }
  function updateLoopChart(dt) {
    const sp = S.space, o = ovalFor(sp.dest);
    setTarget(F.SPACE[sp.dest]);
    const up = new THREE.Vector3(0, 1, 0), side3 = up.clone().cross(CHART_DIR).normalize(), tilt = side3.clone().applyAxisAngle(CHART_DIR, 0.5);
    if (moonOvalKey !== 'd' + sp.dest) {
      moonOvalKey = 'd' + sp.dest;
      const pts = []; for (let k = 0; k < 200; k++) pts.push(loopPoint(k / 200 * Math.PI * 2, tilt, o));
      loopGeo.setFromPoints(pts); moonOval.computeLineDistances();
    }
    const P = CHART_DIR.clone().multiplyScalar(o.D);
    chartBody.visible = true; chartBody.scale.setScalar(o.r); chartBody.position.copy(P); chartLine.visible = false; moonOval.visible = true;
    moon.visible = false; routeGroup.visible = false; nextSprite.visible = false; labelsEl.style.display = 'none';
    // theta = pi is the Earth end, 0 the far world: u = 0.5 is the swing past it
    const at = loopPoint(Math.PI + sp.u * Math.PI * 2, tilt, o);
    birdSprite.position.copy(at);
    const q = clamp(Z / SIDE_B, 0, 1), dist = (o.A + 1) / (Math.tan(camera.fov * D2R / 2) * Math.min(SW / SH, 1.6)) + 10 * Math.pow(1 - q, 2);
    birdSprite.scale.setScalar(0.05 + dist * 0.01);
    const focus = CHART_DIR.clone().multiplyScalar(o.C).lerp(at, smooth(0.75, 1, q));
    camera.position.copy(focus).addScaledVector(side3, -dist).add(new THREE.Vector3(0, dist * 0.45, 0));
    camera.lookAt(focus);
    sun.position.copy(camera.position).add(new THREE.Vector3(-2, 3, 0));
    renderer.render(scene, camera);
  }

  function leaveSpaceChart() {
    chartBody.visible = chartLine.visible = moonOval.visible = false; moon.visible = true; routeGroup.visible = true; nextSprite.visible = true;
  }

  // ======================================================================
  // Zoom: 0 = far out by the moon, 1 = beside the bird in profile.
  // ======================================================================
  let Z = 0.15, ZT = 0.15;
  const SIDE_A = 0.86, SIDE_B = 0.96;
  const camDir = new THREE.Vector3(0, 0, 1);
  function currentGeo() { return F.lerpGeo(F.legFrom(S), F.legTo(S), clamp(S.legKm / F.legLen(S), 0, 1)); }

  function updateGlobe(dt, pip) {
    // in the inset the globe is shown from a fixed middle distance, whatever the main zoom is
    const q = pip ? 0.5 : clamp(Z / SIDE_B, 0, 1);
    const dist = 1.05 + 11 * Math.pow(1 - q, 2.2);
    const g = currentGeo();
    const bv = geoVec(g.lat, g.lon, 1);
    // The camera is locked to the bird: the bird stays put, flying left to
    // right across the screen, and the Earth turns underneath it. Only the
    // heading is smoothed (it turns at each stop), never the position.
    camDir.copy(bv);
    const legT0 = clamp(S.legKm / F.legLen(S), 0, 1);
    const ahead = F.lerpGeo(F.legFrom(S), F.legTo(S), Math.min(1, legT0 + 0.01));
    let h = geoVec(ahead.lat, ahead.lon, 1).sub(bv);
    if (h.lengthSq() < 1e-12) h = side.camHead ? side.camHead.clone() : new THREE.Vector3(0, 1, 0).cross(bv);
    h.addScaledVector(bv, -h.dot(bv)).normalize();
    if (!side.camHead) side.camHead = h.clone();
    side.camHead.lerp(h, 1 - Math.exp(-dt * 3)).addScaledVector(bv, -side.camHead.dot(bv)).normalize();
    const upV = new THREE.Vector3().crossVectors(bv, side.camHead).normalize(); // screen up; screen right = heading
    const tilt = 0.55 * smooth(0.55, 1, q);
    const lockPos = camDir.clone().multiplyScalar(dist).addScaledVector(upV, -tilt * (dist - 0.95));
    const lockLook = camDir.clone().multiplyScalar(smooth(0.35, 0.95, q));
    // Extreme speed (a lap in under ~20 s): the camera lets go of the bird.
    // The whole globe stays in view, turning slowly, and the bird races around it.
    // based on the bird's own speed (not weather or boosts), with some leeway so it doesn't flip back and forth
    const lapSecs = 40075 / Math.max(F.baseSpeed(S), 1e-6);
    if (lapSecs < 25) side.freeOn = true; else if (lapSecs > 32) side.freeOn = false;
    side.freeK = lerp(side.freeK || 0, side.freeOn ? 1 : 0, 1 - Math.exp(-dt * 1.2));
    const fk = side.freeK;
    if (fk > 0.001) {
      if (!side.freeDir || fk < 0.02) side.freeDir = camDir.clone().setY(0).normalize();
      side.freeDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.06).normalize();
      const fd = side.freeDir.clone().multiplyScalar(Math.cos(0.38)).add(new THREE.Vector3(0, Math.sin(0.38), 0));
      // far enough back that the whole globe (and the bird's path) fits the screen
      const vh = Math.tan(camera.fov * D2R / 2), fit = 2 / Math.min(vh, vh * camera.aspect);
      const freePos = fd.multiplyScalar(Math.max(fit, dist));
      camera.position.copy(lockPos.lerp(freePos, fk));
      camera.up.copy(upV.clone().lerp(new THREE.Vector3(0, 1, 0), fk).normalize());
      // aim a little above the globe's centre so it sits below the ticket
      camera.lookAt(lockLook.lerp(new THREE.Vector3(0, 0.45, 0), fk));
    } else {
      camera.position.copy(lockPos); camera.up.copy(upV); camera.lookAt(lockLook);
    }
    // when the camera is free, the bird's dot hides behind the far side of the globe
    birdSprite.material.depthTest = fk > 0.5;
    // light rides with the camera (a little up and left) so the day/night line stays off the visible face
    sun.position.copy(camera.position).add(new THREE.Vector3(-0.15, 0.25, 0).multiplyScalar(camera.position.length()));
    // city lights read from far out; up close they would just be blurry blobs, so they fade away
    nightU.k.value = pip ? 0.8 : smooth(2.2, 5, dist);
    clouds.rotation.y += dt * 0.004; cloudShadow.rotation.y = clouds.rotation.y - 0.006; // shadows sit just off the clouds, away from the light
    const legT = clamp(S.legKm / F.legLen(S), 0, 1);
    birdSprite.position.copy(geoVec(g.lat, g.lon, ROUTE_R + 0.004 + legLift(F.legFrom(S), F.legTo(S), legT)));
    updateTail(legT);
    const bs = 0.004 + (dist - 1) * 0.03; birdSprite.scale.set(bs, bs, 1);
    const to = F.isNonstop(S) ? CITIES[S.start] : F.legTo(S); nextSprite.position.copy(geoVec(to.lat, to.lon, 1.007));
    const ns = (0.008 + (dist - 1) * 0.02) * (1 + 0.25 * Math.sin(performance.now() / 250)); nextSprite.scale.set(ns, ns, 1);
    renderer.render(scene, camera);
    if (pip) labelsEl.style.visibility = 'hidden'; else { labelsEl.style.visibility = ''; placeLabels(); }
  }
  // the round globe inset on iPad-size and wide screens, shown while you're in the close-up
  function setPip(on) {
    if (side.pipOn === on) return;
    side.pipOn = on; glCanvas.classList.toggle('pip', on);
    if (on) { const r = glCanvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = 1; camera.updateProjectionMatrix(); glCanvas.style.opacity = 1; }
    else sizeSide();
  }
  glCanvas.addEventListener('pointerdown', (e) => { if (side.pipOn) { e.stopPropagation(); ZT = 0.25; } });

  // City labels: the leg's two ends, when they are on the visible side.
  const labelsEl = $('labels');
  const labelA = document.createElement('div'), labelB = document.createElement('div');
  labelA.className = labelB.className = 'label3d'; labelsEl.append(labelA, labelB);
  function placeLabel(el, c) {
    if (!c || c.v || !c.name) { el.style.display = 'none'; return; }
    const v = geoVec(c.lat, c.lon, 1.01);
    const facing = v.clone().normalize().dot(camera.position.clone().sub(v).normalize()) > 0.05;
    const p = v.project(camera);
    if (!facing || p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.textContent = c.name;
    el.style.left = ((p.x + 1) / 2 * SW) + 'px'; el.style.top = ((1 - p.y) / 2 * SH) + 'px';
  }
  function placeLabels() {
    const on = Z < SIDE_A;
    labelsEl.style.display = on ? '' : 'none';
    if (!on) return;
    if (F.isNonstop(S)) {
      const recent = overName && performance.now() - overAt < 4000;
      placeLabel(labelA, CITIES[S.start]); placeLabel(labelB, recent ? CITIES.find((c) => c.name === overName) : null);
    } else { placeLabel(labelA, F.legFrom(S)); placeLabel(labelB, F.legTo(S)); }
  }

  // ---------- input ----------
  const pointers = new Map();
  let pinch0 = 0, tapStart = null, everZoomed = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); tapStart = null; }
    else tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) { ZT = clamp(ZT + Math.log(d / pinch0) * 0.42, 0, 1); Z = ZT; noteZoom(); }
      pinch0 = d;
    } else if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 12) tapStart = null;
  });
  const endPtr = (e) => {
    if (pointers.has(e.pointerId) && tapStart && pointers.size === 1 && performance.now() - tapStart.t < 300) doFlap();
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; if (!pointers.size) tapStart = null;
  };
  stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); ZT = clamp(ZT - e.deltaY * 0.0011, 0, 1); noteZoom(); }, { passive: false });
  $('zin').onclick = () => { ZT = ZT < SIDE_A ? clamp(ZT + 0.3, 0, 1) : 1; noteZoom(); };
  $('zout').onclick = () => { ZT = ZT > SIDE_B ? 0.8 : clamp(ZT - 0.3, 0, 1); noteZoom(); };
  function noteZoom() { if (!everZoomed) { everZoomed = true; $('hint').style.opacity = 0; } }

  // flapping: tap the sky, the button, or space. Holding the button keeps flapping.
  const flapBtn = $('flap');
  let holdTimer = null;
  // fromHold: auto-repeat while the button or Space is held. Hammering beats a
  // hawk; holding mostly helps you climb away from a hunter.
  function doFlap(fromHold) {
    if (!S || !running || side.photo) return;
    F.flap(S); side.flapRate += 3; Sound.flap();
    if (S.space && S.space.event && S.space.event.type === 'field') { const r = F.mine(S); if (r) { mineHit(r); } }
    const th = side.threat;
    if (th && !th.resolved) th.meter += th.type === 'hunter' ? 0.12 : (fromHold ? 0.35 : 1) / F.THREAT.taps(S);
    // during the fight itself every tap adds fighting spirit: a bigger reward if you win, fewer seeds lost if you don't
    else if (th && th.phase === 'battle' && !fromHold) { th.spirit = Math.min(SPIRIT_MAX, (th.spirit || 0) + 1); if (!S.space) featherBurst(hero.position.clone().add(new THREE.Vector3(0.6, 0.4, 0.3)), '#ffd36b', 0); }
  }
  flapBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); flapBtn.classList.add('down'); doFlap();
    clearInterval(holdTimer); holdTimer = setInterval(() => doFlap(true), 160);
  });
  const flapUp = () => { flapBtn.classList.remove('down'); clearInterval(holdTimer); };
  flapBtn.addEventListener('pointerup', flapUp); flapBtn.addEventListener('pointerleave', flapUp); flapBtn.addEventListener('pointercancel', flapUp);
  flapBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doFlap(); } });
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('select')) return;
    if (e.code === 'Space') { e.preventDefault(); doFlap(e.repeat); flapBtn.classList.add('down'); } // held space auto-repeats flaps
    if (e.key === '=' || e.key === '+') ZT = clamp(ZT + 0.08, 0, 1);
    if (e.key === '-') ZT = clamp(ZT - 0.08, 0, 1);
  });
  addEventListener('keyup', (e) => { if (e.code === 'Space') flapBtn.classList.remove('down'); });

  // ======================================================================
  // Sound: everything is synthesized, so nothing to download. Audio starts
  // on the player's first tap (browsers require it) and can be muted.
  // ======================================================================
  const Sound = (() => {
    let ctx = null, master = null, padBus = null, windGain = null, windFilter = null, voices = [], chordI = 0, scene = 'earth', nextChordAt = 0;
    let on = true;
    try { on = localStorage.getItem('flyway.sound') !== 'off'; } catch (e) {}
    const CHORDS = {
      earth: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [7, 11, 14, 19]],   // Cmaj7, Fmaj7, Am7, G
      space: [[0, 3, 7, 10], [-4, 0, 3, 7], [5, 8, 12, 15], [-2, 2, 5, 9]],     // darker, drifting
    };
    const hz = (semi) => 196 * 2 ** (semi / 12); // around G3
    function start() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = on ? 0.7 : 0; master.connect(ctx.destination);
      // soft pad through a lowpass, slow chord changes
      padBus = ctx.createGain(); padBus.gain.value = 0.05;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; padBus.connect(lp); lp.connect(master);
      for (let i = 0; i < 4; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = i % 2 ? 'triangle' : 'sine'; o.detune.value = (i - 1.5) * 4; g.gain.value = 0;
        o.connect(g); g.connect(padBus); o.start(); voices.push({ o, g });
      }
      // wind: looping filtered noise, louder the faster the bird flies
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.7;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); src.start();
      nextChordAt = 0; tick();
    }
    function tick() {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (t >= nextChordAt) {
        const ch = CHORDS[scene][chordI++ % 4];
        voices.forEach((v, i) => {
          v.o.frequency.setTargetAtTime(hz(ch[i] - (i === 0 ? 12 : 0)), t, 0.6);
          v.g.gain.setTargetAtTime(i === 0 ? 0.7 : 0.45, t, 1.2);
        });
        nextChordAt = t + 8;
      }
    }
    function noise(dur, freq, gain, type = 'lowpass', at = 0) {
      if (!ctx || !on) return;
      const t = ctx.currentTime + at, len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s0 = ctx.createBufferSource(); s0.buffer = b;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = gain;
      s0.connect(f); f.connect(g); g.connect(master); s0.start(t);
    }
    function tone(freq, dur, gain, type = 'sine', at = 0, slideTo = null) {
      if (!ctx || !on) return;
      const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    let lastFlap = 0;
    return {
      start, tick,
      get on() { return on; },
      toggle() {
        on = !on; try { localStorage.setItem('flyway.sound', on ? 'on' : 'off'); } catch (e) {}
        if (!ctx && on) start();
        if (master) master.gain.setTargetAtTime(on ? 0.7 : 0, ctx.currentTime, 0.05);
        return on;
      },
      setScene(sc) { if (sc !== scene) { scene = sc; nextChordAt = 0; } },
      setWind(level) { if (windGain) { windGain.gain.setTargetAtTime(0.06 * level, ctx.currentTime, 0.4); windFilter.frequency.setTargetAtTime(350 + 900 * level, ctx.currentTime, 0.4); } },
      flap() { const n = performance.now(); if (n - lastFlap < 70) return; lastFlap = n; noise(0.07, 700, 0.12); },
      stamp() { tone(150, 0.22, 0.35, 'sine', 0, 55); noise(0.03, 3000, 0.08, 'highpass'); tone(880, 0.5, 0.06, 'sine', 0.08); },
      chime() { [784, 988, 1175].forEach((f, i) => tone(f, 0.6, 0.07, 'sine', i * 0.09)); },
      coin() { tone(1319, 0.18, 0.06, 'square', 0); tone(1760, 0.25, 0.05, 'square', 0.06); },
      alarm() { [0, 0.22, 0.44].forEach((a) => { tone(880, 0.14, 0.08, 'square', a); tone(660, 0.14, 0.06, 'square', a + 0.11); }); },
      hit() { noise(0.09, 1500, 0.18, 'bandpass'); tone(220, 0.08, 0.08, 'triangle', 0, 110); },
      laser() { tone(1400, 0.13, 0.05, 'square', 0, 280); },
      win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 0.08, 'triangle', i * 0.08)); },
      lose() { [440, 349, 262].forEach((f, i) => tone(f, 0.45, 0.08, 'triangle', i * 0.14)); },
      chirp() { tone(1800, 0.08, 0.06, 'sine', 0, 2600); tone(2200, 0.1, 0.05, 'sine', 0.09, 3000); },
      launch() { noise(1.6, 220, 0.35); tone(60, 1.4, 0.2, 'sawtooth', 0, 30); },
    };
  })();
  addEventListener('pointerdown', () => Sound.start(), { capture: true });

  // ---------- haptics ----------
  // The iPhone's Taptic Engine through Capacitor's Haptics plugin in the app; a short vibration
  // on browsers that have one. Hooked to the same moments as the sound effects.
  const Haptic = (() => {
    const plug = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    let last = 0, on = true;
    try { on = localStorage.getItem('flyway.haptics') !== 'off'; } catch (e) {}
    const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
    return {
      get on() { return on; },
      set on(v) { on = v; try { localStorage.setItem('flyway.haptics', v ? 'on' : 'off'); } catch (e) {} },
      impact(style) {
        const now = performance.now(); if (!on || now - last < 45) return; last = now;
        const h = plug(); if (h) h.impact({ style }).catch(() => {}); else buzz(style === 'HEAVY' ? 28 : style === 'MEDIUM' ? 14 : 6);
      },
      notify(type) {
        if (!on) return; const h = plug();
        if (h) h.notification({ type }).catch(() => {}); else buzz(type === 'ERROR' ? [30, 40, 30] : [10, 30, 14]);
      },
    };
  })();
  for (const [k, fx] of Object.entries({ flap: () => Haptic.impact('LIGHT'), hit: () => Haptic.impact('MEDIUM'), stamp: () => Haptic.impact('MEDIUM'),
    coin: () => Haptic.impact('LIGHT'), launch: () => Haptic.impact('HEAVY'), win: () => Haptic.notify('SUCCESS'), lose: () => Haptic.notify('ERROR') })) {
    const orig = Sound[k]; if (typeof orig === 'function') Sound[k] = (...a) => { fx(); return orig(...a); };
  }

  // ---------- milestone moments ----------
  const cineEl = $('cine');
  let cineTimer = 0;
  function cinematic(title, sub, secs = 3.2) {
    $('cineTitle').innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    cineEl.classList.add('on'); side.cine = { t: 0, T: secs + 0.6 };
    clearTimeout(cineTimer); cineTimer = setTimeout(() => cineEl.classList.remove('on'), secs * 1000);
  }

  // ---------- speed barriers ----------
  function barrierBroken(which) {
    const light = which === 'light';
    cinematic(light ? 'Light speed!' : 'Sound barrier broken!', `+10% speed for ${F.BARRIER_SECS} seconds`, 3.4);
    $('flash').classList.remove('go'); void $('flash').offsetWidth; $('flash').classList.add('go');
    side.shake = Math.max(side.shake || 0, light ? 0.5 : 0.35); side.boomT = 0; side.boomLight = light;
    Sound.launch(); Haptic.impact('HEAVY');
  }

  // ---------- photo mode ----------
  // Hides the HUD so the world fills the screen; the shutter saves (or shares) a framed snapshot.
  const photoBar = $('photoBar');
  function photoMode(on) {
    side.photo = on; document.body.classList.toggle('photo', on); photoBar.hidden = !on;
    if (on) Haptic.impact('LIGHT');
  }
  function snapPhoto() {
    const close = +sideCanvas.style.opacity > 0.5, src = close ? sideCanvas : glCanvas;
    // draw a fresh frame and read it straight back, before the browser clears the buffer
    if (close) fr.render(S.space ? sscene : fscene, fcam); else renderer.render(scene, camera);
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const u = c.height / 900, pad = 26 * u;
    g.font = `800 ${34 * u}px 'Bricolage Grotesque', sans-serif`; g.textBaseline = 'bottom';
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 12 * u; g.fillStyle = '#fff';
    const where = S.space ? (F.SPACE[S.space.loop ? S.space.dest || 0 : 0] || {}).name || 'Space' : (F.legTo(S).name ? `${F.birdOf(S).name} · over ${currentPlace()}` : F.birdOf(S).name);
    g.textAlign = 'left'; g.fillText(where, pad, c.height - pad);
    g.font = `700 ${22 * u}px 'Bricolage Grotesque', sans-serif`; g.textAlign = 'right'; g.globalAlpha = 0.9;
    g.fillText('Flyway · freefowl.com', c.width - pad, c.height - pad);
    $('flash').classList.remove('go'); void $('flash').offsetWidth; $('flash').classList.add('go');
    Sound.stamp && Sound.stamp();
    c.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `flyway-${Date.now()}.png`, { type: 'image/png' });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Flyway' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      toast('Photo saved');
    }, 'image/png');
  }
  function currentPlace() {
    const a = F.legFrom(S), b = F.legTo(S), t = S.legKm / Math.max(1, F.legLen(S));
    return (t < 0.5 ? a : b).name || 'the open sky';
  }
  $('btnPhoto').onclick = () => photoMode(true);
  $('btnPhotoDone').onclick = () => photoMode(false);
  $('btnSnap').onclick = (e) => { e.stopPropagation(); snapPhoto(); };
  photoBar.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ---------- seeds that fly to the purse ----------
  // Big payouts pop up as "+123" over the bird and arc up into the seed counter, which bumps.
  let flyLast = 0;
  function heroScreen() {
    const r = stage.getBoundingClientRect();
    let v;
    if (+sideCanvas.style.opacity > 0.5 && !S.space) v = hero.position.clone().project(fcam);
    else v = birdSprite.position.clone().project(camera);
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  }
  function flySeeds(amount, label, from) {
    const now = performance.now(); if (!(amount > 0) || now - flyLast < 300) return; flyLast = now;
    const purse = document.querySelector('.purse .amt'); if (!purse) return;
    const [x0, y0] = from || heroScreen(), pr = purse.getBoundingClientRect(), x1 = pr.left + pr.width * 0.5, y1 = pr.top + pr.height * 0.5;
    const el = document.createElement('div'); el.className = 'seedfly num';
    el.textContent = `+${label || fmt(amount)}`; document.body.appendChild(el);
    const mx = (x0 + x1) / 2 + 40, my = Math.min(y0, y1) - 60;
    const anim = el.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0 - 34}px) scale(1.15)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${x1}px, ${y1}px) scale(.5)`, opacity: 0.2 },
    ], { duration: 1100, easing: 'cubic-bezier(.3,.7,.4,1)' });
    anim.onfinish = () => { el.remove(); purse.classList.remove('bump'); void purse.offsetWidth; purse.classList.add('bump'); Haptic.impact('LIGHT'); };
  }
  addEventListener('keydown', () => Sound.start(), { capture: true });

  // ======================================================================
  // UI
  // ======================================================================
  let S = null, running = false, buyMode = 1;
  const upRows = {};
  function buildUpgrades() {
    const ul = $('ups'); ul.innerHTML = '';
    for (const u of UPGRADES) {
      const li = document.createElement('li'); li.className = 'up';
      li.innerHTML = `<div class="ic" aria-hidden="true">${u.icon}<span class="lv num">0</span></div>
        <div><div class="nm">${u.name}</div><div class="fx"></div>${u.id === 'wings' || u.id === 'beak' ? '<div class="ms"><i></i></div>' : ''}</div>
        <button class="buy"><b class="num">0</b><small>buy</small></button>`;
      const btn = li.querySelector('.buy');
      btn.onclick = () => { if (F.buy(S, u.id, buyCount(u))) { refreshUpgrades(true); save(); } };
      upRows[u.id] = { li, lv: li.querySelector('.lv'), fx: li.querySelector('.fx'), ms: li.querySelector('.ms i'), btn, cost: btn.querySelector('b'), lab: btn.querySelector('small') };
      ul.append(li);
    }
  }
  function buyCount(u) {
    if (buyMode === 'max') return Math.max(1, F.maxAffordable(u, S.levels[u.id], S.seeds));
    return buyMode;
  }
  function refreshUpgrades() {
    for (const u of UPGRADES) {
      const r = upRows[u.id], L = S.levels[u.id], n = buyCount(u);
      const c = F.costN(u, L, n);
      r.lv.textContent = L;
      r.fx.textContent = `${u.blurb(L)}  →  ${u.blurb(L + n).replace(/^\d+ followers? · /, '')}`;
      if (u.id === 'flock') r.fx.textContent = `${L} follower${L === 1 ? '' : 's'} · ×${fmt(1 + 0.5 * L, 1)} seeds → ×${fmt(1 + 0.5 * (L + n), 1)}`;
      if (r.ms) {
        const nm = F.nextMilestone(L), prev = [0, ...F.MILESTONES].filter((m) => m <= L).pop();
        r.ms.style.width = nm ? ((L - prev) / (nm - prev) * 100) + '%' : '100%';
        r.ms.parentElement.title = nm ? `Doubles at level ${nm}` : 'All doublings reached';
      }
      r.cost.textContent = fmt(c);
      r.lab.textContent = n > 1 ? `buy ${n}` : (r.ms && F.nextMilestone(L) ? `×2 at ${F.nextMilestone(L)}` : 'buy');
      r.btn.disabled = c > S.seeds + 1e-9;
    }
  }
  document.querySelectorAll('.mode button').forEach((b) => b.onclick = () => {
    buyMode = b.dataset.mode === 'max' ? 'max' : +b.dataset.mode;
    document.querySelectorAll('.mode button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    refreshUpgrades(); refreshShip();
  });

  let hudName = '', hudNameAt = 0, lapCache = null;
  let overName = '', overAt = 0, lastOverToast = 0;
  // the bird just flew straight over a city on its nonstop circle
  function overflight(e) {
    overName = e.city.name; overAt = performance.now();
    // the announcement shows the first two times over a city, then stays quiet
    S.overCount = S.overCount || {};
    const n = S.overCount[e.city.i] = (S.overCount[e.city.i] || 0) + 1;
    if (e.first) { stamp(e.city, 0, true); Sound.stamp(); dailyHit('cities'); }
    else if (n <= 2 && overAt - lastOverToast > 2500) { lastOverToast = overAt; toast(`Flying over ${e.city.name}`); }
  }
  // km still to fly this lap, from the bird's position
  function lapKmLeft() {
    if (!lapCache || lapCache.route !== S.route) {
      const lens = []; for (let k = 0; k < S.route.length - 1; k++) lens.push(F.distKm(F.routePt(S, k), F.routePt(S, k + 1)));
      lapCache = { route: S.route, lens };
    }
    let km = lapCache.lens[S.ri] - S.legKm;
    for (let k = S.ri + 1; k < lapCache.lens.length; k++) km += lapCache.lens[k];
    return Math.max(0, km);
  }
  function setTrack(t) { $('trackFill').style.width = (t * 100) + '%'; $('trackDot').style.left = (t * 100) + '%'; }
  // an amount of seeds, written in the current world's currency
  function money(seeds) {
    if (S.space && S.space.loop) { const k = S.space.dest; return `${fmt(seeds / F.unitValue(k))} ${F.CURRENCY[k].icon}`; }
    return `${fmt(seeds)} 🌰`;
  }
  // the top-left counter: seeds on Earth, space rocks in space
  function setPurse(kind) {
    if (side.purse === kind) return; side.purse = kind;
    $('purseSeed').toggleAttribute('hidden', kind !== 'seeds'); $('purseRock').toggleAttribute('hidden', kind !== 'rocks'); // (svg needs the attribute)
    $('seeds').parentElement.setAttribute('aria-label', kind === 'rocks' ? 'Space rocks' : 'Seeds');
  }
  function refreshHud() {
    if (S.space) return refreshSpaceHud();
    setPurse('seeds');
    const v = F.speed(S), len = F.legLen(S), t = clamp(S.legKm / len, 0, 1);
    const g = currentGeo(), ocean = !isLand(g.lat, g.lon);
    const arrivalsPerSec = v / len;
    const rate = F.seedRate(S, ocean) + F.arrivalBonus(S) * Math.min(arrivalsPerSec, 20);
    $('seeds').textContent = fmt(S.seeds);
    $('rate').textContent = `+${fmt(rate)}/s`;
    const from = F.legFrom(S), to = F.legTo(S);
    $('speed').textContent = fmt(v, v < 10 ? 1 : 0);
    if (len / v < 2.5 || F.isNonstop(S)) {
      // cities pass faster than anyone can read: show the lap, name cities at a readable pace
      const legs = F.lapLegs(S), now = performance.now(), left = lapKmLeft();
      const ns = F.isNonstop(S), home = CITIES[S.start];
      if (!ns && now - hudNameAt > 900) { hudNameAt = now; hudName = to.name; }
      if (ns) {
        // only real places: the home city, and cities the bird has just flown straight over
        const recent = overName && now - overAt < 4000;
        $('fromCity').innerHTML = S.homeward ? `Heading home<small>straight to ${home.name}</small>` : `Lap ${fmt(S.lapsTotal + 1, 0)}<small>from ${home.name}</small>`;
        $('toCity').innerHTML = recent ? `${overName}<small>flying over</small>` : `${home.name}<small>${S.homeward ? 'home' : 'back home'}</small>`;
      } else {
        $('fromCity').innerHTML = `${F.isOrbit(S) ? 'Orbit' : 'Lap'} ${S.lapsFlown + 1}<small>${S.ri} of ${legs} stops</small>`;
        $('toCity').innerHTML = `${hudName}<small>passing</small>`;
      }
      $('legKm').textContent = `${fmt(left, 0)} km to go`;
      setTrack(clamp((S.ri + t) / legs, 0, 1));
      $('etaLabel').textContent = 'Lap done in'; $('eta').textContent = fmtTime(left / v);
      $('mini').textContent = `${$('fromCity').firstChild ? $('fromCity').firstChild.textContent : ''} · lap done in ${fmtTime(left / v)}`;
    } else {
      $('fromCity').innerHTML = `${from.name}<small>${S.lapsTotal >= 100 ? 'lap ' + fmt(S.lapsTotal + 1, 0) : from.region}</small>`;
      $('toCity').innerHTML = to.v ? `${to.name}<small>open sky</small>`
        : `${to.name}<small>${S.visited.includes(to.i) ? 'visited' : 'new · '}${S.visited.includes(to.i) ? '' : '+' + fmt(F.arrivalBonus(S)) + ' seeds'}</small>`;
      $('legKm').textContent = `${fmt(len - S.legKm, 0)} km left`;
      setTrack(t);
      $('etaLabel').textContent = 'Arrive in'; $('eta').textContent = fmtTime((len - S.legKm) / v);
      $('mini').textContent = `${from.name || 'Open sky'} → ${to.name || 'open sky'} · ${fmtTime((len - S.legKm) / v)}`;
    }
    const cap = F.boostCap(S.levels.stamina), b = Math.max(S.boost, F.flockBoost(S));
    $('ring').style.strokeDashoffset = 289 * (1 - b / cap);
    $('boostPct').textContent = `+${Math.round(b * 100)}%`;
    setFlapLabel('FLAP');
    $('stampCount').textContent = S.visited.length;
    $('btnShop').hidden = !(S.laps > 0 || S.feathers > 0); $('shopCount').textContent = fmt(S.feathers, 0);
    const rc = $('rushChip');
    $('stunChip').hidden = !(S.stun > 0);
    refreshWeatherChip();
    rc.hidden = !(S.rush > 0);
    if (S.rush > 0) $('rushLeft').textContent = Math.ceil(S.rush) + 's';
    const mig = $('btnMigrate');
    if (S.lapsFlown >= 1 && !S.space) {
      mig.classList.add('on');
      $('migrateSub').textContent = `+${fmt(F.migrateBonus(S), 0)} bonus golden feathers (this run's again)`;
    } else mig.classList.remove('on');
  }

  // postmark stamp when the bird lands somewhere
  const pm = $('postmark');
  let lastStampAt = 0;
  function stamp(city, bonus, first) {
    const now = performance.now();
    // at high speed first visits come constantly; space the stamps out
    if (now - lastStampAt < (F.legLen(S) / F.speed(S) < 2.5 ? 4000 : 1400)) return;
    lastStampAt = now;
    const d = new Date(), date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }).toUpperCase();
    const name = city.name.toUpperCase();
    pm.innerHTML = `<svg viewBox="0 0 172 172" width="172" height="172">
      <defs><path id="pmArc" d="M 26 86 A 60 60 0 1 1 146 86"/></defs>
      <circle cx="86" cy="86" r="80" fill="none" stroke="currentColor" stroke-width="4"/>
      <circle cx="86" cy="86" r="62" fill="none" stroke="currentColor" stroke-width="2"/>
      <text font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="${name.length > 11 ? 14 : 17}" fill="currentColor" letter-spacing="2"><textPath href="#pmArc" startOffset="50%" text-anchor="middle">${name}</textPath></text>
      <text x="86" y="92" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="22" fill="currentColor">${date}</text>
      <text x="86" y="116" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="700" font-size="12" fill="currentColor">${first ? 'FIRST VISIT' : 'FLYWAY'}</text>
      <path d="M 40 136 q 12 -8 24 0 t 24 0 t 24 0 t 24 0" fill="none" stroke="currentColor" stroke-width="3"/>
    </svg>${bonus > 0 ? `<div class="bonus">+${fmt(bonus)} 🌰</div>` : ''}`;
    pm.classList.remove('show'); void pm.offsetWidth; pm.classList.add('show');
  }

  // ---------- sheets ----------
  function open(id) { $(id).classList.add('on'); const f = $(id).querySelector('button.go, button, select'); if (f) f.focus(); }
  function close(id) { $(id).classList.remove('on'); }
  document.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => b.closest('.sheet').classList.remove('on'));
  document.querySelectorAll('.sheet').forEach((s) => s.addEventListener('click', (e) => {
    if (e.target === s && s.querySelector('[data-close]')) s.classList.remove('on');
  }));

  let pickBird = 'pigeon';
  // scale a w x h canvas so a bird's whole wingbeat (its box plus headroom) fits, centred
  // thumbnails use a level-wing glide pose, so they need only a little headroom
  function fitBird(g, w, h, pad = 24) {
    const k = Math.min(w / FW, h / (FH + pad * 2));
    g.translate((w - FW * k) / 2, (h - (FH + pad * 2) * k) / 2 + pad * k); g.scale(k, k);
  }
  const THUMB_PH = 0.35;
  // an unowned secret bird shows only as a dark shape with a question mark
  function silhouette(b) { return Object.assign({}, b, { body: '#1a1a22', wing: '#121218', belly: '#24242e', beak: '#1a1a22', cap: '#1a1a22', head: null, eye: '#1a1a22' }); }
  function birdPreview(cv, b, hidden) {
    cv.width = 240; cv.height = 150;
    const g = cv.getContext('2d'); fitBird(g, 240, 150);
    drawBirdHD(g, THUMB_PH, hidden ? silhouette(b) : b);
    if (hidden) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#b9a8ff'; g.font = "800 54px 'Bricolage Grotesque', sans-serif"; g.textAlign = 'center'; g.fillText('?', 120, 92); }
  }
  const TIER = Object.fromEntries(F.RARITY.map((r) => [r.id, r.name]));
  const TIER_RANK = Object.fromEntries(F.RARITY.map((r, i) => [r.id, i]));
  const starsOf = (id) => (S && S.stars && S.stars[id]) || 0;
  const starText = (id) => (starsOf(id) ? ' ' + '★'.repeat(starsOf(id)) : '');
  // mode: 'new' (first flight) or 'migrate'. When migrating, the feathers this
  // run earns can already be spent on a new bird here.
  function buildStart(mode) {
    const migrating = mode === 'migrate';
    const pending = migrating ? F.migrateBonus(S) : 0;
    const purse = S ? S.feathers + pending : 0;
    const owns = (b) => b.cost === 0 || (S && S.birds.includes(b.id));
    if (!owns(BIRDS.find((x) => x.id === pickBird) || BIRDS[0])) pickBird = S ? S.bird : 'pigeon';
    if (!S) pickBird = 'pigeon';
    const wrap = $('birdPick'); wrap.innerHTML = '';
    // your birds first, rarest at the top; egg-only birds you haven't hatched live in the flock book
    const list = BIRDS.filter((b) => owns(b) || !b.egg).sort((a, b) => (owns(b) - owns(a)) || (TIER_RANK[b.tier] - TIER_RANK[a.tier]));
    for (const b of list) {
      const have = owns(b), afford = migrating && !have && purse >= b.cost;
      const el = document.createElement('button'); el.className = 'bird tier-' + b.tier; el.type = 'button';
      el.disabled = !have && !afford; el.setAttribute('aria-pressed', b.id === pickBird);
      el.innerHTML = `<canvas aria-hidden="true"></canvas><b>${b.name}${starText(b.id)}</b>
        <small>${have ? b.trait : `${b.secret ? 'Specs unknown · ' : ''}🪶 ${fmt(b.cost, 0)}${afford ? ' · tap to unlock' : ''}`}</small>
        <i class="tier">${TIER[b.tier]}</i>`;
      birdPreview(el.querySelector('canvas'), b, b.secret && !have);
      el.onclick = () => { pickBird = b.id; wrap.querySelectorAll('.bird').forEach((x) => x.setAttribute('aria-pressed', x === el)); updateGo(); };
      wrap.append(el);
    }
    const sel = $('cityPick'); sel.innerHTML = '';
    const regions = [...new Set(CITIES.map((c) => c.region))];
    for (const r of regions) {
      const og = document.createElement('optgroup'); og.label = r;
      for (const c of CITIES.filter((x) => x.region === r).sort((p, q) => p.name.localeCompare(q.name))) og.append(new Option(c.name, c.i));
      sel.append(og);
    }
    sel.value = S ? String(F.legFrom(S).i) : String(CITIES.findIndex((c) => c.name === 'New York'));
    $('startTitle').textContent = migrating ? 'Migrate again' : 'Flyway';
    $('startLede').textContent = migrating
      ? `Start a fresh run and get ${fmt(pending, 0)} bonus golden feathers (${fmt(purse, 0)} in all). Spend them on new birds here, or on permanent perks in the feather shop. Your passport, birds and perks stay; upgrades and seeds reset.`
      : 'Pick a bird and a city. It flies the world on its own; you make it faster. Every lap around the globe earns 5 golden feathers for new birds.';
    function updateGo() {
      const b = BIRDS.find((x) => x.id === pickBird);
      $('btnGo').textContent = migrating ? (owns(b) ? 'Migrate' : `Unlock ${b.name} and migrate`) : 'Take off';
    }
    updateGo();
    $('btnStartCancel').hidden = !migrating;
    $('btnGo').onclick = () => {
      const start = +sel.value;
      if (migrating) {
        const b = BIRDS.find((x) => x.id === pickBird);
        S = F.migrateAgain(S, owns(b) ? pickBird : S.bird, start).state;
        if (!owns(b) && F.buyBird(S, b.id)) { S.bird = b.id; toast(b.secret ? `${b.name} unlocked: ${b.trait}!` : `${b.name} unlocked!`); }
      } else S = F.newState(pickBird, start);
      close('startSheet'); beginFlight(true);
    };
    $('btnStartCancel').onclick = () => close('startSheet');
  }

  // ---------- feather shop ----------
  function openShop() {
    const box = $('shopList'); box.innerHTML = '';
    $('shopPurse').textContent = fmt(S.feathers, 0);
    for (const p of F.PERKS) {
      const L = S.perks[p.id] || 0, maxed = p.max && L >= p.max, c = F.perkCost(p, L);
      const li = document.createElement('li'); li.className = 'up';
      li.innerHTML = `<div class="ic" aria-hidden="true">${p.icon}<span class="lv num">${L}</span></div>
        <div><div class="nm">${p.name}</div><div class="fx">${p.blurb(L)}${maxed ? '' : '  →  ' + p.blurb(L + 1).replace(/^start each migration with /, '')}</div></div>
        <button class="buy feather"${maxed || S.feathers < c ? ' disabled' : ''}><b class="num">${maxed ? 'Max' : '🪶 ' + fmt(c, 0)}</b><small>${maxed ? '' : 'forever'}</small></button>`;
      li.querySelector('button').onclick = () => { if (F.buyPerk(S, p.id)) { save(); openShop(); refreshHud(); refreshUpgrades(); } };
      box.append(li);
    }
    // golden eggs: hatch a random bird, mostly common and uncommon, rarely more
    const eggBox = $('shopEggs');
    eggBox.innerHTML = `<div class="egg-row"><div class="egg-ic" aria-hidden="true">🥚</div>
      <div><div class="nm">Golden egg</div><div class="fx">Hatches a random bird. A bird you already have earns a ★ (+15% speed and seeds, up to ${F.MAX_STARS}).</div>
      <div class="odds">${F.RARITY.map((r) => `<span style="color:${r.color}">${r.name} ${r.weight < 1 ? r.weight.toFixed(1) : Math.round(r.weight)}%</span>`).join(' · ')}</div></div>
      <button class="buy feather" id="btnHatch"${S.feathers < F.EGG_COST ? ' disabled' : ''}><b class="num">🪶 ${F.EGG_COST}</b><small>hatch</small></button></div>`;
    $('btnHatch').onclick = () => { const r = F.hatchEgg(S); if (r) { save(); showHatch(r); } };
    // the flock book: every species, grouped by rarity; ones you haven't found are silhouettes
    const book = $('flockBook'); book.innerHTML = '';
    const ownedN = BIRDS.filter((b) => F.ownsBird(S, b.id)).length;
    $('bookCount').textContent = `${ownedN} of ${BIRDS.length}`;
    for (const r of [...F.RARITY].reverse()) {
      const group = BIRDS.filter((b) => b.tier === r.id);
      const h = document.createElement('div'); h.className = 'book-h'; h.style.color = r.color; h.textContent = `${r.name} · ${group.filter((b) => F.ownsBird(S, b.id)).length}/${group.length}`;
      book.append(h);
      const grid = document.createElement('div'); grid.className = 'book-grid';
      for (const b of group) {
        const have = F.ownsBird(S, b.id), cell = document.createElement('div');
        cell.className = 'book-cell' + (have ? ' got' : ''); cell.style.setProperty('--tc', r.color);
        cell.title = have ? `${b.name}: ${b.trait}` : (b.secret ? 'A secret' : 'Not found yet');
        cell.innerHTML = `<canvas width="72" height="45"></canvas><span>${have ? b.name + starText(b.id) : '?'}</span>`;
        const g = cell.querySelector('canvas').getContext('2d'); fitBird(g, 72, 45); drawBirdHD(g, THUMB_PH, have ? b : silhouette(b));
        if (have) cell.onclick = () => toast(`${b.name} (${r.name})${starText(b.id)}: ${b.trait}`);
        grid.append(cell);
      }
      book.append(grid);
    }
    const birds = $('shopBirds'); birds.innerHTML = '';
    for (const b of BIRDS.filter((x) => x.cost > 0 && !x.egg)) {
      const have = S.birds.includes(b.id), li = document.createElement('li'); li.className = 'up';
      li.innerHTML = `<div class="ic bird-ic" aria-hidden="true"><canvas width="88" height="55"></canvas></div>
        <div><div class="nm">${b.name} <i class="tier tier-${b.tier}">${TIER[b.tier]}</i></div><div class="fx">${b.secret && !have ? 'Specs unknown until you own it' : b.trait}</div></div>
        <button class="buy feather"${have || S.feathers < b.cost ? ' disabled' : ''}><b class="num">${have ? 'Owned' : '🪶 ' + fmt(b.cost, 0)}</b><small>${have ? 'pick when you migrate' : 'unlock'}</small></button>`;
      const cv = li.querySelector('canvas'), g = cv.getContext('2d'); fitBird(g, 88, 55); drawBirdHD(g, THUMB_PH, b.secret && !have ? silhouette(b) : b);
      li.querySelector('button').onclick = () => { if (F.buyBird(S, b.id)) { save(); toast(b.secret ? `${b.name} unlocked: ${b.trait}!` : `${b.name} unlocked. Pick it when you migrate.`); openShop(); } };
      birds.append(li);
    }
    open('shopSheet');
  }
  // the hatching moment: the egg wobbles, cracks, and the bird bursts out in its rarity's colour
  function showHatch(r) {
    const box = $('hatch'), tier = F.RARITY.find((x) => x.id === r.tier), b = r.bird;
    box.style.setProperty('--tc', tier.color); box.hidden = false; box.className = 'hatch wobble';
    $('hatchName').textContent = ''; $('hatchInfo').textContent = '';
    const cv = $('hatchBird'), g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    Sound.chirp && Sound.chirp(); Haptic.impact('LIGHT');
    const big = TIER_RANK[r.tier] >= 3;
    setTimeout(() => {
      box.className = 'hatch open' + (big ? ' big' : '');
      fitBird(g, cv.width, cv.height); drawBirdHD(g, THUMB_PH, b);
      $('hatchName').innerHTML = `${b.name} <i style="color:${tier.color}">${tier.name}</i>`;
      $('hatchInfo').textContent = r.isNew ? `New bird! ${b.trait}` : r.star ? `You have this one: ★ ${r.star} of ${F.MAX_STARS} (+15% speed and seeds)` : `Already at ${F.MAX_STARS} ★: ${Math.round(F.EGG_COST * 0.4)} feathers back`;
      if (big) { Sound.win(); Haptic.notify('SUCCESS'); } else { Sound.stamp(); Haptic.impact('MEDIUM'); }
    }, big ? 1600 : 1000);
    $('hatchOk').onclick = () => { box.hidden = true; openShop(); };
  }
  $('btnShop').onclick = openShop;
  // the trip meter can be minimized to a thin bar; the choice is remembered
  const ticketEl = document.querySelector('.ticket');
  function setTicketMini(on) {
    ticketEl.classList.toggle('mini', on); $('btnTicket').setAttribute('aria-label', on ? 'Show the trip meter' : 'Minimize the trip meter');
    $('btnTicket').textContent = on ? '▾' : '▴';
    try { localStorage.setItem('flyway.ticketMini', on ? '1' : '0'); } catch (e) {}
  }
  $('btnTicket').onclick = (e) => { e.stopPropagation(); setTicketMini(!ticketEl.classList.contains('mini')); };
  ticketEl.addEventListener('click', () => { if (ticketEl.classList.contains('mini')) setTicketMini(false); });
  try { if (localStorage.getItem('flyway.ticketMini') === '1') setTicketMini(true); } catch (e) {}
  const soundBtn = $('btnSound');
  const showSound = () => { soundBtn.textContent = Sound.on ? '🔊' : '🔇'; soundBtn.setAttribute('aria-label', Sound.on ? 'Mute sound' : 'Turn sound on'); };
  soundBtn.onclick = () => { Sound.start(); Sound.toggle(); showSound(); };
  showSound();
  $('btnShopMenu').onclick = () => { close('menuSheet'); openShop(); };

  $('btnMigrate').onclick = () => { buildStart('migrate'); open('startSheet'); };
  const lapNoAsk = () => { if ($('lapNoAsk').checked) { S.noLapPrompt = true; save(); } };
  $('btnLapMigrate').onclick = () => { lapNoAsk(); close('lapSheet'); buildStart('migrate'); open('startSheet'); };
  $('btnLapKeep').onclick = () => { lapNoAsk(); close('lapSheet'); };
  $('btnPassport').onclick = () => {
    const box = $('stamps'); box.innerHTML = '';
    const regionCol = { 'North America': '#2557a7', 'South America': '#2b8a57', Africa: '#b5651d', Europe: '#7a3ea0', Asia: '#cf2e3a', Oceania: '#11808a' };
    // stamps earned since the passport was last opened thump down one after another
    const seen = S.passSeen || 0, order = new Map(S.visited.map((ci, k) => [ci, k])); let fresh = 0;
    for (const c of CITIES) {
      const got = S.visited.includes(c.i), d = document.createElement('div');
      d.className = 'stamp' + (got ? ' got' : ''); if (got) d.style.color = regionCol[c.region];
      if (got) { const sp = document.createElement('span'); sp.textContent = c.name; d.append(sp); d.style.setProperty('--rot', `${Math.round((hash(c.i, 5) - 0.5) * 24)}deg`); }
      else d.textContent = '?';
      if (got && order.get(c.i) >= seen && seen > 0) { d.classList.add('fresh'); d.style.setProperty('--d', `${0.25 + fresh++ * 0.18}s`); }
      d.title = got ? `${c.name}, ${c.region}` : `Somewhere in ${c.region}`;
      box.append(d);
    }
    if (fresh) setTimeout(() => Sound.stamp(), 300);
    S.passSeen = S.visited.length;
    for (const b of F.SPACE) {
      const got = S.cosmos.includes(b.id), d = document.createElement('div');
      d.className = 'stamp world' + (got ? ' got' : ''); if (got) d.style.color = '#5b3d8a';
      d.textContent = got ? b.short : '🌑'; d.title = got ? b.name : 'Somewhere out in space';
      box.append(d);
    }
    $('passText').textContent = `${S.visited.length} of ${CITIES.length} cities and ${S.cosmos.length} of ${F.SPACE.length} worlds stamped.`;
    open('passSheet');
  };
  $('btnMenu').onclick = () => {
    const b = F.birdOf(S);
    $('menuStats').innerHTML = [
      ['Bird', b.name], ['Distance flown', fmt(S.totalKm) + ' km'], ['Cities reached', fmt(S.arrivals, 0)],
      ['Migrations', S.laps], ['Golden feathers', `🪶 ${fmt(S.feathers, 0)} to spend`],
      ['Perks', `×${fmt(F.perkSpeed(S), 2)} speed · ×${fmt(F.perkSeeds(S), 2)} seeds`], ['Birds', `${S.birds.length} of ${BIRDS.length}`],
      ['Laps this run', S.lapsFlown], ['This lap', `${S.ri} of ${F.lapLegs(S)} stops`],
      ['Orbital speed', F.isOrbit(S) ? 'Reached · satellite orbits' : `${fmt(F.baseSpeed(S))} of ${fmt(F.ORBIT_SPEED, 0)} km/s`],
      ['Lifetime laps', F.isNonstop(S) ? `${fmt(S.lapsTotal, 0)} · nonstop` : `${S.lapsTotal} of ${F.NONSTOP_AT} to nonstop`], ['Space trips', `${fmt(S.moon.trips, 0)} round trips`],
      ['Worlds reached', `${S.cosmos.length} (+${S.cosmos.length * 25}% seeds)`],
    ].map(([k, v]) => `<div>${k}<strong>${v}</strong></div>`).join('');
    $('optLapPrompt').checked = !S.noLapPrompt;
    open('menuSheet');
  };
  // two taps instead of confirm(), which webviews and app shells often block
  let resetArmed = 0;
  $('btnReset').onclick = () => {
    const btn = $('btnReset');
    if (Date.now() - resetArmed > 4000) {
      resetArmed = Date.now(); btn.textContent = 'Tap again to erase your bird, seeds, feathers and passport';
      setTimeout(() => { if (Date.now() - resetArmed >= 4000) btn.textContent = 'Start over from scratch'; }, 4100);
      return;
    }
    resetArmed = 0; btn.textContent = 'Start over from scratch';
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    S = null; running = false; close('menuSheet'); buildStart('new'); open('startSheet');
  };

  // ---------- save / load ----------
  function save() {
    if (!S) return;
    S.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1 && s.levels) return F.upgradeSave(s); } catch (e) {}
    return null;
  }
  // Offline: fly on without flaps for up to 8 hours.
  function catchUp() {
    const away = clamp((Date.now() - (S.lastSave || Date.now())) / 1000, 0, 8 * 3600);
    if (away < 30) return null;
    const seeds0 = S.seeds, km0 = S.totalKm, arr0 = S.arrivals; S.boost = 0; S.rush = 0; S.stun = 0; S.wx = { type: 'clear', left: 0 }; side.bug = null; side.threat = null;
    const steps = Math.min(4000, Math.ceil(away)), dt = away / steps;
    let lap = false;
    for (let i = 0; i < steps; i++) for (const e of F.step(S, dt, false)) if (e.lapDone) lap = true;
    return { away, seeds: S.seeds - seeds0, km: S.totalKm - km0, cities: S.arrivals - arr0, lap };
  }

  // ---------- Bug Catcher ----------
  // Every so often a bug crosses below the bird; it dives, catches it at the
  // moment the dive bottoms out, and the rush starts.
  const toastEl = $('toast');
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600);
  }
  function tickBugs(dt) {
    const L = S.levels.bugs || 0;
    if (side.bug) {
      side.bug.t += dt;
      if (!side.bug.caught && side.bug.t >= DIVE) {
        side.bug.caught = true;
        const rush = F.catchBug(S); dailyHit('bugs'); Sound.chirp();
        burstAtBeak();
        toast(`Caught a bug! 2× speed and 3× seeds for ${Math.ceil(rush)}s`);
      }
      if (side.bug.t >= DIVE + CLIMB) side.bug = null;
      return;
    }
    if (!L || side.threat || S.space) return;
    side.bugT -= dt;
    if (side.bugT <= 0) { side.bug = { t: 0, caught: false }; side.bugT = F.bugEvery(L) / (F.birdOf(S).bugs || 1) * (0.75 + Math.random() * 0.5); }
  }

  // ---------- predators ----------
  // Live play only, after the first few cities. A threat warns, the player
  // fills its meter (hammer FLAP vs a hawk or owl, hold FLAP to climb from a
  // hunter), and at the strike it either misses (bonus) or connects (penalty).
  const banner = $('threat'), meterEl = $('threatMeter');
  const THREATS = {
    hawk: { icon: '🦅', name: 'hawk', ask: 'Hawk above! Tap FLAP fast to dodge' },
    owl: { icon: '🦉', name: 'owl', ask: 'Owl in the dark! Tap FLAP fast to dodge' },
    hunter: { icon: '🎯', name: 'hunter', ask: 'Hunter below! Hold FLAP to climb out of range' },
    raider: { icon: '🛸', name: 'raider ship', ask: 'Raider ship! Tap BOOST fast to evade', space: true },
    spacehawk: { icon: '🦅', name: 'space hawk', ask: 'A hawk in a space helmet! Tap BOOST fast to evade', space: true },
  };
  const anySheetOpen = () => !!document.querySelector('.sheet.on');
  function pickThreat() {
    if (S.space) return Math.random() < 0.55 ? 'raider' : 'spacehawk';
    const g = currentGeo(), hour = side.skyHour != null ? side.skyHour : localHour(g.lon), v = F.speed(S);
    const night = hour < 6 || hour > 19.5;
    // no hunters: birds of prey only, an owl after dark and a hawk by day
    return night ? 'owl' : 'hawk';
  }
  // The outcome is fixed the moment the warning ends (did the player fill the
  // meter?), but it is only announced after the 5-second battle.
  function clearThreat() {
    side.threat = null; side.bug = null; side.burst = 0; banner.hidden = true; banner.classList.remove('ok', 'bad', 'fight');
    flapBtn.classList.remove('alarm'); dropCarried();
    for (const m of [hawkMesh, owlMesh, hunterMesh]) m.visible = false;
  }
  function tickThreats(dt) {
    const th = side.threat;
    // safety net: a threat from the wrong place (Earth vs space) or one that has outlived its fight is dropped
    if (th && ((!!THREATS[th.type].space) !== !!(S.space && S.space.loop) || th.t > th.warn + BATTLE + 6)) { clearThreat(); return; }
    if (th) {
      if (anySheetOpen() && th.phase === 'warn') return; // never strike behind a dialog
      th.t += dt;
      if (th.phase === 'warn') {
        if (th.type === 'hunter' && flapBtn.classList.contains('down')) th.meter += dt / F.THREAT.climb(S);
        th.meter = clamp(th.meter, 0, 1.2);
        meterEl.style.width = Math.min(100, th.meter * 100) + '%';
        if (th.t >= th.warn) startBattle(th);
      } else if (th.phase === 'battle') {
        // a tug-of-war bar for suspense; it gives nothing away
        const b = th.t - th.warn;
        meterEl.style.width = (50 + 34 * Math.sin(b * 3.4) * Math.cos(b * 1.3 + 0.6)) + '%';
        // after the opening line, rally the player to keep tapping
        if (b > 1.1) $('threatText').textContent = rallyText(th);
        if (b >= BATTLE) finishBattle(th);
      } else if (th.t >= th.warn + BATTLE + 3) {
        side.threat = null; banner.hidden = true; banner.classList.remove('ok', 'bad', 'fight');
      }
      return;
    }
    if (S.arrivals < 3 || side.bug || (S.space && (!S.space.loop || S.space.event)) || anySheetOpen() || (!S.space && S.wx && S.wx.type === 'storm')) return;
    side.threatT -= dt;
    if (side.threatT > 0) return;
    side.threatT = F.THREAT.every(S);
    const type = side.forceType || pickThreat(); side.forceType = null;
    side.threat = { type, t: 0, warn: F.THREAT.warn(S), meter: 0, phase: 'warn', resolved: false, ok: false, lastHit: -1 };
    banner.hidden = false; banner.classList.remove('ok', 'bad', 'fight');
    $('threatIcon').textContent = THREATS[type].icon; $('threatText').textContent = THREATS[type].ask;
    meterEl.style.width = '0%'; flapBtn.classList.add('alarm'); Sound.alarm();
  }
  // Fighting spirit: taps during the 5-second fight. It can't change who wins (that's settled),
  // but it pays out either way, so there's always a reason to keep hammering the button.
  const SPIRIT_MAX = 25, spiritPct = (th) => Math.round(Math.min(SPIRIT_MAX, th.spirit || 0) * 4); // up to +100%
  const RALLY = [
    'Keep tapping! Every tap adds fighting spirit',
    'Dig deep! Tap FLAP to fight harder',
    "Don't give up! Tap, tap, tap!",
    'Hit FLAP! Spirit means a bigger reward',
    'Fight back! Win big or lose less',
  ];
  function rallyText(th) {
    const b = th.t - th.warn, line = RALLY[Math.floor(b / 1.25) % RALLY.length].replace('FLAP', S.space ? 'BOOST' : 'FLAP');
    const p = spiritPct(th);
    return p ? `${line} · spirit +${p}%` : line;
  }
  function startBattle(th) {
    th.phase = 'battle'; th.resolved = true; th.ok = th.meter >= 0.999 || (!THREATS[th.type].space && !!F.birdOf(S).fire); th.spirit = 0;
    th.fire = !THREATS[th.type].space && !!F.birdOf(S).fire; // a dragon breathes fire through the whole fight
    banner.classList.add('fight'); // the FLAP button keeps pulsing: taps still count for spirit
    const name = THREATS[th.type].name, flockUp = S.levels.flock > 0;
    $('threatText').textContent = THREATS[th.type].space
      ? (F.shipLv(S, 'wing') > 0 ? `Your wingmates are dogfighting the ${name}…` : `Dodging the ${name}'s lasers…`)
      : th.type === 'hunter'
      ? (flockUp ? 'Under fire! The flock weaves through the shots…' : 'Under fire! Weaving through the shots…')
      : (flockUp ? `The flock is fighting the ${name}…` : `Your bird is fighting the ${name}…`);
  }
  function finishBattle(th) {
    th.phase = 'done';
    const name = THREATS[th.type].name, sp = spiritPct(th) / 100;
    banner.classList.remove('fight'); flapBtn.classList.remove('alarm');
    // what the player's fighting spirit earned or saved, added to the result line
    const extra = (gain) => { if (!(gain > 0)) return ''; S.seeds += gain; S.runSeeds += gain; return gain; };
    if (THREATS[th.type].space) {
      if (th.ok) {
        const r = F.spaceMiss(S); banner.classList.add('ok'); meterEl.style.width = '100%'; dailyHit('fights'); Sound.win();
        $('threatText').textContent = `The ${name} is driven off! +${money(r)}`;
      } else {
        const r = F.spaceHit(S); banner.classList.add('bad'); meterEl.style.width = '0%'; Sound.lose();
        $('threatText').textContent = r.lost === 'wingmate' ? `The ${name} knocked out a wingmate. Slowed for ${F.THREAT.STUN}s.` : `The ${name} blasted loose ${money(r.seeds)}. Slowed for ${F.THREAT.STUN}s.`;
      }
      spaceOutcome(th, th.ok ? null : { lost: F.shipLv(S, 'wing') < pods.length ? 'wingmate' : 'rocks' });
      refreshShip(); return;
    }
    if (th.ok) {
      let bonus = F.predatorMiss(S); dailyHit('fights'); Sound.win();
      bonus += extra(bonus * sp) || 0;
      flySeeds(bonus);
      banner.classList.add('ok'); meterEl.style.width = '100%';
      $('threatText').textContent = th.type === 'hunter'
        ? `Out of range! The hunter gave up. +${fmt(bonus)} seeds`
        : `The flock drove off the ${name}! +${fmt(bonus)} seeds`;
      if (!S.levels.flock && th.type !== 'hunter') $('threatText').textContent = `You fought off the ${name}! +${fmt(bonus)} seeds`;
      return;
    }
    const r = F.predatorHit(S); Sound.lose();
    banner.classList.add('bad'); meterEl.style.width = '0%';
    // spirit claws back part of the lost seeds (up to 60%)
    const saved = r.lost === 'seeds' ? extra(r.seeds * Math.min(0.6, sp * 0.6)) || 0 : 0;
    if (saved) r.seeds -= saved;
    $('threatText').textContent = r.lost === 'follower'
      ? (th.type === 'hunter' ? `The hunter hit one of your flock. Slowed for ${F.THREAT.STUN}s.` : `The ${name} carried off one of your flock. Slowed for ${F.THREAT.STUN}s.`)
      : `The ${name} knocked loose ${fmt(r.seeds)} seeds${saved ? ` (your fight saved ${fmt(saved)})` : ''}. Slowed for ${F.THREAT.STUN}s.`;
    showOutcome(th, r);
    refreshUpgrades();
  }

  // ---------- weather (game side) ----------
  let lastForecastAt = 0, boltT = 5;
  function forecast(e) {
    if (e.type !== 'arrive') return;
    const w = F.WEATHER[e.wx];
    // at high speed legs pass in a blink, so only call out the forecast when it will be felt
    const legSecs = F.legLen(S) / Math.max(F.speed(S), 1e-6), now = performance.now();
    if (!w || e.wx === 'clear' || legSecs < 4 || now - lastForecastAt < 6000) return;
    lastForecastAt = now;
    const dest = F.legTo(S).v ? 'on this lap' : `on the way to ${F.legTo(S).name}`;
    setTimeout(() => toast(`${w.icon} ${w.name} ${dest}: ${F.wxNote(S, e.wx)}`), 900);
  }
  function tickWeather(dt) {
    if (S.space || !S.wx || S.wx.type !== 'storm') return;
    boltT -= dt;
    if (boltT > 0) return;
    boltT = 4 + Math.random() * 5;
    lightning();
    // the crack spooks the flock: any flap boost is lost
    S.boost = 0; side.shake = Math.max(side.shake || 0, 0.18);
  }
  function refreshWeatherChip() {
    const el = $('wx');
    if (S.space) { el.className = 'wx wx-space'; el.textContent = S.space.loop ? `🚀 Earth–${F.SPACE[S.space.dest].short} loop · ${fmt(S.space.trips, 0)} round trip${S.space.trips === 1 ? '' : 's'} · ${F.CURRENCY[S.space.dest].icon} ${F.CURRENCY[S.space.dest].name}` : S.space.arrived ? '🌌 In orbit · foraging continues' : '🌌 Deep space'; return; }
    const wx = (S.wx && S.wx.type) || 'clear', w = F.WEATHER[wx];
    el.className = 'wx wx-' + wx;
    el.textContent = `${w.icon} ${w.name}` + (w.note ? ` · ${F.wxNote(S, wx)}` : '') + (S.wx.left > 0 ? ` · ${Math.ceil(S.wx.left)}s` : '');
  }

  // ---------- space: HUD, arrivals, expedition panel ----------
  function setFlapLabel(t) { const el = $('flapLabel'); if (el.textContent !== t) { el.textContent = t; flapBtn.setAttribute('aria-label', t === 'BOOST' ? 'Boost the shuttle' : 'Flap for a speed boost'); } }
  function refreshSpaceHud() {
    setFlapLabel('BOOST');
    const sp = S.space, b = F.SPACE[sp.dest], v = sp.loop ? F.loopSpeed(S) : F.spaceSpeed(S);
    $('seeds').textContent = fmt(S.seeds);
    $('rate').textContent = `+${fmt(F.seedRate(S, false))}/s`;
    if (sp.loop) {
      const out = sp.u < 0.5, left = (0.5 - (sp.u % 0.5)) * F.loopKm(sp.dest), name = b.short;
      // in space the top-left counter shows space rocks instead of seeds
      setPurse('rocks');
      const unit = F.unitValue(sp.dest), cur = F.CURRENCY[sp.dest];
      $('purseRock').textContent = cur.icon;
      $('seeds').textContent = fmt(S.seeds / unit);
      const perSec = (F.seedRate(S, false) + F.rocksPerTrip(S) * F.MOON_RATE * v / F.loopKm(sp.dest)) / unit;
      $('rate').textContent = `+${fmt(perSec, perSec < 1 ? 2 : 1)}/s`;
      $('fromCity').innerHTML = `${out ? 'Earth' : name}<small>trip ${sp.trips + 1}</small>`;
      $('toCity').innerHTML = `${out ? name : 'Earth'}<small>${out ? 'swing around it' : `+${money(F.rocksPerTrip(S) * F.MOON_RATE)} on return`}</small>`;
      $('legKm').textContent = `${fmt(left, 0)} km left`;
      setTrack(clamp(sp.u, 0, 1));
      $('speed').textContent = fmt(v, 0); $('etaLabel').textContent = out ? `${name} in` : 'Home in'; $('eta').textContent = fmtTime(left / v);
      $('mini').textContent = `${out ? 'Earth → ' + name : name + ' → Earth'} · ${fmtTime(left / v)}`;
      const cap = 1; $('ring').style.strokeDashoffset = 289 * (1 - Math.min(1, S.boost / 1.5)); $('boostPct').textContent = `+${Math.round(S.boost * 100)}%`;
      $('stampCount').textContent = S.visited.length + S.cosmos.length;
      $('stunChip').hidden = !(S.stun > 0); $('rushChip').hidden = true; refreshWeatherChip(); refreshRocks();
      $('btnMigrate').classList.remove('on');
      return;
    }
    if (sp.arrived) {
      const nb = F.SPACE[sp.dest + 1];
      $('fromCity').innerHTML = `${b.short}<small>in orbit</small>`;
      $('toCity').innerHTML = `${nb ? nb.short : '—'}<small>${nb ? (S.gear[nb.needs] ? 'ready to launch' : 'needs ' + F.GEAR.find((g) => g.id === nb.needs).name) : 'the end of the map'}</small>`;
      $('legKm').textContent = ''; setTrack(1);
      $('speed').textContent = '0'; $('etaLabel').textContent = 'Arrived'; $('eta').textContent = '✓';
    } else {
      $('fromCity').innerHTML = `${sp.from}<small>leaving</small>`;
      $('toCity').innerHTML = `${b.short}<small>+${fmt(F.seedRate(S, false) * 120 * (sp.dest + 1))} seeds</small>`;
      $('legKm').textContent = `${fmt(b.km - sp.km, 0)} km left`;
      setTrack(clamp(sp.km / b.km, 0, 1));
      $('speed').textContent = fmt(v, 0); $('etaLabel').textContent = 'Arrive in'; $('eta').textContent = fmtTime((b.km - sp.km) / v);
    }
    $('ring').style.strokeDashoffset = 289; $('boostPct').textContent = 'in space';
    $('stampCount').textContent = S.visited.length + S.cosmos.length;
    $('stunChip').hidden = true; $('rushChip').hidden = true; refreshWeatherChip();
    $('btnMigrate').classList.remove('on');
  }
  function spaceArrival(e) {
    const name = e.body.short.toUpperCase();
    pm.innerHTML = `<svg viewBox="0 0 172 172" width="172" height="172">
      <defs><path id="pmArcS" d="M 26 86 A 60 60 0 1 1 146 86"/></defs>
      <circle cx="86" cy="86" r="80" fill="none" stroke="currentColor" stroke-width="4"/>
      <circle cx="86" cy="86" r="62" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 5"/>
      <text font-family="Bricolage Grotesque, sans-serif" font-weight="800" font-size="${name.length > 11 ? 14 : 18}" fill="currentColor" letter-spacing="2"><textPath href="#pmArcS" startOffset="50%" text-anchor="middle">${name}</textPath></text>
      <text x="86" y="96" text-anchor="middle" font-size="34">${e.body.star ? '✨' : '🪐'}</text>
      <text x="86" y="124" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="700" font-size="12" fill="currentColor">${e.first ? 'FIRST LANDING' : 'FLYWAY'}</text>
    </svg>${e.bonus > 0 ? `<div class="bonus">+${fmt(e.bonus)} 🌰</div>` : ''}`;
    pm.style.color = '#7a5bd0';
    pm.classList.remove('show'); void pm.offsetWidth; pm.classList.add('show');
    setTimeout(() => { pm.style.color = ''; }, 2700);
    toast(`Reached ${e.body.name}!` + (e.first ? (e.body.id === 'moon' ? ' All seeds +25%, for good.' : ' Space rocks per trip ×1.5 and all seeds +25%, for good.') : ''));
    expoKey = ''; refreshExpo(); save();
  }
  let expoKey = '';
  function refreshExpo() {
    const box = $('expo');
    const g = F.nextGear(S), nb = F.nextBody(S), sp = S.space;
    const show = S.lapsFlown >= 1 || S.laps > 0 || Object.keys(S.gear).length > 0 || S.cosmos.length > 0;
    box.hidden = !show; if (!show) return;
    const key = [g && g.id, nb && nb.id, sp && sp.dest, sp && sp.arrived, sp && sp.loop, Math.round(Math.log10(1 + S.seeds)), F.loopTargets(S).length, S.cosmos.length, Math.round(F.rocksPerTrip(S, 0))].join('|');
    if (key !== expoKey) {
      expoKey = key;
      const owned = F.GEAR.filter((x) => S.gear[x.id]).length;
      let action = '';
      const targets = F.loopTargets(S);
      if (sp && sp.loop) action = `<p class="expo-note">🚀 Looping Earth and ${F.SPACE[sp.dest].name}. Every round trip brings home space rocks.</p>`;
      if (targets.length) action += `<div class="loops">${targets.map((b) => {
        const k = F.SPACE.indexOf(b), here = sp && sp.loop && sp.dest === k;
        return `<button class="loop-btn${here ? ' here' : ''}" data-loop="${k}"${here ? ' disabled' : ''}><b>${b.short}</b><small>${here ? 'looping now' : `${fmt(F.rocksPerTrip(S, k) * F.MOON_RATE / F.unitValue(k))} ${F.CURRENCY[k].icon} / trip`}</small></button>`;
      }).join('')}</div>`;
      if (sp) action += `<button class="expo-home" id="btnHome">Return to Earth</button>`;
      action += `<p class="expo-note rates">💱 1 🌑 Moon rock = ${fmt(F.MOON_RATE)} 🌰 seeds · each world farther out: 10 of its rocks = 1 of the one before</p>`;
      const pm = F.planetsReached(S);
      box.innerHTML = `<div class="expo-head"><h3>Expedition</h3><span>${owned} of ${F.GEAR.length} gear · ${S.cosmos.length} of ${F.SPACE.length} worlds</span></div>
        ${pm ? `<p class="expo-note">🪐 ${pm} planet${pm === 1 ? '' : 's'} reached: ×${fmt(F.planetMult(S), 2)} space rocks per trip</p>` : (S.cosmos.includes('moon') ? '<p class="expo-note">🪐 Each planet you reach multiplies space rocks per trip by 1.5, for good.</p>' : '')}
        ${action}
        ${g ? `<div class="up expo-gear"><div class="ic" aria-hidden="true">${g.icon}</div>
          <div><div class="nm">${g.name}</div><div class="fx">${g.blurb}</div></div>
          <button class="buy" id="btnGear"><b class="num">${money(g.cost)}</b><small>buy once</small></button></div>`
        : '<p class="expo-note">All gear owned. Every world is within reach.</p>'}`;
      const bl = $('btnLaunch'), bh = $('btnHome'), bg = $('btnGear');
      box.querySelectorAll('[data-loop]').forEach((bt) => bt.onclick = () => {
        const k = +bt.dataset.loop, switching = !!S.space, firstTime = !S.cosmos.includes(F.SPACE[k].id || F.SPACE[k].key);
        if (!F.launchLoop(S, k)) return;
        if (!switching || firstTime) cinematic('Liftoff!', `Next stop: ${F.SPACE[k].name}`, 3.6);
        moonOvalKey = '';
        side.bug = null; side.threat = null; $('threat').hidden = true; flapBtn.classList.remove('alarm'); side.threatT = 25;
        ZT = Math.max(ZT, 0.985); expoKey = ''; refreshExpo(); refreshShip(); save();
        toast(`${switching ? 'Course set' : 'Liftoff'}: ${F.SPACE[k].name} and back. Every round trip brings home space rocks.`); Sound.launch();
      });
      const t1 = $('btnTrade1'), ta = $('btnTradeAll');
      if (bl) bl.onclick = () => {
        if (!F.launch(S)) return;
        side.bug = null; side.threat = null; $('threat').hidden = true; flapBtn.classList.remove('alarm');
        ZT = Math.max(ZT, 0.985); expoKey = ''; refreshExpo(); save();
        toast(`Liftoff! Next stop: ${F.SPACE[S.space.dest].name}`);
      };
      if (bh) bh.onclick = () => {
        F.returnToEarth(S); $('eventChip').hidden = true; flapBtn.classList.remove('alarm'); for (const m of rocks) sscene.remove(m); rocks.length = 0; leaveSpaceChart(); resetSide(); rebuildRoute(); side.threat = null; $('threat').hidden = true; expoKey = ''; refreshExpo(); refreshShip(); save();
        toast(`Back on Earth over ${F.legFrom(S).name}.`);
      };
      if (bg) bg.onclick = () => { if (F.buyGear(S, g.id)) { toast(`${g.icon} ${g.name} ready.`); expoKey = ''; refreshExpo(); save(); } };
    }
    const bg = $('btnGear'); if (bg && g) bg.disabled = S.seeds < g.cost;
    refreshRocks();
  }
  function refreshRocks() {
    $('rocksChip').hidden = true; // one balance now: the purse shows it in local currency
  }
  let lastTripToast = 0;
  function tripDone(e) {
    const now = performance.now();
    refreshRocks(); refreshShip();
  }
  function orbitUnlocked() {
    toast(ORBIT_MSG);
    if (!S.space && !F.isNonstop(S)) { const f = F.legFrom(S); S.route = F.genLap(S, f.v ? f : f.i); S.ri = 0; S.legKm = 0; rebuildRoute(); resetSide(); }
    save();
  }
  const ORBIT_MSG = 'Orbital speed! Your bird can circle the globe in under a minute, so it now flies like a satellite. Each orbit pays out every destination.';

  // ---------- ship upgrades (shown in place of bird upgrades while looping the Moon) ----------
  const shipRows = {};
  function buildShip() {
    const ul = $('shipUps'); ul.innerHTML = '';
    for (const u of F.SHIP) {
      const li = document.createElement('li'); li.className = 'up';
      li.innerHTML = `<div class="ic ship-ic" aria-hidden="true">${u.icon}<span class="lv num">0</span></div>
        <div><div class="nm">${u.name}</div><div class="fx"></div></div>
        <button class="buy rock"><b class="num">0</b><small>buy</small></button>`;
      const btn = li.querySelector('.buy');
      btn.onclick = () => { if (F.buyShip(S, u.id, buyMode === 'max' ? 'max' : buyMode)) { refreshShip(); refreshRocks(); save(); } };
      shipRows[u.id] = { li, lv: li.querySelector('.lv'), fx: li.querySelector('.fx'), btn, cost: btn.querySelector('b'), lab: btn.querySelector('small') };
      ul.append(li);
    }
  }
  function refreshShip() {
    const looping = !!(S.space && S.space.loop);
    $('ups').hidden = looping; $('shipUps').hidden = !looping;
    const moonRun = F.onMoonRun(S);
    $('drawerTitle').textContent = looping ? (moonRun ? 'Moon ship upgrades' : 'Ship upgrades') : 'Upgrades';
    if (!looping) return;
    for (const u of F.SHIP) {
      const r = shipRows[u.id], L = F.shipLv(S, u.id);
      r.li.hidden = u.moon && !moonRun; // the Moon-run gear only shows on the way to the Moon
      if (r.li.hidden) continue;
      const n = buyMode === 'max' ? Math.max(1, F.shipMax(u, L, S.seeds)) : buyMode, c = F.shipCostN(u, L, n) * F.MOON_RATE;
      r.lv.textContent = L; r.fx.textContent = `${u.blurb(L)}  →  ${u.blurb(L + n)}`;
      r.cost.textContent = money(c); r.lab.textContent = n > 1 ? `buy ${n}` : 'buy'; r.btn.disabled = c > S.seeds;
    }
  }

  // ---------- admin (testing) ----------
  // Hidden: tap the menu title five times, or open the game with #admin.
  const adminEl = $('admin');
  function adminOn() { adminEl.hidden = false; try { localStorage.setItem('flyway.admin', '1'); } catch (e) {} }
  try { if (localStorage.getItem('flyway.admin') === '1' || /admin/.test(location.hash + location.search)) adminEl.hidden = false; } catch (e) {}
  let titleTaps = [];
  $('menuTitle').addEventListener('click', () => {
    const now = Date.now(); titleTaps = titleTaps.filter((t) => now - t < 4000); titleTaps.push(now);
    if (titleTaps.length >= 5) { titleTaps = []; adminOn(); }
  });
  function adminSeeds(n) {
    if (!(n > 0) || !isFinite(n)) { toast('Enter an amount like 5000 or 2e12.'); return; }
    S.seeds += n; refreshHud(); // not counted toward golden feathers refreshUpgrades(); expoKey = ''; refreshExpo(); save();
    toast(`Added ${fmt(n)} seeds.`);
  }
  $('adminAdd').onclick = () => adminSeeds(Number(String($('adminAmt').value).replace(/,/g, '').trim()));
  adminEl.querySelectorAll('[data-seeds]').forEach((b) => b.onclick = () => adminSeeds(Number(b.dataset.seeds)));
  adminEl.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'x10') return adminSeeds(Math.max(S.seeds, 1) * 9);
    if (a === 'feathers') { S.feathers += 10; toast('+10 golden feathers.'); }
    if (a === 'lap' && !S.space) { S.ri = F.lapLegs(S) - 1; S.legKm = Math.max(0, F.legLen(S) - 1); rebuildRoute(); toast('Last leg of the lap.'); }
    if (a === 'raider') { S.arrivals = Math.max(S.arrivals, 3); side.forceType = S.space && S.space.loop ? 'raider' : null; side.threatT = 0; close('menuSheet'); }
    if (a === 'hawk' || a === 'owl') { S.arrivals = Math.max(S.arrivals, 3); side.forceType = a; side.threatT = 0; S.wx = { type: 'clear', left: 0 }; close('menuSheet'); }
    if (a === 'bug') { side.bug = { t: 0, caught: false }; close('menuSheet'); }
    if (a === 'storm' || a === 'tailwind') { S.wx = { type: a, left: 30 }; close('menuSheet'); }
    if (a === 'birds') { S.birds = BIRDS.map((b) => b.id); toast('Every bird unlocked. Pick one when you migrate.'); }
    if (a === 'laps10') { const was = F.isNonstop(S); S.lapsTotal += 10; toast(`Lifetime laps: ${S.lapsTotal}.`); if (!was && F.isNonstop(S) && !S.space) { S.route = F.genLap(S, F.legFrom(S)); S.ri = 0; S.legKm = 0; rebuildRoute(); resetSide(); } }
    if (a === 'orbit') { if (!S.orbitUnlocked) { S.orbitUnlocked = true; orbitUnlocked(); } }
    if (a === 'rocks') { const k = S.space && S.space.loop ? S.space.dest : 0; S.seeds += 100 * F.unitValue(k); refreshShip(); toast(`+100 ${F.CURRENCY[k].name}.`); }
    if (a === 'gear') { for (const g of F.GEAR) S.gear[g.id] = true; expoKey = ''; refreshExpo(); toast('All gear unlocked.'); }
    if (a === 'hide') { adminEl.hidden = true; try { localStorage.removeItem('flyway.admin'); } catch (e) {} }
    refreshHud(); refreshUpgrades(); save();
  });
  $('optLapPrompt').onchange = (e) => { S.noLapPrompt = !e.target.checked; save(); };

  // ---------- daily migration challenge ----------
  function dailyHit(id, by = 1) {
    const d = F.dailyBump(S, id, by);
    if (d) { toast(`Daily challenge complete! +${d.reward} 🪶`); Sound.win(); save(); }
    refreshDaily();
  }
  function refreshDaily() {
    const d = F.dailyCheck(S), el = $('daily');
    el.classList.toggle('done', d.done);
    $('dailyText').textContent = F.dailyText(d);
    $('dailyProg').textContent = d.done ? `Done · +${d.reward} 🪶 earned` : `${d.have} of ${d.n} · reward ${d.reward} 🪶`;
    $('dailyBar').style.width = (d.have / d.n * 100) + '%';
  }
  // once the bird is fast enough for straight circles, switch right away rather than at the end of the lap
  let straightCheckT = 0;
  function checkStraight(dt) {
    straightCheckT += dt; if (straightCheckT < 1) return; straightCheckT = 0;
    // switch only from a regular city route (nonstop routes always include open-sky points)
    if (!S.space && F.isNonstop(S) && S.route.every((p) => typeof p === 'number')) {
      S.route = F.genLap(S, F.legFrom(S)); S.ri = 0; S.legKm = 0; rebuildRoute(); resetSide();
    }
  }

  // ---------- space events: asteroids, asteroid fields, solar wind ----------
  const ROCK_GEO = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8078, roughness: 1, flatShading: true });
  const rocks = [];
  function spawnRock(field) {
    const m = new THREE.Mesh(ROCK_GEO, rockMat), sc = field ? 0.4 + Math.random() * 1.6 : 0.8 + Math.random() * 2.6;
    m.scale.set(sc, sc * (0.6 + Math.random() * 0.5), sc * (0.7 + Math.random() * 0.4));
    // keep clear of the shuttle's lane so asteroids pass around it, never through it
    let y = (Math.random() - 0.5) * 30; if (Math.abs(y) < 2.5) y += y < 0 ? -3 : 3;
    m.position.set(60 + Math.random() * 60, y, -4 - Math.random() * (field ? 40 : 120));
    m.userData = { spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.5), v: (field ? 30 : 18) + Math.random() * 25 };
    sscene.add(m); rocks.push(m);
  }
  function updateAsteroids(dt) {
    const e = S.space && S.space.event, field = e && e.type === 'field';
    const want = field ? 46 : 5;
    if (rocks.length < want && Math.random() < (field ? 0.6 : 0.03)) spawnRock(field);
    for (let k = rocks.length - 1; k >= 0; k--) {
      const m = rocks[k]; m.position.x -= m.userData.v * dt;
      m.rotation.x += m.userData.spin.x * dt; m.rotation.y += m.userData.spin.y * dt;
      if (m.position.x < -70) { sscene.remove(m); rocks.splice(k, 1); }
    }
    // solar wind: a warm glow and golden streaks
    const solar = e && e.type === 'solar';
    side.solarK = lerp(side.solarK || 0, solar ? 1 : 0, 1 - Math.exp(-dt * 2));
    ssun.intensity = 2.4 + side.solarK * 2.5;
    sunGlow.scale.setScalar(160 + side.solarK * 220);
    sstreaks.material.color.setStyle(solar ? '#ffc86b' : '#cfe3ff');
  }
  // ---- Moon-run gear: laser cannons, the tractor beam and the warp drive ----
  const frags = [], crystals = [];
  const crystalMat = new THREE.SpriteMaterial({ map: paintTex(128, 128, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W / 2); gr.addColorStop(0, 'rgba(160,240,255,.9)'); gr.addColorStop(1, 'rgba(80,180,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8fbff'; g.strokeStyle = '#7fd8ff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(W / 2, H * 0.18); g.lineTo(W * 0.68, H / 2); g.lineTo(W / 2, H * 0.82); g.lineTo(W * 0.32, H / 2); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(120,210,255,.7)'; g.beginPath(); g.moveTo(W / 2, H * 0.18); g.lineTo(W * 0.68, H / 2); g.lineTo(W / 2, H / 2); g.closePath(); g.fill();
  }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.6, 1, 20, 1, true), beamMat); beam.visible = false; sscene.add(beam);
  const screenOf = (v) => { const p = v.clone().project(fcam), r = stage.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; };
  function updateMoonGear(dt) {
    const moon = F.onMoonRun(S), fight = side.threat && side.threat.phase === 'battle';
    const nose = shuttle.position.clone().add(new THREE.Vector3(3.2, 0, 0.3));
    // laser cannons: lock on to an asteroid ahead and blast it apart (faster inside an asteroid field)
    const LL = moon ? F.shipLv(S, 'laser') : 0;
    if (LL > 0 && !fight) {
      const field = S.space.event && S.space.event.type === 'field';
      if (rocks.length < 5 + Math.min(9, LL)) if (Math.random() < 0.05) spawnRock(false);
      side.laserT = (side.laserT ?? 1) - dt * (field ? 3 : 1);
      if (side.laserT <= 0) {
        const tgt = rocks.filter((m) => m.position.x > 4 && m.position.x < 45 && m.position.z > -60).sort((a, b) => a.position.x - b.position.x)[0];
        if (tgt) {
          side.laserT = F.laserEvery(LL);
          for (const dy of [-0.35, 0.35]) fireLaser(nose.clone().add(new THREE.Vector3(0, dy, 0)), tgt.position, '#7dff9a');
          spaceBurst(tgt.position, '#ffb65c', 5); Sound.laser(); Haptic.impact('LIGHT');
          for (let k = 0; k < 5; k++) {
            const f = new THREE.Mesh(ROCK_GEO, rockMat); f.scale.setScalar(tgt.scale.x * (0.2 + Math.random() * 0.2)); f.position.copy(tgt.position);
            f.userData = { v: new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 6).add(new THREE.Vector3(-tgt.userData.v * 0.6, 0, 0)), life: 1.4, spin: Math.random() * 6 };
            sscene.add(f); frags.push(f);
          }
          flySeeds(F.laserHit(S), null, screenOf(tgt.position));
          sscene.remove(tgt); rocks.splice(rocks.indexOf(tgt), 1);
        } else side.laserT = 0.3;
      }
    }
    for (let k = frags.length - 1; k >= 0; k--) {
      const f = frags[k], d = f.userData; d.life -= dt; f.position.addScaledVector(d.v, dt); f.rotation.x += d.spin * dt; f.rotation.y += d.spin * dt;
      f.scale.multiplyScalar(1 - dt * 0.6);
      if (d.life <= 0) { sscene.remove(f); frags.splice(k, 1); }
    }
    // tractor beam: a glowing star crystal drifts by and gets reeled into the hold
    const TL = moon ? F.shipLv(S, 'tractor') : 0;
    if (TL > 0) {
      side.tractorT = (side.tractorT ?? 2) - dt;
      if (side.tractorT <= 0 && crystals.length < 2) {
        side.tractorT = F.tractorEvery(TL);
        const c = new THREE.Sprite(crystalMat); c.scale.setScalar(1.6);
        c.position.set(42, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 4); c.userData = { pull: 0 }; sscene.add(c); crystals.push(c);
      }
    }
    let beamOn = null;
    for (let k = crystals.length - 1; k >= 0; k--) {
      const c = crystals[k], d = c.userData;
      if (d.pull === 0) { c.position.x -= 14 * dt; c.material.rotation += dt; if (c.position.x < 14) d.pull = 0.001; }
      else {
        d.pull += dt / 0.9; c.position.lerp(nose, Math.min(1, d.pull * 0.25 + dt * 3)); c.scale.setScalar(1.6 * (1 - 0.7 * d.pull));
        beamOn = c;
        if (d.pull >= 1) {
          spaceBurst(nose, '#9ee8ff', 3); Sound.chirp(); flySeeds(F.tractorCatch(S), null, screenOf(nose));
          sscene.remove(c); crystals.splice(k, 1); beamOn = null;
        }
      }
      if (c.position.x < -40) { sscene.remove(c); crystals.splice(k, 1); }
    }
    if (beamOn) {
      const a = nose, b = beamOn.position, mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
      beam.visible = true; beam.position.copy(mid); beam.scale.set(1, Math.max(0.1, len), 1);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      beamMat.opacity = 0.28 + 0.12 * Math.sin(side.t * 20);
    } else { beam.visible = false; }
    // warp drive: everything stretches while the jump lasts
    side.warpK = lerp(side.warpK || 0, moon && S.space.warp > 0 ? 1 : 0, 1 - Math.exp(-dt * 5));
  }
  let spaceEventT = 30;
  function tickSpaceEvents(dt) {
    if (!S.space || !S.space.loop || S.space.event || side.threat) return;
    spaceEventT -= dt; if (spaceEventT > 0) return;
    spaceEventT = 45 + Math.random() * 40;
    const type = Math.random() < 0.55 ? 'field' : 'solar', ev2 = F.startEvent(S, type), info = F.EVENTS[type];
    $('eventChip').hidden = false;
    if (type === 'field') { toast('🪨 Asteroid field! Tap BOOST to mine space rocks'); flapBtn.classList.add('alarm'); Sound.alarm(); }
    else { toast('🌞 Solar wind! Ship speed ×2'); Sound.chime(); }
    side.eventName = `${info.icon} ${info.name}`;
  }
  function mineHit(r) {
    const e = S.space.event;
    side.minedTotal = (side.minedTotal || 0) + r;
    if (rocks.length) spaceBurst(shuttle.position.clone().add(new THREE.Vector3(3, -1, 0)), '#c9bfb4', 3);
    Sound.hit();
    if (e.mined >= 15) flapBtn.classList.remove('alarm');
  }
  function endSpaceEvent(e) {
    $('eventChip').hidden = true; flapBtn.classList.remove('alarm');
    if (e.type === 'field' && side.minedTotal) toast(`Mined ${money(side.minedTotal)} from the asteroid field`);
    side.minedTotal = 0;
  }
  function refreshEventChip() {
    const e = S.space && S.space.event;
    $('eventChip').hidden = !e;
    if (e) $('eventChip').textContent = e.type === 'field' ? `🪨 ${15 - e.mined} left · ${Math.ceil(e.left)}s` : `🌞 ×2 · ${Math.ceil(e.left)}s`;
  }

  // ======================================================================
  // Main loop
  // ======================================================================
  let lastT = performance.now(), acc = 0, saveT = 0, uiT = 0, dailyT = 0, lapShownFor = -1;
  function beginFlight(fresh) {
    running = true;
    // a fight, bug dive or carried bird from the last run never carries over
    clearThreat();
    rebuildRoute(); resetSide();
    const g = currentGeo(); camDir.copy(geoVec(g.lat, g.lon, 1));
    if (fresh) { Z = 0.02; ZT = 0.985; } // the opening move: orbit to wingtip
    refreshUpgrades(); refreshHud(); refreshShip(); refreshDaily(); save();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (running && !document.hidden) adaptQuality(dt);
    if (running && S) {
      const g = currentGeo();
      const events = F.step(S, dt, !isLand(g.lat, g.lon));
      for (const e of events) {
        if (e.type === 'space') { spaceArrival(e); continue; }
        if (e.type === 'moonpass') { if (e.first) spaceArrival({ body: e.body, bonus: 0, first: true }); continue; }
        if (e.type === 'eventEnd') { endSpaceEvent(e.event); continue; }
        if (e.type === 'over') { overflight(e); continue; }
        if (e.type === 'barrier') { barrierBroken(e.which); continue; }
        if (e.type === 'warp') { toast('🌀 Warp jump!'); Sound.launch(); Haptic.impact('HEAVY'); continue; }
        if (e.type === 'trip') { tripDone(e); dailyHit('trips', e.trips); Sound.coin(); continue; }
        if (e.type === 'orbit') { orbitUnlocked(); continue; }
        if (e.nonstopNow) { toast('50 laps! Your bird now flies nonstop circles around the globe. Each one pays out every destination.'); rebuildRoute(); }
        else if (e.orbitPay && S.lapsTotal < 100) toast(`Orbit complete! Every destination paid out: +${fmt(e.orbitPay)} seeds`);
        if (e.first) { stamp(e.city, e.bonus, true); Sound.stamp(); dailyHit('cities'); } // stamp only the first time the bird lands somewhere
        if (e.type === 'arrive' && e.bonus > 0 && !e.waypoint) flySeeds(e.bonus);
        if (e.first && S.visited.length === 2) cinematic(`First stamp: ${e.city.name}`, 'Your passport has its first stamp');
        if (e.lapDone && S.lapsTotal === 1) setTimeout(() => cinematic('Around the world!', `${F.birdOf(S).name} circled the whole planet`), 600);
        if (e.lapDone) { dailyHit('laps'); if (S.lapsTotal <= 100) Sound.chime(); }
        if (e.wx === 'storm' && S.wx.left >= 29) dailyHit('storm');
        forecast(e);
        // after 100 laps the ticket shows the lap count; no more pop-ups
        if (e.lapDone && lapShownFor !== S.leg && S.lapsTotal <= 100) {
          lapShownFor = S.leg;
          if (S.noLapPrompt || S.lapsTotal > 1) toast(`Lap ${fmt(S.lapsTotal, 0)} done: +${F.FEATHERS_PER_LAP} 🪶. ${F.isNonstop(S) ? 'Next circle: a new direction.' : 'The next lap takes a new route.'}`);
          else {
            $('lapText').textContent = `${F.birdOf(S).name} made it all the way around and earned ${F.FEATHERS_PER_LAP} golden feathers 🪶. Every lap pays ${F.FEATHERS_PER_LAP} more. Migrate again to start fresh and get this run's ${fmt(F.migrateBonus(S), 0)} feathers again as a bonus, or keep flying: the next lap takes a new route.`;
            $('lapNoAsk').checked = false; open('lapSheet');
          }
        }
      }
      if (events.length) rebuildRoute();
      tickBugs(dt); tickThreats(dt); tickWeather(dt); checkStraight(dt); tickSpaceEvents(dt);
      // zoom easing (the take-off zoom is slower and more deliberate)
      Z = lerp(Z, ZT, 1 - Math.exp(-dt * (Math.abs(ZT - Z) > 0.3 ? 1.6 : 7)));
      const sa = smooth(SIDE_A, SIDE_B, Z);
      sideCanvas.style.opacity = sa;
      if (S.space && S.space.loop) {
        if (sa < 1) updateLoopChart(dt);
        if (sa > 0) updateLoop(dt);
      } else if (S.space) {
        if (sa < 1) updateSpaceChart(dt);
        if (sa > 0) updateSpace(dt);
      } else {
        const pip = sa > 0.98 && SW >= 700 && SH >= 500; // iPad-size stage, either way up
        setPip(pip);
        if (sa < 1 || pip) updateGlobe(dt, pip);
        if (sa > 0) updateFlight(dt);
      }
      if (S.space) setPip(false);
      uiT += dt; if (uiT > 0.1) { uiT = 0; refreshHud(); refreshUpgrades(); refreshExpo(); refreshShip(); refreshEventChip(); }
      Sound.tick(); Sound.setScene(S.space ? 'space' : 'earth');
      Sound.setWind(S.space ? 0.15 : Math.min(1, 0.25 + Math.log10(1 + F.speed(S)) / 4) * smooth(SIDE_A, SIDE_B, Z));
      dailyT += dt; if (dailyT > 2) { dailyT = 0; refreshDaily(); }
      saveT += dt; if (saveT > 5) { saveT = 0; save(); }
    } else {
      // behind the start sheet: let the globe turn slowly
      camDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.05);
      camera.position.copy(camDir).multiplyScalar(4.2); camera.lookAt(0, 0, 0);
      sun.position.copy(camera.position).add(new THREE.Vector3(1, 2, 0));
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  // the stage changes size on rotate, on the desktop/mobile layout switch, and in app webviews
  let lastW = 0;
  new ResizeObserver(() => { const r = stage.getBoundingClientRect(); sizeSide(); if (running && Math.abs(r.width - lastW) > 40) resetSide(); lastW = r.width; }).observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else if (running && S) { const r = catchUp(); if (r && r.away > 60) showAway(r); lastT = performance.now(); }
  });
  addEventListener('pagehide', save);

  function showAway(r) {
    $('awayText').textContent = `You were gone ${fmtTime(r.away)}. Your bird flew ${fmt(r.km)} km, reached ${fmt(r.cities, 0)} ${r.cities === 1 ? 'city' : 'cities'} and gathered ${fmt(r.seeds)} seeds.`;
    rebuildRoute(); resetSide(); open('awaySheet');
  }
  $('btnAway').onclick = () => close('awaySheet');

  // boot
  buildUpgrades(); buildShip(); sizeSide();
  camDir.set(0.3, 0.45, 1).normalize();
  const saved = load();
  if (saved) {
    S = saved;
    const r = catchUp();
    beginFlight(false); Z = ZT = 0.985; everZoomed = true; $('hint').style.opacity = 0;
    if (r) showAway(r);
  } else { buildStart('new'); open('startSheet'); }
  setTimeout(() => { if (!everZoomed) $('hint').style.opacity = 1; }, 6000);
  $('hint').style.opacity = 0;
  requestAnimationFrame(frame);
  // Warm up the GPU programs for the close-up while the start screen is showing, so the
  // first flight doesn't stall compiling them: build one land, city and sea strip off-screen,
  // compile everything in the scene, then throw the strips away.
  setTimeout(() => {
    try {
      const keep = world.cursor, tmp = [buildChunk('land', { lat: 45, lon: 10 }, 'land', 'sea'), buildChunk('city', { lat: 40, lon: -100 }, 'sea', 'land', ' '), buildChunk('sea', null, 'sea', 'sea')];
      for (const c of tmp) { c.grp.position.set(0, 0, -2000); fscene.add(c.grp); }
      const done = () => { for (const c of tmp) disposeChunk(c); world.cursor = keep; };
      if (fr.compileAsync) fr.compileAsync(fscene, fcam).then(done, done); else { fr.compile(fscene, fcam); done(); }
      if (renderer.compileAsync) renderer.compileAsync(scene, camera).catch(() => {});
    } catch (e) {}
  }, 50);

  // In the iOS app the page is local, so site-relative links need the full address.
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    document.querySelectorAll('a[href="/"]').forEach((el) => { el.href = 'https://www.freefowl.com/'; });
    document.documentElement.classList.add('native-app');
  }

  // for testing in the console
  window.__flyway = { get S() { return S; }, setZoom: (z) => { Z = ZT = z; }, F, layers: { clouds, atmo, earth }, forceBug: () => { side.bugT = 0; }, drawBirdHD, FW, FH, heroCount: () => fscene.children.filter((o) => o.isMesh && o.userData && o.userData.atlas && o.visible).map((o) => (o === hero ? "HERO:" : "") + Object.keys(birdAtlases).find((k) => birdAtlases[k] === o.userData.atlas)).join(","), birdScreen: () => { const p = birdSprite.position.clone().project(camera); return [Math.round((p.x + 1) / 2 * SW), Math.round((1 - p.y) / 2 * SH)]; }, setWeather: (type) => { S.wx = { type, left: 30 }; }, atlasFor, seaLife: () => seaLife, space: () => S.space, forceThreat: (type) => { side.threatT = 0; if (type) side.forceType = type; }, side, fscene, world, kindAt, lookahead, chunkAtX, draws: () => fr.info.render.calls, quality: () => qLevel };
})();
