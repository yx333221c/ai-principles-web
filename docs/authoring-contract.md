# 作者契约（v0.2 起生效）

> 面向内容/演示作者的操作手册。设计**为什么**这样做见 [DESIGN.md](../DESIGN.md)，
> 本文只讲**怎么做才不会被构建器拒绝**。
> 黄金样板：[content/modules/m07.html](../content/modules/m07.html) +
> [assets/js/demos/m07-attn-map.js](../assets/js/demos/m07-attn-map.js)。新模块照这两个文件的形状写。

## 0. 三条铁律

1. **`index.html` 是生成物，不要手改。** 改 `templates/shell.html`（全站外壳）或 `content/modules/*.html`（模块内容），然后 `node build.js`。
2. **六段一个都不能少。** 构建器对缺失段落直接报错退出（写作规范 H1）。
3. **改完必须过闸门。** 单人改完跑 `node scripts/gates.js`（四道全跑，自带服务，不必手动起 python）。
   ⚠️ **多人并行时不要跑 `node build.js`／`gates.js` 的闸门 3**：全站产物是单个 `index.html`，
   并发构建会把它撕裂（本项目出过事故）。并行作者只跑静态两道，重建由集成者统一做：
   `node scripts/gates.js --only=1,2`（闸门 1 会报「index.html 已过期」，这是预期，不是你的 bug）。
   注意闸门 4 若指向未重建的产物，验的是旧版面——它曾因此报告"全过"而漏掉真实缺陷。

## 1. 内容文件写法

`content/modules/<id>.html`（例：`m05.html`）。用自定义 `<seg>` 标签划分六段，构建器会转成 `<article class="seg" id="m05--hook">`：

```html
<meta title="模块标题" tagline="一句话定位">

<seg name="hook">        <p class="hook">…</p>                    </seg>
<seg name="intuition">   …                                        </seg>
<seg name="mechanism">   …                                        </seg>
<seg name="demo">        …                                        </seg>
<seg name="misconception">…                                       </seg>
<seg name="takeaway">    …                                        </seg>
```

- `<meta>` 可省略（默认取 `modules.json` 的 title/tagline）。
- `<seg>` 的 name 只能是：`hook` `intuition` `mechanism` `demo` `misconception` `takeaway`。
- 段内写**普通 HTML**，不要写 `<h3>`（构建器自动加段标题）。

### 1.1 各段必用元素

| 段 | 必须包含 | 元素 |
|---|---|---|
| hook | ≤120 字、零术语、以问题/场景收尾 | `<p class="hook">` |
| intuition | 类比 + **失效边界**（H3 硬性） | `<div class="callout callout--warn">` 内写「这个类比对…不成立」 |
| mechanism | ≥3 步编号 + ≥1 张图解 | `<ol class="steps">` + `<div class="figure">` |
| demo | 一句引导语即可 | 演示容器由构建器自动注入，**不要自己写 `.demo`** |
| misconception | ≥3 条 | `<details class="myth">` |
| takeaway | ≤40 字结论 + 自测 + 延伸 | `<blockquote class="takeaway__line">` + `.quiz` + `.nextlinks` |

### 1.2 常用元素速查

```html
<span class="term" data-def="40 字内释义" data-en="English">中文术语</span>
<div class="callout callout--key">必须记住的</div>
<div class="callout callout--warn">警示 / 失效边界</div>
<div class="callout callout--note">补充说明</div>
<span class="badge badge--simplify">已简化</span>   <!-- 任何简化都要标（H7） -->
<table class="tbl tbl--scroll">…</table>
<details class="math-detail"><summary>展开：…</summary><div class="math-detail__body prose">…</div></details>
```

**数字与时效（H5）**：事实性数字后必须跟 `[YYYY-MM]`，例：`Chinchilla 结论（2022）[2026-10]`。

### 1.3 公式（本站不用 KaTeX）

CDN 在本机不可达，公式一律手写 HTML（结构见 m07）：

