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
    { id: 'pigeon', name: 'Rock Pigeon', cost: 0, tier: 'common', trait: 'Steady all-rounder: +20% speed and seeds', speed: 1.2, seeds: 1.2, stamina: 1,
      body: '#7d8796', wing: '#5d6674', belly: '#b9c0ca', beak: '#2e2e33', cap: '#4c6a73' },
    { id: 'sparrow', name: 'House Sparrow', cost: 0, tier: 'common', trait: '+50% seeds', speed: 1, seeds: 1.5, stamina: 1,
      body: '#9a6b43', wing: '#6e4a2c', belly: '#e9dcc6', beak: '#3b2a1c', cap: '#7a7f86' },
    { id: 'swallow', name: 'Barn Swallow', cost: 0, tier: 'common', trait: '+30% speed', speed: 1.3, seeds: 1, stamina: 1,
      body: '#1f3f8a', wing: '#16285a', belly: '#f1d7b0', beak: '#1a1a1a', cap: '#b4442e' },
    { id: 'goose', name: 'Canada Goose', cost: 10, tier: 'uncommon', trait: 'Flaps hit 2× harder', speed: 1.2, seeds: 1.2, stamina: 2,
      body: '#7d6f60', wing: '#4f4539', belly: '#ece6dc', beak: '#161616', cap: '#161616' },
    { id: 'cardinal', name: 'Northern Cardinal', cost: 25, tier: 'uncommon', trait: '+80% seeds', speed: 1.15, seeds: 1.8, stamina: 1,
      body: '#c8202c', wing: '#9e1822', belly: '#d8414a', beak: '#f08a2e', cap: '#c8202c', crest: true, mask: '#1a1a1a' },
    { id: 'mockingbird', name: 'Mockingbird', cost: 40, tier: 'uncommon', trait: 'Bug rushes last 2× longer, +40% seeds', speed: 1.3, seeds: 1.4, stamina: 1.2, rush: 2,
      body: '#8a8f96', wing: '#55595f', belly: '#e9e9e4', beak: '#1e1e1e', cap: '#8a8f96', wingBar: '#f2f2ee' },
    { id: 'tern', name: 'Arctic Tern', cost: 75, tier: 'rare', trait: '+60% speed, +60% seeds', speed: 1.6, seeds: 1.6, stamina: 1,
      body: '#e9eef2', wing: '#b9c4cc', belly: '#ffffff', beak: '#d8342b', cap: '#151515' },
    { id: 'albatross', name: 'Albatross', cost: 120, tier: 'rare', trait: '4× seeds over ocean', speed: 1.6, seeds: 1.5, stamina: 1.5, ocean: 4,
      body: '#f4f2ee', wing: '#3a3632', belly: '#ffffff', beak: '#e8b04a', cap: '#f4f2ee' },
    { id: 'falcon', name: 'Peregrine Falcon', cost: 200, tier: 'rare', trait: '2.5× speed', speed: 2.5, seeds: 1.5, stamina: 1.5,
      body: '#5c6670', wing: '#3a424a', belly: '#efe8dc', beak: '#f2c230', cap: '#22282e', hook: true },
    { id: 'eagle', name: 'Bald Eagle', cost: 400, tier: 'epic', trait: '2.5× speed and seeds; half the flaps to win fights', speed: 2.5, seeds: 2.5, stamina: 2, fight: 2,
      body: '#4a3222', wing: '#3a2618', belly: '#4a3222', beak: '#f2b630', cap: '#ffffff', head: '#ffffff', hook: true },
    { id: 'rooster', name: 'Rooster', cost: 2500, tier: 'legendary', trait: '10× seeds, crows up a tailwind every city', speed: 4, seeds: 10, stamina: 3, crow: true,
      body: '#b5532a', wing: '#2f5a3a', belly: '#d97a3a', beak: '#f2c230', cap: '#b5532a', comb: true, longTail: true },
    { id: 'penguin', name: 'Emperor Penguin', cost: 6000, tier: 'legendary', trait: '8× speed, 8× seeds, 6× over ocean', speed: 8, seeds: 8, stamina: 3, ocean: 6,
      body: '#1b1d24', wing: '#15161c', belly: '#f6f4ee', beak: '#f08a2e', cap: '#1b1d24', cheek: '#f2c230', stubby: true },
    { id: 'kiwi', name: 'Kiwi', cost: 15000, tier: 'legendary', trait: '20× speed, 12× seeds', speed: 20, seeds: 12, stamina: 4,
      body: '#7a5a38', wing: '#6a4c2e', belly: '#8c6a44', beak: '#d8c79a', cap: '#7a5a38', longBeak: true, stubby: true },
    { id: 'dodo', name: 'Dodo', cost: 40000, tier: 'legendary', trait: '10× everything, but predators find it twice as often and strike twice as fast', speed: 10, seeds: 10, stamina: 10, prey: 2,
      body: '#8c8a86', wing: '#6e6c69', belly: '#a9a6a0', beak: '#e0c48a', cap: '#8c8a86', bigBeak: true, stubby: true, longTail: true },
    // the secret one: its specs stay hidden until it is bought
    { id: 'shadow', name: 'Shadow Falcon', cost: 150000, tier: 'legendary', secret: true, trait: '69× everything', speed: 69, seeds: 69, stamina: 69, fight: 69, camo: 69,
      body: '#2a2340', wing: '#171226', belly: '#3d3360', beak: '#9b8cff', cap: '#120e1f', hook: true, eye: '#b9a8ff' },
    // ---- hatched from golden eggs only (egg: true) ----
    // Poor: plain everyday birds
    E('starling', 'European Starling', 'poor', '+5% speed and seeds', 1.05, 1.05, 1, '#2b2f36', '#1f2228', '#3a3f48', '#e8c84a', '#2b2f36', { wingBar: '#d9d2a8' }),
    E('grackle', 'Common Grackle', 'poor', '+5% speed and seeds', 1.05, 1.05, 1, '#2a2440', '#1d1830', '#2f2a48', '#151515', '#3c3470', { eye: '#f2e14a' }),
    E('cowbird', 'Brown-headed Cowbird', 'poor', '+8% seeds', 1, 1.08, 1, '#25262a', '#1c1d20', '#2d2e33', '#2a2a2a', '#6b4a33', { head: '#6b4a33' }),
    E('dove', 'Mourning Dove', 'poor', '+8% speed', 1.08, 1, 1, '#b9a48c', '#9c8670', '#d8c6b0', '#2a2a2a', '#c4b09a', { longTail: true }),
    E('songsparrow', 'Song Sparrow', 'poor', '+5% speed and seeds', 1.05, 1.05, 1, '#8a6b52', '#6c5240', '#e6d9c8', '#5a4636', '#8a5a3c', {}),
    E('dunnock', 'Dunnock', 'poor', '+8% seeds', 1, 1.08, 1, '#7a5a44', '#5e4433', '#9aa0a8', '#2a2a2a', '#7d848c', {}),
    E('chipping', 'Chipping Sparrow', 'poor', '+5% speed and seeds', 1.05, 1.05, 1, '#9a7a5a', '#7a5c42', '#d9dcdf', '#2a2a2a', '#b5552e', {}),
    E('feralduck', 'Feral Duck', 'poor', '+10% seeds over ocean', 1, 1.05, 1, '#e9e4d8', '#c9c2b4', '#f4f1ea', '#f0a83a', '#e9e4d8', { stubby: true, ocean: 1.1 }),
    // Common
    E('robin', 'American Robin', 'common', '+20% speed and seeds', 1.2, 1.2, 1, '#5a5550', '#45413d', '#d8622e', '#f0c23a', '#2e2c2a', {}),
    E('bluejay', 'Blue Jay', 'common', '+25% seeds', 1.15, 1.25, 1, '#3a78c9', '#2b5ea3', '#eef1f4', '#1a1a1a', '#3a78c9', { crest: true, wingBar: '#ffffff' }),
    E('chickadee', 'Black-capped Chickadee', 'common', '+20% speed and seeds', 1.2, 1.2, 1, '#9aa2a8', '#7c848a', '#f2ede2', '#1a1a1a', '#151515', { cheek: '#ffffff' }),
    E('mallard', 'Mallard', 'common', '+50% seeds over ocean', 1.15, 1.15, 1.2, '#8c6a4c', '#5a4636', '#a8886a', '#e8c43a', '#1f6b3a', { head: '#1f6b3a', stubby: true, ocean: 1.5 }),
    E('gull', 'Herring Gull', 'common', '+60% seeds over ocean', 1.2, 1.1, 1, '#f2f2ef', '#9aa3ab', '#ffffff', '#f0c23a', '#f2f2ef', { ocean: 1.6 }),
    E('blackbird', 'Red-winged Blackbird', 'common', '+25% speed', 1.25, 1.1, 1, '#18181c', '#121216', '#202026', '#1a1a1a', '#18181c', { wingBar: '#d8242c' }),
    E('housefinch', 'House Finch', 'common', '+25% seeds', 1.1, 1.25, 1, '#8a6a58', '#6a5040', '#e6d8c8', '#9a8a7a', '#c8343c', { head: '#c8343c' }),
    E('flicker', 'Northern Flicker', 'common', 'bugs come 20% more often', 1.2, 1.2, 1, '#a8846a', '#8a6a52', '#efe2cc', '#2a2a2a', '#9aa0a8', { mask: '#d8343c', bugs: 1.2 }),
    E('killdeer', 'Killdeer', 'common', '+25% speed', 1.25, 1.15, 1, '#9a7a58', '#7a5e44', '#ffffff', '#1a1a1a', '#9a7a58', { mask: '#1a1a1a' }),
    E('bluebird', 'Eastern Bluebird', 'common', '+20% speed and seeds', 1.2, 1.2, 1, '#3a6fd0', '#2c56a8', '#d87a3a', '#1a1a1a', '#3a6fd0', {}),
    E('cedar', 'Cedar Waxwing', 'common', '+20% speed and seeds', 1.2, 1.2, 1, '#b39a78', '#8a7a68', '#e8dcae', '#1a1a1a', '#b39a78', { crest: true, mask: '#1a1a1a' }),
    E('nuthatch', 'Nuthatch', 'common', '+25% seeds', 1.1, 1.25, 1, '#6f87a8', '#556a88', '#f2ede6', '#2a2a2a', '#1f2430', {}),
    // Uncommon
    E('goldfinch', 'American Goldfinch', 'uncommon', '+60% seeds', 1.4, 1.6, 1.2, '#f2d02a', '#1a1a1a', '#f6dc4a', '#e89a3a', '#151515', { wingBar: '#ffffff' }),
    E('oriole', 'Baltimore Oriole', 'uncommon', '+50% speed and seeds', 1.5, 1.5, 1.2, '#f08a1e', '#1a1a1a', '#f59a2e', '#5a5a5a', '#151515', { head: '#151515', wingBar: '#ffffff' }),
    E('tanager', 'Scarlet Tanager', 'uncommon', '+60% speed', 1.6, 1.4, 1.2, '#d81e2a', '#151515', '#e0303a', '#c8b89a', '#d81e2a', {}),
    E('kingfisher', 'Belted Kingfisher', 'uncommon', '2× seeds over ocean, bugs 30% more often', 1.4, 1.4, 1.2, '#4a78a8', '#3a5f88', '#ffffff', '#1a1a1a', '#4a78a8', { crest: true, bigBeak: true, ocean: 2, bugs: 1.3 }),
    E('raven', 'Common Raven', 'uncommon', 'half the flaps to win fights', 1.4, 1.4, 1.4, '#16161c', '#101014', '#1e1e26', '#151515', '#16161c', { bigBeak: true, fight: 1.5 }),
    E('magpie', 'Eurasian Magpie', 'uncommon', '+70% seeds', 1.4, 1.7, 1.2, '#14161c', '#1e3a6a', '#ffffff', '#151515', '#14161c', { longTail: true, wingBar: '#ffffff' }),
    E('puffin', 'Atlantic Puffin', 'uncommon', '2.5× seeds over ocean', 1.4, 1.4, 1.2, '#16161c', '#101014', '#ffffff', '#f06a2a', '#16161c', { cheek: '#ffffff', bigBeak: true, stubby: true, ocean: 2.5 }),
    E('heron', 'Great Blue Heron', 'uncommon', '+50% speed, calm in storms', 1.5, 1.4, 1.4, '#7a8aa0', '#5e6c80', '#c8d0da', '#e8c43a', '#e8ecf0', { longBeak: true, storm: true }),
    E('woodduck', 'Wood Duck', 'uncommon', '+60% seeds, 1.5× over ocean', 1.4, 1.6, 1.2, '#6a4a3a', '#2a4a5a', '#c89a6a', '#d8342b', '#1f6b4a', { head: '#1f6b4a', crest: true, stubby: true, ocean: 1.5 }),
    E('bunting', 'Painted Bunting', 'uncommon', '+60% speed and seeds', 1.6, 1.6, 1, '#2a4ad0', '#3aa04a', '#d8302a', '#6a6a6a', '#2a4ad0', { head: '#2a4ad0' }),
    E('roadrunner', 'Greater Roadrunner', 'uncommon', '+80% speed', 1.8, 1.3, 1.4, '#8a7258', '#5e4c3a', '#d8ccb8', '#2a2a2a', '#3a3028', { crest: true, longTail: true }),
    E('crane', 'Sandhill Crane', 'uncommon', '+50% speed, +1 golden feather per lap', 1.5, 1.4, 1.4, '#a8a29a', '#8a847c', '#c8c2ba', '#3a3a3a', '#d8342b', { longBeak: true, feathers: 1 }),
    E('swift', 'Common Swift', 'uncommon', '+90% speed', 1.9, 1.2, 1.2, '#3a3530', '#2a2622', '#4a443e', '#1a1a1a', '#3a3530', { }),
    E('lark', 'Skylark', 'uncommon', '+60% seeds, bugs 30% more often', 1.4, 1.6, 1.2, '#a8906a', '#8a7454', '#e8dcc4', '#6a5a4a', '#a8906a', { crest: true, bugs: 1.3 }),
    // Rare
    E('snowyowl', 'Snowy Owl', 'rare', '2.2× speed and seeds; predators find you half as often', 2.2, 2.2, 1.5, '#f4f4f0', '#e2e2dc', '#ffffff', '#2a2a2a', '#f4f4f0', { owl: true, talons: true, eye: '#f2c230', camo: 2 }),
    E('hornedowl', 'Great Horned Owl', 'rare', '2× speed and seeds; half the flaps to win fights', 2, 2, 1.5, '#7a5e44', '#5a4432', '#d8c4a8', '#2a2a2a', '#7a5e44', { owl: true, talons: true, eye: '#f29a2a', fight: 2 }),
    E('toucan', 'Toco Toucan', 'rare', '3× seeds', 1.8, 3, 1.5, '#151515', '#101010', '#ffffff', '#f08a1e', '#151515', { cheek: '#ffffff', bigBeak: true }),
    E('macaw', 'Scarlet Macaw', 'rare', '2.5× speed and seeds', 2.5, 2.5, 1.5, '#d8202a', '#2a5ad0', '#e83a3a', '#e8e0d0', '#d8202a', { longTail: true, bigBeak: true, wingBar: '#f2d02a' }),
    E('flamingo', 'American Flamingo', 'rare', '2× speed, 3× seeds over ocean', 2, 2, 1.5, '#f28aa8', '#e85a7a', '#f6a8c0', '#1a1a1a', '#f28aa8', { longBeak: true, ocean: 3 }),
    E('pelican', 'Brown Pelican', 'rare', '2× speed and seeds, 3.5× over ocean', 2, 2, 1.5, '#8a8076', '#5a524a', '#c8c0b4', '#e8b04a', '#f2e8c8', { head: '#f2e8c8', bigBeak: true, ocean: 3.5 }),
    E('hummingbird', 'Ruby-throated Hummingbird', 'rare', '3.5× speed', 3.5, 1.6, 2, '#2a8a5a', '#1f6a44', '#e8eee8', '#1a1a1a', '#2a8a5a', { cheek: '#d8202a', longBeak: true, stubby: true }),
    E('kookaburra', 'Laughing Kookaburra', 'rare', '2.5× seeds, bugs 50% more often', 1.8, 2.5, 1.5, '#8a6a4a', '#4a6a8a', '#efe6d8', '#2a2a2a', '#efe6d8', { head: '#efe6d8', mask: '#5a4232', bigBeak: true, bugs: 1.5 }),
    E('barnowl', 'Barn Owl', 'rare', '2× speed and seeds; predators find you half as often', 2, 2, 1.5, '#d8b48a', '#c09a6e', '#f8f0e4', '#e8d8c8', '#d8b48a', { owl: true, talons: true, eye: '#1a1a1a', camo: 2 }),
    E('lyrebird', 'Superb Lyrebird', 'rare', '2.5× seeds, +1 golden feather per lap', 1.8, 2.5, 1.5, '#7a6250', '#5a4838', '#a89480', '#2a2a2a', '#7a6250', { longTail: true, feathers: 1 }),
    E('secretary', 'Secretary Bird', 'rare', '2.2× speed; half the flaps to win fights', 2.2, 2, 1.5, '#c8ccd0', '#2a2a2a', '#e8eaec', '#e8a83a', '#c8ccd0', { crest: true, hook: true, talons: true, fight: 2 }),
    // Epic
    E('harpy', 'Harpy Eagle', 'epic', '4× speed and seeds; wins fights with a third of the flaps', 4, 4, 2.5, '#3a3a40', '#26262c', '#e8e8e8', '#2a2a2a', '#8a8a92', { crest: true, hook: true, talons: true, fight: 3 }),
    E('quetzal', 'Resplendent Quetzal', 'epic', '5× seeds, +2 golden feathers per lap', 3, 5, 2.5, '#1f9a5a', '#167a46', '#d8202a', '#f2d02a', '#1f9a5a', { crest: true, longTail: true, feathers: 2 }),
    E('pheasant', 'Golden Pheasant', 'epic', '4× speed and seeds, bugs twice as often', 4, 4, 2.5, '#d8302a', '#2a4a8a', '#f2a03a', '#e8c43a', '#f2d02a', { head: '#f2d02a', crest: true, longTail: true, bugs: 2 }),
    E('condor', 'Andean Condor', 'epic', '5× speed; storms never slow you', 5, 3, 3, '#1a1a1e', '#141418', '#f2f2f2', '#c8b8a8', '#e8c8b8', { head: '#e8c8b8', hook: true, storm: true }),
    E('shoebill', 'Shoebill', 'epic', '4× everything; half the flaps to win fights', 4, 4, 4, '#8a96a2', '#6a7682', '#a8b2bc', '#c8b08a', '#8a96a2', { bigBeak: true, fight: 2 }),
    E('peacock', 'Indian Peafowl', 'epic', '6× seeds', 3, 6, 2.5, '#1e5ad0', '#2a8a7a', '#1e4ab0', '#c8c0b0', '#1e5ad0', { crest: true, longTail: true, wingBar: '#2ad0a8' }),
    E('frigate', 'Magnificent Frigatebird', 'epic', '4× speed, 6× seeds over ocean, calm in storms', 4, 3, 3, '#18181c', '#121216', '#202026', '#8a8a92', '#18181c', { cheek: '#d8202a', hook: true, longTail: true, ocean: 6, storm: true }),
    // Legendary: the creatures of legend
    E('dragon', 'Dragon', 'legendary', '25× everything; Dragonfire wins every fight', 25, 25, 12, '#2f7a3a', '#1f5a2a', '#d8c86a', '#e8e0c0', '#2f7a3a', { dragon: true, hook: true, talons: true, eye: '#f2a01a', fire: true, longTail: true }),
    E('phoenix', 'Phoenix', 'legendary', '18× speed and seeds; bug rushes last 3×; +5 golden feathers per lap', 18, 18, 10, '#f05a1a', '#d8301a', '#f6b02a', '#f2d02a', '#f05a1a', { flame: true, crest: true, longTail: true, rush: 3, feathers: 5 }),
    E('thunderbird', 'Thunderbird', 'legendary', '20× everything; storms make it twice as fast', 20, 20, 10, '#2a3a6a', '#1a2448', '#e8d84a', '#f2d02a', '#2a3a6a', { crest: true, hook: true, talons: true, eye: '#8ae8ff', storm: true, surge: true }),
    E('roc', 'Roc', 'legendary', '30× speed, 15× seeds; predators rarely dare', 30, 15, 12, '#8a5a32', '#6a4424', '#d8b48a', '#3a3a3a', '#8a5a32', { hook: true, talons: true, camo: 4, span: 1.25 }),
  ];
  // compact maker for the egg-only birds
  function E(id, name, tier, trait, speed, seeds, stamina, body, wing, belly, beak, cap, extra) {
    return Object.assign({ id, name, tier, egg: true, trait, speed, seeds, stamina, body, wing, belly, beak, cap }, extra);
  }

  // ---- rarity, golden eggs and stars ----
  // Tiers follow the classic loot colours, from Poor (grey) to Legendary (orange).
  const RARITY = [
    { id: 'poor', name: 'Poor', color: '#8a8a8a', weight: 15 },
    { id: 'common', name: 'Common', color: '#4a5568', weight: 45 },
    { id: 'uncommon', name: 'Uncommon', color: '#1e9e3a', weight: 30 },
    { id: 'rare', name: 'Rare', color: '#0070dd', weight: 8 },
    { id: 'epic', name: 'Epic', color: '#a335ee', weight: 1.8 },
    { id: 'legendary', name: 'Legendary', color: '#ff8000', weight: 0.2 },
  ];
  const EGG_COST = 25;          // golden feathers per egg
  const MAX_STARS = 5;          // a duplicate hatch adds a star: +15% speed and seeds for that bird
  const starMult = (s, id) => 1 + 0.15 * Math.min(MAX_STARS, (s.stars && s.stars[id]) || 0);
  const eggPool = (tier) => BIRDS.filter((b) => b.tier === tier && !b.secret);
  function hatchEgg(s, rnd = Math.random) {
    if (s.freeEggs > 0) s.freeEggs--; // mastery rewards come as free eggs
    else if (s.feathers >= EGG_COST) s.feathers -= EGG_COST;
    else return null;
    const total = RARITY.reduce((a, r) => a + r.weight, 0);
    let x = rnd() * total, tier = RARITY[0];
    for (const r of RARITY) { x -= r.weight; if (x <= 0) { tier = r; break; } }
    const pool = eggPool(tier.id), b = pool[Math.floor(rnd() * pool.length)];
    s.stars = s.stars || {};
    if (!s.birds.includes(b.id) && !(b.cost === 0)) { s.birds.push(b.id); return { bird: b, tier: tier.id, isNew: true }; }
    const st = s.stars[b.id] || 0;
    if (st < MAX_STARS) { s.stars[b.id] = st + 1; return { bird: b, tier: tier.id, star: st + 1 }; }
    const refund = Math.round(EGG_COST * 0.4); s.feathers += refund; return { bird: b, tier: tier.id, refund };
  }

  // Permanent upgrades bought with golden feathers. They survive every migration.
  const PERKS = [
    { id: 'swift', name: 'Swift Wings', icon: '💨', base: 10, growth: 1.15, blurb: (L) => `×${fmt(1.05 ** L, 2)} speed` }, // 2× the price, half the effect per level
    { id: 'gold', name: 'Golden Beak', icon: '🌰', base: 5, growth: 1.15, blurb: (L) => `×${fmt(1.1 ** L, 2)} seeds` },
    { id: 'nest', name: 'Nest Egg', icon: '🥚', base: 10, growth: 2.5, max: 12, blurb: (L) => L ? `start each migration with ${fmt(nestEgg(L))} seeds` : 'start each migration with seeds in hand' },
  ];
  const nestEgg = (L) => (L ? 100 * 10 ** (L - 1) : 0);
  const perkCost = (p, L) => Math.ceil(p.base * p.growth ** L);
  const perkSpeed = (s) => 1.05 ** ((s.perks && s.perks.swift) || 0);
  const perkSeeds = (s) => 1.1 ** ((s.perks && s.perks.gold) || 0);
  function buyPerk(s, id) {
    const p = PERKS.find((x) => x.id === id), L = s.perks[id] || 0;
    if (!p || (p.max && L >= p.max)) return false;
    const c = perkCost(p, L); if (s.feathers < c) return false;
    s.feathers -= c; s.perks[id] = L + 1; return true;
  }
  function buyBird(s, id) {
    const b = BIRDS.find((x) => x.id === id);
    if (!b || b.egg || s.birds.includes(id) || s.feathers < b.cost) return false; // egg birds only hatch
    s.feathers -= b.cost; s.birds.push(id); return true;
  }
  const ownsBird = (s, id) => !!s && (s.birds || []).includes(id) || (BIRDS.find((b) => b.id === id) || {}).cost === 0;

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
    { id: 'tail', name: 'Catch the Wind', icon: '🌬️', get base() { return T.bT; }, get growth() { return T.gT; },
      blurb: (L) => `tailwinds ×${fmt(tailBoost(L), 2)} speed · ${tailShare(L)}% of skies · ${tailSecs(L)}s` },
    { id: 'flock', name: 'Flock', icon: '🐦', get base() { return T.bF; }, get growth() { return T.gF; },
      blurb: (L) => `${L} follower${L === 1 ? '' : 's'} · ×${fmt(1 + 0.5 * L, 1)} seeds, auto-flap` },
    { id: 'stamina', name: 'Stamina', icon: '💪', get base() { return T.bS; }, get growth() { return T.gS; },
      blurb: (L) => `flap boost up to +${Math.round(boostCap(L) * 100)}%` },
    // defences against hawks and owls
    { id: 'keen', name: 'Keen Eyes', icon: '👁️', base: 2000, growth: 2.4,
      blurb: (L) => `warnings ${fmt(2 + 0.2 * L, 1)}s ahead · ${Math.max(2, 8 - Math.min(6, Math.floor(L * 0.5)))} flaps to dodge` },
    { id: 'camo', name: 'Camouflage', icon: '🍂', base: 5000, growth: 2.8,
      blurb: (L) => L ? `predators ${Math.round((1 - 1 / (1 + 0.12 * L)) * 100)}% less often` : 'predators find you less often' },
    // the big-ticket item: the bird dips low to snatch a passing bug for a short rush
    { id: 'bugs', name: 'Bug Catcher', icon: '🪲', base: 25000, growth: 3.2,
      blurb: (L) => L ? `a bug every ~${Math.round(bugEvery(L))}s · ${bugRush(L)}s rush of +50% speed, 2× seeds` : 'dip low to catch bugs: +50% speed, 2× seeds' },
  ];
  const bugEvery = (L) => 50 / (1 + 0.3 * (L - 1));   // seconds between bugs
  const bugRush = (L) => 15 + 3 * (L - 1);            // seconds of rush per bug
  const RUSH_SPEED = 1.5, RUSH_SEEDS = 2; // a bug rush: +50% speed, +100% seeds

  // A new bird starts at a real bird's pace (0.05 km/s, about 180 km/h); the
  // first few levels ramp it up, and from level 5 on it follows the full curve.
  const wingSpeedRaw = (L) => (T.v0 + T.vL * L) * 2 ** doublings(L) * Math.min(1, 0.1 + 0.18 * L); // km/s
  // Wing Strength's gain is 75% of the curve above (the starting speed is unchanged)
  const wingSpeedOld = (L) => wingSpeedRaw(0) + 0.75 * (wingSpeedRaw(L) - wingSpeedRaw(0));
  // A bird starts out at a real bird's pace (about 75 km/h, before its own species bonus) and gets
  // about a third faster with each level, so the sound barrier comes after a good while of play
  // (around level 9), not in the first minute. Once that early climb catches up with the big
  // idle-game curve (around level 28) the big curve takes over.
  const EARLY_KMH = 75, EARLY_G = 1.36;
  const wingSpeed = (L) => Math.min(wingSpeedOld(L), EARLY_KMH * EARLY_G ** L / 3600);
  const forage = (L) => T.k0 * (1 + L) * 2 ** doublings(L);
  const boostCap = (L) => 0.5 + 0.2625 * L; // each Stamina level: +26.25% max boost (was +35%)                            // extra speed fraction
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
  const feathersFor = (seeds) => Math.floor(Math.sqrt(seeds / 2e4)); // (older formula, kept for reference)
  // Golden feathers: 5 every time the bird circles the globe, paid as it flies.
  // Migrating pays the run's feathers again as a bonus.
  const FEATHERS_PER_LAP = 5;
  const migrateBonus = (s) => s.runFeathers || 0;
  // Legacy: the reason to start over. Every migration banks this run's laps (and space round
  // trips, which count double) as permanent legacy: each one adds +0.5% to everything (speed,
  // seeds, ship speed and space rocks), for good, in every run and with every bird after.
  const LEGACY_PER = 0.005;
  const legacyGain = (s) => (s.lapsFlown || 0) + 2 * (s.runTrips || 0);
  const legacyMult = (s) => 1 + LEGACY_PER * (s.legacy || 0);

  function newState(birdId, startIdx) {
    const s = {
      v: 1, bird: birdId, start: startIdx, leg: 0, legKm: 0, ri: 0, route: null, lapsFlown: 0,
      gear: {}, space: null, spaceStage: -1, cosmos: [], noLapPrompt: false, lapsTotal: 0, moon: { rocks: 0, total: 0, trips: 0, lv: {} }, birds: BIRDS.filter((b) => b.cost === 0).map((b) => b.id), perks: {},
      takeoff: TAKEOFF_SECS, seeds: 0, runSeeds: 0, totalKm: 0, levels: { wings: 0, beak: 0, tail: 0, flock: 0, stamina: 0, keen: 0, camo: 0, bugs: 0 }, rush: 0, stun: 0, wx: { type: 'clear', left: 0 },
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
  function genLap(s, startRef) {
    const startPt = typeof startRef === 'number' ? CITIES[startRef] : startRef;
    if (isNonstop(s)) return genFree(s, startPt);
    const startIdx = typeof startRef === 'number' ? startRef : nearestCity(startPt.lat, startPt.lon).i;
    if (isOrbit(s)) return genOrbit(s, startIdx);
    const n = s.lapsFlown || 0, start = CITIES[startIdx];
    const band = n === 0 ? start.lat : BANDS[(n - 1) % BANDS.length] + (Math.random() - 0.5) * 8;
    const route = [startIdx], used = new Set([startIdx]), seen = new Set(s.visited || []);
    let cur = start, acc = 0;
    // a new run opens with three short hops to nearby cities, so early stamps come while the bird is still bird-paced
    if (n === 0 && !s.leg) for (let h = 0; h < 3; h++) {
      let near = null, nd = Infinity;
      for (const c of CITIES) {
        const dl = (((c.lon - cur.lon) % 360) + 360) % 360;
        if (used.has(c.i) || c.i === startIdx || dl < 1 || dl > 40) continue;
        const d = distKm(cur, c); if (d < nd) { nd = d; near = c; }
      }
      if (!near) break;
      acc += (((near.lon - cur.lon) % 360) + 360) % 360; route.push(near.i); used.add(near.i); cur = near;
    }
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

  // ---- satellite orbits ----
  // Once the bird's base speed reaches ORBIT_SPEED (it could circle the globe
  // in under a minute), each lap is a near-perfect great circle through the
  // current city, stopping only at cities lying close to it. A full orbit
  // pays as if the bird had reached every destination. Unlocked for good.
  const ORBIT_SPEED = 40075 / 60; // km/s: once around the equator per minute
  // Once circling is unlocked (orbital speed, or nonstop) the player can switch back to
  // city hopping (s.routePref === 'hop'): laps then wander east through a band of cities again.
  const isOrbit = (s) => !!s.orbitUnlocked && s.routePref !== 'hop';
  const v3 = (c) => { const a = rad(c.lat), o = rad(c.lon); return [Math.cos(a) * Math.cos(o), Math.cos(a) * Math.sin(o), Math.sin(a)]; };
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  // ---- nonstop circles ----
  // After NONSTOP_AT laps the bird stops landing anywhere: each lap is one
  // unbroken circle around the globe in a fresh random direction, and pays
  // as if it had passed every destination.
  const NONSTOP_AT = 50;
  // Extremely fast (a lap in under 30 seconds) also means nonstop: stops would
  // just make the path jitter across the map.
  const STRAIGHT_SPEED = 40075 / 30;
  const nonstopReached = (s) => (s.lapsTotal || 0) >= NONSTOP_AT || baseSpeed(s) >= STRAIGHT_SPEED;
  const isNonstop = (s) => s.routePref !== 'hop' && nonstopReached(s);
  const circleUnlocked = (s) => !!s.orbitUnlocked || nonstopReached(s);
  function nearestCity(lat, lon) {
    let best = CITIES[0], bd = Infinity;
    for (const c of CITIES) { const d = distKm({ lat, lon }, c); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function skyPoint(lat, lon) { return { i: -1, v: true, lat, lon, name: '', region: '' }; }
  // Each nonstop lap is one near-perfect circle through the player's home city
  // (the city they chose when they started this migration). It leaves home
  // heading due east, the flattest circle around the globe that still passes
  // over home, so the line on the globe is clean and every lap starts and ends
  // over home, where the lap pays out. If the bird is somewhere else when it
  // gets this fast, it first flies straight home (that leg is not a lap).
  const homeIdx = (s) => (typeof s.start === 'number' ? s.start : 5);
  function genFree(s, start) {
    const home = CITIES[homeIdx(s)];
    if (distKm(start, home) > 50) { s.homeward = true; s.overs = []; s.overNext = 0; return [skyPoint(start.lat, start.lon), home.i]; }
    s.homeward = false;
    const u = v3(home), o = rad(home.lon), w = [-Math.sin(o), Math.cos(o), 0]; // due east at home
    // cities the circle passes directly over (within ~130 km), in the order the bird reaches them
    const axis = cross3(u, w);
    s.overs = [];
    for (const c of CITIES) {
      if (c.i === home.i) continue;
      const p = v3(c), off = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot3(p, axis))))) * 180 / Math.PI;
      if (off > 1.2) continue;
      let ang = Math.atan2(dot3(p, w), dot3(p, u)) * 180 / Math.PI; if (ang < 0) ang += 360;
      s.overs.push({ i: c.i, ang });
    }
    s.overs.sort((a, b) => a.ang - b.ang); s.overNext = 0;
    const pts = [home.i];
    for (let k = 1; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, x = u.map((c, j) => c * Math.cos(a) + w[j] * Math.sin(a));
      pts.push(skyPoint(Math.asin(Math.max(-1, Math.min(1, x[2]))) * 180 / Math.PI, Math.atan2(x[1], x[0]) * 180 / Math.PI));
    }
    pts.push(home.i);
    return pts;
  }
  function genOrbit(s, startIdx) {
    const c0 = CITIES[startIdx], u = v3(c0), o = rad(c0.lon), east = [-Math.sin(o), Math.cos(o), 0];
    let best = null;
    for (let tries = 0; tries < 24; tries++) {
      // the orbit's axis is perpendicular to the start; tilt it at random, keep heading broadly east
      let axis = norm3(cross3(u, norm3([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5])));
      let w = cross3(axis, u);
      if (dot3(w, east) < 0) { axis = axis.map((x) => -x); w = w.map((x) => -x); }
      const hits = [];
      for (const c of CITIES) {
        if (c.i === startIdx) continue;
        const p = v3(c), off = Math.abs(Math.asin(Math.max(-1, Math.min(1, dot3(p, axis))))) * 180 / Math.PI;
        if (off > 7) continue;
        let ang = Math.atan2(dot3(p, w), dot3(p, u)) * 180 / Math.PI; if (ang < 0) ang += 360;
        if (ang > 4 && ang < 356) hits.push({ i: c.i, ang });
      }
      hits.sort((a, b) => a.ang - b.ang);
      const kept = []; let last = 0;
      for (const h of hits) if (h.ang - last >= 7) { kept.push(h); last = h.ang; }
      if (!best || kept.length > best.length) best = kept;
      if (best.length >= 10) break;
    }
    return [startIdx, ...best.map((h) => h.i)];
  }

  // older saves predate the bug catcher
  function upgradeSave(s) {
    for (const k of ['bugs', 'keen', 'camo']) s.levels[k] = s.levels[k] || 0;
    if (!s.route) { // saves from the fixed 48-city loop
      const cur = (s.start + s.leg) % 48;
      s.lapsFlown = Math.floor(s.leg / 48); s.route = genLap(s, cur); s.ri = 0; s.legKm = 0;
    }
    s.gear = s.gear || {}; s.space = s.space || null; s.cosmos = s.cosmos || []; s.perks = s.perks || {};
    if (s.lapsTotal == null) s.lapsTotal = (s.laps || 0) + (s.lapsFlown || 0);
    s.runFeathers = s.runFeathers || 0;
    s.moon = s.moon || { rocks: 0, total: 0, trips: 0, lv: {} };
    if (s.moon.rocks > 0) { s.seeds += s.moon.rocks * MOON_RATE; s.moon.rocks = 0; } // rocks are part of the one balance now
    if (s.space && !s.space.loop) s.space = { loop: true, dest: s.space.dest || 0, u: 0.5, trips: 0, from: 'Earth', event: null };
    if (!s.birds) { // before feathers were spent: keep what the old lap-count unlocks gave
      const old = { tern: 1, albatross: 2, falcon: 4 };
      s.birds = BIRDS.filter((b) => b.cost === 0 || (old[b.id] && (s.laps || 0) >= old[b.id]) || b.id === s.bird).map((b) => b.id);
    }
    if (s.spaceStage == null) s.spaceStage = -1;
    if (s.welcomeEgg == null && (s.arrivals > 0 || s.laps > 0)) s.welcomeEgg = true; // players from before the welcome egg
    s.rush = s.rush || 0; s.stun = 0; s.wx = s.wx || { type: 'clear', left: 0 }; s.dodged = s.dodged || 0; s.caught = s.caught || 0; return s;
  }

  // ---- predators (live play only) ----
  // A threat warns first; flapping fast (hawk, owl) or climbing (hunter) fills a
  // meter before it strikes. Escaping pays a bonus; getting caught costs one flock
  // follower (or 10% of seeds with no flock) and halves speed for a few seconds.
  const THREAT = {
    warn: (s) => (s.space ? 2 + 0.5 * shipLv(s, 'shield') : 2 + 0.2 * s.levels.keen) / (birdOf(s).prey || 1), // seconds of warning (the dodo gets half)
    taps: (s) => Math.max(2, Math.ceil((8 - Math.min(6, s.space ? shipLv(s, 'shield') : Math.floor(s.levels.keen * 0.5))) / (birdOf(s).fight || 1))), // flaps needed vs hawk/owl
    climb: (s) => Math.max(0.6, 1.3 - 0.05 * s.levels.keen),// seconds of climbing vs hunter
    every: (s) => (s.space ? 40 + Math.random() * 30 : (75 + Math.random() * 45) * (1 + 0.12 * s.levels.camo) * (birdOf(s).camo || 1)) / (birdOf(s).prey || 1),
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
  // a route holds city indices, or (when flying nonstop) open-sky waypoints
  const routePt = (s, k) => { const r = s.route[k]; return typeof r === 'number' ? CITIES[r] : r; };
  const legFrom = (s) => routePt(s, s.ri);
  const legTo = (s) => routePt(s, s.ri + 1);
  const legLen = (s) => distKm(legFrom(s), legTo(s));

  function baseSpeed(s) {
    const b = birdOf(s);
    return wingSpeed(s.levels.wings) * b.speed * starMult(s, b.id) * perkSpeed(s) * legacyMult(s);
  }
  // Breaking the sound barrier (0.343 km/s) and reaching the speed of light (299,792 km/s)
  // each give a 10% speed boost for 60 seconds, once per run.
  const SOUND_KMS = 0.343, LIGHT_KMS = 299792.458, BARRIER_SECS = 60;
  const barrierMult = (s) => (s.barrierT > 0 ? 1.1 : 1);
  // Take-off tailwind: every run's first leg is carried by a strong tailwind (at least ×4, enough
  // to reach the first city in about two minutes), which eases off over 30 s after landing there,
  // so the first stamp comes quickly instead of after a long wait.
  const TAKEOFF_SECS = 30;
  function takeoffMult(s, base) {
    if (s.space) return 1;
    if (!s.leg) return Math.min(3000, Math.max(4, legLen(s) / (110 * Math.max(base, 1e-6))));
    return Math.max(timeLapse(s), s.takeoff > 0 ? 1 + 3 * Math.min(1, s.takeoff / 30) : 1);
  }
  // While the bird is still bird-paced, the trip between cities runs as a time-lapse so the next
  // stamp isn't an hour away. The bird's own speed (shown, and what breaks the sound barrier) stays
  // real; only the clock runs faster. It fades out by itself as the wings catch up (gone by ~level 28).
  function timeLapse(s) {
    if (s.space) return 1;
    const L = s.levels.wings;
    return Math.max(1, wingSpeedOld(L) / wingSpeed(L)) ** 0.65;
  }
  // Passive boost from followers flapping alongside, never above the cap.
  const flockBoost = (s) => Math.min(boostCap(s.levels.stamina), 0.04 * s.levels.flock);
  function speed(s) {
    return baseSpeed(s) * (1 + Math.max(s.boost, flockBoost(s))) * (s.rush > 0 ? RUSH_SPEED : 1) * (s.stun > 0 ? 0.5 : 1) * wxSpeed(s) * barrierMult(s);
  }
  // how fast the bird actually covers its route: its own speed, carried along on the first leg
  // by the take-off fast-forward (time runs quicker; the bird itself flies at its real pace)
  function travelSpeed(s) {
    return speed(s) * takeoffMult(s, baseSpeed(s));
  }
  function seedRate(s, overOcean) {
    const b = birdOf(s);
    const oc = overOcean && b.ocean ? b.ocean : 1;
    return forage(s.levels.beak) * (1 + 0.5 * s.levels.flock) * b.seeds * starMult(s, b.id) * perkSeeds(s) * solarMult(s) * oc * (s.rush > 0 ? RUSH_SEEDS : 1) * wxOf(s).seeds * cosmicMult(s) * legacyMult(s);
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
    if (s.barrierT > 0) s.barrierT = Math.max(0, s.barrierT - dt);
    if (s.takeoff > 0 && !s.space && s.leg > 0) s.takeoff = Math.max(0, s.takeoff - dt);
    if (!s.space) {
      const v = speed(s) / barrierMult(s); // the bird's own speed
      if (!s.soundHit && v >= SOUND_KMS) { s.soundHit = true; s.barrierT = BARRIER_SECS; ev.push({ type: 'barrier', which: 'sound' }); }
      if (!s.lightHit && v >= LIGHT_KMS) { s.lightHit = true; s.barrierT = BARRIER_SECS; ev.push({ type: 'barrier', which: 'light' }); }
    }
    s.boost = Math.max(0, s.boost - dt * (0.18 + s.boost * 0.25));
    if (s.rush > 0) s.rush = Math.max(0, s.rush - dt);
    if (s.stun > 0) s.stun = Math.max(0, s.stun - dt);
    if (s.wx && s.wx.left > 0) { s.wx.left -= dt; if (s.wx.left <= 0) s.wx = { type: 'clear', left: 0, calm: 8 }; }
    else if (s.wx && s.wx.calm > 0) s.wx.calm -= dt;
    const earned = seedRate(s, overOcean) * dt;
    s.seeds += earned; s.runSeeds += earned;
    if (s.space && s.space.loop) {
      // the warp drive (Moon run): a short jump at several times the speed, every so often
      const wl = shipPow(s, 'warp');
      if (wl > 0 && s.space.dest === 0) {
        if (s.space.warp > 0) s.space.warp = Math.max(0, s.space.warp - dt);
        else if ((s.space.warpT = (s.space.warpT ?? warpEvery(wl)) - dt) <= 0) { s.space.warpT = warpEvery(wl); s.space.warp = WARP_SECS; ev.push({ type: 'warp' }); }
      }
      const body = SPACE[s.space.dest], v = loopSpeed(s), before = s.space.u;
      if (s.space.event) { s.space.event.left -= dt; if (s.space.event.left <= 0) { ev.push({ type: 'eventEnd', event: s.space.event }); s.space.event = null; } }
      s.space.u += v * dt / loopKm(s.space.dest); s.totalKm += v * dt;
      // swinging around the far world (half way); at high speed several laps can pass in one step
      const passes = Math.floor(s.space.u + 0.5) - Math.floor(before + 0.5);
      if (passes > 0) {
        const first = !s.cosmos.includes(body.id);
        if (first) s.cosmos.push(body.id);
        s.spaceStage = Math.max(s.spaceStage, s.space.dest);
        ev.push({ type: 'moonpass', body, first });
      }
      const trips = Math.floor(s.space.u);
      if (trips > 0) {
        s.space.u -= trips; s.space.trips += trips;
        const r = rocksPerTrip(s) * trips, pay = r * MOON_RATE;
        s.seeds += pay; s.runSeeds += pay; s.moon.total += r; s.moon.trips += trips; s.runTrips = (s.runTrips || 0) + trips;
        const fl = tripFeathers(s, s.space.dest) * trips;
        s.feathers += fl; s.runFeathers = (s.runFeathers || 0) + fl;
        ev.push({ type: 'trip', rocks: r, pay, trips, feathers: fl });
        addMastery(s, 'flyer', flyerOf(s).id, trips, ev);
      }
      return ev;
    }
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
    if (!s.orbitUnlocked && baseSpeed(s) >= ORBIT_SPEED) { s.orbitUnlocked = true; ev.push({ type: 'orbit' }); }
    let km = travelSpeed(s) * dt;
    let guard = 0;
    const overFire = () => {
      if (!s.overs || !s.overs.length || s.homeward || typeof s.route[1] === 'number') return;
      const ang = (s.ri + s.legKm / legLen(s)) * 360 / lapLegs(s);
      while (s.overNext < s.overs.length && s.overs[s.overNext].ang <= ang) {
        const c = CITIES[s.overs[s.overNext++].i], first = !s.visited.includes(c.i);
        if (first) s.visited.push(c.i);
        ev.push({ type: 'over', city: c, first });
      }
    };
    while (km > 0 && guard++ < 200) {
      const len = legLen(s);
      const left = len - s.legKm;
      const use = Math.min(km, left);
      s.legKm += use; s.totalKm += use; km -= use;
      overFire();
      if (s.legKm >= len - 1e-6) {
        const to = legTo(s);
        const bonus = to.v ? 0 : arrivalBonus(s);
        s.seeds += bonus; s.runSeeds += bonus; if (!to.v) s.arrivals++;
        // the very first stamp a player ever earns comes with a free golden egg
        if (!to.v && !s.welcomeEgg) { s.welcomeEgg = true; s.freeEggs = (s.freeEggs || 0) + 1; ev.push({ type: 'welcomeEgg' }); }
        const first = !to.v && !s.visited.includes(to.i);
        if (first) s.visited.push(to.i);
        s.leg++; s.ri++; s.legKm = 0;
        let lapDone = false;
        let orbitPay = 0;
        if (s.ri >= lapLegs(s) && s.homeward) {
          // arrived home: from here every lap is the home circle
          s.homeward = false; s.route = genLap(s, homeIdx(s)); s.ri = 0;
        } else if (s.ri >= lapLegs(s)) {
          if (isOrbit(s) || isNonstop(s)) { orbitPay = arrivalBonus(s) * CITIES.length; s.seeds += orbitPay; s.runSeeds += orbitPay; }
          lapDone = true; s.lapsFlown++; s.lapsTotal = (s.lapsTotal || 0) + 1;
          const fl = FEATHERS_PER_LAP + (birdOf(s).feathers || 0); // some birds bring home extra feathers
          s.feathers += fl; s.runFeathers = (s.runFeathers || 0) + fl;
          addMastery(s, 'bird', s.bird, 1, ev);
          s.route = genLap(s, s.route[s.route.length - 1]); s.ri = 0; s.overNext = 0;
        }
        // a new forecast only once the current one (or a calm spell) has run its course
        if (!s.wx || (s.wx.left <= 0 && !(s.wx.calm > 0))) s.wx = rollWeather(s);
        // the rooster crows up a tailwind whenever the sky is calm
        if (birdOf(s).crow && s.wx.type === 'clear') s.wx = { type: 'tailwind', left: 12 };
        ev.push({ type: 'arrive', city: to, bonus, first, lapDone, wx: s.wx.type, orbitPay, waypoint: !!to.v, nonstopNow: lapDone && s.lapsTotal === NONSTOP_AT && s.routePref !== 'hop' });
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
  // Catch the Wind: tailwinds come more often, last longer and push harder
  const tailBoost = (L) => 1.5 + 0.0625 * L;
  const tailWeight = (L) => 22 * (1 + 0.1 * L);
  const tailSecs = (L) => WX_SECS + 1 * L;
  const tailShare = (L) => { const tot = Object.keys(WEATHER).reduce((a, k) => a + (k === 'tailwind' ? tailWeight(L) : WEATHER[k].weight), 0); return Math.round(tailWeight(L) / tot * 100); };
  function wxSpeed(s) {
    const w = wxOf(s), b = birdOf(s);
    if (w === WEATHER.tailwind) return tailBoost(s.levels.tail || 0);
    if (b.surge && w === WEATHER.storm) return 2;   // the Thunderbird rides storms
    return b.storm ? Math.max(1, w.speed) : w.speed; // storm-hardy birds aren't slowed by bad weather
  }
  function wxNote(s, type) { return type === 'tailwind' ? `×${fmt(tailBoost(s.levels.tail || 0), 2)} speed` : WEATHER[type].note; }
  function rollWeather(s) {
    const L = (s && s.levels.tail) || 0, wt = (k) => (k === 'tailwind' ? tailWeight(L) : WEATHER[k].weight);
    const types = Object.keys(WEATHER), total = types.reduce((a, k) => a + wt(k), 0);
    let r = Math.random() * total;
    // clear skies also hold for a while, so calm stretches feel deliberate too
    for (const k of types) { r -= wt(k); if (r <= 0) return k === 'clear' ? { type: k, left: 0, calm: 20 } : { type: k, left: k === 'tailwind' ? tailSecs(L) : WX_SECS }; }
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
  // the next one-way trip beyond the Moon (Mars and on), once the gear is owned
  function nextBody(s) {
    const b = SPACE[Math.max(1, s.spaceStage + 1)];
    return b && s.gear[b.needs] && s.spaceStage >= 0 ? b : null;
  }
  function spaceSpeed(s) {
    const b = SPACE[s.space ? s.space.dest : s.spaceStage + 1];
    if (!b) return 0;
    const k = 1 + 0.6 * Math.log10(1 + baseSpeed(s));
    return b.km / b.secs * k;
  }
  function launch(s) {
    const b = nextBody(s); if (!b || (s.space && !s.space.arrived && !s.space.loop)) return false;
    const from = s.space && s.space.loop ? 'the Moon' : s.space && s.space.arrived ? SPACE[s.space.dest].short : 'Earth';
    s.space = { dest: SPACE.indexOf(b), km: 0, arrived: false, from }; s.boost = 0; s.rush = 0; s.stun = 0;
    return true;
  }
  function returnToEarth(s) { s.space = null; }

  // ---- the Earth–Moon loop ----
  // With the shuttle, the bird flies an oval around Earth and the Moon. Each
  // full round trip earns space rocks (part of the one seed balance); spend them on
  // ship upgrades. Rocks and ship upgrades last through every migration.
  const LOOP_KM = 2 * 384400 * 1.15; // (the Moon loop; loopKm() covers every world)
  // Every world is a round trip from Earth. Farther worlds take longer per
  // trip but pay many more space rocks.
  // Space is a real voyage: a first trip to the Moon takes about 5 minutes out and 5 back
  // (Thrusters and a faster bird cut that down). Farther worlds take longer still. Each trip pays
  // ten times what it used to, so space earns at the same rate per minute, in bigger hauls.
  // Every new world starts as a long haul again: a fresh ship takes 10 minutes for the Moon, 25 for
  // Mars, up to two hours for Alpha Centauri. Pay per trip grows with the time it takes.
  const TRIP_SECS = [600, 1500, 2400, 3000, 3600, 4200, 4800, 7200];
  const DEST_ROCKS = [10, 50, 160, 280, 600, 920, 1270, 9000];
  const loopKm = (dest) => 2 * SPACE[dest].km * 1.15;
  // ---- one currency, shown in local units ----
  // Everything the player owns is seeds. In space the same amount is shown in
  // the local world's rocks at a fixed rate: 1 Moon rock = 1 billion seeds,
  // and each world farther out is 10x smaller (10 Mars rocks = 1 Moon rock).
  const MOON_RATE = 1e9;
  const CURRENCY = [
    { name: 'Moon rocks', one: 'Moon rock', icon: '🌑' }, { name: 'Mars rocks', one: 'Mars rock', icon: '🔴' },
    { name: 'Jupiter rocks', one: 'Jupiter rock', icon: '🟠' }, { name: 'Saturn rocks', one: 'Saturn rock', icon: '🪐' },
    { name: 'Uranus rocks', one: 'Uranus rock', icon: '🔵' }, { name: 'Neptune rocks', one: 'Neptune rock', icon: '🔷' },
    { name: 'Pluto rocks', one: 'Pluto rock', icon: '⚪' }, { name: 'star shards', one: 'star shard', icon: '✨' },
  ];
  const unitValue = (dest) => MOON_RATE / 10 ** dest;          // seeds per local rock
  const here = (s) => (s.space && s.space.loop ? s.space.dest : -1); // -1 = Earth
  const toLocal = (s, seeds) => (here(s) < 0 ? seeds : seeds / unitValue(here(s)));
  // the worlds the player can loop to now (gear owned)
  const loopTargets = (s) => SPACE.filter((b) => s.gear[b.needs]);
  const SHIP = [
    { id: 'thrust', name: 'Thrusters', icon: '🔥', base: 2, growth: 1.45, blurb: (L) => `×${fmt(1 + 0.15 * L, 2)} ship speed` },
    { id: 'cargo', name: 'Cargo Hold', icon: '📦', base: 3, growth: 1.55, blurb: (L) => `${fmt((1 + L) * DEST_ROCKS[0], 0)} 🌑 Moon rocks' worth per round trip` },
    { id: 'wing', name: 'Wingmates', icon: '🛸', base: 8, growth: 2.1, blurb: (L) => `×${fmt(1 + 0.5 * L, 2)} space rocks from escort pods` },
    { id: 'shield', name: 'Deflector Shields', icon: '🛡️', base: 5, growth: 1.9, blurb: (L) => `${fmt(2 + 0.5 * L, 1)}s raider warning · ${Math.max(2, 8 - L)} taps to evade` },
    { id: 'solar', name: 'Solar Panels', icon: '☀️', base: 4, growth: 1.7, blurb: (L) => `×${fmt(1 + 0.5 * L, 1)} seeds while in space` },
    // Moon-run gear: the eight-upgrade set for the trip to the Moon (other worlds get their own sets)
    { id: 'laser', name: 'Laser Cannons', icon: '🔫', base: 6, growth: 1.6, moon: true,
      blurb: (L) => (L ? `blast an asteroid every ${fmt(laserEvery(L), 1)}s · ${fmt(laserPayK(L) * 100, 2)}% of a trip's rocks each` : 'auto-fire at passing asteroids for bonus rocks') },
    { id: 'tractor', name: 'Tractor Beam', icon: '🧲', base: 5, growth: 1.6, moon: true,
      blurb: (L) => (L ? `reel in a star crystal every ${fmt(tractorEvery(L), 1)}s · ${fmt(tractorPayK(L) * 100, 2)}% of a trip each` : 'pull in glowing star crystals as you fly') },
    { id: 'warp', name: 'Warp Drive', icon: '🌀', base: 12, growth: 1.9, moon: true,
      blurb: (L) => (L ? `a ${WARP_SECS}s warp jump at ×${fmt(warpMult(L), 1)} speed every ${fmt(warpEvery(L), 0)}s` : 'jump to warp speed now and then') },
  ];
  // Moon gear numbers (shared by the blurbs above, the sim and the visuals)
  const laserEvery = (L) => 5 / (1 + 0.35 * L), laserPayK = (L) => 0.0012 * (1 + 0.25 * L);
  const tractorEvery = (L) => 9 / (1 + 0.3 * L), tractorPayK = (L) => 0.0015 * (1 + 0.3 * L);
  const WARP_SECS = 3, warpMult = (L) => 2 + 0.4 * L, warpEvery = (L) => 75 / (1 + 0.12 * L);
  const onMoonRun = (s) => !!(s.space && s.space.loop && s.space.dest === 0);
  // laser and tractor payouts, in seeds (the visuals call these when a shot lands or a crystal is caught)
  function laserHit(s) { const pay = rocksPerTrip(s) * laserPayK(shipPow(s, 'laser')) * MOON_RATE; s.seeds += pay; s.runSeeds += pay; s.moon.total += pay / MOON_RATE; return pay; }
  function tractorCatch(s) { const pay = rocksPerTrip(s) * tractorPayK(shipPow(s, 'tractor')) * MOON_RATE; s.seeds += pay; s.runSeeds += pay; s.moon.total += pay / MOON_RATE; return pay; }
  const shipLv = (s, id) => (s.moon && s.moon.lv[id]) || 0;
  const shipCost = (u, L) => Math.ceil(u.base * u.growth ** L);
  const shipCostN = (u, L, n) => { let c = 0; for (let k = 0; k < n; k++) c += shipCost(u, L + k); return c; };
  // ship upgrades are priced in Moon rocks and paid from the one balance
  function shipMax(u, L, seeds) { const rocks = seeds / MOON_RATE; let n = 0, c = 0; while (n < 500) { const nx = shipCost(u, L + n); if (c + nx > rocks) break; c += nx; n++; } return n; }
  // Where a ship upgrade is fitted matters: a farther world's workshop builds it stronger
  // (Moon ×1, Mars ×1.25, Jupiter ×1.5 … Alpha Centauri ×2.75). Back on Earth it can still be
  // fitted, at ×0.6. Each upgrade's strength is the sum of what every level it got was worth.
  const shipWhere = (s) => (s.space && s.space.loop ? s.space.dest : -1); // -1 = Earth
  const shipWeight = (s, where = shipWhere(s)) => (where < 0 ? 0.6 : 1 + 0.25 * where);
  // Upgrades fitted at a nearer world only help a little out at a farther one (35% per step out),
  // so each new world starts slow again and has to be built up there. Earth fits count as the Moon's.
  const NEAR_K = 0.35;
  function pwAt(s, id) {
    s.moon.pwAt = s.moon.pwAt || {};
    if (!s.moon.pwAt[id]) { const old = s.moon.pw && s.moon.pw[id] != null ? s.moon.pw[id] : shipLv(s, id); s.moon.pwAt[id] = old ? { 0: old } : {}; }
    return s.moon.pwAt[id];
  }
  function shipPowAt(s, id, d) {
    if (!s.moon) return 0;
    let p = 0; for (const [w, v] of Object.entries(pwAt(s, id))) p += v * (+w >= d ? 1 : NEAR_K ** (d - +w));
    return p;
  }
  const shipPow = (s, id) => shipPowAt(s, id, Math.max(0, shipWhere(s)));
  function buyShip(s, id, n) {
    const u = SHIP.find((x) => x.id === id), L = shipLv(s, id);
    if (n === 'max') n = shipMax(u, L, s.seeds);
    if (!n) return 0;
    const c = shipCostN(u, L, n) * MOON_RATE; if (c > s.seeds) return 0;
    const at = pwAt(s, id), w = Math.max(0, shipWhere(s)); at[w] = (at[w] || 0) + n * shipWeight(s);
    s.seeds -= c; s.moon.lv[id] = L + n; return n;
  }
  // Earth training carries into space, in part: a faster bird makes a faster ship, though much
  // less than one for one (×1 at the start, about ×1.6 at a thousand km/s).
  const earthShip = (s) => (1 + 0.08 * Math.log10(Math.max(1, baseSpeed(s) / 0.06))) ** (1 / (1 + Math.max(0, shipWhere(s))));
  // every planet reached beyond the Moon (ever) multiplies space rocks per trip by 1.5
  const planetsReached = (s) => (s.cosmos || []).filter((id) => id !== 'moon').length;
  const planetMult = (s) => 1.5 ** planetsReached(s);
  const rocksPerTrip = (s, dest = s.space && s.space.loop ? s.space.dest : 0) => Math.round((1 + shipPowAt(s, 'cargo', dest)) * (1 + 0.5 * shipPowAt(s, 'wing', dest)) * planetMult(s) * DEST_ROCKS[dest] * flyerRocks(s) * legacyMult(s));
  const solarMult = (s) => (s.space ? 1 + 0.5 * shipPow(s, 'solar') : 1);
  function loopSpeed(s) {
    const d = s.space && s.space.loop ? s.space.dest : 0;
    const solar = s.space && s.space.event && s.space.event.type === 'solar' ? 2 : 1;
    const warp = s.space && s.space.warp > 0 ? warpMult(shipPow(s, 'warp')) : 1;
    // the ship's own speed: however fast the bird was on Earth, space starts slow; Thrusters, BOOST and solar wind speed it up
    return loopKm(d) / TRIP_SECS[d] * (1 + 0.15 * shipPowAt(s, 'thrust', d)) * earthShip(s) * flyerSpeed(s) * legacyMult(s)
      * (1 + s.boost) * (s.stun > 0 ? 0.5 : 1) * solar * warp;
  }
  // ---- space flyers ----
  // What the bird rides in space. Hatched from space eggs (bought with golden feathers once
  // the shuttle has been owned), with the same rarity odds as golden eggs. They're kept
  // through every migration; pick any owned one at any time. A duplicate adds a star.
  const FLYERS = [
    { id: 'shuttle', name: 'Shuttle', tier: 'common', trait: 'the trusty starter ship', speed: 1, rocks: 1, starter: true },
    { id: 'cardboard', name: 'Cardboard Rocket', tier: 'poor', trait: '+5% space rocks (somehow)', speed: 1, rocks: 1.05 },
    { id: 'bottle', name: 'Bottle Rocket', tier: 'common', trait: '+15% ship speed', speed: 1.15, rocks: 1 },
    { id: 'jetpack', name: 'Jet Pack', tier: 'common', trait: '+20% space rocks', speed: 1, rocks: 1.2 },
    { id: 'pod', name: 'Escape Pod', tier: 'common', trait: '+10% ship speed and rocks', speed: 1.1, rocks: 1.1 },
    { id: 'roadster', name: 'Flying Roadster', tier: 'uncommon', trait: '+35% ship speed', speed: 1.35, rocks: 1 },
    { id: 'scooter', name: 'Hover Scooter', tier: 'uncommon', trait: '+30% space rocks', speed: 1, rocks: 1.3 },
    { id: 'retro', name: 'Retro Rocket', tier: 'uncommon', trait: '+25% ship speed and rocks', speed: 1.25, rocks: 1.25 },
    { id: 'lander', name: 'Lunar Lander', tier: 'rare', trait: '+60% space rocks, +5 golden feathers a trip', speed: 1, rocks: 1.6, feathers: 5 },
    { id: 'glider', name: 'Star Glider', tier: 'rare', trait: '+70% ship speed', speed: 1.7, rocks: 1 },
    { id: 'saucer', name: 'Flying Saucer', tier: 'epic', trait: '2.2× ship speed and rocks', speed: 2.2, rocks: 2.2 },
    { id: 'comet', name: 'Comet Rider', tier: 'epic', trait: '2.5× ship speed, +10 golden feathers a trip', speed: 2.5, rocks: 1.5, feathers: 10 },
    { id: 'cruiser', name: 'Warp Cruiser', tier: 'legendary', trait: '3.5× ship speed, 3× rocks, +20 golden feathers a trip', speed: 3.5, rocks: 3, feathers: 20 },
    { id: 'whale', name: 'Star Whale', tier: 'legendary', trait: '4× ship speed and rocks, +30 golden feathers a trip', speed: 4, rocks: 4, feathers: 30 },
  ];
  const SPACE_EGG_COST = 60;
  const flyerOf = (s) => FLYERS.find((f) => f.id === (s.moon && s.moon.flyer)) || FLYERS[0];
  const ownsFlyer = (s, id) => id === 'shuttle' || !!(s.moon && s.moon.flyers && s.moon.flyers.includes(id));
  const flyerStar = (s, id) => 1 + 0.15 * Math.min(MAX_STARS, (s.moon && s.moon.fstars && s.moon.fstars[id]) || 0);
  const flyerSpeed = (s) => flyerOf(s).speed * flyerStar(s, flyerOf(s).id);
  const flyerRocks = (s) => flyerOf(s).rocks * flyerStar(s, flyerOf(s).id);
  // space eggs open once the bird has had a shuttle (in any run)
  const spaceOpen = (s) => !!(s.gear && s.gear.shuttle) || !!(s.moon && s.moon.trips > 0);
  function hatchSpaceEgg(s, rnd = Math.random) {
    if (!spaceOpen(s)) return null;
    if (s.freeSpaceEggs > 0) s.freeSpaceEggs--;
    else if (s.feathers >= SPACE_EGG_COST) s.feathers -= SPACE_EGG_COST;
    else return null;
    const total = RARITY.reduce((a, r) => a + r.weight, 0);
    let x = rnd() * total, tier = RARITY[0];
    for (const r of RARITY) { x -= r.weight; if (x <= 0) { tier = r; break; } }
    const pool = FLYERS.filter((f) => f.tier === tier.id && !f.starter), f = pool[Math.floor(rnd() * pool.length)];
    s.moon.flyers = s.moon.flyers || []; s.moon.fstars = s.moon.fstars || {};
    if (!s.moon.flyers.includes(f.id)) { s.moon.flyers.push(f.id); return { flyer: f, tier: tier.id, isNew: true }; }
    const st = s.moon.fstars[f.id] || 0;
    if (st < MAX_STARS) { s.moon.fstars[f.id] = st + 1; return { flyer: f, tier: tier.id, star: st + 1 }; }
    const refund = Math.round(SPACE_EGG_COST * 0.4); s.feathers += refund; return { flyer: f, tier: tier.id, refund };
  }
  function pickFlyer(s, id) { if (!ownsFlyer(s, id)) return false; s.moon.flyer = id; return true; }

  // Golden feathers for each round trip: about three times what the same time earns on Earth,
  // more for each world farther out. Some flyers (and feather birds) bring home extra.
  const TRIP_FEATHERS = [50, 160, 300, 440, 600, 790, 1000, 1800];
  const tripFeathers = (s, dest) => TRIP_FEATHERS[dest] + (flyerOf(s).feathers || 0) + (birdOf(s).feathers || 0);

  // ---- mastery ----
  // Flying a bird (laps) or a space flyer (round trips) earns rewards along the way: free eggs
  // and feathers. Every bird and flyer has its own track, so switching (and migrating to fly a
  // different bird) keeps paying off.
  const MASTERY = {
    bird: [{ n: 3, eggs: 1 }, { n: 10, feathers: 40 }, { n: 25, eggs: 2 }],
    flyer: [{ n: 2, spaceEggs: 1 }, { n: 6, feathers: 80 }, { n: 15, spaceEggs: 2 }],
  };
  function masteryOf(s, kind, id) {
    const m = (s.mastery && s.mastery[kind] && s.mastery[kind][id]) || 0, steps = MASTERY[kind];
    const lv = steps.filter((x) => m >= x.n).length;
    return { count: m, level: lv, max: steps.length, next: steps[lv] || null };
  }
  function addMastery(s, kind, id, n, ev) {
    s.mastery = s.mastery || { bird: {}, flyer: {} }; s.mastery[kind] = s.mastery[kind] || {};
    const before = s.mastery[kind][id] || 0, after = before + n; s.mastery[kind][id] = after;
    MASTERY[kind].forEach((st, i) => {
      if (before < st.n && after >= st.n) {
        if (st.eggs) s.freeEggs = (s.freeEggs || 0) + st.eggs;
        if (st.spaceEggs) s.freeSpaceEggs = (s.freeSpaceEggs || 0) + st.spaceEggs;
        if (st.feathers) { s.feathers += st.feathers; s.runFeathers = (s.runFeathers || 0) + st.feathers; }
        ev.push({ type: 'mastery', kind, id, level: i + 1, reward: st });
      }
    });
  }

  // ---- space events ----
  // Asteroid field: tap BOOST to mine bonus rocks (up to 15 hauls per field).
  // Solar wind: double ship speed while it blows.
  const EVENTS = {
    field: { name: 'Asteroid field', icon: '🪨', secs: 14 },
    solar: { name: 'Solar wind', icon: '🌞', secs: 16 },
  };
  function startEvent(s, type) { s.space.event = { type, left: EVENTS[type].secs, mined: 0 }; return s.space.event; }
  function mine(s) {
    const e = s.space && s.space.event;
    if (!e || e.type !== 'field' || e.mined >= 15) return 0;
    e.mined++; const r = Math.max(0.1, rocksPerTrip(s) * 0.008), pay = r * MOON_RATE;
    s.seeds += pay; s.runSeeds += pay; s.moon.total += r; return pay;
  }
  // One moon rock is worth a quarter of a city landing on Earth, so a loop
  // with a few cargo and wingmate upgrades earns about twice what Earth does.
  // Golden feathers come from Earth laps and (far faster) from space round trips.
  const rockValue = (s) => arrivalBonus(s) * 0.25;
  function tradeRocks(s, n) {
    n = Math.min(Math.floor(n), s.moon.rocks); if (n <= 0) return 0;
    const v = n * rockValue(s); s.moon.rocks -= n; s.seeds += v; s.runSeeds += v; return v;
  }
  function launchLoop(s, dest = 0) {
    const b = SPACE[dest];
    if (!b || !s.gear[b.needs]) return false;
    s.space = { loop: true, dest, u: 0, trips: 0, from: 'Earth', event: null }; s.boost = 0; s.rush = 0; s.stun = 0;
    return true;
  }
  // raiders in space: lose an escort pod, or a tenth of the rocks
  function spaceHit(s) {
    s.stun = THREAT.STUN; s.caught = (s.caught || 0) + 1;
    if (shipLv(s, 'wing') > 0) { const L = shipLv(s, 'wing'), at = pwAt(s, 'wing'); for (const w in at) at[w] *= (L - 1) / L; s.moon.lv.wing--; return { lost: 'wingmate' }; }
    const lost = s.seeds * 0.1; s.seeds -= lost; return { lost: 'rocks', seeds: lost };
  }
  function spaceMiss(s) { const pay = Math.max(0.1, rocksPerTrip(s) * 0.03) * MOON_RATE; s.seeds += pay; s.runSeeds += pay; s.dodged = (s.dodged || 0) + 1; return pay; }

  // ---- daily migration challenge ----
  // One challenge per calendar day, the same for everyone that day. Progress
  // is counted automatically; finishing it pays golden feathers.
  const DAILY = [
    { id: 'laps', text: (n) => `Fly ${n} laps around the globe`, n: [2, 3, 4] },
    { id: 'cities', text: (n) => `Stamp ${n} cities you have never visited`, n: [4, 6, 8] },
    { id: 'fights', text: (n) => `Win ${n} predator fights`, n: [2, 3, 4] },
    { id: 'bugs', text: (n) => `Catch ${n} bugs`, n: [3, 5, 6] },
    { id: 'trips', text: (n) => `Make ${n} round trip${n === 1 ? '' : 's'} in space`, n: [1, 2, 3] },
    { id: 'storm', text: (n) => `Fly through ${n} storms`, n: [1, 2, 3] },
  ];
  function dayKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
  function dailyFor(s, key = dayKey()) {
    let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    // only offer challenges the player can actually do yet
    const pool = DAILY.filter((c) => !(c.id === 'bugs' && !s.levels.bugs) && !(c.id === 'trips' && !s.gear.shuttle));
    const c = pool[h % pool.length], n = c.n[(h >> 8) % c.n.length];
    return { key, id: c.id, n, have: 0, done: false, reward: 15 + 5 * n };
  }
  function dailyCheck(s) {
    const key = dayKey();
    if (!s.daily || s.daily.key !== key) s.daily = dailyFor(s, key);
    return s.daily;
  }
  function dailyBump(s, id, by = 1) {
    const d = dailyCheck(s);
    if (d.done || d.id !== id) return null;
    d.have = Math.min(d.n, d.have + by);
    if (d.have >= d.n) { d.done = true; s.feathers += d.reward; return d; }
    return null;
  }
  const dailyText = (d) => DAILY.find((c) => c.id === d.id).text(d.n);

  // A caught bug starts the rush. Rushes don't stack: no time is added on top of one already running.
  function catchBug(s) { s.rush = Math.max(s.rush, bugRush(s.levels.bugs || 1) * (birdOf(s).rush || 1)); return s.rush; }

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
    const gained = migrateBonus(s);
    const keep = { laps: s.laps + 1, feathers: s.feathers + gained, visited: s.visited, createdAt: s.createdAt, cosmos: s.cosmos || [], noLapPrompt: !!s.noLapPrompt,
      birds: s.birds, stars: s.stars || {}, perks: s.perks, lapsTotal: s.lapsTotal || 0, moon: s.moon, orbitUnlocked: !!s.orbitUnlocked, routePref: s.routePref || 'circle', overCount: s.overCount || {},
      mastery: s.mastery || { bird: {}, flyer: {} }, freeEggs: s.freeEggs || 0, freeSpaceEggs: s.freeSpaceEggs || 0,
      legacy: (s.legacy || 0) + legacyGain(s), funnel: s.funnel || {}, welcomeEgg: true, coach: s.coach };
    const n = newState(birdId, startIdx);
    Object.assign(n, keep);
    if (!n.visited.includes(startIdx)) n.visited.push(startIdx);
    n.route = genLap(n, startIdx); // with the passport, so the first lap favours new places
    n.seeds = nestEgg(n.perks.nest || 0);
    return { state: n, gained, legacy: legacyGain(s) };
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
    laserEvery, tractorEvery, warpMult, onMoonRun, laserHit, tractorCatch, WARP_SECS,
    RARITY, EGG_COST, MAX_STARS, starMult, hatchEgg, eggPool, SOUND_KMS, LIGHT_KMS, BARRIER_SECS,
    LEGACY_PER, legacyGain, legacyMult, GEAR, SPACE, FLYERS, SPACE_EGG_COST, flyerOf, ownsFlyer, hatchSpaceEgg, pickFlyer, spaceOpen, TRIP_FEATHERS, tripFeathers, MASTERY, masteryOf, cosmicMult, MOON_RATE, CURRENCY, unitValue, toLocal, TRIP_SECS, DEST_ROCKS, loopKm, loopTargets, EVENTS, startEvent, mine, ORBIT_SPEED, isOrbit, circleUnlocked, STRAIGHT_SPEED, planetsReached, planetMult, dailyCheck, dailyBump, dailyText, NONSTOP_AT, isNonstop, routePt, FEATHERS_PER_LAP, migrateBonus, genOrbit, LOOP_KM, SHIP, shipLv, shipPow, shipPowAt, NEAR_K, shipWeight, shipWhere, earthShip, shipCost, shipCostN, shipMax, buyShip, rocksPerTrip, loopSpeed, rockValue, tradeRocks, launchLoop, spaceHit, spaceMiss, solarMult, nextGear, buyGear, nextBody, spaceSpeed, launch, returnToEarth,
    speed, travelSpeed, takeoffMult, timeLapse, baseSpeed, seedRate, arrivalBonus, flap, step, buy, cost, costN, maxAffordable, migrateAgain,
    feathersFor, featherMult, PERKS, perkCost, buyPerk, buyBird, ownsBird, nestEgg, perkSpeed, perkSeeds, bugEvery, bugRush, catchBug, upgradeSave, WEATHER, wxOf, rollWeather, wxNote, wxSpeed, tailBoost, THREAT, escapeBonus, predatorHit, predatorMiss, RUSH_SPEED, RUSH_SEEDS, boostCap, flockBoost, doublings, nextMilestone, wingSpeed, forage, cityMult, fmt, fmtTime,
  };
})(typeof window !== 'undefined' ? window : globalThis);
