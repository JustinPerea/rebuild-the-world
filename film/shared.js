// Rebuild the World: one model world, seen from closer or farther. Scenes stage these; none redraws one.
window.W = {
  // Shows world point (wx, wy) of a world group at stage point (sx, sy), at zoom z. Pure vector, so it stays sharp at any zoom.
  cam(el, wx, wy, sx, sy, z) {
    el.setAttribute('transform', 'translate(' + (sx - wx * z).toFixed(2) + ' ' + (sy - wy * z).toFixed(2) + ') scale(' + z.toFixed(4) + ')');
  },
  // An even pull-back: zoom moves by ratio, not by amount.
  zoom(z0, z1, p) { return z0 * Math.pow(z1 / z0, p); },
  // The floor every close view stands on; farther out it is the road, then the planet.
  floor(cls, y) { return '<rect class="' + cls + '" x="-9000" y="' + y + '" width="20000" height="9000" style="fill:var(--land)"/>'; },
  // A soft shadow on the floor under a thing.
  shadow(cls, cx, cy, rx) { return '<ellipse class="' + cls + '" cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + (rx * 0.06).toFixed(1) + '" style="fill:var(--shade)"/>'; },
};