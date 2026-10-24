// 四字熟語の一覧と、使う漢字の部品データ（data.js）を作る：node tools/build-data.js
//   漢字の形と部品の分け方は KanjiVG（https://kanjivg.tagaini.net、CC BY-SA 3.0、Ulrich Apel）から取る。取ったファイルは tools/kanjivg/ に置いておく
//   部品は、漢字のいちばん外側の分け方（例：語 → 言・吾）。kvg:part で分かれている同じ部品（例：衣の上と下）は1つにまとめる
//   いちばん外側に部品のグループがない漢字（一・二・石 など）は、漢字まるごとで1つの部品
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'kanjivg'), OUT = path.join(__dirname, '..', 'data.js');

// 四字熟語：w 熟語、y 読み、m 意味（自分のことばで短く）
const LIST = [
  { w: '一石二鳥', y: 'いっせきにちょう', m: 'ひとつのことをして、ふたつの得をする' },
  { w: '以心伝心', y: 'いしんでんしん', m: '言葉にしなくても、気持ちが通じあう' },
  { w: '十人十色', y: 'じゅうにんといろ', m: '考えや好みは、人によってそれぞれちがう' },
  { w: '温故知新', y: 'おんこちしん', m: '昔のことを学んで、新しい考えを見つける' },
  { w: '試行錯誤', y: 'しこうさくご', m: 'ためしては失敗し、くり返しながら近づいていく' },
  { w: '晴耕雨読', y: 'せいこううどく', m: '晴れた日は畑をたがやし、雨の日は本を読む。のんびりした暮らし' },
  { w: '起死回生', y: 'きしかいせい', m: 'だめになりかけたものを、一気に立て直す' },
  { w: '電光石火', y: 'でんこうせっか', m: 'いなずまや火花のように、とても速い' },
  { w: '有言実行', y: 'ゆうげんじっこう', m: '言ったことを、そのとおりにやりとげる' },
  { w: '心機一転', y: 'しんきいってん', m: '気持ちをすっかり切りかえる' },
  { w: '大器晩成', y: 'たいきばんせい', m: '大物は、時間をかけてあとから大きく育つ' },
  { w: '臨機応変', y: 'りんきおうへん', m: 'その場に合わせて、うまくやり方を変える' },
  { w: '自画自賛', y: 'じがじさん', m: '自分のしたことを、自分でほめる' },
  { w: '油断大敵', y: 'ゆだんたいてき', m: '気をゆるめるのが、いちばんの敵' },
  { w: '一心同体', y: 'いっしんどうたい', m: '心も体もひとつのように、ぴったり息が合う' },
  { w: '花鳥風月', y: 'かちょうふうげつ', m: '花・鳥・風・月。自然の美しいながめ' },
  { w: '弱肉強食', y: 'じゃくにくきょうしょく', m: '強いものが弱いものを食べて生き残る' },
  { w: '自業自得', y: 'じごうじとく', m: '自分のしたことの結果が、自分に返ってくる' },
  { w: '一期一会', y: 'いちごいちえ', m: '一生に一度の出会いだと思って、大切にする' },
  { w: '七転八起', y: 'しちてんはっき', m: '何度ころんでも、そのたびに起きあがる' },
];

const hex = (ch) => ch.codePointAt(0).toString(16).padStart(5, '0');
async function svgOf(ch) {
  const f = path.join(DIR, hex(ch) + '.svg');
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex(ch)}.svg`);
    if (!r.ok) throw new Error(ch + ' が KanjiVG にありません');
    fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f, await r.text());
  }
  return fs.readFileSync(f, 'utf8');
}
// <g …> と </g> と <path …/> を順に読んで、入れ子の木にする
function tree(svg) {
  const root = { kids: [] }, stack = [root];
  const re = /<g\b([^>]*)>|<\/g>|<path\b([^>]*)\/>/g; let m;
  const attr = (s, k) => { const x = new RegExp('(?:^|\\s)' + k + '="([^"]*)"').exec(s); return x ? x[1] : null; };   // 「id=」の中の「d=」に当たらないよう、前は空白
  while ((m = re.exec(svg))) {
    if (m[1] !== undefined) { const g = { el: attr(m[1], 'kvg:element'), pos: attr(m[1], 'kvg:position'), part: attr(m[1], 'kvg:part'), id: attr(m[1], 'id'), kids: [] }; stack.at(-1).kids.push(g); stack.push(g); }
    else if (m[0] === '</g>') stack.pop();
    else stack.at(-1).kids.push({ d: attr(m[2], 'd') });
  }
  return root;
}
const paths = (n) => (n.d ? [n.d] : n.kids.flatMap(paths));
function partsOf(ch, svg) {
  const t = tree(svg);
  const top = t.kids[0].kids[0];   // StrokePaths の中の、漢字のグループ
  const groups = top.kids.filter((k) => k.kids && k.el), loose = top.kids.filter((k) => k.d);
  if (paths(top).length <= 3) return [{ el: ch, pos: 'whole', d: paths(top) }];   // 線が3本までの漢字（七 など）は分けない
  if (groups.length < 2 && !(groups.length === 1 && groups[0].part)) return [{ el: ch, pos: 'whole', d: paths(top) }];
  if (loose.length) return [{ el: ch, pos: 'whole', d: paths(top) }];   // 部品に入らない線がある漢字は、まるごと
  const out = [];
  for (const g of groups) {
    const same = g.part ? out.find((o) => o.el === g.el && o.multi) : null;
    if (same) { same.d.push(...paths(g)); continue; }
    out.push({ el: g.el, pos: g.pos || (g.part ? 'part' : 'other'), d: paths(g), multi: !!g.part });
  }
  return out.map(({ multi, ...o }) => o);
}

(async () => {
  const chars = [...new Set(LIST.flatMap((x) => [...x.w]))];
  const K = {};
  for (const ch of chars) { K[ch] = partsOf(ch, await svgOf(ch)); }
  const head = `// 四字熟語あつめ のデータ（tools/build-data.js が作る。手で書きかえない）
// 漢字の形と部品の分け方：KanjiVG（https://kanjivg.tagaini.net） Copyright (C) 2009-2011 Ulrich Apel.
//   CC BY-SA 3.0（https://creativecommons.org/licenses/by-sa/3.0/）。このファイルも同じ CC BY-SA 3.0 で公開する
//   ここでは、漢字ごとにいちばん外側の部品に分け、線（path の d）だけを残した
`;
  fs.writeFileSync(OUT, head + 'window.YOJI=' + JSON.stringify({ list: LIST, K }) + ';\n');
  for (const x of LIST) console.log(x.w, [...x.w].map((c) => c + '(' + K[c].map((p) => p.el + ':' + p.pos).join(' ') + ')').join(' '));
  console.log('漢字', chars.length, '・部品', Object.values(K).reduce((a, p) => a + p.length, 0));
})();
