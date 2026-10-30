// Flyway — economy, route and save model. No rendering in here, so the
// same file runs in the page and in the pacing simulator.
(function (root) {
  'use strict';

  // Every place the bird can land. The first 48 keep their positions so older
  // saves (which store indices) stay valid; the rest were added later.
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
    // added with eastbound laps
    ['Seattle', 47.61, -122.33, 'North America'], ['San Diego', 32.72, -117.16, 'North America'],
    ['Phoenix', 33.45, -112.07, 'North America'], ['Salt Lake City', 40.76, -111.89, 'North America'],
    ['Calgary', 51.05, -114.07, 'North America'], ['Edmonton', 53.55, -113.49, 'North America'],
    ['Albuquerque', 35.08, -106.65, 'North America'], ['Winnipeg', 49.90, -97.14, 'North America'],
    ['Minneapolis', 44.98, -93.27, 'North America'], ['Dallas', 32.78, -96.80, 'North America'],
    ['Houston', 29.76, -95.37, 'North America'], ['Kansas City', 39.10, -94.58, 'North America'],
    ['New Orleans', 29.95, -90.07, 'North America'], ['Nashville', 36.16, -86.78, 'North America'],
    ['Atlanta', 33.75, -84.39, 'North America'], ['Detroit', 42.33, -83.05, 'North America'],
    ['Montreal', 45.50, -73.57, 'North America'], ['Washington, D.C.', 38.91, -77.04, 'North America'],
    ['Boston', 42.36, -71.06, 'North America'], ['Halifax', 44.65, -63.57, 'North America'],
    ["St. John's", 47.56, -52.71, 'North America'], ['Monterrey', 25.69, -100.32, 'North America'],
    ['Guadalajara', 20.66, -103.35, 'North America'], ['Cancún', 21.16, -86.85, 'North America'],
    ['Havana', 23.11, -82.37, 'North America'], ['Kingston', 18.02, -76.80, 'North America'],
    ['San Juan', 18.47, -66.11, 'North America'], ['Guatemala City', 14.63, -90.51, 'North America'],
    ['Bermuda', 32.29, -64.78, 'North America'], ['Nuuk', 64.18, -51.69, 'North America'],
    ['Iqaluit', 63.75, -68.52, 'North America'], ['Fairbanks', 64.84, -147.72, 'North America'],
    ['Nome', 64.50, -165.41, 'North America'],
    ['Caracas', 10.48, -66.90, 'South America'], ['Quito', -0.18, -78.47, 'South America'],
    ['Galápagos', -0.74, -90.31, 'South America'], ['La Paz', -16.50, -68.15, 'South America'],
    ['Manaus', -3.12, -60.02, 'South America'], ['Belém', -1.46, -48.50, 'South America'],
    ['Recife', -8.05, -34.88, 'South America'], ['Salvador', -12.97, -38.50, 'South America'],
    ['Brasília', -15.79, -47.88, 'South America'], ['São Paulo', -23.55, -46.63, 'South America'],
    ['Asunción', -25.26, -57.58, 'South America'], ['Montevideo', -34.90, -56.16, 'South America'],
    ['Mendoza', -32.89, -68.83, 'South America'], ['Ushuaia', -54.80, -68.30, 'South America'],
    ['Easter Island', -27.15, -109.43, 'South America'],
    ['Lisbon', 38.72, -9.14, 'Europe'], ['Barcelona', 41.39, 2.17, 'Europe'], ['Dublin', 53.35, -6.26, 'Europe'],
    ['Edinburgh', 55.95, -3.19, 'Europe'], ['Amsterdam', 52.37, 4.90, 'Europe'], ['Brussels', 50.85, 4.35, 'Europe'],
    ['Zurich', 47.38, 8.54, 'Europe'], ['Milan', 45.46, 9.19, 'Europe'], ['Naples', 40.85, 14.27, 'Europe'],
    ['Copenhagen', 55.68, 12.57, 'Europe'], ['Stockholm', 59.33, 18.07, 'Europe'], ['Helsinki', 60.17, 24.94, 'Europe'],
    ['Vienna', 48.21, 16.37, 'Europe'], ['Prague', 50.08, 14.44, 'Europe'], ['Warsaw', 52.23, 21.01, 'Europe'],
    ['Budapest', 47.50, 19.04, 'Europe'], ['Kyiv', 50.45, 30.52, 'Europe'], ['St. Petersburg', 59.93, 30.34, 'Europe'],
    ['Azores', 37.74, -25.67, 'Europe'], ['Tromsø', 69.65, 18.96, 'Europe'], ['Murmansk', 68.97, 33.08, 'Europe'],
    ['Longyearbyen', 78.22, 15.65, 'Europe'],
    ['Casablanca', 33.57, -7.59, 'Africa'], ['Canary Islands', 28.12, -15.43, 'Africa'], ['Cape Verde', 14.93, -23.51, 'Africa'],
    ['Accra', 5.60, -0.19, 'Africa'], ['Tunis', 36.81, 10.18, 'Africa'], ['Tripoli', 32.89, 13.19, 'Africa'],
    ['Khartoum', 15.50, 32.56, 'Africa'], ['Addis Ababa', 9.03, 38.74, 'Africa'], ['Zanzibar', -6.16, 39.19, 'Africa'],
    ['Kinshasa', -4.44, 15.27, 'Africa'], ['Luanda', -8.84, 13.23, 'Africa'], ['Windhoek', -22.56, 17.08, 'Africa'],
    ['Durban', -29.86, 31.02, 'Africa'], ['Antananarivo', -18.88, 47.51, 'Africa'], ['Mauritius', -20.16, 57.50, 'Africa'],
    ['Timbuktu', 16.77, -3.01, 'Africa'], ['St. Helena', -15.92, -5.72, 'Africa'],
    ['Riyadh', 24.71, 46.68, 'Asia'], ['Doha', 25.29, 51.53, 'Asia'], ['Tehran', 35.69, 51.39, 'Asia'],
    ['Baku', 40.41, 49.87, 'Asia'], ['Tashkent', 41.30, 69.24, 'Asia'], ['Karachi', 24.86, 67.01, 'Asia'],
    ['Malé', 4.18, 73.51, 'Asia'], ['Colombo', 6.93, 79.86, 'Asia'], ['Chennai', 13.08, 80.27, 'Asia'],
    ['Kathmandu', 27.72, 85.32, 'Asia'], ['Kolkata', 22.57, 88.36, 'Asia'], ['Dhaka', 23.81, 90.41, 'Asia'],
    ['Almaty', 43.24, 76.89, 'Asia'], ['Novosibirsk', 55.01, 82.93, 'Asia'], ['Ulaanbaatar', 47.89, 106.91, 'Asia'],
    ['Irkutsk', 52.29, 104.30, 'Asia'], ['Yangon', 16.84, 96.17, 'Asia'], ['Hanoi', 21.03, 105.85, 'Asia'],
    ['Ho Chi Minh City', 10.82, 106.63, 'Asia'], ['Kuala Lumpur', 3.14, 101.69, 'Asia'], ['Jakarta', -6.21, 106.85, 'Asia'],
    ['Bali', -8.65, 115.22, 'Asia'], ['Taipei', 25.03, 121.57, 'Asia'], ['Chengdu', 30.57, 104.07, 'Asia'],
    ["Xi'an", 34.34, 108.94, 'Asia'], ['Osaka', 34.69, 135.50, 'Asia'], ['Sapporo', 43.06, 141.35, 'Asia'],
    ['Vladivostok', 43.12, 131.89, 'Asia'], ['Yakutsk', 62.03, 129.73, 'Asia'], ['Magadan', 59.56, 150.80, 'Asia'],
    ['Kamchatka', 53.04, 158.65, 'Asia'], ['Anadyr', 64.73, 177.51, 'Asia'],
    ['Darwin', -12.46, 130.84, 'Oceania'], ['Perth', -31.95, 115.86, 'Oceania'], ['Adelaide', -34.93, 138.60, 'Oceania'],
    ['Melbourne', -37.81, 144.96, 'Oceania'], ['Brisbane', -27.47, 153.03, 'Oceania'], ['Cairns', -16.92, 145.77, 'Oceania'],
    ['Hobart', -42.88, 147.33, 'Oceania'], ['Port Moresby', -9.44, 147.18, 'Oceania'], ['Guam', 13.47, 144.75, 'Oceania'],
    ['Nouméa', -22.27, 166.46, 'Oceania'], ['Fiji', -18.14, 178.44, 'Oceania'], ['Wellington', -41.29, 174.78, 'Oceania'],
    ['Queenstown', -45.03, 168.66, 'Oceania'], ['Samoa', -13.83, -171.76, 'Oceania'], ['Tahiti', -17.54, -149.57, 'Oceania'],
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

  // Every bird. Starters cost nothing; the rest are bought with golden
  // feathers and stay unlocked through every migration. Traits multiply speed,
  // seeds and flap strength; some have specials (ocean seeds, longer bug
  // rushes, easier predator fights, fewer predators).
  const BIRDS = [
    { id: 'pigeon', name: 'Rock Pigeon', cost: 0, tier: 'starter', trait: 'Steady all-rounder: +20% speed and seeds', speed: 1.2, seeds: 1.2, stamina: 1,
      body: '#7d8796', wing: '#5d6674', belly: '#b9c0ca', beak: '#2e2e33', cap: '#4c6a73' },
    { id: 'sparrow', name: 'House Sparrow', cost: 0, tier: 'starter', trait: '+50% seeds', speed: 1, seeds: 1.5, stamina: 1,
      body: '#9a6b43', wing: '#6e4a2c', belly: '#e9dcc6', beak: '#3b2a1c', cap: '#7a7f86' },
    { id: 'swallow', name: 'Barn Swallow', cost: 0, tier: 'starter', trait: '+30% speed', speed: 1.3, seeds: 1, stamina: 1,
      body: '#1f3f8a', wing: '#16285a', belly: '#f1d7b0', beak: '#1a1a1a', cap: '#b4442e' },
    { id: 'goose', name: 'Canada Goose', cost: 3, tier: 'common', trait: 'Flaps hit 2× harder', speed: 1.2, seeds: 1.2, stamina: 2,
      body: '#7d6f60', wing: '#4f4539', belly: '#ece6dc', beak: '#161616', cap: '#161616' },
    { id: 'cardinal', name: 'Northern Cardinal', cost: 8, tier: 'common', trait: '+80% seeds', speed: 1.15, seeds: 1.8, stamina: 1,
      body: '#c8202c', wing: '#9e1822', belly: '#d8414a', beak: '#f08a2e', cap: '#c8202c', crest: true, mask: '#1a1a1a' },
    { id: 'mockingbird', name: 'Mockingbird', cost: 15, tier: 'common', trait: 'Bug rushes last 2× longer, +40% seeds', speed: 1.3, seeds: 1.4, stamina: 1.2, rush: 2,
      body: '#8a8f96', wing: '#55595f', belly: '#e9e9e4', beak: '#1e1e1e', cap: '#8a8f96', wingBar: '#f2f2ee' },
    { id: 'tern', name: 'Arctic Tern', cost: 30, tier: 'rare', trait: '+60% speed, +60% seeds', speed: 1.6, seeds: 1.6, stamina: 1,
      body: '#e9eef2', wing: '#b9c4cc', belly: '#ffffff', beak: '#d8342b', cap: '#151515' },
    { id: 'albatross', name: 'Albatross', cost: 60, tier: 'rare', trait: '4× seeds over ocean', speed: 1.6, seeds: 1.5, stamina: 1.5, ocean: 4,
      body: '#f4f2ee', wing: '#3a3632', belly: '#ffffff', beak: '#e8b04a', cap: '#f4f2ee' },
    { id: 'falcon', name: 'Peregrine Falcon', cost: 120, tier: 'rare', trait: '2.5× speed', speed: 2.5, seeds: 1.5, stamina: 1.5,
      body: '#5c6670', wing: '#3a424a', belly: '#efe8dc', beak: '#f2c230', cap: '#22282e', hook: true },
    { id: 'eagle', name: 'Bald Eagle', cost: 300, tier: 'epic', trait: '2.5× speed and seeds; half the flaps to win fights', speed: 2.5, seeds: 2.5, stamina: 2, fight: 2,
      body: '#4a3222', wing: '#3a2618', belly: '#4a3222', beak: '#f2b630', cap: '#ffffff', head: '#ffffff', hook: true },
    { id: 'rooster', name: 'Rooster', cost: 250000, tier: 'legendary', trait: '10× seeds, crows up a tailwind every city', speed: 4, seeds: 10, stamina: 3, crow: true,
      body: '#b5532a', wing: '#2f5a3a', belly: '#d97a3a', beak: '#f2c230', cap: '#b5532a', comb: true, longTail: true },
    { id: 'penguin', name: 'Emperor Penguin', cost: 2000000, tier: 'legendary', trait: '8× speed, 8× seeds, 6× over ocean', speed: 8, seeds: 8, stamina: 3, ocean: 6,
      body: '#1b1d24', wing: '#15161c', belly: '#f6f4ee', beak: '#f08a2e', cap: '#1b1d24', cheek: '#f2c230', stubby: true },
    { id: 'kiwi', name: 'Kiwi', cost: 20000000, tier: 'legendary', trait: '20× speed, 12× seeds', speed: 20, seeds: 12, stamina: 4,
      body: '#7a5a38', wing: '#6a4c2e', belly: '#8c6a44', beak: '#d8c79a', cap: '#7a5a38', longBeak: true, stubby: true },
    { id: 'dodo', name: 'Dodo', cost: 500000000, tier: 'legendary', trait: '10× everything, but predators find it twice as often and strike twice as fast', speed: 10, seeds: 10, stamina: 10, prey: 2,
      body: '#8c8a86', wing: '#6e6c69', belly: '#a9a6a0', beak: '#e0c48a', cap: '#8c8a86', bigBeak: true, stubby: true, longTail: true },
    // the secret one: its specs stay hidden until it is bought
    { id: 'shadow', name: 'Shadow Falcon', cost: 10000000000, tier: 'legendary', secret: true, trait: '69× everything', speed: 69, seeds: 69, stamina: 69, fight: 69, camo: 69,
      body: '#2a2340', wing: '#171226', belly: '#3d3360', beak: '#9b8cff', cap: '#120e1f', hook: true, eye: '#b9a8ff' },
  ];

  // Permanent upgrades bought with golden feathers. They survive every migration.
  const PERKS = [
    { id: 'swift', name: 'Swift Wings', icon: '💨', base: 2, growth: 1.15, blurb: (L) => `×${fmt(1.1 ** L, 2)} speed` },
    { id: 'gold', name: 'Golden Beak', icon: '🌰', base: 2, growth: 1.15, blurb: (L) => `×${fmt(1.1 ** L, 2)} seeds` },
    { id: 'nest', name: 'Nest Egg', icon: '🥚', base: 5, growth: 3, max: 12, blurb: (L) => L ? `start each migration with ${fmt(nestEgg(L))} seeds` : 'start each migration with seeds in hand' },
  ];
  const nestEgg = (L) => (L ? 100 * 10 ** (L - 1) : 0);
  const perkCost = (p, L) => Math.ceil(p.base * p.growth ** L);
  const perkSpeed = (s) => 1.1 ** ((s.perks && s.perks.swift) || 0);
  const perkSeeds = (s) => 1.1 ** ((s.perks && s.perks.gold) || 0);
  function buyPerk(s, id) {
    const p = PERKS.find((x) => x.id === id), L = s.perks[id] || 0;
    if (!p || (p.max && L >= p.max)) return false;
    const c = perkCost(p, L); if (s.feathers < c) return false;
    s.feathers -= c; s.perks[id] = L + 1; return true;
  }
  function buyBird(s, id) {
    const b = BIRDS.find((x) => x.id === id);
    if (!b || s.birds.includes(id) || s.feathers < b.cost) return false;
    s.feathers -= b.cost; s.birds.push(id); return true;
  }
  const ownsBird = (s, id) => !!s && (s.birds || []).includes(id) || BIRDS.find((b) => b.id === id).cost === 0;

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
  const PRICE = 2; // every upgrade costs double its listed base
  const cost = (u, L) => PRICE * u.base * u.growth ** L;
  // Total price of n levels starting at L (geometric series).
  const costN = (u, L, n) => PRICE * u.base * u.growth ** L * (u.growth ** n - 1) / (u.growth - 1);
  function maxAffordable(u, L, seeds) {
    const r = u.growth, c0 = PRICE * u.base * r ** L;
    if (seeds < c0) return 0;
    return Math.floor(Math.log(seeds * (r - 1) / c0 + 1) / Math.log(r));
  }

  const featherMult = () => 1; // feathers are spent now, not a passive bonus
  // Feathers earned for this run's lifetime seeds (prestige).
  const feathersFor = (seeds) => Math.floor(Math.sqrt(seeds / 2e4));

  function newState(birdId, startIdx) {
    const s = {
      v: 1, bird: birdId, start: startIdx, leg: 0, legKm: 0, ri: 0, route: null, lapsFlown: 0,
      gear: {}, space: null, spaceStage: -1, cosmos: [], noLapPrompt: false, birds: BIRDS.filter((b) => b.cost === 0).map((b) => b.id), perks: {},
      seeds: 0, runSeeds: 0, totalKm: 0, levels: { wings: 0, beak: 0, tail: 0, flock: 0, stamina: 0, keen: 0, camo: 0, bugs: 0 }, rush: 0, stun: 0, wx: { type: 'clear', left: 0 },
      boost: 0, laps: 0, feathers: 0, visited: [startIdx], arrivals: 0, lastSave: Date.now(),
      createdAt: Date.now(),
    };
    s.route = genLap(s, startIdx);
    return s;
  }

  // ---- eastbound laps ----
  // Each lap is a steady sweep east around the globe, hopping between cities
  // in a latitude band. Later laps use other bands and favour places the bird
  // has not been, so each trip around shows somewhere new.
  const BANDS = [40, 22, 52, -28, 32, 8, 60, -15, 45, 28, -35, 15];
  function genLap(s, startIdx) {
    const n = s.lapsFlown || 0, start = CITIES[startIdx];
    const band = n === 0 ? start.lat : BANDS[(n - 1) % BANDS.length] + (Math.random() - 0.5) * 8;
    const route = [startIdx], used = new Set([startIdx]), seen = new Set(s.visited || []);
    let cur = start, acc = 0;
    while (acc < 360 && route.length < 70) {
      let best = null, bs = Infinity, bd = 0;
      for (const maxD of [75, 130, 200]) {
        for (const c of CITIES) {
          if (used.has(c.i)) continue;
          const d = (((c.lon - cur.lon) % 360) + 360) % 360;
          if (d < 5 || d > maxD) continue;
          // drift toward the band, prefer ~16 degree hops and unvisited places
          const target = cur.lat + (band - cur.lat) * 0.45;
          const sc = ((d - 16) / 8) ** 2 + Math.abs(c.lat - target) * 0.35 + (seen.has(c.i) ? 3 : 0) + Math.random() * 1.5;
          if (sc < bs) { bs = sc; best = c; bd = d; }
        }
        if (best) break;
      }
      if (!best) break;
      route.push(best.i); used.add(best.i); acc += bd; cur = best;
    }
    return route;
  }
  const lapLegs = (s) => s.route.length - 1;

  // older saves predate the bug catcher
  function upgradeSave(s) {
    for (const k of ['bugs', 'keen', 'camo']) s.levels[k] = s.levels[k] || 0;
    if (!s.route) { // saves from the fixed 48-city loop
      const cur = (s.start + s.leg) % 48;
      s.lapsFlown = Math.floor(s.leg / 48); s.route = genLap(s, cur); s.ri = 0; s.legKm = 0;
    }
    s.gear = s.gear || {}; s.space = s.space || null; s.cosmos = s.cosmos || []; s.perks = s.perks || {};
    if (!s.birds) { // before feathers were spent: keep what the old lap-count unlocks gave
      const old = { tern: 1, albatross: 2, falcon: 4 };
      s.birds = BIRDS.filter((b) => b.cost === 0 || (old[b.id] && (s.laps || 0) >= old[b.id]) || b.id === s.bird).map((b) => b.id);
    }
    if (s.spaceStage == null) s.spaceStage = -1;
    s.rush = s.rush || 0; s.stun = 0; s.wx = s.wx || { type: 'clear', left: 0 }; s.dodged = s.dodged || 0; s.caught = s.caught || 0; return s;
  }

  // ---- predators (live play only) ----
  // A threat warns first; flapping fast (hawk, owl) or climbing (hunter) fills a
  // meter before it strikes. Escaping pays a bonus; getting caught costs one flock
  // follower (or 10% of seeds with no flock) and halves speed for a few seconds.
  const THREAT = {
    warn: (s) => (2 + 0.4 * s.levels.keen) / (birdOf(s).prey || 1), // seconds of warning (the dodo gets half)
    taps: (s) => Math.max(2, Math.ceil((8 - Math.min(5, s.levels.keen)) / (birdOf(s).fight || 1))), // flaps needed vs hawk/owl
    climb: (s) => Math.max(0.6, 1.3 - 0.1 * s.levels.keen),// seconds of climbing vs hunter
    every: (s) => (75 + Math.random() * 45) * (1 + 0.3 * s.levels.camo) * (birdOf(s).camo || 1) / (birdOf(s).prey || 1),
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
  const legFrom = (s) => CITIES[s.route[s.ri]];
  const legTo = (s) => CITIES[s.route[s.ri + 1]];
  const legLen = (s) => distKm(legFrom(s), legTo(s));

  function baseSpeed(s) {
    const b = birdOf(s);
    return wingSpeed(s.levels.wings) * (1 + 0.25 * s.levels.tail) * b.speed * perkSpeed(s);
  }
  // Passive boost from followers flapping alongside, never above the cap.
  const flockBoost = (s) => Math.min(boostCap(s.levels.stamina), 0.04 * s.levels.flock);
  function speed(s) {
    return baseSpeed(s) * (1 + Math.max(s.boost, flockBoost(s))) * (s.rush > 0 ? RUSH_SPEED : 1) * (s.stun > 0 ? 0.5 : 1) * wxOf(s).speed;
  }
  function seedRate(s, overOcean) {
    const b = birdOf(s);
    const oc = overOcean && b.ocean ? b.ocean : 1;
    return forage(s.levels.beak) * (1 + 0.5 * s.levels.flock) * b.seeds * perkSeeds(s) * oc * (s.rush > 0 ? RUSH_SEEDS : 1) * wxOf(s).seeds * cosmicMult(s);
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
    if (s.wx && s.wx.left > 0) { s.wx.left -= dt; if (s.wx.left <= 0) s.wx = { type: 'clear', left: 0, calm: 8 }; }
    else if (s.wx && s.wx.calm > 0) s.wx.calm -= dt;
    const earned = seedRate(s, overOcean) * dt;
    s.seeds += earned; s.runSeeds += earned;
    if (s.space) {
      if (s.space.arrived) return ev; // in orbit: foraging only
      const body = SPACE[s.space.dest], v = spaceSpeed(s);
      const use = Math.min(body.km - s.space.km, v * dt);
      s.space.km += use; s.totalKm += use;
      if (s.space.km >= body.km - 1e-6) {
        s.space.arrived = true; s.spaceStage = s.space.dest;
        const bonus = seedRate(s, false) * 120 * (s.space.dest + 1);
        s.seeds += bonus; s.runSeeds += bonus;
        const first = !s.cosmos.includes(body.id);
        if (first) s.cosmos.push(body.id);
        ev.push({ type: 'space', body, bonus, first });
      }
      return ev;
    }
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
        s.leg++; s.ri++; s.legKm = 0;
        let lapDone = false;
        if (s.ri >= lapLegs(s)) {
          lapDone = true; s.lapsFlown++;
          s.route = genLap(s, s.route[s.route.length - 1]); s.ri = 0;
        }
        // a new forecast only once the current one (or a calm spell) has run its course
        if (!s.wx || (s.wx.left <= 0 && !(s.wx.calm > 0))) s.wx = rollWeather();
        // the rooster crows up a tailwind whenever the sky is calm
        if (birdOf(s).crow && s.wx.type === 'clear') s.wx = { type: 'tailwind', left: 12 };
        ev.push({ type: 'arrive', city: to, bonus, first, lapDone, wx: s.wx.type });
      }
    }
    return ev;
  }

  // ---- weather ----
  // Each leg gets a forecast when the bird leaves a city. It lasts until the
  // next landing or WX_SECS, whichever comes first, so it never flickers at speed.
  const WX_SECS = 30;
  const WEATHER = {
    clear: { name: 'Clear skies', icon: '☀️', speed: 1, seeds: 1, weight: 38 },
    tailwind: { name: 'Tailwind', icon: '💨', speed: 1.5, seeds: 1, weight: 22, note: '+50% speed' },
    headwind: { name: 'Headwind', icon: '🌬️', speed: 0.7, seeds: 1.6, weight: 15, note: '−30% speed, +60% seeds' },
    rain: { name: 'Rain', icon: '🌧️', speed: 1, seeds: 1.3, weight: 15, note: '+30% seeds' },
    storm: { name: 'Storm', icon: '⛈️', speed: 0.85, seeds: 1.5, weight: 10, note: 'predators grounded, +50% seeds' },
  };
  function rollWeather() {
    const types = Object.keys(WEATHER), total = types.reduce((a, k) => a + WEATHER[k].weight, 0);
    let r = Math.random() * total;
    // clear skies also hold for a while, so calm stretches feel deliberate too
    for (const k of types) { r -= WEATHER[k].weight; if (r <= 0) return k === 'clear' ? { type: k, left: 0, calm: 20 } : { type: k, left: WX_SECS }; }
    return { type: 'clear', left: 0 };
  }
  const wxOf = (s) => WEATHER[(!s.space && s.wx && s.wx.type) || 'clear'];

  // ---- beyond Earth ----
  // Gear is bought once per run, in order. The shuttle opens the Moon; each
  // engine opens the next bodies. A trip takes roughly 'secs' seconds, a bit
  // less the faster the bird's wings are. Reaching a body for the first time
  // ever adds +25% to all seeds, for good.
  const GEAR = [
    { id: 'helmet', name: 'Space Helmet', icon: '🫧', cost: 4e7, blurb: 'a glass bubble to breathe in' },
    { id: 'suit', name: 'Pressure Suit', icon: '🧑‍🚀', cost: 3e8, blurb: 'keeps the cold of space out' },
    { id: 'pack', name: 'Rocket Pack', icon: '🎒', cost: 2e9, blurb: 'thrust where wings have no air to push' },
    { id: 'shuttle', name: 'Shuttle', icon: '🚀', cost: 1.5e10, blurb: 'opens the trip to the Moon' },
    { id: 'ion', name: 'Ion Engine', icon: '🔋', cost: 3e14, blurb: 'opens the trip to Mars' },
    { id: 'fusion', name: 'Fusion Drive', icon: '☢️', cost: 2e17, blurb: 'opens Jupiter and Saturn' },
    { id: 'sail', name: 'Solar Sail', icon: '⛵', cost: 5e19, blurb: 'opens Uranus, Neptune and Pluto' },
    { id: 'warp', name: 'Warp Wings', icon: '✨', cost: 1e22, blurb: 'opens Alpha Centauri' },
  ];
  const SPACE = [
    { id: 'moon', name: 'the Moon', short: 'Moon', km: 384400, secs: 60, needs: 'shuttle', color: '#c9c6bd' },
    { id: 'mars', name: 'Mars', short: 'Mars', km: 7.8e7, secs: 120, needs: 'ion', color: '#c1502e' },
    { id: 'jupiter', name: 'Jupiter', short: 'Jupiter', km: 6.3e8, secs: 180, needs: 'fusion', color: '#d8b48a', bands: true },
    { id: 'saturn', name: 'Saturn', short: 'Saturn', km: 1.28e9, secs: 180, needs: 'fusion', color: '#e3cf98', ring: true },
    { id: 'uranus', name: 'Uranus', short: 'Uranus', km: 2.7e9, secs: 240, needs: 'sail', color: '#9fd8e0' },
    { id: 'neptune', name: 'Neptune', short: 'Neptune', km: 4.35e9, secs: 240, needs: 'sail', color: '#4a6fd6' },
    { id: 'pluto', name: 'Pluto', short: 'Pluto', km: 5.9e9, secs: 240, needs: 'sail', color: '#cdb59a' },
    { id: 'centauri', name: 'Alpha Centauri', short: 'Alpha Centauri', km: 4.1e13, secs: 600, needs: 'warp', color: '#ffe9a8', star: true },
  ];
  const cosmicMult = (s) => 1 + 0.25 * ((s.cosmos && s.cosmos.length) || 0);
  function nextGear(s) { return GEAR.find((g) => !s.gear[g.id]) || null; }
  function buyGear(s, id) {
    const g = GEAR.find((x) => x.id === id);
    if (!g || s.gear[id] || nextGear(s) !== g || s.seeds < g.cost) return false;
    s.seeds -= g.cost; s.gear[id] = true; return true;
  }
  // the body the next launch goes to, if the gear for it is owned
  function nextBody(s) {
    const b = SPACE[s.spaceStage + 1];
    return b && s.gear[b.needs] ? b : null;
  }
  function spaceSpeed(s) {
    const b = SPACE[s.space ? s.space.dest : s.spaceStage + 1];
    if (!b) return 0;
    const k = 1 + 0.6 * Math.log10(1 + baseSpeed(s));
    return b.km / b.secs * k;
  }
  function launch(s) {
    const b = nextBody(s); if (!b || (s.space && !s.space.arrived)) return false;
    const from = s.space && s.space.arrived ? SPACE[s.space.dest].short : 'Earth';
    s.space = { dest: SPACE.indexOf(b), km: 0, arrived: false, from }; s.boost = 0; s.rush = 0; s.stun = 0;
    return true;
  }
  function returnToEarth(s) { s.space = null; }

  // A caught bug starts (or extends) the rush.
  function catchBug(s) { s.rush = Math.max(s.rush, 0) + bugRush(s.levels.bugs || 1) * (birdOf(s).rush || 1); return s.rush; }

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
    const keep = { laps: s.laps + 1, feathers: s.feathers + gained, visited: s.visited, createdAt: s.createdAt, cosmos: s.cosmos || [], noLapPrompt: !!s.noLapPrompt,
      birds: s.birds, perks: s.perks };
    const n = newState(birdId, startIdx);
    Object.assign(n, keep);
    if (!n.visited.includes(startIdx)) n.visited.push(startIdx);
    n.route = genLap(n, startIdx); // with the passport, so the first lap favours new places
    n.seeds = nestEgg(n.perks.nest || 0);
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
    T, PRICE, CITIES, BIRDS, UPGRADES, MILESTONES, distKm, lerpGeo, newState, birdOf, legFrom, legTo, legLen, genLap, lapLegs,
    GEAR, SPACE, cosmicMult, nextGear, buyGear, nextBody, spaceSpeed, launch, returnToEarth,
    speed, baseSpeed, seedRate, arrivalBonus, flap, step, buy, cost, costN, maxAffordable, migrateAgain,
    feathersFor, featherMult, PERKS, perkCost, buyPerk, buyBird, ownsBird, nestEgg, perkSpeed, perkSeeds, bugEvery, bugRush, catchBug, upgradeSave, WEATHER, wxOf, rollWeather, THREAT, escapeBonus, predatorHit, predatorMiss, RUSH_SPEED, RUSH_SEEDS, boostCap, flockBoost, doublings, nextMilestone, wingSpeed, forage, cityMult, fmt, fmtTime,
  };
})(typeof window !== 'undefined' ? window : globalThis);
