# 作者契约（v0.2 起生效）

> 面向内容/演示作者的操作手册。设计**为什么**这样做见 [DESIGN.md](../DESIGN.md)，
> 本文只讲**怎么做才不会被构建器拒绝**。
> 黄金样板：[content/modules/m07.html](../content/modules/m07.html) +
> [assets/js/demos/m07-attn-map.js](../assets/js/demos/m07-attn-map.js)。新模块照这两个文件的形状写。

## 0. 三条铁律

1. **`index.html` 是生成物，不要手改。** 改 `templates/shell.html`（全站外壳）或 `content/modules/*.html`（模块内容），然后 `node build.js`。
2. **六段一个都不能少。** 构建器对缺失段落直接报错退出（写作规范 H1）。
3. **改完必须跑** `node build.js && node scripts/selfcheck.js`，两者都绿才算完成。

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

**颜色纪律（两种实现都适用，硬性）**：禁止硬编码颜色。
- SVG 内只能用 `class="box|box--a|box--w|box--g|box--b|line|line--a|arrow|muted|faint|t-sm|t-xs|accent|good|bad|warm"` 或 `fill="var(--c-…)"`。
- HTML 构图只能用 `fig__*` 与 `badge--*` 等既有类。
- 违反的后果：暗色主题下文字/色块直接看不见。自检会抓这一条。

SVG 里的下标用 `<tspan baseline-shift="sub">`（**不是** `<tsml>`，那不是 SVG 标签）。

`fig__*` 常用件：`fig__grid`（网格）、`fig__mat` + `fig__cell`（矩阵，配 `--h0..--h3` 热力档、`--blocked` 斜纹屏蔽）、`fig__flow` + `fig__box` + `fig__arrow`（流程）、`fig__chain`（链式，配 `--back` 反向）、`fig__pill`（状态标签）、`fig__row`（一行说明）、`fig__bar`/`fig__barwrap`（条形）、`fig__legend`（图例）、`fig__note`（注释）。

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

`assets/data/modules.json` 里已给全 13 个模块的 `demo.id`、`prereq`、`acceptance`、`difficulty`、`estMinutes`。**不要改 `id`/`num`/`prereq`**（会破坏 DAG 与已分享锚点）。若内容实际比预估长，可改 `estMinutes`。

## 4. 自检清单（作者自查）

- [ ] `node build.js` 无输出问题
- [ ] `node scripts/selfcheck.js` 显示 `RESULT: all checks passed`
- [ ] `node --check assets/js/demos/<id>.js` 通过
- [ ] 六段齐全，hook ≤120 字且零术语
- [ ] 类比有失效边界；简化处有 `badge--simplify`
- [ ] 事实数字带 `[YYYY-MM]`
- [ ] 图解无硬编码颜色，含 `<title>`/`<desc>`/`role="img"`
- [ ] 演示 hint 三要素齐全，含重置，参数有区间
- [ ] 误区 ≥3 条且写了「为何会有此误解」
- [ ] 带走一句 ≤40 字，且能被 `modules.json` 的 `acceptance` 检验

## 5. 本地预览

```bash
python -m http.server 8765 --bind 127.0.0.1
# 完整页：http://127.0.0.1:8765/
# 只看某一段：…/index.html?only=m05--mechanism
# 立即挂载全部演示（截图/调试用）：…/index.html?mountall=1
```
