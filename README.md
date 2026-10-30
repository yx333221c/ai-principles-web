# AI 原理图解 · Explainable AI Primer

> 用**可交互图解**讲清 AI 底层原理的开源静态站点。不讲新闻、不卖课、不堆术语，只回答「它到底是怎么工作的」。

**当前状态：v0.3 —— 13 个模块正文与演示完成，并经专家复核修复全部 P1 硬伤**。四道闸门全绿（结构自检、可计算断言复算、构建幂等、三视口真实浏览器渲染）。内容状态仍标 `reviewed`：本轮复核由 AI 领域专家分组逐行精读完成（报告见仓库同级 `ai-principles-review/`），**尚未经人类领域专家签核**，因此未转 `published`。站点已上线 GitHub Pages：<https://yx333221c.github.io/ai-principles-web/>。设计依据见 [DESIGN.md](./DESIGN.md)，动手写内容前先看 [docs/authoring-contract.md](./docs/authoring-contract.md)。

## 这个站点想解决什么

公众了解 AI 的信息源两极分化：营销科普只有类比没有机制，论文教材需要数学前置。本站的立场是 **Explain-by-Manipulation**——每个原理至少配一个能动手拨弄的东西：拖一个滑块，看懂 ReLU 为什么能消除梯度平坦；改一次温度，看概率分布如何从「求稳」变成「求险」。

## 本地打开

纯静态、零外部依赖、无框架。`index.html` 是构建产物，可以直接双击打开，但建议起个本地服务：

```bash
node build.js                              # 内容由 content/modules/*.html 生成 index.html
python -m http.server 8765 --bind 127.0.0.1
```

| 文件 | 作用 |
|---|---|
| `DESIGN.md` | 设计文档：信息架构、13 模块大纲、六段式模板、演示体系、视觉令牌、路线图 |
| `build.js` | 构建器：`modules.json` + `content/modules/*.html` + `templates/shell.html` → `index.html` |
| `templates/shell.html` | 站点外壳（**要改结构改这里，不要改 index.html**） |
| `index.html` | 生成物，勿手改 |
| `assets/css/base.css` | 设计令牌（颜色/字体/间距/动效）+ 亮/暗/跟随系统三态 |
| `assets/css/layout.css` | 三栏外壳与四档响应式断点 |
| `assets/css/components.css` | 组件样式（模块卡、演示容器、误区卡、图解、搜索…） |
| `assets/css/diagram.css` | 内联 SVG 图解与手写公式的公共样式 |
| `assets/js/app.js` | 主题 / 抽屉 / scroll-spy / 阅读进度 / 搜索 / 术语卡 / 自测题 / 步骤联动 / lightbox / 演示懒挂载 |
| `assets/js/demo-kit.js` | 演示公共工具箱：统一生命周期、原生可达控件、可复现随机数、SVG 助手 |
| `assets/js/demos/` | 13 个交互演示，每模块一个 |
| `assets/data/modules.json` | 内容契约：编号、前置依赖 DAG、演示键、验收标准、状态 |
| `content/modules/` | 13 个模块的六段式正文（含内联 SVG 图解） |
| `docs/` | 作者契约、写作规范、术语表 |
| `scripts/selfcheck.js` | 结构自检（零依赖） |
| `scripts/verify-math.js` | 内容里可计算断言的独立复算 + 溯源元检查 |
| `scripts/verify-demos.js` | 无头浏览器渲染验证（三视口） |
| `scripts/gates.js` | 一条命令跑完四道闸门（自带服务，`--only=` 可挑） |
| `scripts/serve.js` | 零依赖静态服务；`--live-build` 当场构建再供出 |

## 四道验证

改完内容/结构，四条都要绿。**一条命令跑完**（自带静态服务，不必手动起 python）：

```bash
node scripts/gates.js            # 依次跑四道，最后给汇总
node scripts/gates.js --only=1,2 # 只跑前三道里的一部分（内容改到一半时用）
```

手工分别跑也可以，但注意**闸门 4 需要服务**，且服务必须提供**当前产物**：