```html
<div class="math-block math">
  L <span class="op">=</span> −<span class="bigg">(</span>y<span class="sub">true</span>
  <span class="op">·</span> log p<span class="bigg">)</span>
  <span class="reads">读作：一句话自然语言读法（硬性要求）</span>
</div>
```
可用类：`.frac`（内含 `.num`/`.den`）、`.sub`、`.sup`、`.op`、`.bigg`、`.reads`、`.vec`。
行内用 `<code>` 或 `<span class="math">`。

**矩阵**用 `.mat`，**分段函数**用 `.cases`（v0.3 补强，此前只能用 `[[a b],[c d]]` 文字凑）：

```html
<!-- 矩阵：格子 .mat__c 按行优先排，列数写在内联 style 里。
     selfcheck 核对 格子数 % 列数 == 0，漏格/错行会被抓到。 -->
<span class="mat" style="grid-template-columns:repeat(2,auto)">
  <span class="mat__c">0</span><span class="mat__c">−1</span>
  <span class="mat__c">1</span><span class="mat__c">0</span></span>

<!-- 分段函数：每行一个 .case__row，左值右条件（.case__cond） -->
<span class="cases">
  <span class="case__row"><span>z</span><span class="case__cond">当 z &gt; 0</span></span>
  <span class="case__row"><span>0</span><span class="case__cond">当 z ≤ 0</span></span></span>
```

- 括号是 CSS 边框拼的，随内容自动增高，**不要**再用 `.bigg`+`.frac` 凑矩阵（m03 旧写法已迁）。
- 矩阵与分段都可在行内正文里用，但块级公式里更常见；两者都必须配 `.reads` 读法（H4 不变）。

### 1.4 图解（两种实现，二选一）

图解必须包在统一的 figure 外壳里，这样 lightbox 放大、步骤联动、图注样式都自动生效：

```html
<div class="figure" data-fig="m05-compute-graph-1">
  <div class="figure__inner">
    <!-- 实现 A 或 实现 B -->
  </div>
  <figcaption>怎么看：告诉读者阅读路径（从左到右？按颜色？先看哪一行？）</figcaption>
</div>
```

**实现 A —— 内联 SVG**（适合流程、坐标曲线、几何示意；文字量少的场合）：

```html
<svg viewBox="0 0 640 210" class="dgm" role="img" aria-labelledby="f5a-t">
  <title id="f5a-t">一句话说清这张图画的是什么</title>
  <desc>给屏幕阅读器的结构描述</desc>
  <g data-step="1">…</g>   <!-- data-step 与 .steps 编号联动，可选 -->
</svg>
```

**实现 B —— HTML 构图**（`fig__*` 类，适合含中文标签的矩阵、流程、表格化示意）。
选 B 的正当理由：**SVG 的 `<text>` 不会自动换行**，中文标签一多就必须手工算坐标、极易溢出。
纯结构图（方块 + 箭头 + 少量标签）用 A；带中文术语表/矩阵/多行说明的用 B。

**颜色纪律（两种实现都适用，硬性）**：禁止硬编码颜色（`#hex`、`rgb()`）。只能用下面两种写法之一。

⚠️ **class 与 `fill=`/`stroke=` 属性不能混用在同一个元素上。**
SVG 的 presentation attribute 优先级**低于任何 CSS 规则**，所以
`<rect class="box" fill="var(--c-heat-2)">` 会渲染成 `.box` 的 fill，属性被**静默丢弃**——
不报错、不警告，自检的对比度检查也发现不了（覆盖后的颜色对比度往往更好）。
m07 的注意力矩阵九个格子就是这样把整片热力编码压成一片灰的。

- **写法 A：只用 class**（适合固定语义的框线）
  `class="box | box--a | box--w | box--g | box--b | box--sun | line | line--a | line--w | line--g | line--dash | arrow | arrow--a | grid-l | accent | good | bad | warm | muted | faint | dim | on-accent | cell | t-sm | t-xs | t-lg | t-mono"`
- **写法 B：只用 `fill="var(--c-…)"` / `stroke="var(--c-…)"` 属性，且该元素不带任何声明了 fill/stroke 的 class**
  需要逐元素取色（热力矩阵、数据条）时走这条，用 `class="cell"`（只声明 stroke）或干脆不加 class。
