// 四字熟語あつめ の決まり（ひとりで遊ぶ画面と、サーバーの部屋で同じものを使う。サーバーへは sync-yoji.sh で写す）
//   漢字の部品のデータ（どの字がどの部品に分かれるか）は、ここには持たない。呼ぶ側が K（字 → [{el,pos}]）を渡す
//   ゲーム g：{q, chars:[{ch, slots:[{el,pos,by,owner}], at, pts}], tiles:[{id, src:[字の番号,部品の番号], el, pos, owner, holder, where, held, dropBy, u, band, v}], hinted:[]}
//     where：'hand'（holder の手札）/ 'desk'（机に転がっている）/ 'air'（だれかが運んでいる途中）/ 'placed'（枠にはまった）
//     机の上の場所は、画面の大きさによらないよう u（横 0〜1）、band（0 枠の上 / 1 枠の下）、v（その帯の中の縦 0〜1）で持つ
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YojiCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 配る：部品を全部まぜて、人数で順に配る
  function deal(q, K, n, rand) {
    rand = rand || Math.random;
    const chars = [...q.w].map((ch) => ({ ch, slots: K[ch].map((p) => ({ el: p.el, pos: p.pos, by: null, owner: null })), at: null, pts: null }));
    const all = [];
    chars.forEach((c, i) => c.slots.forEach((s, j) => all.push({ src: [i, j], el: s.el, pos: s.pos })));
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    const tiles = all.map((t, k) => ({ id: 't' + k, ...t, owner: k % n, holder: k % n, where: 'hand', held: null, dropBy: null, u: 0, band: 0, v: 0 }));
    return { q, chars, tiles, hinted: [] };
  }
  // 枠 i に、その札がはまる空きがあるか（同じ部品・同じ場所なら、ほかの字の札でもよい：試の言を誤の言に置ける）
  function fitSlot(g, t, i) {
    const c = g.chars[i]; if (!c || c.at != null) return -1;
    return c.slots.findIndex((s) => s.by == null && s.el === t.el && s.pos === t.pos);
  }
  // はまる枠があるか（CPU が「どこに置くか」を探すとき）
  const fitAny = (g, t) => g.chars.findIndex((c, i) => fitSlot(g, t, i) >= 0);
  // 枠 i にはめる。はまったら、その字ができたか・全部できたかを返す。はまらなければ null
  function place(g, t, i, by, sec) {
    const j = fitSlot(g, t, i); if (j < 0) return null;
    const c = g.chars[i], s = c.slots[j];
    s.by = by; s.owner = t.owner; t.where = 'placed'; t.held = null; t.holder = null; t.at = [i, j];
    let done = false;
    if (c.slots.every((x) => x.by != null)) { c.at = sec; c.pts = score(c, sec, g.hinted.includes(i)); done = true; }
    return { i, j, done, all: g.chars.every((x) => x.at != null) };
  }
  // 1文字の点：速さ（始めてからの秒）と協力（何人で作ったか・ほかの人に配られた部品を使ったか）。ヒントで見せた字は −20
  function score(c, sec, hinted) {
    const who = [...new Set(c.slots.map((s) => s.by))], foreign = c.slots.filter((s) => s.by !== s.owner).length;
    const speed = Math.max(10, Math.round(100 - sec * 1.2)), coop = (who.length - 1) * 25 + foreign * 15, hint = hinted ? -20 : 0;
    return { speed, coop, hint, sum: Math.max(0, speed + coop + hint), who };
  }
  const BONUS = 50;
  const total = (g, done) => g.chars.reduce((a, c) => a + (c.pts ? c.pts.sum : 0), 0) + (done ? BONUS : 0);
  // ヒント：まだできていない字のうち、いちばん進んでいない字を薄く見せる
  function hint(g) {
    const left = g.chars.map((c, i) => ({ i, n: c.slots.filter((s) => s.by != null).length / c.slots.length }))
      .filter((x) => g.chars[x.i].at == null && !g.hinted.includes(x.i)).sort((a, b) => a.n - b.n);
    if (!left.length) return -1;
    g.hinted.push(left[0].i); return left[0].i;
  }
  // 机に転がす場所（帯 band の中で、ほかの札となるべく重ならないところ）。nearU があれば、その横のあたり
  function freeSpot(g, nearU, rand) {
    rand = rand || Math.random;
    const on = g.tiles.filter((t) => t.where === 'desk');
    let best = null, bs = -1;
    for (let k = 0; k < 24; k++) {
      const band = k % 2, u = nearU != null && k < 12 ? Math.max(0, Math.min(1, nearU + (rand() - 0.5) * 0.35)) : rand(), v = rand();
      const gap = Math.min(9, ...on.filter((t) => t.band === band).map((t) => Math.hypot((t.u - u) * 3, t.v - v)));
      if (gap > bs) { bs = gap; best = { u, band, v }; }
      if (gap > 0.9) break;
    }
    return best || { u: rand(), band: 0, v: rand() };
  }
  // CPU の仲間が次にすること。分かった部品は（手札でも机の上でも）正しい枠へ。分からなければ、ときどき手札を机に出す
  //   分かる見込みは、時間がたつほど・その字がもうできかけているほど上がる（はじめは半分くらいしか分からない）
  function cpuChoose(g, p, sec, rand) {
    rand = rand || Math.random;
    const cand = g.tiles.filter((t) => (t.where === 'hand' && t.holder === p) || (t.where === 'desk' && t.held == null));
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (const t of cand) {
      const i = fitAny(g, t); if (i < 0) continue;
      const started = g.chars[i].slots.some((s) => s.by != null);
      if (rand() < Math.min(0.9, 0.35 + sec * 0.012 + (started ? 0.25 : 0))) return { t, i };
    }
    const mine = cand.filter((t) => t.where === 'hand');
    if (mine.length && rand() < 0.4) return { t: mine[Math.floor(rand() * mine.length)], i: -1 };
    return null;
  }
  return { deal, fitSlot, fitAny, place, score, BONUS, total, hint, freeSpot, cpuChoose };
});