```bash
node build.js && node scripts/selfcheck.js && node scripts/verify-math.js
node scripts/serve.js 8765 &      # 或 python -m http.server 8765 --bind 127.0.0.1
node scripts/verify-demos.js      # BASE 环境变量可指定地址
```

> 为什么强调"当前产物"：`index.html` 是生成物，改了 `content/modules/*.html` 不重建就不会进页面，而 CSS/JS 是运行时直接加载的。闸门 4 于是会验「新 JS + 旧正文」的混搭版并报告全过——本项目真出过这档事，所以 `serve.js --live-build` 会当场构建再供出。

**`selfcheck.js`（静态）**：六段是否齐全、hook 字数、类比有没有写失效边界（H3）、误区是否 ≥3 条且写了「为何会有」（H10）、公式是否都配了自然语言读法、有没有违禁营销词（H8）、图解是否硬编码颜色（暗色主题杀手）、图解元素的 fill/stroke 属性是否被自身 class 的 CSS 静默压掉、矩阵格子数与列数是否匹配、分段函数是否 ≥2 行、**步骤编号是否双轨错位**（可见编号由 CSS `counter(step)` 渲染、悬停联动用 `data-step`，两者一旦错开，hover 第 5 步会点亮图里第 4 步——联动"看起来在工作"，人工查不出）、**「第 ⑤ 步」引用是否越界**（跨模块引用按目标模块的步数核对）、带走一句是否 ≤40 字、自测题是否标了正确项并给了答错解释、有无重复 id 与失效锚点、CSS 变量是否都有定义、`modules.json` 的 `figures` 清单是否与正文 `data-fig` 双向一致、**声称的总阅读时长是否等于 `estMinutes` 之和**（写死派生值迟早过期）、演示控件是否都绑了 state key（否则重置失效）、是否用了 `Math.random`（不可复现）、两个暗色分支定义是否逐变量一致、类名是否双向闭合（内容引用的类都有定义；契约承诺给作者的类都存在；契约自己手抄的类清单也与 CSS 核对）。它还把 `build.js --stdout` 再跑一遍与 `index.html` 逐字节比对，抓「改了内容却忘了重建」。

**`verify-math.js`（数字）**：结构检查看不见算错。这条把内容里每个可计算断言独立复算一遍，并同时检查「文中确实这么写」——例如 m10 的 KV Cache 每词元字节数与 2³⁴ = 16 GiB、m12 的 pᴺ 与词元溢出阈值、m02 的整条交叉熵链、m05 手算反向传播表的 17 行链条。它上线时抓到 m10 把 16 GiB 写成 16 GB；m04 图解的三处夸大则是开发期实测发现的，现已收进这里长期守护。m04 的地形另做**三方绑定**：本脚本复算用的地形是演示的副本，所以再设锚点断言演示源码里的梯度系数、起点（按出现次数）、步数上限与逃逸半径，三者任一改动都会被抓到。**溯源元检查**：每条 `near()` 复算出的数都必须能在它声称所在的文件里独立成数地找到（正文用上标记法如 `2.9×10⁻⁵`、`8.4×10²²` 也认），否则判为悬空断言——曾经有 2 条断言复算的是正文里根本不存在的数，它们不会误报，只会让人误信「被复算覆盖的每个数都在正文里」。

**`verify-demos.js`（真实浏览器）**：在**桌面亮色 / 桌面暗色 / 移动端**三种视口下各加载一次，检查每个演示是否真的挂载、画布/控件/读数/说明/重置是否齐备、**有没有文字越出 viewBox**（越界的字会被静默裁掉）、**有没有两段文字互相叠印**、页面是否横向溢出、正文对比度是否达 AA/AAA、console 有无未捕获异常。它靠 `app.js` 里的 `?probe=1` 探针在浏览器内测量（用 CTM 链把文字包围盒映射回 SVG 用户坐标）。

> 别靠眼睛看截图：这两项检测上线时，7 个有重叠的演示**全部**先被人工看过截图，只发现了 2 个（其中 m06 看到了症状还被判为"可接受"）。手工排坐标的 SVG 里，标签叠印是常态而非例外。

> 这些检查本身也做过**变异测试**：故意注入 desync、幽灵类名、单位漂移、过期构建，确认每条都会真的失败——一条永不失败的检查等于没有。

