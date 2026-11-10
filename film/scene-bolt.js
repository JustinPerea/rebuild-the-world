const { seg, eo, eio, lerp, TextFx } = kit;
Object.assign(W, {
  // A lug bolt on (0,0): washer, hex head lit from the upper left, a dark stud.
  lug(cls) {
    return '<g class="' + cls + '"><circle r="9.6" style="fill:var(--steel-dark)"/><path d="M7 0L3.5 6.06L-3.5 6.06L-7 0L-3.5 -6.06L3.5 -6.06Z" style="fill:var(--steel-lit)"/><path d="M3.5 -6.06L7 0L3.5 6.06L-3.5 6.06L0 0Z" style="fill:var(--steel);opacity:.75"/><circle r="2.8" style="fill:var(--steel-dark)"/></g>';
  },
  // A wheel on (0,0), radius 100: tyre, rim, five cut-outs, hub cap and five lugs. Lite is three circles, for far views.
  wheel(cls, lite) {
    let s = '<g class="' + cls + '"><circle r="100" style="fill:var(--rubber)"/>';
    if (lite) return s + '<circle r="66" style="fill:var(--steel)"/><circle r="20" style="fill:var(--steel-lit)"/></g>';
    s += '<circle r="90" style="fill:none;stroke:var(--ground);stroke-width:3;opacity:.5"/><path d="M-67.9 -67.9 A96 96 0 0 1 0 -96" style="fill:none;stroke:var(--steel);stroke-width:4;stroke-linecap:round"/>' +
      '<circle r="68" style="fill:var(--steel)"/><path d="M-60.1 -21.9 A64 64 0 0 1 21.9 -60.1" style="fill:none;stroke:var(--steel-lit);stroke-width:6;stroke-linecap:round"/>';
    for (let i = 0; i < 5; i++) s += '<rect x="38" y="-9" width="24" height="18" rx="9" transform="rotate(' + (i * 72 - 54) + ')" style="fill:var(--steel-dark)"/>';
    s += '<circle r="15" style="fill:var(--steel-lit)"/><circle r="6" style="fill:var(--steel)"/>';
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      s += '<g transform="translate(' + (32 * Math.cos(a)).toFixed(2) + ' ' + (32 * Math.sin(a)).toFixed(2) + ')">' + W.lug(cls + '-lug') + '</g>';
    }
    return s + '</g>';
  },
});
kit.scene('bolt', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground"><div class="lamp bolt-air"></div>' +
      '<svg class="art" viewBox="0 0 1920 1080"><g class="bolt-world">' + W.floor('bolt-floor', 900) + W.shadow('bolt-shadow', 1340, 906, 300) +
        '<g class="bolt-wheelbox" transform="translate(1340 560) scale(3.4)">' + W.wheel('bolt-wheel') + '</g></g></svg>' +
      '<div class="edge"></div><div class="calm"></div>' +
      '<div class="words" style="left:110px;top:300px;width:860px"><h1 class="line">Rebuild the World</h1><p class="sub bolt-sub">An open project to model the planet, one part at a time.</p></div></div>'));
    const q = (s) => kit.stage.querySelector(s);
    Object.assign(this, { world: q('.bolt-world'), lug: q('.bolt-wheel-lug'), air: q('.bolt-air'), line: q('.line'), sub: q('.bolt-sub') });
  },
  render(t) {
    // One slow pull-back from the top lug (world 1340, 451.2) to the whole wheel.
    const p = eio(seg(t, 1.4, 5.3));
    W.cam(this.world, 1340, 451.2, 1340, lerp(560, 451.2, p), W.zoom(6.5, 1, p));
    // The lug turns home and seats: the first part going in.
    const turn = eo(seg(t, -0.5, 1.0));
    this.lug.setAttribute('transform', 'rotate(' + lerp(-150, 0, turn).toFixed(2) + ') scale(' + lerp(1.45, 1, turn).toFixed(3) + ')');
    this.air.style.opacity = (0.85 + 0.15 * Math.sin(t * 1.3)).toFixed(3);
    TextFx.fadeFromRight(this.line, t, -0.7);
    this.sub.style.opacity = eo(seg(t, 1.3, 1.9));
  },
});