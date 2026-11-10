kit.score(function (S, T) {
  const B = 5.5 / 8;   // eight beats to a scene, so every cut up to the city lands on a bar line
  S.tempo(60 / B, { t0: 0 });
  S.program('pad', 'pad', { rev: 0.6 }); S.program('bass', 'bass'); S.program('mallet', 'marimba', { rev: 0.25 }); S.program('ep', 'ep');
  // The bolt: near silent, one part seating.
  S.chord('pad', ['D3', 'A3', 'F#4'], { t: 0, dur: 5.4, vel: 28 });
  S.fx('click', 1.0, { vel: 70 });
  S.run('mallet', ['A4', 'D5', 'F#5'], { t: 4.6, step: 0.28, vel: 46 });
  // The groove comes in with the car and runs to the edge of the city.
  S.drums({ kick: 'x...x...', hat: 'oxoxoxox' }, { from: 8, repeat: 5 });
  S.drums({ kick: 'x...x.', hat: 'oxoxox' }, { from: 28, repeat: 1 });
  const bars = [['D2', ['D3', 'F#3', 'A3']], ['G2', ['G3', 'B3', 'D4']], ['B1', ['B2', 'D3', 'F#3']], ['G2', ['G3', 'B3', 'D4']], ['D2', ['D3', 'F#3', 'A3']]];
  bars.forEach(function (b, i) {
    S.note('bass', b[0], { beat: 8 + i * 4, beats: 3.5, vel: 58 });
    S.chord('ep', b[1], { beat: 8 + i * 4, beats: 3.5, vel: 44 });
  });
  S.note('bass', 'A1', { beat: 28, beats: 3, vel: 58 });
  S.chord('ep', ['A2', 'C#3', 'E3'], { beat: 28, beats: 3, vel: 44 });
  S.pattern('mallet', 'x.x.X.xx', { from: 8, repeat: 2, pitch: ['D5', 'A4', 'F#4', 'A4', 'D5'], vel: 54 });
  S.pattern('mallet', 'x.x.X.xx', { from: 16, repeat: 2, pitch: ['B4', 'F#4', 'D5', 'F#4', 'B4'], vel: 58 });
  S.pattern('mallet', 'x.x.X.xx', { from: 24, repeat: 1, pitch: ['D5', 'A4', 'F#5', 'A4', 'D5'], vel: 62 });
  // The car's parts, each on its own frame.
  S.fx('thud', T.car + 1.3, { vel: 60 }); S.fx('click', T.car + 2.0); S.fx('thud', T.car + 2.5, { vel: 70 });
  S.fx('pop', T.car + 3.0); S.fx('click', T.car + 3.6); S.fx('ding', T.car + 4.2, { vel: 60 });
  // The street: a tick for every floor that lands.
  const land = [];
  [5, 6, 8, 4, 3].forEach(function (n, i) { for (let j = 0; j < n; j++) land.push(T.street + 0.9 + i * 0.35 + j * 0.16 + 0.4); });
  S.ticks(land, { vel: 44 });
  S.fx('pop', T.street + 3.5); S.fx('pop', T.street + 3.65); S.fx('pop', T.street + 3.8);
  S.fx('ding', T.street + 4.4, { vel: 56 }); S.fx('sparkle', T.street + 4.5, { vel: 50 });
  // The city rises.
  S.fx('whoosh', T.city + 0.6, { dur: 1.6, vel: 36 }); S.fx('sparkle', T.city + 2.2, { vel: 54 });
  // The globe: drop back, swell, and land the end card.
  const hit = T.globe + 3.5;
  S.chord('pad', ['G2', 'D3', 'B3'], { t: T.globe, dur: 3.5, vel: 40 });
  S.fx('revswell', hit, { dur: 1.8, vel: 60 });
  S.chord('pad', ['D3', 'A3', 'D4', 'F#4'], { t: hit, dur: 5, vel: 74 });
  S.chord('ep', ['D3', 'F#3', 'A3', 'D4'], { t: hit, dur: 4, vel: 66 });
  S.note('bass', 'D2', { t: hit, dur: 4, vel: 70 });
  S.fx('chime', hit, { vel: 70 });
  S.run('mallet', ['D5', 'F#5', 'A5', 'D6'], { t: hit + 0.1, step: 0.2, vel: 62 });
  S.fx('pop', T.globe + 4.5, { vel: 50 });
  S.master({ gain: -6, fadeOut: 1.5 });
});