- 需要「自带 fill + 统一描边」时，用 `.dgm .cell`；要新语义就往 `diagram.css` 加类，别在元素上混用。
- HTML 构图只能用 `fig__*` 与 `badge--*` 等既有类。
- 违反的后果：暗色主题下文字/色块直接看不见，或颜色编码被静默抹平。
  selfcheck 会抓硬编码颜色，也会抓「元素的 fill/stroke 属性被自身 class 的 CSS 声明压掉」。

SVG 里的下标用 `<tspan baseline-shift="sub">`（**不是** `<tsml>`，那不是 SVG 标签）。

`fig__*` 可用类（与 `assets/css/components.css` 逐字对应，selfcheck 会双向核对：
用了未定义的类 → 报错；定义了但没人用也没在这里列出 → 提示死代码）：

| 用途 | 类 |
|---|---|
| 骨架 | `fig__grid`（网格容器，配 `style="grid-template-columns:…"`）、`fig__flow`（横向流程）、`fig__mat`（矩阵） |
| 文字块 | `fig__head`（图内标题）、`fig__lbl`（行标签）、`fig__note`（脚注）、`fig__sub`（次级小字）、`fig__tag`（行首标签） |
| 节点 | `fig__box` + `--a/--w/--g/--b/--sun`、`fig__tok` + `--k/--out`、`fig__pill` + `--a/--w/--g/--b/--mute` |
| 单元格 | `fig__cell` + `--h0/--h1/--h2/--h3`（热力四档）、`--blocked`（斜纹=屏蔽） |
| 代码样 | `fig__code` + `--a/--g/--b/--sun` |
| 行 | `fig__row` + `--sub` |
| 连接 | `fig__arrow`、`fig__chain` |
| 条形 | `fig__bar`、`fig__barwrap` |
| 图例 | `fig__legend`（内含 `.sw-a/.sw-w/.sw-g/.sw-b/.sw-l/.sw-h2`） |

需要表里没有的形状时，优先用已有类组合；确实需要新类，**同时**加到 CSS 与本表，否则 selfcheck 会报死代码。

## 2. 演示写法

`assets/js/demos/<demoId>.js`，demoId 必须等于 `modules.json` 里该模块的 `demo.id`。骨架：

```js
(function (AIP) {
  'use strict';
  const DK = AIP && AIP.DK;
  if (!DK) return;

  DK.define('m05-microcalc', {
    title: '手搭网络与反向传播',
    viewBox: [700, 380],                 // 逻辑坐标系，自动等比缩放
    state: { lr: 0.1, hidden: 4 },       // 必须给初值，reset 回到这里
    controls(holder, api) {              // 生成控件；控件要挂 key 才能被 reset 还原
      holder.appendChild(DK.range({ key: 'lr', label: '学习率', min: 0.01, max: 1,
        step: 0.01, value: api.state.lr, fmt: v => v.toFixed(2),
        on(v) { api.state.lr = v; api.draw(); } }));
      const ro = DK.readout([['loss', '损失', '']]);
      api._ro = ro; api.host.appendChild(ro);
    },
    build(svg, api) { /* 只建静态元素一次 */ },
    draw(api) { /* 每次状态变化重绘；api.state 读参数，api._ro.set('loss', 0.42) 写读数 */ },
    hint: '<strong>你能改什么：</strong>… <br><strong>拨动它你会看到：</strong>… <br><strong>对应机制段：</strong>第 ③ 步…'
  });
})(window.AIPrinciples);
```

### 2.1 `DK` 工具箱

| 成员 | 用途 |
|---|---|
| `DK.el(tag, attrs, kids)` | 建 SVG 元素；`attrs.text` 写文本 |
| `DK.readout([[key,label,init]])` | 读数条，返回带 `.set(key,v)` 的节点 |
| `DK.range/select/checkbox/toggle` | 原生控件（键盘可达）。`toggle` 用于模式开关 |
| `DK.heatFill(t)` | t∈[0,1] → 主题感知热力色 |
| `DK.fmt(v,d)` / `DK.clamp` / `DK.lerp` | 数值格式化（负号用 −） |
| `DK.rng(seed)` | 可复现随机数 |
| `DK.scales/axis` | 坐标映射与坐标轴 |
| `api.host / api.ctr / api.svg` | demo 容器 / 控件条 / 画布根 |
| `api.animate(fn)` | 逐帧动画，自动尊重 `prefers-reduced-motion`；`fn` 返回 `false` 停止 |

