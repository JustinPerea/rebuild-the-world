const { seg, eo, eio, eob, lerp, TextFx } = kit;
Object.assign(W, {
  // The first block: five buildings as [x, width, floors] on ground line 760. A floor is 60 tall, a window bay 40 wide.
  blockSpec: [[760, 280, 5], [480, 240, 6], [1180, 240, 8], [250, 200, 4], [1460, 200, 3]],
  // One pattern paints every floor, another the lit windows, so a whole block costs a frame almost nothing.
  blockDefs(id) {
    return '<defs><pattern id="' + id + '-floor" width="40" height="60" patternUnits="userSpaceOnUse"><rect width="40" height="60" style="fill:var(--wall)"/><rect x="12" y="14" width="18" height="30" style="fill:var(--glass)"/><rect y="57" width="40" height="3" style="fill:var(--ground);opacity:.45"/></pattern>' +
      '<pattern id="' + id + '-lit" width="120" height="180" patternUnits="userSpaceOnUse"><rect x="52" y="14" width="18" height="30" style="fill:var(--accent)"/><rect x="12" y="74" width="18" height="30" style="fill:var(--accent)"/><rect x="92" y="134" width="18" height="30" style="fill:var(--accent)"/></pattern></defs>';
  },
  // A street tree, its foot on (x, 760), lit on the upper left.
  tree(cls, x) {
    return '<g class="' + cls + '" transform="translate(' + x + ' 760)"><rect x="-5" y="-74" width="10" height="74" style="fill:var(--steel-dark)"/><circle cy="-104" r="46" style="fill:var(--wall)"/><circle cx="-13" cy="-116" r="26" style="fill:var(--wall-lit)"/></g>';
  },
  // A street light, its foot on (x, 760): glow, pole, arm, head and bulb.
  light(cls, x) {
    return '<g class="' + cls + '" transform="translate(' + x + ' 760)"><circle class="' + cls + '-glow" cx="46" cy="-150" r="64" style="fill:var(--glow)"/><rect x="-3" y="-176" width="6" height="176" style="fill:var(--steel)"/><rect x="-3" y="-176" width="50" height="6" style="fill:var(--steel)"/><rect x="34" y="-172" width="24" height="10" rx="3" style="fill:var(--steel-lit)"/><circle class="' + cls + '-bulb" cx="46" cy="-160" r="6" style="fill:var(--accent)"/></g>';
  },
  // The finished block, for farther views: the same buildings, trees, lights and car, on a slab of ground.
  block(cls) {
    let s = '<g class="' + cls + '">' + W.blockDefs(cls) + '<rect x="150" y="760" width="1640" height="40" style="fill:var(--land)"/>';
    for (const [x, w, n] of W.blockSpec) {
      s += '<g transform="translate(' + x + ' ' + (760 - n * 60) + ')"><rect width="' + w + '" height="' + n * 60 + '" fill="url(#' + cls + '-floor)"/><rect width="8" height="' + n * 60 + '" style="fill:var(--wall-lit)"/><rect x="-4" y="-8" width="' + (w + 8) + '" height="8" style="fill:var(--wall-lit)"/><rect width="' + w + '" height="' + n * 60 + '" fill="url(#' + cls + '-lit)"/></g>';
    }
    return s + W.tree(cls + '-tree', 1110) + W.tree(cls + '-tree', 170) + W.tree(cls + '-tree', 1760) + W.light(cls + '-light', 735) + W.light(cls + '-light', 1435) +
      '<g transform="translate(874 760) scale(.2)">' + W.car(cls + '-car', true) + '</g></g>';
  },
});
kit.scene('street', {
  init(kit) {
    const floors = [];
    let build = '', lit = '';
    W.blockSpec.forEach((b, i) => {
      const x = b[0], w = b[1], n = b[2];
      for (let j = 0; j < n; j++) {
        floors.push({ x: x, y: 760 - (j + 1) * 60, at: 0.9 + i * 0.35 + j * 0.16 });
        build += '<g class="street-f"><rect width="' + w + '" height="60" fill="url(#street-floor)"/><rect width="8" height="60" style="fill:var(--wall-lit)"/>' + (j === n - 1 ? '<rect x="-4" y="-8" width="' + (w + 8) + '" height="8" style="fill:var(--wall-lit)"/>' : '') + '</g>';
      }
      lit += '<g transform="translate(' + x + ' ' + (760 - n * 60) + ')"><rect class="street-lit" width="' + w + '" height="' + n * 60 + '" fill="url(#street-lit)"/></g>';
    });
    kit.stage.append(kit.h('<div class="ground"><div class="lamp street-air"></div>' +
      '<svg class="art" viewBox="0 0 1920 1080"><g class="street-world">' + W.blockDefs('street') + W.floor('street-road', 760) +
        '<rect class="street-kerb" x="-9000" y="760" width="20000" height="6" style="fill:var(--steel-dark)"/>' +
        '<g class="street-buildings">' + build + lit + '</g>' +
        W.tree('street-tree', 1110) + W.tree('street-tree', 170) + W.tree('street-tree', 1760) + W.light('street-light', 735) + W.light('street-light', 1435) +
        '<g class="street-carbox" transform="translate(874 760) scale(.2)">' + W.shadow('street-shadow', 550, 8, 560) + W.car('street-car', false) + '</g></g></svg>' +
      '<div class="edge"></div>' +
      '<div class="words" style="left:110px;bottom:60px;width:1700px"><h2 class="line say">Every part is checked, then snaps into place.</h2></div></div>'));
    const q = (s) => kit.stage.querySelector(s), all = (s) => Array.from(kit.stage.querySelectorAll(s));
    all('.street-f').forEach((el, i) => { floors[i].el = el; });
    Object.assign(this, { floors: floors, world: q('.street-world'), lit: all('.street-lit'), trees: all('.street-tree'), lights: all('.street-light'),
      glows: all('.street-light-glow'), bulbs: all('.street-light-bulb'), air: q('.street-air'), line: q('.line'), treeX: [1110, 170, 1760], lightX: [735, 1435] });
  },
  render(t) {
    // Opens on the finished car exactly as the last scene left it; the floor it stood on is now the road.
    const p = eio(seg(t, 0.4, 5.3));
    W.cam(this.world, 1050, 740, lerp(1643.6, 1050, p), lerp(632, 740, p), W.zoom(3.6, 1, p));
    // Floors drop in one by one: each a part someone built.
    for (const f of this.floors) {
      const a = eo(seg(t, f.at, f.at + 0.45));
      f.el.setAttribute('transform', 'translate(' + f.x + ' ' + (f.y - (1 - a) * 420).toFixed(1) + ')');
      f.el.style.opacity = seg(t, f.at, f.at + 0.15);
    }
    for (let i = 0; i < this.trees.length; i++) {
      const s = eob(seg(t, 3.1 + i * 0.15, 3.6 + i * 0.15), 1.6);
      this.trees[i].setAttribute('transform', 'translate(' + this.treeX[i] + ' 760) scale(' + Math.max(0.001, s).toFixed(3) + ')');
    }
    for (let i = 0; i < this.lights.length; i++) {
      const s = eo(seg(t, 3.4 + i * 0.2, 3.9 + i * 0.2)), on = eo(seg(t, 4.2 + i * 0.15, 4.6 + i * 0.15));
      this.lights[i].setAttribute('transform', 'translate(' + this.lightX[i] + ' 760) scale(1 ' + Math.max(0.001, s).toFixed(3) + ')');
      this.glows[i].style.opacity = on * (0.85 + 0.15 * Math.sin(t * 2 + i));
      this.bulbs[i].style.opacity = 0.25 + 0.75 * on;
    }
    const win = eo(seg(t, 4.3, 5.0));
    for (const el of this.lit) el.style.opacity = win;
    this.air.style.opacity = (0.85 + 0.15 * Math.sin(t * 1.3)).toFixed(3);
    TextFx.fadeFromRight(this.line, t, 0.9);
  },
});