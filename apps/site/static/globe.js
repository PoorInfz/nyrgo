/* global document, window, requestAnimationFrame, IntersectionObserver */

// A small pixel-art globe with the latest catches on it. Drag (or swipe) to turn it, tap a mark
// to see which creature was caught there. Places are half-degree cells (about 50 km) and names
// come masked from the server; nothing here can point at a person.

(function () {
  const root = document.getElementById('globe');
  const data = window.NYRGO_GLOBE;
  if (!root || !data) return;
  const canvas = root.querySelector('canvas');
  const tip = root.querySelector('.globe-tip');
  const latest = document.querySelector('.globe-latest');
  const caption = document.querySelector('.globe-cap');
  const ctx = canvas.getContext('2d');
  const N = canvas.width;
  const R = N / 2 - 4;
  const C = N / 2;
  const img = ctx.createImageData(N, N);
  const t = (k, vars) =>
    (root.dataset[k] || '').replace(/\{(\w+)\}/g, (_, v) => (vars && v in vars ? vars[v] : ''));

  // land mask: one bit per cell of an equirectangular grid, north-west first
  const LW = data.land.w;
  const LH = data.land.h;
  const bits = Uint8Array.from(window.atob(data.land.bits), (c) => c.charCodeAt(0));
  const isLand = (lat, lng) => {
    const x = Math.floor((((((lng + 180) % 360) + 360) % 360) / 360) * LW);
    const y = Math.min(LH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * LH)));
    const i = y * LW + x;
    return (bits[i >> 3] >> (7 - (i & 7))) & 1;
  };

  const OCEAN = ['#081a44', '#0d2b66', '#14468f', '#2165b8'].map(rgb);
  const LAND = ['#11502c', '#1b7038', '#289846', '#45c25f'].map(rgb);
  const ICE = ['#6f83a8', '#9aaed0', '#c7d4ec', '#eef3ff'].map(rgb);
  function rgb(h) {
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const light = norm([-0.55, 0.55, 0.63]);
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]);
    return v.map((x) => x / l);
  }

  // view: longitude at the centre and tilt (latitude at the centre)
  let lon = -10;
  let lat = 25;
  let vLon = 0;
  let vLat = 0;
  let goal = null;
  let lastTouch = -1e9;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = Math.PI / 180;

  let cells = [];
  function project(cLat, cLng) {
    const a = cLat * D;
    const b = (cLng - lon) * D;
    const x = Math.cos(a) * Math.sin(b);
    const y0 = Math.sin(a);
    const z0 = Math.cos(a) * Math.cos(b);
    const p = lat * D;
    const y = y0 * Math.cos(p) - z0 * Math.sin(p);
    const z = y0 * Math.sin(p) + z0 * Math.cos(p);
    return { x: C + x * R, y: C - y * R, z };
  }

  function draw(time) {
    const p = lat * D;
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    const d = img.data;
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const o = (py * N + px) * 4;
        const x = (px + 0.5 - C) / R;
        const y = (C - py - 0.5) / R;
        const r2 = x * x + y * y;
        if (r2 > 1) {
          // a thin glow around the planet
          const r = Math.sqrt(r2);
          const a = r < 1 + 3 / R ? Math.round(150 * (1 - (r - 1) / (3 / R))) : 0;
          d[o] = 67;
          d[o + 1] = 210;
          d[o + 2] = 238;
          d[o + 3] = a;
          continue;
        }
        const z = Math.sqrt(1 - r2);
        // back to the globe's own frame
        const y1 = y * cp + z * sp;
        const z1 = -y * sp + z * cp;
        const la = Math.asin(y1) / D;
        const ln = Math.atan2(x, z1) / D + lon;
        const shade = x * light[0] + y * light[1] + z * light[2];
        const step = shade > 0.75 ? 3 : shade > 0.45 ? 2 : shade > 0.15 ? 1 : 0;
        const pal = Math.abs(la) > 68 ? ICE : isLand(la, ln) ? LAND : OCEAN;
        const c = pal[step];
        d[o] = c[0];
        d[o + 1] = c[1];
        d[o + 2] = c[2];
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // the catches, blinking softly
    const blink = Math.floor(time / 450) % 2;
    for (const c of cells) {
      const q = project(c.lat, c.lng);
      c.screen = q;
      if (q.z < 0.08) continue;
      const x = Math.round(q.x);
      const y = Math.round(q.y);
      ctx.fillStyle = '#05060f';
      ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = c.color;
      ctx.fillRect(x - 1, y - 1, 3, 3);
      if (blink || c === selected) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      }
      if (c === selected) {
        ctx.strokeStyle = '#ffcf4d';
        ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
      }
    }
  }

  let selected = null;
  function show(c) {
    selected = c;
    if (!c) {
      tip.hidden = true;
      return;
    }
    const info = data.creatures[c.creature] || [c.creature, '#fff'];
    const days = Math.max(0, Math.round((Date.now() - Date.parse(c.day)) / 86400000));
    tip.innerHTML = '';
    const im = document.createElement('img');
    im.src = `/assets/creatures/${c.creature}.webp`;
    im.alt = '';
    im.width = 48;
    im.height = 71;
    const box = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = info[0];
    const by = document.createElement('span');
    by.textContent = t('by', { by: c.by });
    const when = document.createElement('span');
    when.className = 'muted';
    when.textContent = days === 0 ? t('today') : days === 1 ? t('ago1') : t('ago', { n: days });
    box.append(name, by, when);
    if (c.count > 1) {
      const n = document.createElement('span');
      n.className = 'muted';
      n.textContent = t('here', { n: c.count });
      box.append(n);
    }
    tip.append(im, box);
    tip.hidden = false;
  }

  function nearest(clientX, clientY) {
    const b = canvas.getBoundingClientRect();
    const sx = ((clientX - b.left) / b.width) * N;
    const sy = ((clientY - b.top) / b.height) * N;
    let best = null;
    let bd = 7;
    for (const c of cells) {
      if (!c.screen || c.screen.z < 0.08) continue;
      const dd = Math.hypot(c.screen.x - sx, c.screen.y - sy);
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    return best;
  }

  // dragging turns the globe; a short tap picks a mark
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
    canvas.setPointerCapture(e.pointerId);
    vLon = vLat = 0;
    goal = null;
    lastTouch = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = 180 / canvas.getBoundingClientRect().width;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    lon -= dx * k;
    lat = Math.max(-70, Math.min(70, lat + dy * k));
    const now = performance.now();
    const dt = Math.max(1, now - drag.t);
    vLon = (-dx * k) / dt;
    vLat = (dy * k) / dt;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.t = now;
    lastTouch = now;
  });
  const end = (e) => {
    if (!drag) return;
    const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
    drag = null;
    lastTouch = performance.now();
    if (moved < 6) {
      vLon = vLat = 0;
      show(nearest(e.clientX, e.clientY));
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('keydown', (e) => {
    const step = {
      ArrowLeft: [-12, 0],
      ArrowRight: [12, 0],
      ArrowUp: [0, 10],
      ArrowDown: [0, -10],
    }[e.key];
    if (!step) return;
    e.preventDefault();
    lon += step[0];
    lat = Math.max(-70, Math.min(70, lat + step[1]));
    lastTouch = performance.now();
  });

  let visible = true;
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) requestAnimationFrame(frame);
  }).observe(canvas);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!drag) {
      if (goal) {
        const dl = ((((goal.lon - lon) % 360) + 540) % 360) - 180;
        lon += dl * Math.min(1, dt * 4);
        lat += (goal.lat - lat) * Math.min(1, dt * 4);
        if (Math.abs(dl) < 0.3 && Math.abs(goal.lat - lat) < 0.3) goal = null;
      } else if (Math.abs(vLon) + Math.abs(vLat) > 0.0005) {
        lon += vLon * dt * 1000;
        lat = Math.max(-70, Math.min(70, lat + vLat * dt * 1000));
        vLon *= Math.pow(0.04, dt);
        vLat *= Math.pow(0.04, dt);
      } else if (!reduce && now - lastTouch > 3000) {
        lon += 5 * dt;
      }
    }
    draw(now);
    if (visible) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // the latest catches
  fetch(`${root.dataset.api}/v1/public/captures`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((body) => {
      cells = (body.cells || []).map((c) => ({
        ...c,
        color: (data.creatures[c.creature] || [0, '#ffffff'])[1],
      }));
      if (!cells.length) {
        caption.textContent = t('empty');
        return;
      }
      caption.textContent = t('count', { n: cells.reduce((s, c) => s + c.count, 0) });
      const recent = [...cells].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 6);
      for (const c of recent) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        const im = document.createElement('img');
        im.src = `/assets/creatures/${c.creature}.webp`;
        im.alt = '';
        im.width = 28;
        im.height = 41;
        const s = document.createElement('span');
        s.textContent = `${(data.creatures[c.creature] || [c.creature])[0]} · ${c.by}`;
        b.append(im, s);
        b.addEventListener('click', () => {
          goal = { lon: c.lng, lat: Math.max(-70, Math.min(70, c.lat)) };
          lastTouch = performance.now();
          show(c);
        });
        li.append(b);
        latest.append(li);
      }
    })
    .catch(() => {
      caption.textContent = t('offline');
    });
})();
