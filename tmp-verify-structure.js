const fs = require('fs');
const src = fs.readFileSync('content/modules/m02.html', 'utf8');

// 1. hook 字数（去 HTML 标签）
const grab = (name) => {
  const m = src.match(new RegExp('<seg name="' + name + '">([\\s\\S]*?)</seg>'));
  return m ? m[1] : '';
};
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '');
const hookHtml = (grab('hook').match(/<p class="hook">([\s\S]*?)<\/p>/) || [])[1] || '';
const hookText = strip(hookHtml).replace(/\s/g, '');
console.log('hook 字数 =', hookText.length, hookText.length <= 120 ? 'OK' : 'OVER');

// 2. takeaway 一句 ≤40 字
const tl = strip((grab('takeaway').match(/takeaway__line">([\s\S]*?)</) || [])[1] || '').replace(/\s/g, '');
console.log('takeaway 字数 =', tl.length, tl.length <= 40 ? 'OK' : 'OVER', '|', tl);

// 3. 六段齐全 + 各段必用元素
const segs = ['hook', 'intuition', 'mechanism', 'demo', 'misconception', 'takeaway'];
segs.forEach(s => console.log('seg ' + s + ':', grab(s) ? 'OK (' + grab(s).length + 'B)' : 'MISSING'));
const mech = grab('mechanism');
console.log('steps 数量 =', (mech.match(/<li /g) || []).length, '(≥5)');
console.log('figure 数量 =', (mech.match(/class="figure"/g) || []).length, '(≥1)');
console.log('math-block 数量 =', (mech.match(/math-block/g) || []).length);
console.log('reads 数量 =', (mech.match(/class="reads"/g) || []).length, '(每公式一条)');
console.log('tbl 数量 =', (mech.match(/class="tbl"/g) || []).length);
console.log('warn callout 数量 =', (grab('intuition').match(/callout--warn/g) || []).length);
console.log('「不成立」出现 =', (grab('intuition').match(/不成立/g) || []).length, '(H3)');
console.log('myth 数量 =', (grab('misconception').match(/class="myth"/g) || []).length, '(≥3)');
console.log('「为何会有」数量 =', (grab('misconception').match(/为何会有/g) || []).length);
console.log('myth__truth 数量 =', (grab('misconception').match(/myth__truth/g) || []).length);
console.log('quiz__opt =', (grab('takeaway').match(/quiz__opt/g) || []).length, '| data-right=', (grab('takeaway').match(/data-right="1"/g) || []).length);
console.log('data-for no/ok =', (grab('takeaway').match(/data-for="(no|ok)"/g) || []).join(','));
console.log('nextlinks =', (grab('takeaway').match(/href="#m\d\d"/g) || []).join(','));
console.log('demo 段是否自写 .demo 容器 =', /data-demo=/.test(grab('demo')) ? 'BAD(自己写了)' : 'OK(未写)');
console.log('badge--simplify 数量 =', (src.match(/badge--simplify/g) || []).length);
console.log('时间戳 =', (src.match(/\[\d{4}-\d{2}\]/g) || []).join(','));

// 4. SVG 颜色纪律：抓 svg 内所有 fill=/stroke= 与 style
const svgAll = [...src.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m => m[0]);
console.log('内联 SVG 数 =', svgAll.length);
svgAll.forEach((s, i) => {
  const attrs = [...s.matchAll(/(fill|stroke|color)="([^"]*)"/g)].map(m => m[1] + '=' + m[2]);
  const bad = attrs.filter(a => !/^fill="none"$/.test(a) && !/var\(--c-/.test(a));
  console.log(' svg#' + i, 'fill/stroke 属性:', attrs.length, '| 违规:', bad.length ? bad.join(' ') : '无');
  console.log('   title/desc/role:', /<title /.test(s) ? 'title✓' : 'title✗', /<desc>/.test(s) ? 'desc✓' : 'desc✗', /role="img"/.test(s) ? 'role✓' : 'role✗');
  const hex = s.match(/#[0-9a-fA-F]{3,8}\b/g);
  console.log('   硬编码 hex 色:', hex ? hex.join(',') : '无');
  // 只用契约列出的 class
  const allowed = new Set(['box', 'box--a', 'box--w', 'box--g', 'box--b', 'line', 'line--a', 'arrow', 'muted', 'faint', 't-sm', 't-xs', 'accent', 'good', 'bad', 'warm', 'dgm']);
  const used = new Set([...s.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  const off = [...used].filter(c => c && !allowed.has(c));
  console.log('   契约外 class:', off.length ? off.join(',') : '无');
});

// 5. 段内不许写 h3；术语定义长度
console.log('h3 出现 =', (src.match(/<h3/g) || []).length, '(应为 0)');
const defs = [...src.matchAll(/data-def="([^"]*)"/g)].map(m => m[1]);
defs.forEach(d => console.log('term def ' + d.length + ' 字 ' + (d.length <= 40 ? 'OK' : 'OVER') + ' | ' + d.slice(0, 20) + '…'));

// 6. 违禁营销词
const ban = ['震撼', '颠覆', '革命性', '史诗级', '降维打击', '遥遥领先', '不难', '众所周知', '显然', '你应该'];
console.log('违禁词命中:', ban.filter(w => src.includes(w)).join(',') || '无');

// 7. 未闭合标签粗检（seg/table/ol/svg/details/div 计数）
['div', 'table', 'ol', 'li', 'svg', 'details', 'summary', 'p', 'g', 'text', 'tr', 'td', 'th', 'label', 'span', 'blockquote', 'ul', 'a', 'code', 'em', 'strong', 'tbody', 'thead', 'rect', 'line'].forEach(t => {
  const open = (src.match(new RegExp('<' + t + '(\\s|>)', 'g')) || []).length;
  const close = (src.match(new RegExp('</' + t + '>', 'g')) || []).length;
  const self = (src.match(new RegExp('<' + t + '[^>]*/>', 'g')) || []).length;
  if (open - self !== close) console.log('  标签不平衡:', t, 'open=' + open, 'self=' + self, 'close=' + close);
});
