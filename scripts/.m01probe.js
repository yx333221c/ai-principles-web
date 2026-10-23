const fs = require('fs');
const s = fs.readFileSync('content/modules/m01.html', 'utf8');
const seg = (n) => { const x = s.match(new RegExp('<seg\\s+name="' + n + '"[^>]*>([\\s\\S]*?)<\\/seg>')); return x ? x[1] : ''; };
const strip = (x) => x.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const hookFull = strip(seg('hook'));
console.log('hook seg chars (selfcheck metric):', hookFull.length);
console.log('hook p.hook only:', strip(seg('hook').match(/<p class="hook">[\s\S]*?<\/p>/)[0]).length);
console.log('takeaway chars:', strip((seg('takeaway').match(/class="takeaway__line"[^>]*>([\s\S]*?)<\/blockquote>/) || [])[1] || '').length);
console.log('external http attrs:', (s.match(/(src|href)="https?:/g) || []));
console.log('bare --c- var misuse:', (s.match(/var\(--c-[),]/g) || []));
console.log('不成立 count:', (s.match(/不成立/g) || []).length);
console.log('simplify:', (s.match(/badge--simplify/g) || []).length, 'debate:', (s.match(/badge--debate/g) || []).length);
console.log('timestamps:', (s.match(/\[\d{4}-\d{2}\]/g) || []).join(' '));
console.log('hardcoded colors:', (s.match(/(?:fill|stroke|color|background)\s*[:=]\s*"?(#[0-9a-fA-F]{3,8}|rgba?\()/g) || []));
console.log('steps li count:', (seg('mechanism').match(/<li[\s>]/g) || []).length);
console.log('figures:', (s.match(/class="figure/g) || []).length);
console.log('TODO/todo:', /TODO|class="todo"/.test(s));
console.log('tag balance check:');
const tags = {};
for (const m of s.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
  const closing = m[1] === '/', name = m[2];
  const selfClose = /\/\s*>$/.test(m[3]);
  if (['meta', 'br', 'img', 'hr'].includes(name) || selfClose) continue;
  tags[name] = (tags[name] || 0) + (closing ? -1 : 1);
}
console.log(JSON.stringify(tags));