## 与设计文档的偏差（已核对，均为有意为之）

| DESIGN.md 原计划 | 实际做法 | 原因 |
|---|---|---|
| §10.2 用 KaTeX（CDN）渲染公式 | 手写 HTML 公式（`.frac` / `.sub` / `.sup` / `.bigg` / `.mat` / `.cases`） | 本机 CDN 与 GitHub 均不可达；且手写公式随主题变色、可被 lightbox 无损放大。矩阵与分段函数已补强为专用结构（括号用 CSS 边框拼出，随内容自动增高），m03/m05/m07 已迁移 |
| §6.4 D-M07 用真实小模型离线跑注意力权重 | 合成权重，并在画面顶部标注「示意数据（合成权重）」 | 无法下载模型权重。合成规则刻意复现三种真实存在的模式（局部性、句法主干、attention sink），但**不冒充真实输出** |
| §11.1 内容以 `content/modules/*.md` 存放 | 改为 `*.html` 片段 | 本站内容以内联 SVG 图解与交互容器为主体，Markdown 反而要额外解析依赖 |
| §12.3 v0.3 再上 GitHub Pages | 已可开启 | 纯静态无需构建 |

## 内容开发怎么写

新增或修改正文前，**必读**：

- [docs/authoring-contract.md](./docs/authoring-contract.md) —— 操作契约：文件怎么写、有哪些类可用、演示 API、自检清单
- [docs/writing-guide.md](./docs/writing-guide.md) —— 硬性规则 H1–H10、风格、图解与演示文案规范
- [docs/glossary.md](./docs/glossary.md) —— 全站唯一中文译名
- 黄金样板：[content/modules/m07.html](./content/modules/m07.html) + [assets/js/demos/m07-attn-map.js](./assets/js/demos/m07-attn-map.js)

每个模块必须能被它的**验收标准**检验（见 `modules.json` 的 `acceptance` 字段），例：

> M07 — 读完能做到：白板画出 Transformer 数据流；解释 O(n²) 复杂度从哪来；说出 RoPE 与绝对位置编码的差异。

## 路线

| 阶段 | 内容 | 状态 |
|---|---|---|
| v0.1 | 设计文档 + 结构骨架 + 数据契约 | ✅ |
| v0.2 | 13 个模块正文与演示全部完成；构建器、演示工具箱、四道验证；三视口渲染验证通过 | ✅ |
| v0.3 | 专家复核修复 P1（✅ 已完成，报告见 `ai-principles-review/`）；矩阵/分段函数公式排版（✅）；开启 GitHub Pages（✅ 已上线）；四道闸门进 CI（✅ `.github/workflows/ci.yml`，Linux runner 实测全过）；人类领域专家签核（⬜ 未完成，故 `status` 仍为 `reviewed`）；Lighthouse/a11y/链接检查进 CI（⬜ 未做：CI 目前只跑 `gates.js` 四道，这些独立工具尚未纳入） | 🔶 进行中 |
| v1.0 | 交互式学习地图（DAG：泳道布局 + hover 亮起祖先闭包 + 点击跳转 + 已读联动描红；**不是可拖拽**，固定泳道才看得出依赖方向）✅；英文版数据骨架（`i18n-en.json` 只存文案、结构单源 modules.json）✅；分享用 OG 图（14 张 1200×630 + 每模块薄分享页 `/mXX/`，让爬虫读到 per-module OG）✅；英文正文、JSON-LD 结构化数据、BibTeX ⬜ | 🔶 进行中 |

开发顺序的取舍见 [DESIGN.md §15](./DESIGN.md)：先做难度最高的 M07，用它一次性证伪/证实六段式模板、演示挂载机制与图解换色体系，避免架构缺陷到后期才暴露——这个决定后来确实抓出了若干只有旗舰演示才会触发的缺陷。

## 许可

- 文字与图解内容：CC BY-SA 4.0
- 代码：MIT

## 一句话总结

> **模型能力 ≈ 对数据的压缩质量；智能体只是让模型学会了调用工具。** 这句话，本站打算用 13 个模块证明给你看。
