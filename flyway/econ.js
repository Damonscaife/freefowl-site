// Flyway — economy, route and save model. No rendering in here, so the
// same file runs in the page and in the pacing simulator.
(function (root) {
  'use strict';

  // The loop the bird flies. Order is a rough lap of the globe; the player
  // picks any city to start from and the route wraps around from there.
  const CITIES = [
    ['Los Angeles', 34.05, -118.24, 'North America'],
    ['Las Vegas', 36.17, -115.14, 'North America'],
    ['Denver', 39.74, -104.99, 'North America'],
    ['Chicago', 41.88, -87.63, 'North America'],
    ['Toronto', 43.65, -79.38, 'North America'],
    ['New York', 40.71, -74.01, 'North America'],
    ['Miami', 25.76, -80.19, 'North America'],
    ['Mexico City', 19.43, -99.13, 'North America'],
    ['Panama City', 8.98, -79.52, 'South America'],
    ['Bogotá', 4.71, -74.07, 'South America'],
    ['Lima', -12.05, -77.04, 'South America'],
    ['Santiago', -33.45, -70.67, 'South America'],
    ['Buenos Aires', -34.60, -58.38, 'South America'],
    ['Rio de Janeiro', -22.91, -43.17, 'South America'],
    ['Cape Town', -33.92, 18.42, 'Africa'],
    ['Johannesburg', -26.20, 28.05, 'Africa'],
    ['Nairobi', -1.29, 36.82, 'Africa'],
    ['Lagos', 6.52, 3.38, 'Africa'],
    ['Dakar', 14.72, -17.47, 'Africa'],
    ['Marrakesh', 31.63, -8.01, 'Africa'],
    ['Cairo', 30.04, 31.24, 'Africa'],
    ['Istanbul', 41.01, 28.98, 'Europe'],
    ['Athens', 37.98, 23.73, 'Europe'],
    ['Rome', 41.90, 12.50, 'Europe'],
    ['Madrid', 40.42, -3.70, 'Europe'],
    ['Paris', 48.86, 2.35, 'Europe'],
    ['London', 51.51, -0.13, 'Europe'],
    ['Reykjavík', 64.15, -21.94, 'Europe'],
    ['Oslo', 59.91, 10.75, 'Europe'],
    ['Berlin', 52.52, 13.40, 'Europe'],
    ['Moscow', 55.76, 37.62, 'Europe'],
    ['Dubai', 25.20, 55.27, 'Asia'],
    ['Mumbai', 19.08, 72.88, 'Asia'],
    ['Delhi', 28.61, 77.21, 'Asia'],
    ['Bangkok', 13.76, 100.50, 'Asia'],
    ['Hong Kong', 22.32, 114.17, 'Asia'],
    ['Shanghai', 31.23, 121.47, 'Asia'],
    ['Beijing', 39.90, 116.40, 'Asia'],
    ['Seoul', 37.57, 126.98, 'Asia'],
    ['Tokyo', 35.68, 139.65, 'Asia'],
    ['Manila', 14.60, 120.98, 'Asia'],
    ['Singapore', 1.35, 103.82, 'Asia'],
    ['Sydney', -33.87, 151.21, 'Oceania'],
    ['Auckland', -36.85, 174.76, 'Oceania'],
    ['Honolulu', 21.31, -157.86, 'Oceania'],
    ['Anchorage', 61.22, -149.90, 'North America'],
    ['Vancouver', 49.28, -123.12, 'North America'],
    ['San Francisco', 37.77, -122.42, 'North America'],
  ].map(([name, lat, lon, region], i) => ({ i, name, lat, lon, region }));

  const R_EARTH = 6371; // km
  const rad = (d) => d * Math.PI / 180;

  function distKm(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Great-circle interpolation, t in [0,1].
  function lerpGeo(a, b, t) {
    const p1 = rad(a.lat), l1 = rad(a.lon), p2 = rad(b.lat), l2 = rad(b.lon);
    const x1 = Math.cos(p1) * Math.cos(l1), y1 = Math.cos(p1) * Math.sin(l1), z1 = Math.sin(p1);
    const x2 = Math.cos(p2) * Math.cos(l2), y2 = Math.cos(p2) * Math.sin(l2), z2 = Math.sin(p2);
    const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
    const w = Math.acos(dot);
    if (w < 1e-9) return { lat: a.lat, lon: a.lon };
    const s1 = Math.sin((1 - t) * w) / Math.sin(w), s2 = Math.sin(t * w) / Math.sin(w);
    const x = s1 * x1 + s2 * x2, y = s1 * y1 + s2 * y2, z = s1 * z1 + s2 * z2;
    return { lat: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, lon: Math.atan2(y, x) * 180 / Math.PI };
  }

  // Starter birds plus species unlocked by completing laps.
  const BIRDS = [
    { id: 'sparrow', name: 'House Sparrow', laps: 0, trait: '+50% seeds', speed: 1, seeds: 1.5, stamina: 1,
      body: '#9a6b43', wing: '#6e4a2c', belly: '#e9dcc6', beak: '#3b2a1c', cap: '#7a7f86' },
    { id: 'swallow', name: 'Barn Swallow', laps: 0, trait: '+30% speed', speed: 1.3, seeds: 1, stamina: 1,
      body: '#1f3f8a', wing: '#16285a', belly: '#f1d7b0', beak: '#1a1a1a', cap: '#b4442e' },
    { id: 'goose', name: 'Canada Goose', laps: 0, trait: 'Flaps hit 2× harder', speed: 1, seeds: 1, stamina: 2,
      body: '#7d6f60', wing: '#4f4539', belly: '#ece6dc', beak: '#161616', cap: '#161616' },
    { id: 'tern', name: 'Arctic Tern', laps: 1, trait: '+40% speed, +40% seeds', speed: 1.4, seeds: 1.4, stamina: 1,
      body: '#e9eef2', wing: '#b9c4cc', belly: '#ffffff', beak: '#d8342b', cap: '#151515' },
    { id: 'albatross', name: 'Albatross', laps: 2, trait: '3× seeds over ocean', speed: 1.2, seeds: 1.2, stamina: 1.5, ocean: 3,
      body: '#f4f2ee', wing: '#3a3632', belly: '#ffffff', beak: '#e8b04a', cap: '#f4f2ee' },
    { id: 'falcon', name: 'Peregrine Falcon', laps: 4, trait: '2× speed', speed: 2, seeds: 1.2, stamina: 1.5,
      body: '#5c6670', wing: '#3a424a', belly: '#efe8dc', beak: '#f2c230', cap: '#22282e' },
  ];

  // Level-milestone doublings, AdVenture Capitalist style.
  const MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000];
  const doublings = (L) => { let n = 0; for (const m of MILESTONES) if (L >= m) n++; return n; };
  const nextMilestone = (L) => MILESTONES.find((m) => m > L) || null;

  // Tuning knobs (the pacing simulator overrides these).
  // Foraging pays a steady seeds/sec that does not depend on speed; speed pays
  // off through city arrivals, which get richer with every city in the run.
  const T = { v0: 0.5, vL: 0.5, k0: 0.5, gW: 1.6, gB: 1.6, gT: 2.2, gF: 2.6, gS: 2.2,
    bW: 5, bB: 8, bT: 150, bF: 600, bS: 100, arrive: 60, cityG: 0.15 };

  const UPGRADES = [
    { id: 'wings', name: 'Wing Strength', icon: '🪽', get base() { return T.bW; }, get growth() { return T.gW; },
      blurb: (L) => `${fmt(wingSpeed(L))} km/s base speed` },
    { id: 'beak', name: 'Forager Beak', icon: '🌰', get base() { return T.bB; }, get growth() { return T.gB; },
      blurb: (L) => `${fmt(forage(L), 1)} seeds/sec foraging` },
    { id: 'tail', name: 'Tailwind', icon: '🌬️', get base() { return T.bT; }, get growth() { return T.gT; },
      blurb: (L) => `×${fmt(1 + 0.25 * L, 2)} speed` },
    { id: 'flock', name: 'Flock', icon: '🐦', get base() { return T.bF; }, get growth() { return T.gF; },
      blurb: (L) => `${L} follower${L === 1 ? '' : 's'} · ×${fmt(1 + 0.5 * L, 1)} seeds, auto-flap` },
    { id: 'stamina', name: 'Stamina', icon: '💪', get base() { return T.bS; }, get growth() { return T.gS; },
      blurb: (L) => `flap boost up to +${Math.round(boostCap(L) * 100)}%` },
    // defences against hawks, owls and hunters
    { id: 'keen', name: 'Keen Eyes', icon: '👁️', base: 2000, growth: 2.4,
      blurb: (L) => `warnings ${fmt(2 + 0.4 * L, 1)}s ahead · ${Math.max(3, 8 - L)} flaps to dodge` },
    { id: 'camo', name: 'Camouflage', icon: '🍂', base: 5000, growth: 2.8,
      blurb: (L) => L ? `predators ${Math.round((1 - 1 / (1 + 0.3 * L)) * 100)}% less often` : 'predators find you less often' },
    // the big-ticket item: the bird dips low to snatch a passing bug for a short rush
    { id: 'bugs', name: 'Bug Catcher', icon: '🪲', base: 25000, growth: 3.2,
      blurb: (L) => L ? `a bug every ~${Math.round(bugEvery(L))}s · ${bugRush(L)}s rush of 2× speed, 3× seeds` : 'dip low to catch bugs: 2× speed, 3× seeds' },
  ];
  const bugEvery = (L) => 50 / (1 + 0.3 * (L - 1));   // seconds between bugs
  const bugRush = (L) => 15 + 3 * (L - 1);            // seconds of rush per bug
  const RUSH_SPEED = 2, RUSH_SEEDS = 3;

  const wingSpeed = (L) => (T.v0 + T.vL * L) * 2 ** doublings(L); // km/s
  const forage = (L) => T.k0 * (1 + L) * 2 ** doublings(L);
  const boostCap = (L) => 0.5 + 0.35 * L;                            // extra speed fraction
  const cost = (u, L) => u.base * u.growth ** L;
  // Total price of n levels starting at L (geometric series).
  const costN = (u, L, n) => u.base * u.growth ** L * (u.growth ** n - 1) / (u.growth - 1);
  function maxAffordable(u, L, seeds) {
    const r = u.growth, c0 = u.base * r ** L;
    if (seeds < c0) return 0;
    return Math.floor(Math.log(seeds * (r - 1) / c0 + 1) / Math.log(r));
  }

  const featherMult = (f) => 1 + 0.05 * f;
  // Feathers earned for this run's lifetime seeds (prestige).
  const feathersFor = (seeds) => Math.floor(Math.sqrt(seeds / 2e4));

  function newState(birdId, startIdx) {
    return {
      v: 1, bird: birdId, start: startIdx, leg: 0, legKm: 0,
      seeds: 0, runSeeds: 0, totalKm: 0, levels: { wings: 0, beak: 0, tail: 0, flock: 0, stamina: 0, keen: 0, camo: 0, bugs: 0 }, rush: 0, stun: 0,
      boost: 0, laps: 0, feathers: 0, visited: [startIdx], arrivals: 0, lastSave: Date.now(),
      createdAt: Date.now(),
    };
  }

  // older saves predate the bug catcher
  function upgradeSave(s) {
    for (const k of ['bugs', 'keen', 'camo']) s.levels[k] = s.levels[k] || 0;
    s.rush = s.rush || 0; s.stun = 0; s.dodged = s.dodged || 0; s.caught = s.caught || 0; return s;
  }

  // ---- predators (live play only) ----
  // A threat warns first; flapping fast (hawk, owl) or climbing (hunter) fills a
  // meter before it strikes. Escaping pays a bonus; getting caught costs one flock
  // follower (or 10% of seeds with no flock) and halves speed for a few seconds.
  const THREAT = {
    warn: (s) => 2 + 0.4 * s.levels.keen,                  // seconds of warning
    taps: (s) => Math.max(3, 8 - s.levels.keen),           // flaps needed vs hawk/owl
    climb: (s) => Math.max(0.6, 1.3 - 0.1 * s.levels.keen),// seconds of climbing vs hunter
    every: (s) => (75 + Math.random() * 45) * (1 + 0.3 * s.levels.camo),
    STUN: 4,
  };
  function escapeBonus(s) { return seedRate(s, false) * 20; }
  function predatorHit(s) {
    s.stun = THREAT.STUN; s.caught = (s.caught || 0) + 1;
    if (s.levels.flock > 0) { s.levels.flock--; return { lost: 'follower' }; }
    const seeds = s.seeds * 0.1; s.seeds -= seeds; return { lost: 'seeds', seeds };
  }
  function predatorMiss(s) { const b = escapeBonus(s); s.seeds += b; s.runSeeds += b; s.dodged = (s.dodged || 0) + 1; return b; }

  const birdOf = (s) => BIRDS.find((b) => b.id === s.bird) || BIRDS[0];
  const cityAt = (s, k) => CITIES[(s.start + k + CITIES.length * 1000) % CITIES.length];
  const legFrom = (s) => cityAt(s, s.leg);
  const legTo = (s) => cityAt(s, s.leg + 1);
  const legLen = (s) => distKm(legFrom(s), legTo(s));

  function baseSpeed(s) {
    const b = birdOf(s);
    return wingSpeed(s.levels.wings) * (1 + 0.25 * s.levels.tail) * b.speed * featherMult(s.feathers);
  }
  // Passive boost from followers flapping alongside, never above the cap.
  const flockBoost = (s) => Math.min(boostCap(s.levels.stamina), 0.04 * s.levels.flock);
  function speed(s) {
    return baseSpeed(s) * (1 + Math.max(s.boost, flockBoost(s))) * (s.rush > 0 ? RUSH_SPEED : 1) * (s.stun > 0 ? 0.5 : 1);
  }
  function seedRate(s, overOcean) {
    const b = birdOf(s);
    const oc = overOcean && b.ocean ? b.ocean : 1;
    return forage(s.levels.beak) * (1 + 0.5 * s.levels.flock) * b.seeds * featherMult(s.feathers) * oc * (s.rush > 0 ? RUSH_SEEDS : 1);
  }
  // Payout for landing in the next city: worth T.arrive seconds of foraging,
  // growing with each city already reached this run.
  const cityMult = (s) => 1 + T.cityG * Math.min(s.leg, 96); // plateaus after two laps
  const arrivalBonus = (s) => seedRate(s, false) * T.arrive * cityMult(s);

  // One flap. Each tap fills the boost meter; the meter drains on its own.
  function flap(s) {
    const cap = boostCap(s.levels.stamina);
    s.boost = Math.min(cap, s.boost + 0.12 * birdOf(s).stamina);
  }

  // Advance the sim by dt seconds. Returns a list of events.
  function step(s, dt, overOcean) {
    const ev = [];
    s.boost = Math.max(0, s.boost - dt * (0.18 + s.boost * 0.25));
    if (s.rush > 0) s.rush = Math.max(0, s.rush - dt);
    if (s.stun > 0) s.stun = Math.max(0, s.stun - dt);
    const earned = seedRate(s, overOcean) * dt;
    s.seeds += earned; s.runSeeds += earned;
    let km = speed(s) * dt;
    let guard = 0;
    while (km > 0 && guard++ < 200) {
      const len = legLen(s);
      const left = len - s.legKm;
      const use = Math.min(km, left);
      s.legKm += use; s.totalKm += use; km -= use;
      if (s.legKm >= len - 1e-6) {
        const to = legTo(s);
        const bonus = arrivalBonus(s);
        s.seeds += bonus; s.runSeeds += bonus; s.arrivals++;
        const first = !s.visited.includes(to.i);
        if (first) s.visited.push(to.i);
        s.leg++; s.legKm = 0;
        const lapDone = s.leg % CITIES.length === 0;
        ev.push({ type: 'arrive', city: to, bonus, first, lapDone });
      }
    }
    return ev;
  }

  // A caught bug starts (or extends) the rush.
  function catchBug(s) { s.rush = Math.max(s.rush, 0) + bugRush(s.levels.bugs || 1); return s.rush; }

  function buy(s, id, n) {
    const u = UPGRADES.find((x) => x.id === id);
    const L = s.levels[id];
    if (n === 'max') n = maxAffordable(u, L, s.seeds);
    if (n <= 0) return 0;
    const c = costN(u, L, n);
    if (c > s.seeds + 1e-9) return 0;
    s.seeds -= c; s.levels[id] += n;
    return n;
  }

  // Prestige: keep feathers, laps and passport; reset the rest.
  function migrateAgain(s, birdId, startIdx) {
    const gained = feathersFor(s.runSeeds);
    const keep = { laps: s.laps + 1, feathers: s.feathers + gained, visited: s.visited, createdAt: s.createdAt };
    const n = newState(birdId, startIdx);
    Object.assign(n, keep);
    if (!n.visited.includes(startIdx)) n.visited.push(startIdx);
    return { state: n, gained };
  }

  const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(x, dp) {
    if (!isFinite(x)) return '∞';
    const neg = x < 0; x = Math.abs(x);
    let out;
    if (x < 1000) out = x < 10 && dp !== 0 ? x.toFixed(dp == null ? 1 : dp) : Math.floor(x).toString();
    else {
      let u = 0; while (x >= 1000 && u < UNITS.length - 1) { x /= 1000; u++; }
      out = (x < 100 ? x.toFixed(2) : x.toFixed(1)) + UNITS[u];
    }
    return (neg ? '-' : '') + out;
  }
  function fmtTime(sec) {
    if (!isFinite(sec)) return '—';
    if (sec < 1) return '<1s';
    if (sec < 60) return Math.ceil(sec) + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ' + Math.floor(sec % 60) + 's';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm';
    return Math.floor(sec / 86400) + 'd ' + Math.floor((sec % 86400) / 3600) + 'h';
  }

  root.Flyway = {
    T, CITIES, BIRDS, UPGRADES, MILESTONES, distKm, lerpGeo, newState, birdOf, cityAt, legFrom, legTo, legLen,
    speed, baseSpeed, seedRate, arrivalBonus, flap, step, buy, cost, costN, maxAffordable, migrateAgain,
    feathersFor, featherMult, bugEvery, bugRush, catchBug, upgradeSave, THREAT, escapeBonus, predatorHit, predatorMiss, RUSH_SPEED, RUSH_SEEDS, boostCap, flockBoost, doublings, nextMilestone, wingSpeed, forage, cityMult, fmt, fmtTime,
  };
})(typeof window !== 'undefined' ? window : globalThis);