### 2.2 演示硬性要求（§6.3 / 写作规范 §6）

1. **必须有重置**（工具箱自动加，别自己写）。
2. **每个参数标合法区间与物理含义**，写进 `hint`。
3. **`hint` 三要素齐全**：能改什么 / 会观察到什么规律 / 对应机制段第几步。缺一条退回。
4. **数据必须诚实**：合成数据要在画面上写明「示意（合成数据）」，不得冒充真实模型输出。
5. 用 `api.state` 存状态，控件 `on()` 里改 state 再 `api.draw()`。
6. 不要在 `draw()` 里创建新 DOM 节点堆积（先清空分组再画，参考 m07 的 `gSide`）。

## 3. 元数据

`assets/data/modules.json` 里已给全 13 个模块的 `demo.id`、`prereq`、`acceptance`、`difficulty`、`estMinutes`。

- **不要改 `id`/`num`**（会破坏 URL 与已分享锚点）。
- `prereq` 原则上不动，但**当正文的前置提示与它矛盾时可以补全**：v0.3 复核发现 m08 的
  `demo__note` 写着「需要 M02 和 M07」而 `prereq` 只有 `m07`，UI 只展示直接前置，
  于是按 DAG 合法顺序补成 `["m02","m07"]`。改之前先确认目标编号更小、无环（selfcheck 有反向依赖检查）。
- `figures` 是**受校验字段**：正文 `data-fig` 集合必须与它完全相等（selfcheck 双向核对）。
  新增或删除图解时同步这里，否则闸门直接报错。
- `estMinutes` 改动会牵动全站阅读时长：`DESIGN.md`/首页的「约 X–Y 小时」由它求和派生，
  selfcheck 会核对，别只改一处。
- `demo.params` 已删除：无消费方、键名在演示源码里已写明，抄一份只会腐化（实测 7+ 模块与正文脱节）。

## 4. 自检清单（作者自查）

- [ ] `node scripts/gates.js`（单人）或 `--only=1,2`（并行时）全绿
- [ ] **闸门 4 必须跑过**：它专抓静态检查看不见的那类——演示画布里两段文字叠印（本轮抓到一处由加长说明文字引入的 76×11px 重叠）、badge 撑破移动端（HSCROLL+38）、文字压色块对比度不足（历史抓到 1.96:1）。改过图解坐标、hint 文案或内联样式，不跑闸门 4 等于没验
- [ ] `node --check assets/js/demos/<id>.js` 通过
- [ ] 六段齐全，`<p class="hook">` 本体 ≤120 字且零术语（段里的 `demo__note` 前置横幅不计入）
- [ ] 类比有失效边界；简化处有 `badge--simplify`（badge 可换行，但别把整段说明塞进去）
- [ ] 事实数字带 `[YYYY-MM]`；纯算式改标「按公式推算」，不占时间戳
- [ ] 图解无硬编码颜色，含 `<title>`/`<desc>`/`role="img"`
- [ ] 步骤编号 `data-step` 恰好 1..N，图内节点按**可见编号**对齐；「第 ⑤ 步」引用不越界
- [ ] 演示 hint 三要素齐全，含重置，参数有区间；hint 里承诺的数**必须能按代码算出来**
- [ ] 误区 ≥3 条且写了「为何会有此误解」
- [ ] 带走一句 ≤40 字，且能被 `modules.json` 的 `acceptance` 检验
- [ ] 改了 `modules.json` 用 Node 写文件，**不要用 PowerShell `Set-Content`**：它会写 UTF-8 BOM，`JSON.parse` 直接失败，而 selfcheck 只报"解析失败"不说原因（实测有人因此白跑十分钟）

## 5. 本地预览

```bash
python -m http.server 8765 --bind 127.0.0.1
# 完整页：http://127.0.0.1:8765/
# 只看某一段：…/index.html?only=m05--mechanism
# 立即挂载全部演示（截图/调试用）：…/index.html?mountall=1
```
