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
  function arcPoints(a, b, r = ROUTE_R, tEnd = 1) {
    const n = Math.max(8, Math.ceil(F.distKm(a, b) / 120 * tEnd));
    const pts = [];
    for (let i = 0; i <= n; i++) { const g = F.lerpGeo(a, b, (i / n) * tEnd); pts.push(geoVec(g.lat, g.lon, r)); }
    return pts;
  }
  let loopLine = null, doneLine = null;
  const liveGeo = new THREE.BufferGeometry();
  liveGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
  const liveLine = new THREE.Line(liveGeo, new THREE.LineBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.95 }));
  routeGroup.add(liveLine);
  let cityPoints = null;
  const birdSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('#fff3c9', 'rgba(227,165,43,.7)'), depthTest: false, transparent: true }));
  birdSprite.renderOrder = 5; scene.add(birdSprite);
  const nextSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('#ffffff', 'rgba(207,46,58,.8)'), depthTest: true, transparent: true }));
  scene.add(nextSprite);

  function rebuildRoute() {
    for (const l of [loopLine, doneLine, cityPoints]) if (l) { routeGroup.remove(l); l.geometry.dispose(); }
    const all = [];
    for (let k = 0; k < CITIES.length; k++) all.push(...arcPoints(F.cityAt(S, k), F.cityAt(S, k + 1)));
    loopLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(all),
      new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, dashSize: 0.012, gapSize: 0.01 }));
    loopLine.computeLineDistances(); routeGroup.add(loopLine);
    const done = [];
    const lapStart = S.leg - (S.leg % CITIES.length);
    for (let k = lapStart; k < S.leg; k++) done.push(...arcPoints(F.cityAt(S, k), F.cityAt(S, k + 1), ROUTE_R + 0.0005));
    doneLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(done.length ? done : [new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xe3a52b, transparent: true, opacity: done.length ? 0.9 : 0 }));
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
  function updateLiveLine(t) {
    const pts = arcPoints(F.legFrom(S), F.legTo(S), ROUTE_R + 0.001, Math.max(0.001, t)).slice(0, 400);
    const a = liveGeo.attributes.position;
    pts.forEach((p, i) => a.setXYZ(i, p.x, p.y, p.z));
    a.needsUpdate = true; liveGeo.setDrawRange(0, pts.length); liveGeo.computeBoundingSphere();
  }

  // ======================================================================
  // Side view: the bird in profile, sky by the local time of day, ground
  // that matches whatever is actually below it.
  // ======================================================================
  const sideCanvas = $('side');
  const sctx = sideCanvas.getContext('2d');
  let SW = 0, SH = 0, DPR = 1;
  const side = { segs: [], farSegs: [], clouds: [], streaks: [], off: { near: 0, far: 0 }, cityLeg: -1, flap: 0, flapRate: 2, t: 0 };

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

  function sizeSide() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = stage.getBoundingClientRect();
    SW = r.width; SH = r.height;
    sideCanvas.width = Math.round(SW * DPR); sideCanvas.height = Math.round(SH * DPR);
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    renderer.setPixelRatio(DPR); renderer.setSize(SW, SH, false);
    camera.aspect = SW / SH; camera.updateProjectionMatrix();
  }

  const groundY = () => SH * 0.8;
  const birdX = () => SW * (SW > 700 ? 0.36 : 0.34);
  const birdY = () => SH * 0.5;
  // What will be under the bird by the time a segment entering on the right reaches it.
  function lookahead(sec) {
    const km = Math.min(F.legLen(S), S.legKm + F.speed(S) * sec);
    return F.lerpGeo(F.legFrom(S), F.legTo(S), km / F.legLen(S));
  }
  function makeSeg(x, kind, geo, extra) {
    const w = kind === 'city' ? Math.max(420, SW * 0.7) : 260 + Math.random() * 180;
    const b = geo ? biome(geo.lat, geo.lon) : 'temperate';
    return Object.assign({ x, w, kind, biome: b, seed: Math.random() * 1000, lat: geo ? geo.lat : 0 }, extra || {});
  }
  function resetSide(cityName) {
    side.segs = []; side.farSegs = [];
    const here = { lat: F.legFrom(S).lat, lon: F.legFrom(S).lon };
    let x = -40;
    // start the scene over the departure city so take-off reads right
    side.segs.push(makeSeg(x, 'city', here, { name: cityName || F.legFrom(S).name }));
    side.segs[0].x = birdX() - side.segs[0].w * 0.55;
    x = side.segs[0].x + side.segs[0].w;
    while (x < SW + 300) { const s = makeSeg(x, isLand(here.lat, here.lon) ? 'land' : 'sea', here); side.segs.push(s); x += s.w; }
    for (let fx = -50; fx < SW + 300;) { const s = makeSeg(fx, isLand(here.lat, here.lon) ? 'land' : 'sea', here); side.farSegs.push(s); fx += s.w; }
    side.clouds = [];
    for (let i = 0; i < 14; i++) side.clouds.push(newCloud(Math.random() * SW * 1.4));
    side.cityLeg = S.leg;
  }
  function newCloud(x) {
    const depth = Math.random();
    return { x, y: SH * (0.08 + Math.random() * 0.55), s: 0.5 + depth * 1.3, depth, front: depth > 0.86, seed: Math.random() * 99 };
  }

  function pxPerSec(v) { return clamp(38 + 95 * Math.log10(1 + v), 38, 900); }

  function updateSide(dt) {
    const v = F.speed(S), gs = pxPerSec(v) * (reduceMotion ? 0.5 : 1);
    side.t += dt;
    const move = (arr, f, gen, key) => {
      side.off[key] += gs * f * dt;
      for (const s of arr) s.x -= gs * f * dt;
      while (arr.length && arr[0].x + arr[0].w < -60) arr.shift();
      let last = arr[arr.length - 1];
      while (!last || last.x + last.w < SW + 260) {
        const nx = last ? last.x + last.w : 0;
        const s = gen(nx); arr.push(s); last = s;
      }
    };
    // near ground
    move(side.segs, 1, (nx) => {
      const secToBird = Math.max(0, (nx - birdX()) / gs);
      const left = (F.legLen(S) - S.legKm) / Math.max(v, 1e-6);
      // drop the destination skyline in so it is under the bird on arrival
      if (side.cityLeg !== S.leg + 1 && left < secToBird + 2.2 && left > 1.2 && left > secToBird - 1) {
        side.cityLeg = S.leg + 1;
        const to = F.legTo(S);
        return makeSeg(nx, 'city', to, { name: to.name });
      }
      const g = lookahead(secToBird);
      return makeSeg(nx, isLand(g.lat, g.lon) ? 'land' : 'sea', g);
    }, 'near');
    move(side.farSegs, 0.32, (nx) => {
      const g = lookahead(Math.max(0, (nx - birdX()) / (gs * 0.32)));
      return makeSeg(nx, isLand(g.lat, g.lon) ? 'land' : 'sea', g);
    }, 'far');
    for (const c of side.clouds) c.x -= gs * (0.15 + c.depth * 1.15) * dt;
    side.clouds = side.clouds.filter((c) => c.x > -260 * c.s);
    while (side.clouds.length < 14) side.clouds.push(newCloud(SW + 80 + Math.random() * 200));
    // speed streaks once things get fast
    const want = clamp(Math.floor(Math.log10(1 + v) * 7 - 6), 0, 40);
    while (side.streaks.length < want) side.streaks.push({ x: SW + Math.random() * SW, y: Math.random() * SH * 0.75, l: 40 + Math.random() * 140 });
    if (side.streaks.length > want) side.streaks.length = want;
    for (const st of side.streaks) { st.x -= gs * 3.5 * dt; if (st.x + st.l < 0) { st.x = SW + Math.random() * 200; st.y = Math.random() * SH * 0.75; } }
    // wing beat: quick when boosting, lazy glide-and-flap when not
    const target = 1.6 + S.boost * 7 + Math.min(2, Math.log10(1 + v) * 0.4);
    side.flapRate = lerp(side.flapRate, target, 1 - Math.exp(-dt * 4));
    side.flap += dt * side.flapRate * Math.PI * 2;
  }

  // Hill height comes from the layer's continuous world position, so the
  // horizon flows across segment joins instead of stepping.
  function drawHills(seg, baseY, amp, color, dark, scale, off) {
    const g = sctx;
    if (dark) { const gr = g.createLinearGradient(0, baseY - amp, 0, SH); gr.addColorStop(0, color); gr.addColorStop(1, dark); g.fillStyle = gr; }
    else g.fillStyle = color;
    g.beginPath(); g.moveTo(seg.x - 1, SH);
    for (let x = 0; x <= seg.w + 12; x += 12) {
      const wx = Math.min(seg.x + x, seg.x + seg.w + 1);
      const n = fbm((wx + off) / (140 * scale), 3.7);
      g.lineTo(wx, baseY - n * amp);
    }
    g.lineTo(seg.x + seg.w + 1, SH); g.closePath(); g.fill();
  }
  function biomeCss(b, k = 1, night = 0) {
    const c = BIOME_RGB[b].map((v) => v * k * (1 - night * 0.55));
    return `rgb(${c.map(Math.round).join(',')})`;
  }

  function drawSide() {
    const g = sctx, cur = currentGeo();
    const hour = localHour(cur.lon);
    const night = 1 - smooth(5.5, 7.5, hour) + smooth(18.5, 20.5, hour);
    const nf = clamp(night, 0, 1);
    const [top, bot] = skyAt(hour);
    const sky = g.createLinearGradient(0, 0, 0, groundY());
    sky.addColorStop(0, top); sky.addColorStop(1, bot);
    g.fillStyle = sky; g.fillRect(0, 0, SW, SH);
    // stars at night
    if (nf > 0.05) {
      g.fillStyle = `rgba(255,255,255,${0.8 * nf})`;
      for (let i = 0; i < 70; i++) { const x = (hash(i, 1) * SW * 1.2 - side.t * 2) % SW; g.fillRect((x + SW) % SW, hash(i, 2) * SH * 0.6, 1.5, 1.5); }
    }
    // sun or moon arcs across the sky with the hour
    {
      const dayT = (hour - 6) / 12, nightT = ((hour + 6) % 24) / 12;
      const isDay = hour >= 6 && hour <= 18;
      const t = isDay ? dayT : nightT;
      const x = SW * (0.1 + 0.8 * t), y = groundY() * (0.75 - Math.sin(t * Math.PI) * 0.6);
      g.beginPath(); g.arc(x, y, isDay ? 26 : 18, 0, Math.PI * 2);
      g.fillStyle = isDay ? 'rgba(255,240,200,.95)' : 'rgba(230,234,245,.9)'; g.fill();
      if (isDay) { g.beginPath(); g.arc(x, y, 52, 0, Math.PI * 2); g.fillStyle = 'rgba(255,230,170,.18)'; g.fill(); }
    }
    // far clouds
    for (const c of side.clouds) if (!c.front && c.depth < 0.5) drawCloud(c, nf);
    // far horizon
    const fy = groundY() - SH * 0.06;
    for (const s of side.farSegs) {
      if (s.kind !== 'sea') drawHills(s, fy + SH * 0.05, SH * 0.11, mix(hex('#9db4cf'), hex('#2c3a5c'), nf), null, 2.2, side.off.far);
    }
    for (const c of side.clouds) if (!c.front && c.depth >= 0.5) drawCloud(c, nf);
    // near ground
    const gy = groundY();
    for (const s of side.segs) {
      if (s.kind === 'sea') {
        g.fillStyle = nf > 0.5 ? '#16305a' : '#2468a6'; g.fillRect(s.x - 1, gy, s.w + 2, SH - gy);
        g.strokeStyle = `rgba(255,255,255,${0.28 - nf * 0.15})`; g.lineWidth = 2;
        for (let r = 0; r < 4; r++) {
          const yy = gy + 10 + r * 16; g.beginPath();
          for (let x = 0; x <= s.w; x += 18) {
            const wx = s.x + x; const yv = yy + Math.sin((wx + side.t * 30 + r * 40) / 22) * 2;
            x === 0 ? g.moveTo(wx, yv) : g.lineTo(wx, yv);
          }
          g.stroke();
        }
      } else {
        drawHills(s, gy, SH * 0.05, biomeCss(s.biome, 1, nf), biomeCss(s.biome, 0.6, nf), 1, side.off.near);
        if (s.kind === 'city') drawSkyline(s, gy, nf);
      }
    }
    // speed streaks behind the bird
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.5;
    for (const st of side.streaks) { g.beginPath(); g.moveTo(st.x, st.y); g.lineTo(st.x + st.l, st.y); g.stroke(); }
    // flock, then the bird
    const L = S.levels.flock, bird = F.birdOf(S), S0 = Math.min(SW, SH) * (SW > 700 ? 0.075 : 0.095);
    for (let i = Math.min(L, 8) - 1; i >= 0; i--) {
      const row = Math.floor(i / 2) + 1, sideSign = i % 2 ? 1 : -1;
      const x = birdX() - row * S0 * 1.5, y = birdY() + sideSign * row * S0 * 0.75 + Math.sin(side.t * 2 + i) * 4;
      drawBird(g, x, y, S0 * 0.55, bird, side.flap + i * 0.9, 0.85);
    }
    const bob = Math.sin(side.t * 1.7) * SH * 0.012;
    drawBird(g, birdX(), birdY() + bob, S0, bird, side.flap, 1);
    for (const c of side.clouds) if (c.front) drawCloud(c, nf, 0.55);
  }

  function drawCloud(c, nf, alpha = 1) {
    const g = sctx, s = c.s * (SW > 700 ? 1.2 : 0.9);
    const shade = Math.round(255 - nf * 150), a = (0.55 + c.depth * 0.4) * alpha;
    g.fillStyle = `rgba(${shade},${shade},${Math.min(255, shade + 15)},${a})`;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const ox = (i - 2) * 26 * s, oy = -Math.abs(i - 2) * -4 * s - hash(c.seed, i) * 12 * s;
      g.moveTo(c.x + ox + 30 * s, c.y + oy); g.arc(c.x + ox, c.y + oy, (22 + hash(i, c.seed) * 16) * s, 0, Math.PI * 2);
    }
    g.fill();
  }

  function drawSkyline(s, gy, nf) {
    const g = sctx, n = Math.floor(s.w / 26);
    for (let i = 0; i < n; i++) {
      const bw = 18 + hash(s.seed, i) * 22, x = s.x + 20 + i * (s.w - 40) / n;
      const mid = 1 - Math.abs(i / n - 0.5) * 1.6;
      const bh = SH * (0.04 + mid * 0.16 * (0.4 + hash(i, s.seed) * 0.8));
      g.fillStyle = mix(hex('#5a6b86'), hex('#1b2238'), nf);
      g.fillRect(x, gy - bh, bw, bh + 4);
      g.fillStyle = nf > 0.4 ? 'rgba(255,214,120,.85)' : 'rgba(210,230,250,.5)';
      for (let wy = gy - bh + 6; wy < gy - 6; wy += 9)
        for (let wx = x + 4; wx < x + bw - 4; wx += 7) if (hash(wx, wy) > (nf > 0.4 ? 0.45 : 0.7)) g.fillRect(wx, wy, 3, 4);
    }
    if (s.name) {
      const tx = s.x + s.w / 2;
      g.font = `800 ${Math.round(clamp(SW * 0.05, 18, 32))}px 'Bricolage Grotesque', sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(6,12,31,.55)'; g.fillText(s.name, tx + 2, gy - SH * 0.24 + 2);
      g.fillStyle = '#fff'; g.fillText(s.name, tx, gy - SH * 0.24);
    }
  }

  // A side-on bird seen slightly from below: belly shows, near wing in front
  // of the body, far wing behind it and foreshortened.
  function drawBird(g, x, y, S, b, ph, alpha) {
    const w = Math.sin(ph);
    g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(-0.06 - w * 0.03);
    const wing = (sx, sy, len, col, k) => {
      const tipX = sx - len * 0.55, tipY = sy - len * w * k;
      g.fillStyle = col; g.beginPath(); g.moveTo(sx + S * 0.25, sy);
      g.quadraticCurveTo(sx - len * 0.1, sy - len * w * k * 0.7 - S * 0.05, tipX, tipY);
      g.quadraticCurveTo(sx - len * 0.2, sy - len * w * k * 0.25 + S * 0.08, sx - S * 0.35, sy + S * 0.06);
      g.closePath(); g.fill();
    };
    wing(S * 0.05, -S * 0.12, S * 1.15, b.wing, 0.75);       // far wing
    g.fillStyle = b.wing;                                      // tail
    g.beginPath(); g.moveTo(-S * 0.55, -S * 0.05); g.lineTo(-S * 1.15, -S * 0.22); g.lineTo(-S * 1.2, S * 0.12); g.lineTo(-S * 0.55, S * 0.12); g.fill();
    g.fillStyle = b.body; g.beginPath(); g.ellipse(0, 0, S * 0.72, S * 0.34, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = b.belly; g.beginPath(); g.ellipse(S * 0.08, S * 0.13, S * 0.55, S * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = b.body; g.beginPath(); g.arc(S * 0.66, -S * 0.12, S * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = b.cap; g.beginPath(); g.arc(S * 0.66, -S * 0.12, S * 0.28, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    g.fillStyle = b.beak; g.beginPath(); g.moveTo(S * 0.9, -S * 0.2); g.lineTo(S * 1.2, -S * 0.1); g.lineTo(S * 0.9, -S * 0.04); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(S * 0.76, -S * 0.17, S * 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(S * 0.78, -S * 0.17, S * 0.04, 0, Math.PI * 2); g.fill();
    wing(S * 0.1, -S * 0.05, S * 1.35, shadeHex(b.wing, 1.25), 1); // near wing
    g.restore();
  }
  function shadeHex(h, k) { return `rgb(${hex(h).map((v) => clamp(Math.round(v * k + 12), 0, 255)).join(',')})`; }

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
    // follow the bird smoothly; at speed it jumps city to city every frame
    camDir.lerp(bv, 1 - Math.exp(-dt * (q > 0.6 ? 6 : 2.5))).normalize();
    const south = new THREE.Vector3(0, -1, 0).addScaledVector(camDir, camDir.y).normalize();
    const tilt = 0.55 * smooth(0.55, 1, q);
    camera.position.copy(camDir).multiplyScalar(dist).addScaledVector(south, tilt * (dist - 0.95));
    camera.up.set(0, 1, 0);
    const look = camDir.clone().multiplyScalar(smooth(0.35, 0.95, q));
    camera.lookAt(look);
    // light rides with the camera (a little up and left) so the day/night line stays off the visible face
    sun.position.copy(camera.position).add(new THREE.Vector3(-0.15, 0.25, 0).multiplyScalar(camera.position.length()));
    clouds.rotation.y += dt * 0.004;
    birdSprite.position.copy(geoVec(g.lat, g.lon, 1.008));
    const bs = 0.004 + (dist - 1) * 0.03; birdSprite.scale.set(bs, bs, 1);
    const to = F.legTo(S); nextSprite.position.copy(geoVec(to.lat, to.lon, 1.007));
    const ns = (0.008 + (dist - 1) * 0.02) * (1 + 0.25 * Math.sin(performance.now() / 250)); nextSprite.scale.set(ns, ns, 1);
    updateLiveLine(clamp(S.legKm / F.legLen(S), 0, 1));
    renderer.render(scene, camera);
    placeLabels();
  }

  // City labels: the leg's two ends, when they are on the visible side.
  const labelsEl = $('labels');
  const labelA = document.createElement('div'), labelB = document.createElement('div');
  labelA.className = labelB.className = 'label3d'; labelsEl.append(labelA, labelB);
  function placeLabel(el, c) {
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
    placeLabel(labelA, F.legFrom(S)); placeLabel(labelB, F.legTo(S));
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
  function doFlap() { if (!S || !running) return; F.flap(S); side.flapRate += 3; }
  flapBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); flapBtn.classList.add('down'); doFlap();
    clearInterval(holdTimer); holdTimer = setInterval(doFlap, 160);
  });
  const flapUp = () => { flapBtn.classList.remove('down'); clearInterval(holdTimer); };
  flapBtn.addEventListener('pointerup', flapUp); flapBtn.addEventListener('pointerleave', flapUp); flapBtn.addEventListener('pointercancel', flapUp);
  flapBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doFlap(); } });
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('select')) return;
    if (e.code === 'Space') { e.preventDefault(); doFlap(); flapBtn.classList.add('down'); } // held space auto-repeats flaps
    if (e.key === '=' || e.key === '+') ZT = clamp(ZT + 0.08, 0, 1);
    if (e.key === '-') ZT = clamp(ZT - 0.08, 0, 1);
  });
  addEventListener('keyup', (e) => { if (e.code === 'Space') flapBtn.classList.remove('down'); });

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
    refreshUpgrades();
  });

  function refreshHud() {
    const v = F.speed(S), len = F.legLen(S), t = clamp(S.legKm / len, 0, 1);
    const g = currentGeo(), ocean = !isLand(g.lat, g.lon);
    const arrivalsPerSec = v / len;
    const rate = F.seedRate(S, ocean) + F.arrivalBonus(S) * Math.min(arrivalsPerSec, 20);
    $('seeds').textContent = fmt(S.seeds);
    $('rate').textContent = `+${fmt(rate)}/s`;
    const from = F.legFrom(S), to = F.legTo(S);
    $('fromCity').innerHTML = `${from.name}<small>${from.region}</small>`;
    $('toCity').innerHTML = `${to.name}<small>+${fmt(F.arrivalBonus(S))} seeds</small>`;
    $('legKm').textContent = `${fmt(len - S.legKm, 0)} km left`;
    $('trackFill').style.width = (t * 100) + '%'; $('trackDot').style.left = (t * 100) + '%';
    $('speed').textContent = fmt(v, v < 10 ? 1 : 0);
    $('eta').textContent = fmtTime((len - S.legKm) / v);
    const cap = F.boostCap(S.levels.stamina), b = Math.max(S.boost, F.flockBoost(S));
    $('ring').style.strokeDashoffset = 289 * (1 - b / cap);
    $('boostPct').textContent = `+${Math.round(b * 100)}%`;
    $('stampCount').textContent = S.visited.length;
    const mig = $('btnMigrate');
    if (S.leg >= CITIES.length) {
      mig.classList.add('on');
      $('migrateSub').textContent = `+${F.feathersFor(S.runSeeds)} golden feathers · keeps your passport`;
    } else mig.classList.remove('on');
  }

  // postmark stamp when the bird lands somewhere
  const pm = $('postmark');
  let lastStampAt = 0;
  function stamp(city, bonus, first) {
    const now = performance.now();
    if (now - lastStampAt < 1400) return; // at high speed, don't strobe
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
    </svg><div class="bonus">+${fmt(bonus)} 🌰</div>`;
    pm.classList.remove('show'); void pm.offsetWidth; pm.classList.add('show');
  }

  // ---------- sheets ----------
  function open(id) { $(id).classList.add('on'); const f = $(id).querySelector('button.go, button, select'); if (f) f.focus(); }
  function close(id) { $(id).classList.remove('on'); }
  document.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => b.closest('.sheet').classList.remove('on'));
  document.querySelectorAll('.sheet').forEach((s) => s.addEventListener('click', (e) => {
    if (e.target === s && s.querySelector('[data-close]')) s.classList.remove('on');
  }));

  let pickBird = 'sparrow';
  function birdPreview(cv, b) {
    const r = 2; cv.width = 120 * r; cv.height = 58 * r;
    const g = cv.getContext('2d'); g.scale(r, r);
    drawBird(g, 58, 34, 22, b, 1.1, 1);
  }
  function buildStart(mode) {
    const laps = S ? S.laps + (mode === 'migrate' ? 1 : 0) : 0;
    const wrap = $('birdPick'); wrap.innerHTML = '';
    for (const b of BIRDS) {
      const locked = b.laps > laps;
      const el = document.createElement('button'); el.className = 'bird'; el.type = 'button';
      el.disabled = locked; el.setAttribute('aria-pressed', b.id === pickBird);
      el.innerHTML = `<canvas aria-hidden="true"></canvas><b>${b.name}</b><small>${locked ? `Unlocks after ${b.laps} migration${b.laps > 1 ? 's' : ''}` : b.trait}</small>`;
      birdPreview(el.querySelector('canvas'), b);
      el.onclick = () => { pickBird = b.id; wrap.querySelectorAll('.bird').forEach((x) => x.setAttribute('aria-pressed', x === el)); };
      wrap.append(el);
    }
    const sel = $('cityPick'); sel.innerHTML = '';
    const regions = [...new Set(CITIES.map((c) => c.region))];
    for (const r of regions) {
      const og = document.createElement('optgroup'); og.label = r;
      for (const c of CITIES.filter((x) => x.region === r)) { const o = new Option(c.name, c.i); og.append(o); }
      sel.append(og);
    }
    sel.value = S ? String(F.cityAt(S, S.leg).i) : String(CITIES.findIndex((c) => c.name === 'New York'));
    const migrating = mode === 'migrate';
    $('startTitle').textContent = migrating ? 'Migrate again' : 'Flyway';
    $('startLede').textContent = migrating
      ? `You keep your passport and gain ${F.feathersFor(S.runSeeds)} golden feathers (+${F.feathersFor(S.runSeeds) * 5}% speed and seeds, forever). Upgrades and seeds reset.`
      : 'Pick a bird and a city. It flies the world on its own; you make it faster.';
    $('btnGo').textContent = migrating ? 'Migrate' : 'Take off';
    $('btnStartCancel').hidden = !migrating;
    $('btnGo').onclick = () => {
      const start = +sel.value;
      if (migrating) S = F.migrateAgain(S, pickBird, start).state;
      else S = F.newState(pickBird, start);
      close('startSheet'); beginFlight(true);
    };
    $('btnStartCancel').onclick = () => close('startSheet');
  }

  $('btnMigrate').onclick = () => { buildStart('migrate'); open('startSheet'); };
  $('btnLapMigrate').onclick = () => { close('lapSheet'); buildStart('migrate'); open('startSheet'); };
  $('btnLapKeep').onclick = () => close('lapSheet');
  $('btnPassport').onclick = () => {
    const box = $('stamps'); box.innerHTML = '';
    const regionCol = { 'North America': '#2557a7', 'South America': '#2b8a57', Africa: '#b5651d', Europe: '#7a3ea0', Asia: '#cf2e3a', Oceania: '#11808a' };
    for (const c of CITIES) {
      const got = S.visited.includes(c.i), d = document.createElement('div');
      d.className = 'stamp' + (got ? ' got' : ''); if (got) d.style.color = regionCol[c.region];
      d.textContent = got ? c.name : '?'; d.title = got ? `${c.name}, ${c.region}` : `Somewhere in ${c.region}`;
      box.append(d);
    }
    $('passText').textContent = `${S.visited.length} of ${CITIES.length} cities stamped.`;
    open('passSheet');
  };
  $('btnMenu').onclick = () => {
    const b = F.birdOf(S);
    $('menuStats').innerHTML = [
      ['Bird', b.name], ['Distance flown', fmt(S.totalKm) + ' km'], ['Cities reached', fmt(S.arrivals, 0)],
      ['Migrations', S.laps], ['Golden feathers', `${S.feathers} (+${S.feathers * 5}%)`], ['Lap progress', `${S.leg % CITIES.length}/${CITIES.length}`],
    ].map(([k, v]) => `<div>${k}<strong>${v}</strong></div>`).join('');
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
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1 && s.levels) return s; } catch (e) {}
    return null;
  }
  // Offline: fly on without flaps for up to 8 hours.
  function catchUp() {
    const away = clamp((Date.now() - (S.lastSave || Date.now())) / 1000, 0, 8 * 3600);
    if (away < 30) return null;
    const seeds0 = S.seeds, km0 = S.totalKm, arr0 = S.arrivals; S.boost = 0;
    const steps = Math.min(4000, Math.ceil(away)), dt = away / steps;
    let lap = false;
    for (let i = 0; i < steps; i++) for (const e of F.step(S, dt, false)) if (e.lapDone) lap = true;
    return { away, seeds: S.seeds - seeds0, km: S.totalKm - km0, cities: S.arrivals - arr0, lap };
  }

  // ======================================================================
  // Main loop
  // ======================================================================
  let lastT = performance.now(), acc = 0, saveT = 0, uiT = 0, lapShownFor = -1;
  function beginFlight(fresh) {
    running = true;
    rebuildRoute(); resetSide();
    const g = currentGeo(); camDir.copy(geoVec(g.lat, g.lon, 1));
    if (fresh) { Z = 0.02; ZT = 0.97; } // the opening move: orbit to wingtip
    refreshUpgrades(); refreshHud(); save();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (running && S) {
      const g = currentGeo();
      const events = F.step(S, dt, !isLand(g.lat, g.lon));
      for (const e of events) {
        stamp(e.city, e.bonus, e.first);
        if (e.lapDone && lapShownFor !== S.leg) {
          lapShownFor = S.leg;
          $('lapText').textContent = `${F.birdOf(S).name} made it all the way around, ${fmt(S.totalKm)} km. Migrate again to bank ${F.feathersFor(S.runSeeds)} golden feathers, or keep flying to earn more first.`;
          open('lapSheet');
        }
      }
      if (events.length) rebuildRoute();
      // zoom easing (the take-off zoom is slower and more deliberate)
      Z = lerp(Z, ZT, 1 - Math.exp(-dt * (Math.abs(ZT - Z) > 0.3 ? 1.6 : 7)));
      const sa = smooth(SIDE_A, SIDE_B, Z);
      sideCanvas.style.opacity = sa;
      if (sa < 1) updateGlobe(dt);
      if (sa > 0) { updateSide(dt); drawSide(); }
      uiT += dt; if (uiT > 0.1) { uiT = 0; refreshHud(); refreshUpgrades(); }
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
  buildUpgrades(); sizeSide();
  camDir.set(0.3, 0.45, 1).normalize();
  const saved = load();
  if (saved) {
    S = saved;
    const r = catchUp();
    beginFlight(false); Z = ZT = 0.97; everZoomed = true; $('hint').style.opacity = 0;
    if (r) showAway(r);
  } else { buildStart('new'); open('startSheet'); }
  setTimeout(() => { if (!everZoomed) $('hint').style.opacity = 1; }, 6000);
  $('hint').style.opacity = 0;
  requestAnimationFrame(frame);

  // for testing in the console
  window.__flyway = { get S() { return S; }, setZoom: (z) => { Z = ZT = z; }, F, layers: { clouds, atmo, earth } };
})();
