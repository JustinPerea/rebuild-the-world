(function () {
  const D = window.PHOTOMAP;
  const P = D.photos.map((r) => ({ id: r[0], x: r[1], z: r[2], c: r[3], s: r[4], pano: r[5], img: r[6], ar: r[7] }));
  const bySeq = D.seqs.map(() => []);
  P.forEach((p) => { p.k = bySeq[p.s].length; bySeq[p.s].push(p); });
  const $ = (id) => document.getElementById(id);
  const cv = $("map"), ctx = cv.getContext("2d");
  const view = { x: 0, z: 0, k: 2 };
  let W = 0, H = 0, sel = null, queued = false, bld = -1, seen = new Set(), bldList = [];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sx = (x) => W / 2 + (x - view.x) * view.k, sy = (z) => H / 2 + (z - view.z) * view.k;
  const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function draw() {
    queued = false;
    const d = window.devicePixelRatio || 1;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const c = { ground: tok("--ground"), bld: tok("--bld"), edge: tok("--bld-edge"), block: tok("--block"), ink: tok("--ink"), ink2: tok("--ink2"), dot: tok("--dot"), off: tok("--dot-off"), acc: tok("--accent"), panel: tok("--panel"), see: tok("--see"), ref: tok("--ref"), refEdge: tok("--ref-edge") };
    ctx.fillStyle = c.ground; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 1; ctx.strokeStyle = c.edge; ctx.lineJoin = "round";
    const trace = (ring) => { ctx.beginPath(); ring.forEach((p, i) => (i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1])))); ctx.closePath(); };
    D.buildings.forEach(([inBlock, ring], i) => {
      const ref = D.info[i][2] > 0;
      trace(ring); ctx.fillStyle = ref ? c.ref : inBlock ? c.block : c.bld; ctx.strokeStyle = ref ? c.refEdge : c.edge; ctx.fill(); ctx.stroke();
    });
    if (bld >= 0) {
      trace(D.buildings[bld][1]);
      ctx.globalAlpha = 0.3; ctx.fillStyle = c.see; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 2.5; ctx.strokeStyle = c.see; ctx.stroke();
    }
    const r = clamp(1.4 + view.k * 0.22, 2, 6.5);
    // with a building chosen, the photos that do not show it step back
    const dots = (want, stored) => {
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (!!p.img !== stored || seen.has(i) !== want) continue;
        const x = sx(p.x), y = sy(p.z);
        if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
        ctx.beginPath(); ctx.arc(x, y, stored ? r + (want ? 1 : 0) : r * 0.8 + (want ? 1 : 0), 0, 6.2832);
        if (stored) ctx.fill(); else ctx.stroke();
      }
    };
    ctx.globalAlpha = bld >= 0 ? 0.3 : 1;
    ctx.lineWidth = 1.2; ctx.strokeStyle = c.off; dots(false, false);
    ctx.fillStyle = c.dot; dots(false, true);
    ctx.globalAlpha = 1;
    if (bld >= 0) { ctx.lineWidth = 2; ctx.strokeStyle = c.see; dots(true, false); ctx.fillStyle = c.see; dots(true, true); }
    if (sel) {
      const x = sx(sel.x), y = sy(sel.z);
      if (sel.c >= 0 && !sel.pano) {
        const a = ((sel.c - 90) * Math.PI) / 180, len = 34 + r * 3;
        ctx.globalAlpha = 0.28; ctx.fillStyle = c.acc; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = c.ground; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 6.2832); ctx.fill();
      ctx.fillStyle = c.acc; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 6.2832); ctx.fill();
    }
    // scale bar and north, top left
    const nice = [1, 2, 5, 10, 20, 50, 100, 200].find((m) => m * view.k >= 70) || 200, bar = nice * view.k;
    ctx.fillStyle = c.panel; ctx.globalAlpha = 0.9; ctx.fillRect(10, 10, Math.max(bar + 58, 96), 40); ctx.globalAlpha = 1;
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(20, 30); ctx.lineTo(20, 38); ctx.lineTo(20 + bar, 38); ctx.lineTo(20 + bar, 30); ctx.stroke();
    ctx.fillStyle = c.ink; ctx.font = "500 13px Inter, system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText(nice + " m", 20, 26);
    const nx = 20 + bar + 22;
    ctx.beginPath(); ctx.moveTo(nx, 16); ctx.lineTo(nx - 5, 28); ctx.lineTo(nx + 5, 28); ctx.closePath(); ctx.fill();
    ctx.textAlign = "center"; ctx.fillText("N", nx, 43);
  }
  const redraw = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };

  function resize() {
    const b = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    W = b.width; H = b.height; cv.width = Math.round(W * d); cv.height = Math.round(H * d); draw();
  }
  function fitTo(pts) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    view.x = (x0 + x1) / 2; view.z = (z0 + z1) / 2;
    view.k = clamp(Math.min(W / (x1 - x0 + 20), H / (z1 - z0 + 20)), 0.6, 60); redraw();
  }
  function zoomAt(px, py, f) {
    const wx = view.x + (px - W / 2) / view.k, wz = view.z + (py - H / 2) / view.k;
    view.k = clamp(view.k * f, 0.6, 80);
    view.x = wx - (px - W / 2) / view.k; view.z = wz - (py - H / 2) / view.k; redraw();
  }

  const el = (tag, text, attrs) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const compass = (deg) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(deg / 45) % 8];
  function select(p, centre) {
    sel = p;
    const q = D.seqs[p.s], url = "https://www.mapillary.com/app/?pKey=" + p.id, frame = $("frame");
    frame.replaceChildren();
    if (p.img) {
      frame.style.aspectRatio = String(p.ar || 1.333);
      frame.appendChild(el("img", null, { src: "img/" + p.id + ".jpg", alt: "Street photo taken on " + q.date + " by " + q.creator, decoding: "async" }));
    } else {
      frame.style.aspectRatio = "4 / 3";
      const n = el("div", null, { class: "none" });
      n.append("This photo isn't stored on this page. ", el("a", "Open it on Mapillary", { href: url, target: "_blank", rel: "noopener" }), ".");
      frame.appendChild(n);
    }
    const facts = $("facts"); facts.replaceChildren();
    const row = (k, v) => { facts.appendChild(el("dt", k)); const dd = el("dd"); dd.append(v); facts.appendChild(dd); };
    row("Taken", q.date);
    row("By", q.creator + " on Mapillary");
    row("Kind", p.pano ? "360° panorama" : "Photo");
    if (p.c >= 0 && !p.pano) row("Facing", compass(p.c) + " (" + p.c + "°)");
    row("Where", Math.abs(p.x).toFixed(0) + " m " + (p.x >= 0 ? "east" : "west") + ", " + Math.abs(p.z).toFixed(0) + " m " + (p.z >= 0 ? "south" : "north") + " of the map's centre, by its GPS record");
    row("Source", el("a", "Open on Mapillary", { href: url, target: "_blank", rel: "noopener" }));
    $("pos").textContent = "photo " + (p.k + 1) + " of " + q.n + " in this drive";
    $("prev").disabled = p.k === 0; $("next").disabled = p.k === q.n - 1;
    showBuilding();
    const x = sx(p.x), y = sy(p.z);
    if (centre && (x < 40 || x > W - 40 || y < 60 || y > H - 60)) { view.x = p.x; view.z = p.z; }
    redraw();
  }
  function inside(ring, x, z) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  }
  function showBuilding() {
    const text = $("bldtext"), stepRow = $("bldstep"), facts = $("bldfacts");
    if (bld < 0) { text.textContent = "Tap a building to see which photos show it and what it could be claimed for."; stepRow.hidden = true; facts.hidden = true; return; }
    const [name, tall, ok, doubt, tallFrom] = D.info[bld], n = bldList.length, stored = bldList.filter((i) => P[i].img).length, inBlock = D.buildings[bld][0];
    text.textContent = "Building " + name + ", " + tall + " m tall" + (tallFrom === "assumed" ? " (assumed: the map data has no height)" : tallFrom === "storeys" ? " (from its storey count)" : "") + ". " + (n ? n + (n === 1 ? " photo shows it, " : " photos show it, ") + stored + " stored here." : "No indexed photo shows it.");
    facts.replaceChildren(); facts.hidden = false;
    const row = (k, v) => { facts.appendChild(el("dt", k)); facts.appendChild(el("dd", v)); };
    row("Level now", "Blockout (A0)");
    row("Open to claim", inBlock ? "Dressed (A1): write its facade plan" : "Nothing yet. It is outside the open block");
    row("True exterior", ok ? "Opens once it is dressed. " + ok + (ok === 1 ? " wall has" : " walls have") + " a reference image"
      : doubt ? "Needs photos. Its wall image is marked doubtful"
      : n && !D.refsRun ? "Not checked. " + n + (n === 1 ? " photo shows" : " photos show") + " it, and the wall-reference tool has not run here"
      : n ? "Needs photos. None of the " + n + " that show it gave a usable wall image"
      : "Needs photos. No open photo shows it");
    row("Claimed by", "Nobody. Claims are not taken yet");
    stepRow.hidden = false;
    const at = sel ? bldList.indexOf(P.indexOf(sel)) : -1;
    $("bpos").textContent = n ? (at >= 0 ? "photo " + (at + 1) + " of " + n + ", ordinary photos first, sharpest first" : "chosen photo is not one of them") : "";
    $("bprev").disabled = !n || at === 0; $("bnext").disabled = !n || at === n - 1;
  }
  function chooseBuilding(i) {
    bld = i; bldList = i >= 0 ? D.sees[i].map((s) => s[0]) : []; seen = new Set(bldList);
    if (bldList.length) select(P[bldList[0]], false); else { showBuilding(); redraw(); }
  }
  function pick(px, py) {
    let best = null, bs = 20;
    for (const p of P) {
      const s = Math.hypot(sx(p.x) - px, sy(p.z) - py) - (p.img ? 4 : 0);
      if (s < bs) { bs = s; best = p; }
    }
    const wx = view.x + (px - W / 2) / view.k, wz = view.z + (py - H / 2) / view.k;
    const b = D.buildings.findIndex((q) => inside(q[1], wx, wz));
    // a dot wins when the tap is on it; a tap inside a building, away from any dot, chooses the building
    if (best && (b < 0 || bs < 9)) select(best, false);
    else if (b >= 0) chooseBuilding(b);
  }

  // drag to move, pinch or wheel to zoom, tap to choose
  const pts = new Map(); let moved = 0, pinch = 0;
  const at = (e) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener("pointerdown", (e) => { try { cv.setPointerCapture(e.pointerId); } catch (_) {} pts.set(e.pointerId, at(e)); if (pts.size === 1) moved = 0; pinch = 0; });
  cv.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    const was = pts.get(e.pointerId), now = at(e);
    pts.set(e.pointerId, now);
    if (pts.size === 1) {
      moved += Math.abs(now[0] - was[0]) + Math.abs(now[1] - was[1]);
      if (moved > 6) { view.x -= (now[0] - was[0]) / view.k; view.z -= (now[1] - was[1]) / view.k; redraw(); }
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0 && dist > 0) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, dist / pinch);
      pinch = dist; moved = 99;
    }
  });
  const up = (e) => { if (!pts.has(e.pointerId)) return; const p = pts.get(e.pointerId); pts.delete(e.pointerId); pinch = 0; if (e.type === "pointerup" && pts.size === 0 && moved <= 6) pick(p[0], p[1]); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const p = at(e); zoomAt(p[0], p[1], Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
  $("zin").addEventListener("click", () => zoomAt(W / 2, H / 2, 1.6));
  $("zout").addEventListener("click", () => zoomAt(W / 2, H / 2, 1 / 1.6));
  const blockPts = D.buildings.filter((b) => b[0]).flatMap((b) => b[1]);
  $("fit").addEventListener("click", () => fitTo(blockPts));
  $("all").addEventListener("click", () => fitTo(P.map((p) => [p.x, p.z])));
  const step = (d) => { if (sel) { const q = bySeq[sel.s][sel.k + d]; if (q) select(q, true); } };
  const bstep = (d) => { const at = sel ? bldList.indexOf(P.indexOf(sel)) : -1, i = bldList[at < 0 ? 0 : at + d]; if (i != null) select(P[i], true); };
  $("bprev").addEventListener("click", () => bstep(-1));
  $("bnext").addEventListener("click", () => bstep(1));
  $("bclear").addEventListener("click", () => chooseBuilding(-1));
  $("prev").addEventListener("click", () => step(-1));
  $("next").addEventListener("click", () => step(1));
  document.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1); });

  const names = [...new Set(D.seqs.map((s) => s.creator))].sort();
  const inB = D.buildings.map((b, i) => i).filter((i) => D.buildings[i][0]);
  const part = inB.length < D.buildings.length;
  const claimLine = "The claim lines preview a proposed process (docs/claim-system-spec.md) and take no claims. Of the " + inB.length + " buildings " + (part ? "in the open block" : "here") + ", all blockouts, " +
    inB.filter((i) => D.info[i][2] > 0).length + " have a wall reference, " + inB.filter((i) => !D.info[i][2] && D.sees[i].length).length + " are shown by photos but have none, and " +
    inB.filter((i) => !D.sees[i].length).length + " are shown by no photo.";
  $("credit").textContent = (P.length ? P.length.toLocaleString("en") + " photos from " + D.seqs.length + " drives and walks, " + P.filter((p) => p.img).length + " of them stored here. Photos by " + names.join(", ") +
    " on Mapillary, shared under CC BY-SA 4.0. " : "No open street photo is indexed here. ") + claimLine + " Building outlines: " + D.outlines + ". " + (part ? "The darker buildings are the open block. " : "") + "Which photos show a building is worked out from each photo's GPS position and heading (within 40 m of a wall, facing it, no building in between), not by looking at the photo. A dot sits at the photo's GPS record, which can be several metres from where the camera stood.";

  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentElement); else window.addEventListener("resize", resize);
  try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw); } catch (_) {}
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  resize(); fitTo(blockPts.length ? blockPts : D.buildings.flatMap((b) => b[1]));
  const first = P.find((p) => p.id === D.start) || P.find((p) => p.img) || P[0];
  if (first) select(first, false);
  else { $("frame").appendChild(el("div", "No open street photo is indexed here yet. Photos taken on this block and shared openly would appear as dots.", { class: "none" })); $("prev").disabled = $("next").disabled = true; showBuilding(); }
})();
