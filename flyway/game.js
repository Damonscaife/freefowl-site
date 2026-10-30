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
    if (a + jt * 0.6 < 14) return 'tropic';
    if (a + jt * 0.8 > 50) return 'boreal';
    return 'temperate';
  }
  const BIOME_RGB = {
    ice: [233, 238, 243], tundra: [128, 132, 104], desert: [210, 178, 122], tropic: [56, 112, 58], boreal: [74, 104, 72], temperate: [104, 146, 74],
  };

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
    const img = g.getImageData(0, 0, TW, TH), d = img.data;
    for (let y = 0; y < TH; y++) {
      const lat = 90 - (y + 0.5) / TH * 180;
      for (let x = 0; x < TW; x++) {
        const k = (y * TW + x) * 4;
        if (maskData[k] < 128) continue;
        const lon = (x + 0.5) / TW * 360 - 180;
        const rgb = BIOME_RGB[biome(lat, lon)];
        const n = 0.82 + fbm(x / 40, y / 40) * 0.36;
        d[k] = rgb[0] * n; d[k + 1] = rgb[1] * n; d[k + 2] = rgb[2] * n;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
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

  const earthTex = new THREE.CanvasTexture(buildEarthTexture());
  earthTex.anisotropy = 4; earthTex.colorSpace = THREE.SRGBColorSpace;
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
    [0, '#0a1332', '#1c2a55'], [4.5, '#141c46', '#3a3a6e'], [6, '#33407a', '#f09a73'], [7.5, '#4f8fd6', '#cfe7f7'],
    [12, '#3a86d9', '#b4e2ff'], [16.5, '#4a7fc9', '#f6d3a1'], [18.5, '#3b3474', '#f28a5c'], [20, '#18204c', '#3a3768'],
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

  const GROUND = -24, CW = 80, DEPTH = 420, ZC = -150; // strip width, depth and centre z
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x2468a6, roughness: 0.35, metalness: 0.15 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, GROUND + 0.6, -300); fscene.add(water);

  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x8a97ad, roughness: 0.7, emissive: 0x000000 });
  const towerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const world = { chunks: [], cursor: 0, nextType: null, clouds: [], u: 10, viewW: 14 };

  // land height at a world position; heights are continuous across strips
  function landHeight(wx, z) {
    const far = smooth(-60, -330, z);
    const n = fbm(wx / 70, z / 70 + 9);
    const ridge = Math.pow(fbm(wx / 160 + 40, z / 160), 2.2) * 40 * far;
    return 3 + n * (12 + far * 18) + ridge;
  }
  function vertColor(b, h, wx, z) {
    let c = BIOME_RGB[b];
    if (b !== 'ice' && h > 30) c = [128, 124, 118];              // bare rock
    if (b === 'ice' || h > 46) c = [236, 240, 244];               // snow
    const k = 0.85 + fbm(wx / 25, z / 25) * 0.3;
    return c.map((v) => Math.pow(v / 255 * k, 2.2)); // sRGB → linear for vertex colours
  }
  function buildChunk(kind, geo, prevKind, nextKind, name) {
    const wx0 = world.cursor; world.cursor += CW;
    const b = geo ? biome(geo.lat, geo.lon) : 'temperate';
    const g = new THREE.PlaneGeometry(CW, DEPTH, 16, 60); g.rotateX(-Math.PI / 2); g.translate(0, 0, ZC);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), z = p.getZ(i), wx = wx0 + lx + CW / 2;
      let h;
      if (kind === 'sea') h = -6;
      else {
        // cities sit on a plain; open land gets hills and far ranges
        h = kind === 'city' ? 2 + fbm(wx / 30, z / 30) * 3 : landHeight(wx, z);
        // slope down to the water where the next or previous strip is sea
        const dl = lx + CW / 2, dr = CW / 2 - lx;
        let t = 1;
        if (prevKind === 'sea') t = Math.min(t, smooth(0, 26, dl));
        if (nextKind === 'sea') t = Math.min(t, smooth(0, 26, dr));
        h = -6 + (h + 6) * t;
      }
      p.setY(i, GROUND + h);
      col.set(kind === 'sea' ? [0.26, 0.21, 0.13] : vertColor(b, h, wx, z), i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, landMat));
    if (kind === 'city') addCity(grp, name, wx0);
    return { grp, kind, wx0 };
  }
  function addCity(grp, name, seed) {
    const n = 90, inst = new THREE.InstancedMesh(towerGeo, towerMat, n), m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = (hash(seed, i) - 0.5) * (CW - 10), z = -30 - hash(i, seed) * 130;
      const core = 1 - Math.min(1, Math.hypot(x / (CW * 0.5), (z + 95) / 65));
      const h = 3 + core * core * 30 * (0.4 + hash(i * 3, seed) * 0.9);
      const w = 2.2 + hash(i, i + seed) * 3;
      m.compose(new THREE.Vector3(x, GROUND + 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w * (0.7 + hash(seed, i * 7) * 0.6)));
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
  function disposeChunk(c) {
    c.grp.traverse((o) => { if (o.isMesh || o.isSprite) { if (o.geometry && o.geometry !== towerGeo) o.geometry.dispose(); if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } } });
    fscene.remove(c.grp);
  }

  // What will be under the bird by the time a strip now at world x reaches it.
  function lookahead(sec) {
    const km = Math.min(F.legLen(S), S.legKm + F.speed(S) * sec);
    return F.lerpGeo(F.legFrom(S), F.legTo(S), km / F.legLen(S));
  }
  const kindAt = (g) => (isLand(g.lat, g.lon) ? 'land' : 'sea');
  function pushChunk(x, kind, geo, name) {
    const prev = world.chunks[world.chunks.length - 1];
    const nextGeo = lookahead(Math.max(0, (x + CW) / world.u));
    world.nextType = kindAt(nextGeo);
    const c = buildChunk(kind, geo, prev ? prev.kind : kind, world.nextType, name);
    c.grp.position.x = x; fscene.add(c.grp); world.chunks.push(c);
  }

  function makeCloud(x) {
    const grp = new THREE.Group();
    // self-lit so undersides stay cloud-white instead of picking up the ground's green
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc9d3de, emissiveIntensity: 0.55, flatShading: true, transparent: true, opacity: 0.94 });
    const n = 5 + Math.floor(Math.random() * 6), s = 3 + Math.random() * 6;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(cloudGeo, mat);
      const r = s * (0.6 + Math.random() * 0.7);
      m.scale.set(r * 1.3, r * 0.8, r);
      m.position.set((i - n / 2) * s * 0.9 + Math.random() * s, Math.random() * s * 0.5, (Math.random() - 0.5) * s);
      grp.add(m);
    }
    // keep clouds off the camera's lens: either well behind the bird or below/above it
    const far = Math.random() < 0.9;
    if (!far) grp.scale.setScalar(0.45);
    const z = far ? -40 - Math.random() * 280 : -14 - Math.random() * 18;
    // near clouds stay well below or above the bird's line so they never swallow the shot
    const y = far ? -8 + Math.random() * 38 : -15 + Math.random() * 5;
    grp.position.set(x, y, z);
    grp.userData.mat = mat;
    fscene.add(grp); world.clouds.push(grp);
  }
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);

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
  function updateWeather(dt, v, cur, wx) {
    const ease = (k, t) => lerp(k, t, 1 - Math.exp(-dt * 1.5));
    const cold = ['ice', 'boreal', 'tundra'].includes(biome(cur.lat, cur.lon));
    const wet = wx === 'rain' ? 0.55 : wx === 'storm' ? 1 : 0;
    wxK.rain = ease(wxK.rain, cold ? 0 : wet); wxK.snow = ease(wxK.snow, cold ? wet : 0);
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
    // head
    const hr = (opt.owl ? 0.44 : opt.bigBeak ? 0.38 : 0.32) * S, hx = cx + (opt.owl ? 0.62 : 0.78) * S, hy = cy - 0.3 * S;
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
    return birdAtlases[key] || (birdAtlases[key] = makeAtlas((g, i, n) => { g.translate(0, PAD); drawBirdHD(g, (i / n) * Math.PI * 2, b, opt); }, BIRD_FRAMES, 4, 3, FH + PAD * 2));
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
    return GROUND + (c.kind === 'city' ? 3 : landHeight(c.wx0 + (x - c.grp.position.x) + CW / 2, z));
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
    if (b < 0 || b > BATTLE) return 0;
    return Math.sin(b * 5.3) * 1.3 * (1 - smooth(4.4, BATTLE, b));
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
    if (b < 0) {
      // circles high and ahead during the warning, then stoops at the flock
      const k = smooth(-0.55, 0, b);
      const high = new THREE.Vector3(W * 0.3 + Math.sin(t * 1.3) * 1.2, 2.8 + Math.sin(t * 2.1) * 0.6, -4);
      m.position.copy(high.lerp(C.clone().add(new THREE.Vector3(1.5, 1.5, 0)), k));
      m.userData.roll = -0.55 * k;
      setFrame(m, b < -0.55 ? phaseFrame(t * 5, BIRD_FRAMES) : 3);
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
      if (th.ok) {
        // beaten: tumbles away down and to the left
        m.position.copy(P).add(new THREE.Vector3(-a * 7, -a * a * 5, 0));
        m.userData.roll = a * 9; setFrame(m, 3);
      } else {
        // wins: climbs away up and to the right, with a follower in its talons
        m.position.copy(P).add(new THREE.Vector3(a * 4.5, a * 2.4, -a * 0.6));
        m.userData.roll = -0.35; setFrame(m, phaseFrame(t * 7, BIRD_FRAMES));
        if (carried) {
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

  function sizeSide() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = stage.getBoundingClientRect();
    SW = r.width; SH = r.height;
    renderer.setPixelRatio(DPR); renderer.setSize(SW, SH, false);
    camera.aspect = SW / SH; camera.updateProjectionMatrix();
    fr.setPixelRatio(DPR); fr.setSize(SW, SH, false);
    fcam.aspect = SW / SH; fcam.updateProjectionMatrix();
  }

  const unitsPerSec = (v) => clamp(10 + 30 * Math.log10(1 + v), 10, 230) * (reduceMotion ? 0.5 : 1);

  function resetSide() {
    for (const c of world.chunks) disposeChunk(c); world.chunks = [];
    for (const c of world.clouds) fscene.remove(c); world.clouds = [];
    world.u = unitsPerSec(F.speed(S));
    const here = F.legFrom(S);
    // start over the departure city so take-off reads right
    world.cursor = 0;
    let x = -CW * 3 + 30; // puts the departure city in frame at take-off
    for (let i = 0; i < 2; i++) { pushChunk(x, kindAt(here), here); x += CW; }
    pushChunk(x, 'city', here, here.name); x += CW;
    while (x < 620) { const g = lookahead(Math.max(0, x / world.u)); pushChunk(x, kindAt(g), g); x += CW; }
    for (let i = 0; i < 16; i++) makeCloud(-150 + Math.random() * 760);
    side.cityLeg = S.leg;
    setBirds();
  }

  function updateFlight(dt) {
    const v = F.speed(S);
    world.u = lerp(world.u, unitsPerSec(v), 1 - Math.exp(-dt * 2));
    const fighting = side.threat && side.threat.phase === 'battle';
    const u = world.u, dx = u * dt * (fighting ? 0.35 : 1);
    side.t += dt;
    // ground strips: slide back, recycle behind, add ahead
    for (const c of world.chunks) c.grp.position.x -= dx;
    while (world.chunks.length && world.chunks[0].grp.position.x < -CW * 3.5) disposeChunk(world.chunks.shift());
    let last = world.chunks[world.chunks.length - 1], guard = 0;
    while (last.grp.position.x < 620 - CW && guard++ < 12) {
      const nx = last.grp.position.x + CW, sec = Math.max(0, nx / u);
      const left = (F.legLen(S) - S.legKm) / Math.max(v, 1e-6);
      // skip the skyline when legs fly by in a blink; the ticket shows lap progress instead
      if (side.cityLeg !== S.leg + 1 && left < sec + CW / u && left > 1.0 && F.legLen(S) / v >= 3 && !F.legTo(S).v) {
        side.cityLeg = S.leg + 1;
        const to = F.legTo(S); pushChunk(nx, 'city', to, to.name);
      } else { const g = lookahead(sec); pushChunk(nx, world.nextType || kindAt(g), g); }
      last = world.chunks[world.chunks.length - 1];
    }
    for (const c of world.clouds) {
      c.position.x -= dx;
      if (c.position.x < -220) { fscene.remove(c); c.userData.recycle = true; }
    }
    world.clouds = world.clouds.filter((c) => !c.userData.recycle);
    while (world.clouds.length < 16) makeCloud(560 + Math.random() * 120);

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
    const dive = (side.bug ? diveOffset(side.bug.t) : 0) + threatOffset();
    const wobble = S.stun > 0 ? Math.sin(side.t * 14) * 0.25 : 0;
    hero.position.set(0, Math.sin(side.t * 1.6) * 0.35 * (dive ? 0.3 : 1) - Math.sin(side.flap) * 0.08 + dive + wobble, 0);
    // nose down into the dive, up on the climb
    const pitch = side.bug ? (side.bug.t < DIVE ? -0.28 * Math.sin(Math.PI * clamp(side.bug.t / DIVE, 0, 1)) : 0.22 * Math.sin(Math.PI * clamp((side.bug.t - DIVE) / CLIMB, 0, 1))) : 0;
    hero.userData.roll = 0.04 + Math.sin(side.t * 1.6 + 0.6) * 0.04 + pitch + wobble * 0.3;
    updateBug(dt);
    updatePredators(dt); updateCarried(dt);
    // golden streaks while a bug rush is on
    streaks.material.color.setStyle(S.rush > 0 ? '#ffd36b' : '#ffffff');
    flock.forEach((f, i) => {
      const h = f.userData.home, slot = battleSlot(i, f);
      const want = slot || new THREE.Vector3(h.x + Math.sin(side.t * 0.5 + i) * 0.4, h.y + Math.sin(side.t * 1.4 + i * 1.3) * 0.4, h.z);
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
    sunDisc.material.color.setStyle(isDay ? '#ffffff' : '#c9d4f5');
    sunDisc.scale.setScalar(isDay ? 130 : 70);
    water.material.color.setStyle(night > 0.5 ? '#183461' : '#2468a6');
    towerMat.emissive.setStyle(night > 0.4 ? '#b8862e' : '#000000');
    towerMat.emissiveIntensity = night * 0.55;
    updateWeather(dt, v, cur, (S.wx && S.wx.type) || 'clear');
    for (const c of world.clouds) c.userData.mat.color.copy(cloudTint);

    // camera: raised and off to the near side, framed so the bird sits left of centre
    const f = smooth(SIDE_A, 1, Z);
    const hfov = 2 * Math.atan(Math.tan(fcam.fov * D2R / 2) * fcam.aspect);
    // during a predator fight the camera pulls back and centres on the action
    const th = side.threat, tb = th ? th.t - th.warn : -9;
    const fightOn = th && tb > -0.6 && tb < BATTLE + 1.6 ? 1 : 0;
    side.fightK = lerp(side.fightK || 0, fightOn, 1 - Math.exp(-dt * 2.5));
    const wantW = lerp(60, 10, f) * Math.max(1, fcam.aspect * 1.25) * (1 + 0.45 * side.fightK); world.viewW = wantW;
    const d = (wantW / 2) / Math.tan(hfov / 2);
    // ~12° above the bird keeps the horizon in the upper third of the frame
    const elevA = lerp(22, 12, f) * D2R, sway = Math.sin(side.t * 0.12) * 0.12;
    fcam.position.set(d * 0.18 + Math.sin(sway) * d * 0.15, Math.sin(elevA) * d, Math.cos(elevA) * d);
    // follow the bird part-way down into a bug dive
    fcam.position.y += hero.position.y * 0.6;
    if (side.shake > 0) fcam.position.add(new THREE.Vector3((Math.random() - 0.5) * side.shake, (Math.random() - 0.5) * side.shake, 0));
    fcam.lookAt(wantW * 0.14 - side.fightK * 2.4, 0.4 + hero.position.y * 0.7 + side.fightK * 0.6, 0);
    // cutouts dim a little at night, like everything else
    const lit = lerp(1, 0.6, night);
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
  {
    const n = 1800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(900);
      pos.set([v.x, v.y, v.z], i * 3);
      const w = 0.7 + Math.random() * 0.3, tint = Math.random();
      col.set(tint < 0.15 ? [w, w * 0.85, w * 0.7] : tint > 0.85 ? [w * 0.8, w * 0.9, w] : [w, w, w], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sscene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true })));
  }
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
    const sp = S.space;
    setTarget(F.SPACE[0]); labelsEl.style.display = 'none';
    if (shuttleBird !== S.bird) {
      shuttleBird = S.bird; shuttleBirdDef = F.birdOf(S);
      const c = shuttleAtlas.tex.image, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
      for (let i = 0; i < 2; i++) { g.save(); g.translate(i * FW, 0); g.beginPath(); g.rect(0, 0, FW, FH); g.clip(); drawShuttle(g, i); g.restore(); }
      shuttle.userData.tex.needsUpdate = true;
    }
    side.t += dt;
    const fight = side.threat && side.threat.phase === 'battle';
    ring.visible = false; starGlow.visible = false; spaceEarth.visible = true;
    bodyPlace(spaceEarth, sp.u % 1, 40);
    bodyPlace(target, (sp.u + 0.5) % 1, 24);
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
    const sp2 = sstreakGeo.attributes.position, speedK = 160 * (fight ? 0.4 : 1);
    for (let i = 0; i < SSTREAK; i++) {
      const d = sstreakData[i]; d.x -= speedK * dt;
      if (d.x < -80) { d.x = 90 + Math.random() * 40; d.y = Math.random() * 60 - 30; d.z = Math.random() * 80 - 70; }
      sp2.setXYZ(i * 2, d.x, d.y, d.z); sp2.setXYZ(i * 2 + 1, d.x + 6, d.y, d.z);
    }
    sp2.needsUpdate = true; sstreakGeo.setDrawRange(0, SSTREAK * 2);
    // camera pulls back a little during a fight
    side.fightK = lerp(side.fightK || 0, th && b > -0.6 && b < BATTLE + 1.6 ? 1 : 0, 1 - Math.exp(-dt * 2.5));
    const shake = side.shake > 0 ? (side.shake -= dt, side.shake) : 0;
    fcam.position.set(3 - side.fightK * 4 + (Math.random() - 0.5) * shake, 4.2 + side.fightK * 2 + (Math.random() - 0.5) * shake, 22 + side.fightK * 10);
    fcam.lookAt(4 - side.fightK * 3, 0.5, 0);
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
  const LOOP_D = 7, LOOP_A = LOOP_D / 2 + 1.1, LOOP_B = 1.7;
  function loopPoint(theta, side3) {
    const C = CHART_DIR.clone().multiplyScalar(LOOP_D / 2);
    return C.addScaledVector(CHART_DIR, LOOP_A * Math.cos(theta)).addScaledVector(side3, LOOP_B * Math.sin(theta));
  }
  function updateLoopChart(dt) {
    const sp = S.space;
    setTarget(F.SPACE[0]);
    const up = new THREE.Vector3(0, 1, 0), side3 = up.clone().cross(CHART_DIR).normalize(), tilt = side3.clone().applyAxisAngle(CHART_DIR, 0.5);
    if (!loopGeo.attributes.position) { const pts = []; for (let k = 0; k < 160; k++) pts.push(loopPoint(k / 160 * Math.PI * 2, tilt)); loopGeo.setFromPoints(pts); moonOval.computeLineDistances(); }
    const P = CHART_DIR.clone().multiplyScalar(LOOP_D);
    chartBody.visible = true; chartBody.scale.setScalar(0.27); chartBody.position.copy(P); chartLine.visible = false; moonOval.visible = true;
    moon.visible = false; routeGroup.visible = false; nextSprite.visible = false; labelsEl.style.display = 'none';
    const at = loopPoint(Math.PI + sp.u * Math.PI * 2, tilt);
    birdSprite.position.copy(at);
    // far enough back that the whole oval (Earth to past the Moon) fits the screen width
    const q = clamp(Z / SIDE_B, 0, 1), dist = (LOOP_A + 0.8) / (Math.tan(camera.fov * D2R / 2) * Math.min(SW / SH, 1.6)) + 10 * Math.pow(1 - q, 2);
    birdSprite.scale.setScalar(0.05 + dist * 0.01);
    const focus = P.clone().multiplyScalar(0.5).lerp(at, smooth(0.75, 1, q));
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

  function updateGlobe(dt) {
    const q = clamp(Z / SIDE_B, 0, 1);
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
    clouds.rotation.y += dt * 0.004;
    const legT = clamp(S.legKm / F.legLen(S), 0, 1);
    birdSprite.position.copy(geoVec(g.lat, g.lon, ROUTE_R + 0.004 + legLift(F.legFrom(S), F.legTo(S), legT)));
    updateTail(legT);
    const bs = 0.004 + (dist - 1) * 0.03; birdSprite.scale.set(bs, bs, 1);
    const to = F.isNonstop(S) ? CITIES[S.start] : F.legTo(S); nextSprite.position.copy(geoVec(to.lat, to.lon, 1.007));
    const ns = (0.008 + (dist - 1) * 0.02) * (1 + 0.25 * Math.sin(performance.now() / 250)); nextSprite.scale.set(ns, ns, 1);
    renderer.render(scene, camera);
    placeLabels();
  }

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
    if (!S || !running) return;
    F.flap(S); side.flapRate += 3; Sound.flap();
    const th = side.threat;
    if (th && !th.resolved) th.meter += th.type === 'hunter' ? 0.12 : (fromHold ? 0.35 : 1) / F.THREAT.taps(S);
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
  function refreshHud() {
    if (S.space) return refreshSpaceHud();
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
    } else {
      $('fromCity').innerHTML = `${from.name}<small>${S.lapsTotal >= 100 ? 'lap ' + fmt(S.lapsTotal + 1, 0) : from.region}</small>`;
      $('toCity').innerHTML = to.v ? `${to.name}<small>open sky</small>`
        : `${to.name}<small>${S.visited.includes(to.i) ? 'visited' : 'new · '}${S.visited.includes(to.i) ? '' : '+' + fmt(F.arrivalBonus(S)) + ' seeds'}</small>`;
      $('legKm').textContent = `${fmt(len - S.legKm, 0)} km left`;
      setTrack(t);
      $('etaLabel').textContent = 'Arrive in'; $('eta').textContent = fmtTime((len - S.legKm) / v);
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
  const TIER = { starter: 'Starter', common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
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
    for (const b of BIRDS) {
      const have = owns(b), afford = migrating && !have && purse >= b.cost;
      const el = document.createElement('button'); el.className = 'bird tier-' + b.tier; el.type = 'button';
      el.disabled = !have && !afford; el.setAttribute('aria-pressed', b.id === pickBird);
      el.innerHTML = `<canvas aria-hidden="true"></canvas><b>${b.name}</b>
        <small>${have ? b.trait : `${b.secret ? 'Specs unknown · ' : ''}🪶 ${fmt(b.cost, 0)}${afford ? ' · tap to unlock' : ''}`}</small>
        ${b.tier !== 'starter' ? `<i class="tier">${TIER[b.tier]}</i>` : ''}`;
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
    const birds = $('shopBirds'); birds.innerHTML = '';
    for (const b of BIRDS.filter((x) => x.cost > 0)) {
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
  $('btnShop').onclick = openShop;
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
    for (const c of CITIES) {
      const got = S.visited.includes(c.i), d = document.createElement('div');
      d.className = 'stamp' + (got ? ' got' : ''); if (got) d.style.color = regionCol[c.region];
      d.textContent = got ? c.name : '?'; d.title = got ? `${c.name}, ${c.region}` : `Somewhere in ${c.region}`;
      box.append(d);
    }
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
      ['Lifetime laps', F.isNonstop(S) ? `${fmt(S.lapsTotal, 0)} · nonstop` : `${S.lapsTotal} of ${F.NONSTOP_AT} to nonstop`], ['Space rocks', `☄️ ${fmt(S.moon.rocks, 0)} · ${fmt(S.moon.trips, 0)} round trips`],
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
    if (side.bugT <= 0) { side.bug = { t: 0, caught: false }; side.bugT = F.bugEvery(L) * (0.75 + Math.random() * 0.5); }
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
    if (night) return 'owl';
    // hunters only over open land: never over water, never right by a city
    const fromCity = S.legKm / v, toCity = (F.legLen(S) - S.legKm) / v;
    const open = isLand(g.lat, g.lon) && fromCity > 6 && toCity > 8;
    return open && Math.random() < 0.55 ? 'hunter' : 'hawk';
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
        if (b >= BATTLE) finishBattle(th);
      } else if (th.t >= th.warn + BATTLE + 3) {
        side.threat = null; banner.hidden = true; banner.classList.remove('ok', 'bad', 'fight');
      }
      return;
    }
    if (S.arrivals < 3 || side.bug || (S.space && !S.space.loop) || anySheetOpen() || (!S.space && S.wx && S.wx.type === 'storm')) return;
    side.threatT -= dt;
    if (side.threatT > 0) return;
    side.threatT = F.THREAT.every(S);
    const type = side.forceType || pickThreat(); side.forceType = null;
    side.threat = { type, t: 0, warn: F.THREAT.warn(S), meter: 0, phase: 'warn', resolved: false, ok: false, lastHit: -1 };
    banner.hidden = false; banner.classList.remove('ok', 'bad', 'fight');
    $('threatIcon').textContent = THREATS[type].icon; $('threatText').textContent = THREATS[type].ask;
    meterEl.style.width = '0%'; flapBtn.classList.add('alarm'); Sound.alarm();
  }
  function startBattle(th) {
    th.phase = 'battle'; th.resolved = true; th.ok = th.meter >= 0.999;
    flapBtn.classList.remove('alarm'); banner.classList.add('fight');
    const name = THREATS[th.type].name, flockUp = S.levels.flock > 0;
    $('threatText').textContent = THREATS[th.type].space
      ? (F.shipLv(S, 'wing') > 0 ? `Your wingmates are dogfighting the ${name}…` : `Dodging the ${name}'s lasers…`)
      : th.type === 'hunter'
      ? (flockUp ? 'Under fire! The flock weaves through the shots…' : 'Under fire! Weaving through the shots…')
      : (flockUp ? `The flock is fighting the ${name}…` : `Your bird is fighting the ${name}…`);
  }
  function finishBattle(th) {
    th.phase = 'done';
    const name = THREATS[th.type].name;
    banner.classList.remove('fight');
    if (THREATS[th.type].space) {
      if (th.ok) {
        const r = F.spaceMiss(S); banner.classList.add('ok'); meterEl.style.width = '100%'; dailyHit('fights'); Sound.win();
        $('threatText').textContent = `The ${name} is driven off! +${fmt(r, 0)} ☄️`;
      } else {
        const r = F.spaceHit(S); banner.classList.add('bad'); meterEl.style.width = '0%'; Sound.lose();
        $('threatText').textContent = r.lost === 'wingmate' ? `The ${name} knocked out a wingmate. Slowed for ${F.THREAT.STUN}s.` : `The ${name} blasted loose ${fmt(r.rocks, 0)} ☄️. Slowed for ${F.THREAT.STUN}s.`;
      }
      spaceOutcome(th, th.ok ? null : { lost: F.shipLv(S, 'wing') < pods.length ? 'wingmate' : 'rocks' });
      refreshShip(); return;
    }
    if (th.ok) {
      const bonus = F.predatorMiss(S); dailyHit('fights'); Sound.win();
      banner.classList.add('ok'); meterEl.style.width = '100%';
      $('threatText').textContent = th.type === 'hunter'
        ? `Out of range! The hunter gave up. +${fmt(bonus)} seeds`
        : `The flock drove off the ${name}! +${fmt(bonus)} seeds`;
      if (!S.levels.flock && th.type !== 'hunter') $('threatText').textContent = `You fought off the ${name}! +${fmt(bonus)} seeds`;
      return;
    }
    const r = F.predatorHit(S); Sound.lose();
    banner.classList.add('bad'); meterEl.style.width = '0%';
    $('threatText').textContent = r.lost === 'follower'
      ? (th.type === 'hunter' ? `The hunter hit one of your flock. Slowed for ${F.THREAT.STUN}s.` : `The ${name} carried off one of your flock. Slowed for ${F.THREAT.STUN}s.`)
      : `The ${name} knocked loose ${fmt(r.seeds)} seeds. Slowed for ${F.THREAT.STUN}s.`;
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
    setTimeout(() => toast(`${w.icon} ${w.name} ${dest}: ${w.note}`), 900);
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
    if (S.space) { el.className = 'wx wx-space'; el.textContent = S.space.loop ? `🌙 Earth–Moon loop · ${fmt(S.moon.trips, 0)} round trips` : S.space.arrived ? '🌌 In orbit · foraging continues' : '🌌 Deep space'; return; }
    const wx = (S.wx && S.wx.type) || 'clear', w = F.WEATHER[wx];
    el.className = 'wx wx-' + wx;
    el.textContent = `${w.icon} ${w.name}` + (w.note ? ` · ${w.note}` : '') + (S.wx.left > 0 ? ` · ${Math.ceil(S.wx.left)}s` : '');
  }

  // ---------- space: HUD, arrivals, expedition panel ----------
  function setFlapLabel(t) { const el = $('flapLabel'); if (el.textContent !== t) { el.textContent = t; flapBtn.setAttribute('aria-label', t === 'BOOST' ? 'Boost the shuttle' : 'Flap for a speed boost'); } }
  function refreshSpaceHud() {
    setFlapLabel('BOOST');
    const sp = S.space, b = F.SPACE[sp.dest], v = sp.loop ? F.loopSpeed(S) : F.spaceSpeed(S);
    $('seeds').textContent = fmt(S.seeds);
    $('rate').textContent = `+${fmt(F.seedRate(S, false))}/s`;
    if (sp.loop) {
      const out = sp.u < 0.5, left = (0.5 - (sp.u % 0.5)) * F.LOOP_KM;
      $('fromCity').innerHTML = `${out ? 'Earth' : 'Moon'}<small>trip ${sp.trips + 1}</small>`;
      $('toCity').innerHTML = `${out ? 'Moon' : 'Earth'}<small>${out ? 'swing around it' : `+${fmt(F.rocksPerTrip(S), 0)} ☄️ on return`}</small>`;
      $('legKm').textContent = `${fmt(left, 0)} km left`;
      setTrack(clamp(sp.u, 0, 1));
      $('speed').textContent = fmt(v, 0); $('etaLabel').textContent = out ? 'Moon in' : 'Home in'; $('eta').textContent = fmtTime(left / v);
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
    const key = [g && g.id, nb && nb.id, sp && sp.dest, sp && sp.arrived, sp && sp.loop, S.moon.rocks > 0, !!S.gear.shuttle].join('|');
    if (key !== expoKey) {
      expoKey = key;
      const owned = F.GEAR.filter((x) => S.gear[x.id]).length;
      let action = '';
      if (!sp && S.gear.shuttle) action = `<button class="expo-launch" id="btnLoop">🚀 Launch: Earth–Moon loop</button>`;
      if (sp && sp.loop) action = `<p class="expo-note">🌙 Looping Earth and the Moon. Every round trip brings home space rocks.</p>`;
      if (sp && !sp.loop && !sp.arrived) action = `<p class="expo-note">🚀 On the way to ${F.SPACE[sp.dest].name}</p>`;
      else if (nb && (!sp || sp.loop || sp.arrived)) action += `<button class="expo-launch" id="btnLaunch">🚀 Fly on to ${nb.name}</button>`;
      if (sp && (sp.arrived || sp.loop)) action += `<button class="expo-home" id="btnHome">Return to Earth</button>`;
      if (S.moon.rocks > 0 || (sp && sp.loop)) action += `<div class="trade"><span>☄️ <b class="num" id="tradeRocks">0</b> space rocks · 1 = <b class="num" id="tradeRate">0</b> seeds</span>
        <span class="trade-btns"><button id="btnTrade1">Trade 1</button><button id="btnTradeAll">Trade all</button></span></div>`;
      const pm = F.planetsReached(S);
      box.innerHTML = `<div class="expo-head"><h3>Expedition</h3><span>${owned} of ${F.GEAR.length} gear · ${S.cosmos.length} of ${F.SPACE.length} worlds</span></div>
        ${pm ? `<p class="expo-note">🪐 ${pm} planet${pm === 1 ? '' : 's'} reached: ×${fmt(F.planetMult(S), 2)} space rocks per trip</p>` : (S.cosmos.includes('moon') ? '<p class="expo-note">🪐 Each planet you reach multiplies space rocks per trip by 1.5, for good.</p>' : '')}
        ${action}
        ${g ? `<div class="up expo-gear"><div class="ic" aria-hidden="true">${g.icon}</div>
          <div><div class="nm">${g.name}</div><div class="fx">${g.blurb}</div></div>
          <button class="buy" id="btnGear"><b class="num">${fmt(g.cost)}</b><small>buy once</small></button></div>`
        : '<p class="expo-note">All gear owned. Every world is within reach.</p>'}`;
      const bl = $('btnLaunch'), bh = $('btnHome'), bg = $('btnGear'), bo = $('btnLoop');
      if (bo) bo.onclick = () => {
        if (!F.launchLoop(S)) return;
        side.bug = null; side.threat = null; $('threat').hidden = true; flapBtn.classList.remove('alarm'); side.threatT = 25;
        ZT = Math.max(ZT, 0.985); expoKey = ''; refreshExpo(); refreshShip(); save();
        toast('Liftoff! Loop the Moon and bring home space rocks.'); Sound.launch();
      };
      const t1 = $('btnTrade1'), ta = $('btnTradeAll');
      if (t1) t1.onclick = () => { const v = F.tradeRocks(S, 1); if (v) { toast(`Traded 1 ☄️ for ${fmt(v)} seeds.`); refreshRocks(); refreshShip(); save(); } };
      if (ta) ta.onclick = () => { const n = S.moon.rocks, v = F.tradeRocks(S, n); if (v) { toast(`Traded ${fmt(n, 0)} ☄️ for ${fmt(v)} seeds.`); refreshRocks(); refreshShip(); save(); } };
      if (bl) bl.onclick = () => {
        if (!F.launch(S)) return;
        side.bug = null; side.threat = null; $('threat').hidden = true; flapBtn.classList.remove('alarm');
        ZT = Math.max(ZT, 0.985); expoKey = ''; refreshExpo(); save();
        toast(`Liftoff! Next stop: ${F.SPACE[S.space.dest].name}`);
      };
      if (bh) bh.onclick = () => {
        F.returnToEarth(S); leaveSpaceChart(); resetSide(); rebuildRoute(); side.threat = null; $('threat').hidden = true; expoKey = ''; refreshExpo(); refreshShip(); save();
        toast(`Back on Earth over ${F.legFrom(S).name}.`);
      };
      if (bg) bg.onclick = () => { if (F.buyGear(S, g.id)) { toast(`${g.icon} ${g.name} ready.`); expoKey = ''; refreshExpo(); save(); } };
    }
    const bg = $('btnGear'); if (bg && g) bg.disabled = S.seeds < g.cost;
    refreshRocks();
  }
  function refreshRocks() {
    const show = S.moon.rocks > 0 || (S.space && S.space.loop) || S.moon.total > 0;
    $('rocksChip').hidden = !show; $('rocksCount').textContent = fmt(S.moon.rocks, 0);
    const tr = $('tradeRocks'); if (tr) { tr.textContent = fmt(S.moon.rocks, 0); $('tradeRate').textContent = fmt(F.rockValue(S)); $('btnTrade1').disabled = $('btnTradeAll').disabled = S.moon.rocks < 1; }
  }
  let lastTripToast = 0;
  function tripDone(e) {
    const now = performance.now();
    if (now - lastTripToast > 3000) { lastTripToast = now; toast(`Round trip done: +${fmt(e.rocks, 0)} ☄️`); }
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
      shipRows[u.id] = { lv: li.querySelector('.lv'), fx: li.querySelector('.fx'), btn, cost: btn.querySelector('b'), lab: btn.querySelector('small') };
      ul.append(li);
    }
  }
  function refreshShip() {
    const looping = !!(S.space && S.space.loop);
    $('ups').hidden = looping; $('shipUps').hidden = !looping;
    $('drawerTitle').textContent = looping ? 'Ship upgrades' : 'Upgrades';
    if (!looping) return;
    for (const u of F.SHIP) {
      const r = shipRows[u.id], L = F.shipLv(S, u.id);
      const n = buyMode === 'max' ? Math.max(1, F.shipMax(u, L, S.moon.rocks)) : buyMode, c = F.shipCostN(u, L, n);
      r.lv.textContent = L; r.fx.textContent = `${u.blurb(L)}  →  ${u.blurb(L + n)}`;
      r.cost.textContent = '☄️ ' + fmt(c, 0); r.lab.textContent = n > 1 ? `buy ${n}` : 'buy'; r.btn.disabled = c > S.moon.rocks;
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
    if (a === 'hawk' || a === 'hunter') { S.arrivals = Math.max(S.arrivals, 3); side.forceType = a; side.threatT = 0; S.wx = { type: 'clear', left: 0 }; close('menuSheet'); }
    if (a === 'bug') { side.bug = { t: 0, caught: false }; close('menuSheet'); }
    if (a === 'storm' || a === 'tailwind') { S.wx = { type: a, left: 30 }; close('menuSheet'); }
    if (a === 'birds') { S.birds = BIRDS.map((b) => b.id); toast('Every bird unlocked. Pick one when you migrate.'); }
    if (a === 'laps10') { const was = F.isNonstop(S); S.lapsTotal += 10; toast(`Lifetime laps: ${S.lapsTotal}.`); if (!was && F.isNonstop(S) && !S.space) { S.route = F.genLap(S, F.legFrom(S)); S.ri = 0; S.legKm = 0; rebuildRoute(); resetSide(); } }
    if (a === 'orbit') { if (!S.orbitUnlocked) { S.orbitUnlocked = true; orbitUnlocked(); } }
    if (a === 'rocks') { S.moon.rocks += 100; S.moon.total += 100; refreshRocks(); refreshShip(); toast('+100 space rocks.'); }
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
    if (running && S) {
      const g = currentGeo();
      const events = F.step(S, dt, !isLand(g.lat, g.lon));
      for (const e of events) {
        if (e.type === 'space') { spaceArrival(e); continue; }
        if (e.type === 'moonpass') { if (e.first) spaceArrival({ body: F.SPACE[0], bonus: 0, first: true }); continue; }
        if (e.type === 'over') { overflight(e); continue; }
        if (e.type === 'trip') { tripDone(e); dailyHit('trips', e.trips); Sound.coin(); continue; }
        if (e.type === 'orbit') { orbitUnlocked(); continue; }
        if (e.nonstopNow) { toast('50 laps! Your bird now flies nonstop circles around the globe. Each one pays out every destination.'); rebuildRoute(); }
        else if (e.orbitPay && S.lapsTotal < 100) toast(`Orbit complete! Every destination paid out: +${fmt(e.orbitPay)} seeds`);
        if (e.first) { stamp(e.city, e.bonus, true); Sound.stamp(); dailyHit('cities'); } // stamp only the first time the bird lands somewhere
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
      tickBugs(dt); tickThreats(dt); tickWeather(dt); checkStraight(dt);
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
        if (sa < 1) updateGlobe(dt);
        if (sa > 0) updateFlight(dt);
      }
      uiT += dt; if (uiT > 0.1) { uiT = 0; refreshHud(); refreshUpgrades(); refreshExpo(); refreshShip(); }
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

  // In the iOS app the page is local, so site-relative links need the full address.
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    document.querySelectorAll('a[href="/"]').forEach((el) => { el.href = 'https://www.freefowl.com/'; });
    document.documentElement.classList.add('native-app');
  }

  // for testing in the console
  window.__flyway = { get S() { return S; }, setZoom: (z) => { Z = ZT = z; }, F, layers: { clouds, atmo, earth }, forceBug: () => { side.bugT = 0; }, drawBirdHD, FW, FH, heroCount: () => fscene.children.filter((o) => o.isMesh && o.userData && o.userData.atlas && o.visible).map((o) => (o === hero ? "HERO:" : "") + Object.keys(birdAtlases).find((k) => birdAtlases[k] === o.userData.atlas)).join(","), birdScreen: () => { const p = birdSprite.position.clone().project(camera); return [Math.round((p.x + 1) / 2 * SW), Math.round((1 - p.y) / 2 * SH)]; }, setWeather: (type) => { S.wx = { type, left: 30 }; }, atlasFor, space: () => S.space, forceThreat: (type) => { side.threatT = 0; if (type) side.forceType = type; }, side, fscene, world };
})();
