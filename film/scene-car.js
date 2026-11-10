const { seg, eo, eio, eob, lerp, TextFx } = kit;
Object.assign(W, {
  // Car parts in car space: ground at y 0, tail at x 20, nose at x 1090, wheels on (220,-100) and (880,-100). Each part is its own group, so a scene can bring it in alone.
  carChassis(cls) {
    return '<g class="' + cls + '"><rect x="60" y="-124" width="980" height="52" rx="12" style="fill:var(--steel-dark)"/><circle cx="220" cy="-100" r="20" style="fill:var(--steel)"/><circle cx="880" cy="-100" r="20" style="fill:var(--steel)"/></g>';
  },
  carBody(cls) {
    return '<g class="' + cls + '"><path d="M20 -70 L30 -190 L170 -215 L330 -330 H640 L800 -220 L1040 -190 L1085 -150 L1090 -70 L994 -70 A118 118 0 1 0 766 -70 L334 -70 A118 118 0 1 0 106 -70 Z" style="fill:var(--paint)"/>' +
      '<path d="M176 -219 L332 -326 H638 L792 -224" style="fill:none;stroke:var(--paint-lit);stroke-width:8;stroke-linejoin:round;stroke-linecap:round"/><path d="M44 -150 H1066" style="fill:none;stroke:var(--steel-dark);stroke-width:4;opacity:.45"/></g>';
  },
  carGlass(cls) {
    return '<g class="' + cls + '"><path d="M200 -226 L340 -314 H470 V-226 Z M496 -314 H630 L770 -226 H496 Z" style="fill:var(--glass)"/></g>';
  },
  carDoor(cls) {
    return '<g class="' + cls + '"><path d="M398 -222 H616 L626 -84 H402 Z" style="fill:var(--paint-lit);stroke:var(--steel-dark);stroke-width:4;stroke-linejoin:round"/><rect x="572" y="-204" width="34" height="9" rx="4" style="fill:var(--second)"/></g>';
  },
  carLamp(cls) {
    return '<g class="' + cls + '"><circle cx="1076" cy="-150" r="70" style="fill:var(--glow)"/><path d="M1040 -176 L1066 -158 L1078 -132 L1046 -146 Z" style="fill:var(--accent)"/></g>';
  },
  // The whole car at once, for farther views. Lite wheels are three circles each.
  car(cls, lite) {
    return '<g class="' + cls + '">' + W.carChassis(cls + '-chassis') + '<g transform="translate(220 -100)">' + W.wheel(cls + '-wr', lite) + '</g><g transform="translate(880 -100)">' + W.wheel(cls + '-wf', lite) + '</g>' +
      W.carBody(cls + '-body') + W.carGlass(cls + '-glass') + W.carDoor(cls + '-door') + W.carLamp(cls + '-lamp') + '</g>';
  },
});
kit.scene('car', {
  init(kit) {
    kit.stage.append(kit.h('<div class="ground"><div class="lamp car-air"></div>' +
      '<svg class="art" viewBox="0 0 1920 1080"><g class="car-world">' + W.floor('car-floor', 820) +
        '<g class="car-rig" transform="translate(430 820)">' + W.shadow('car-sh1', 880, 6, 88) + W.shadow('car-sh2', 550, 8, 560) + W.carChassis('car-chassis') +
          '<g class="car-rear">' + W.wheel('car-wr') + '</g><g class="car-front" transform="translate(880 -100)">' + W.wheel('car-wf') + '</g>' +
          W.carBody('car-body') + W.carGlass('car-glass') + W.carDoor('car-door') + W.carLamp('car-lamp') + '</g></g></svg>' +
      '<div class="edge"></div><div class="calm"></div>' +
      '<div class="words" style="left:110px;top:330px;width:860px"><h2 class="line say">Claim one small part.</h2><p class="sub car-sub">Your AI builds it to a shared spec.</p></div></div>'));
    const q = (s) => kit.stage.querySelector(s);
    Object.assign(this, { world: q('.car-world'), chassis: q('.car-chassis'), rear: q('.car-rear'), body: q('.car-body'), glass: q('.car-glass'), door: q('.car-door'),
      headlamp: q('.car-lamp'), sh2: q('.car-sh2'), air: q('.car-air'), line: q('.line'), sub: q('.car-sub') });
  },
  render(t) {
    // Opens on the front wheel exactly as the last scene left it, then pulls back as the parts arrive.
    const p = eio(seg(t, 0.4, 5.3));
    W.cam(this.world, 1310, 720, lerp(1340, 1643.6, p), lerp(560, 632, p), W.zoom(3.4, 0.72, p));
    const ch = eob(seg(t, 0.6, 1.4), 1.2);
    this.chassis.setAttribute('transform', 'translate(' + lerp(-1500, 0, ch).toFixed(1) + ' 0)');
    const rx = lerp(-1300, 0, eo(seg(t, 1.1, 2.0)));
    this.rear.setAttribute('transform', 'translate(' + (220 + rx).toFixed(1) + ' -100) rotate(' + (rx * 0.573).toFixed(1) + ')');
    const bd = eob(seg(t, 1.8, 2.6), 1.3);
    this.body.setAttribute('transform', 'translate(0 ' + lerp(-900, 0, bd).toFixed(1) + ')');
    this.sh2.style.opacity = eo(seg(t, 2.0, 2.6));
    const gl = eo(seg(t, 2.5, 3.0));
    this.glass.setAttribute('transform', 'translate(0 ' + lerp(-70, 0, gl).toFixed(1) + ')');
    this.glass.style.opacity = gl;
    const dr = eob(seg(t, 3.0, 3.7), 1.5);
    this.door.setAttribute('transform', 'translate(' + lerp(-420, 0, dr).toFixed(1) + ' ' + lerp(-260, 0, dr).toFixed(1) + ')');
    this.door.style.opacity = seg(t, 3.0, 3.2);
    this.headlamp.style.opacity = eo(seg(t, 4.1, 4.5)) * (0.9 + 0.1 * Math.sin(t * 3));
    this.air.style.opacity = (0.85 + 0.15 * Math.sin(t * 1.3)).toFixed(3);
    TextFx.fadeFromRight(this.line, t, 0.7);
    this.sub.style.opacity = eo(seg(t, 2.0, 2.6));
  },
});