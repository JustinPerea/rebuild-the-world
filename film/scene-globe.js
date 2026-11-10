const { seg, eo, eio, lerp, TextFx } = kit;
kit.scene('globe', {
  init(kit) {
    this.sky = W.skyline(kit, 'globe-sky');
    const r = kit.rng(11);
    let stars = '', land = '';
    for (let i = 0; i < 24; i++) stars += '<circle class="globe-star" cx="' + Math.round(r() * 1920) + '" cy="' + Math.round(r() * 1080) + '" r="' + (1.5 + r() * 2).toFixed(1) + '" style="fill:var(--second)"/>';
    // Six landmasses with their city lights, in a strip 900 wide that is drawn twice so the globe can turn without a seam.
    for (let i = 0; i < 6; i++) {
      const x = -450 + (i + 0.5) * 150 + (r() - 0.5) * 60, y = (r() - 0.5) * 380, rx = 55 + r() * 60, ry = 32 + r() * 44;
      land += '<ellipse cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" rx="' + rx.toFixed(0) + '" ry="' + ry.toFixed(0) + '" style="fill:var(--wall)"/>';
      for (let j = 0; j < 4; j++) {
        const a = r() * 6.283, d = Math.sqrt(r()) * 0.7;
        land += '<circle cx="' + (x + Math.cos(a) * rx * d).toFixed(0) + '" cy="' + (y + Math.sin(a) * ry * d).toFixed(0) + '" r="' + (2.5 + r() * 2.5).toFixed(1) + '" style="fill:var(--accent)"/>';
      }
    }
    kit.stage.append(kit.h('<div class="ground"><div class="lamp globe-air"></div>' +
      '<svg class="art globe-stars" viewBox="0 0 1920 1080">' + stars + '</svg>' +
      '<svg class="art" viewBox="0 0 1920 1080"><g class="globe-world"><defs><clipPath id="globe-clip"><circle cx="1340" cy="560" r="300"/></clipPath>' +
        '<radialGradient id="globe-shade" cx="0.32" cy="0.28" r="0.85"><stop offset="0.55" style="stop-color:rgba(0,0,0,0)"/><stop offset="1" style="stop-color:rgba(0,0,0,.5)"/></radialGradient></defs>' +
        '<circle class="globe-disc" cx="1340" cy="560" r="300" style="fill:var(--land);stroke:var(--steel-dark);stroke-width:.15"/>' +
        '<g class="globe-lands" clip-path="url(#globe-clip)"><g class="globe-turn"><g>' + land + '</g><g transform="translate(-900 0)">' + land + '</g></g></g>' +
        '<circle class="globe-dark" cx="1340" cy="560" r="300" fill="url(#globe-shade)"/>' +
        '<path class="globe-limb" d="M1089.5 402.2 A296 296 0 0 1 1497.8 309.6" style="fill:none;stroke:var(--steel-lit);stroke-width:4;stroke-linecap:round"/>' +
        '<g class="globe-skybox" transform="translate(1340 560) scale(.1)">' + this.sky.markup + '</g></g></svg>' +
      '<div class="edge"></div><div class="calm globe-calm"></div>' +
      '<div class="words" style="left:110px;top:270px;width:900px"><h1 class="line">Rebuild the World</h1><div class="globe-rule" style="width:180px;height:10px;border-radius:5px;background:var(--accent);transform-origin:0 50%"></div><p class="sub globe-sub">Looking for our first builders. Want to build a part?</p></div></div>'));
    const q = (s) => kit.stage.querySelector(s);
    Object.assign(this, { world: q('.globe-world'), turn: q('.globe-turn'), lands: q('.globe-lands'), limb: q('.globe-limb'), stars: q('.globe-stars'),
      star: Array.from(kit.stage.querySelectorAll('.globe-star')), air: q('.globe-air'), calm: q('.globe-calm'), line: q('.line'), rule: q('.globe-rule'), sub: q('.globe-sub') });
  },
  render(t) {
    // Opens on the skyline exactly as the last scene left it: the curve was the top of this globe all along.
    const p = eio(seg(t, 0.3, 4.4)), hold = seg(t, 4.4, 8.5);
    W.cam(this.world, 1340, 260, lerp(960, 1340, p), lerp(700, 260, p), W.zoom(10, 1, p) * (1 + 0.025 * hold));
    // The globe turns: the strip of land slides and wraps.
    this.turn.setAttribute('transform', 'translate(' + (1340 + (Math.max(0, t) * 36) % 900).toFixed(1) + ' 560)');
    this.lands.style.opacity = eo(seg(t, 0.8, 2.4));
    this.limb.style.opacity = 0.7 * eo(seg(t, 1.6, 3.4));
    this.stars.style.opacity = eo(seg(t, 1.4, 3.4));
    for (let i = 0; i < this.star.length; i++) this.star[i].style.opacity = 0.55 + 0.45 * Math.sin(t * 1.7 + i * 2.1);
    this.air.style.opacity = (0.85 + 0.15 * Math.sin(t * 1.3)).toFixed(3);
    this.calm.style.opacity = eo(seg(t, 2.6, 3.6));
    TextFx.fadeFromRight(this.line, t, 3.5);
    this.rule.style.transform = 'scaleX(' + eo(seg(t, 4.3, 4.9)).toFixed(3) + ')';
    this.sub.style.opacity = eo(seg(t, 4.6, 5.2));
  },
});