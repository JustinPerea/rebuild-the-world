const { seg, eo, eio, eob, lerp, TextFx } = kit;
Object.assign(W, {
  // A skyline standing on a circle of radius 3000 about (0,0), near its top, with the first block in the middle.
  // Each building has its own seed, so the same city comes back wherever this is called.
  skyline(kit, cls) {
    const r = kit.rng(7), list = [];
    for (let i = 0; i < 36; i++) list.push({ a: (i % 2 ? 1 : -1) * (4.4 + r() * 15), w: 28 + r() * 40, h: 34 + r() * 120, tone: Math.round(20 + r() * 26) });
    const one = (b) => {
      const x = (-b.w / 2).toFixed(1), y = (-b.h).toFixed(1), w = b.w.toFixed(1), h = b.h.toFixed(1);
      return '<g class="' + cls + '-b" transform="rotate(' + b.a.toFixed(2) + ') translate(0 -3000)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (b.h + 8).toFixed(1) + '" style="fill:color-mix(in srgb, var(--main) ' + b.tone + '%, var(--ground))"/>' +
        '<rect x="' + x + '" y="' + y + '" width="4" height="' + h + '" style="fill:var(--wall-lit)"/><rect class="' + cls + '-w" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="url(#' + cls + '-win)"/></g>';
    };
    return {
      list: list,
      markup: '<g class="' + cls + '"><defs><pattern id="' + cls + '-win" width="20" height="26" patternUnits="userSpaceOnUse"><rect x="4" y="5" width="5" height="8" style="fill:var(--glass)"/><rect x="13" y="16" width="5" height="8" style="fill:var(--accent)"/></pattern></defs>' +
        list.map(one).join('') + '<g transform="translate(-240 -3190) scale(.25)">' + W.block(cls + '-blk') + '</g></g>',
      bind(g) {
        const bs = g.querySelectorAll('.' + cls + '-b');
        list.forEach((b, i) => { b.el = bs[i]; b.win = bs[i].lastChild; });
      },
    };
  },
});
kit.scene('city', {
  init(kit) {
    this.sky = W.skyline(kit, 'city-sky');
    kit.stage.append(kit.h('<div class="ground"><div class="lamp city-air"></div>' +
      '<svg class="art" viewBox="0 0 1920 1080"><g class="city-world"><circle class="city-land" cx="960" cy="3700" r="3000" style="fill:var(--land);stroke:var(--steel-dark);stroke-width:1.5"/>' +
        '<g class="city-skybox" transform="translate(960 3700)">' + this.sky.markup + '</g></g></svg>' +
      '<div class="edge"></div>' +
      '<div class="words" style="left:110px;top:90px;width:1100px"><h2 class="line say">Blocks become cities.</h2><p class="sub city-sub">Every new builder adds more.</p></div></div>'));
    const q = (s) => kit.stage.querySelector(s);
    this.sky.bind(q('.city-sky'));
    Object.assign(this, { world: q('.city-world'), air: q('.city-air'), line: q('.line'), sub: q('.city-sub') });
  },
  render(t) {
    // Opens on the block exactly as the last scene left it; the road is now the curve of the planet.
    const p = eio(seg(t, 0.3, 4.8));
    W.cam(this.world, 960, 700, 960, lerp(760, 700, p), W.zoom(4, 1, p));
    // New buildings rise outward from the first block, and their windows come on.
    for (const b of this.sky.list) {
      const at = 0.7 + (Math.abs(b.a) - 4.4) / 15 * 2.4, s = eob(seg(t, at, at + 0.5), 1.5);
      b.el.setAttribute('transform', 'rotate(' + b.a.toFixed(2) + ') translate(0 -3000) scale(1 ' + Math.max(0.001, s).toFixed(3) + ')');
      b.win.style.opacity = eo(seg(t, at + 0.4, at + 1.0));
    }
    this.air.style.opacity = (0.85 + 0.15 * Math.sin(t * 1.3)).toFixed(3);
    TextFx.fadeFromRight(this.line, t, 0.9);
    this.sub.style.opacity = eo(seg(t, 1.8, 2.4));
  },
});