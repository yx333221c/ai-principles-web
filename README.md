# AI 原理图解 · Explainable AI Primer

> 用**可交互图解**讲清 AI 底层原理的开源静态站点。不讲新闻、不卖课、不堆术语，只回答「它到底是怎么工作的」。

⚠️ **当前状态：v0.1 结构骨架。** 站点外壳、设计系统、13 个模块的区块结构与数据契约已全部就位，**正文内容与交互演示尚未填充**。设计与开发依据见 [DESIGN.md](./DESIGN.md)。

## 这个站点想解决什么

公众了解 AI 的信息源两极分化：营销科普只有类比没有机制，论文教材需要数学前置。本站的立场是 **Explain-by-Manipulation**——每个原理至少配一个能动手拨弄的东西：拖一个滑块，看懂 ReLU 为什么能消除梯度平坦；改一次温度，看概率分布如何从「求稳」变成「求险」。

## 本地打开

纯静态、零依赖、零构建，任意方式皆可：

```bash
# 直接双击 index.html 也能看，但建议起个本地服务
python -m http.server 8080       # 然后打开 http://localhost:8080
```

| 文件 | 作用 |
|---|---|
| `index.html` | 站点全部区块：6 个部分 / 13 个模块 / 每模块六段式 |
| `assets/css/base.css` | 设计令牌（颜色/字体/间距/动效）+ 亮暗双主题 |
| `assets/css/layout.css` | 三栏外壳与响应式断点 |
| `assets/css/components.css` | 组件样式（模块卡、demo 容器、误区卡…） |
| `assets/js/app.js` | 主题切换 / 抽屉导航 / scroll-spy / 阅读进度 / 快捷键 / Demo 注册表 |
| `assets/js/demos/` | 每模块一个演示（当前仅 `m05-microcalc.js` 契约空壳） |
| `assets/data/modules.json` | 模块元数据：编号、前置依赖 DAG、演示键、状态（内容契约） |
| `content/modules/` | 13 个模块的六段式写作草稿模板（全 TODO 占位） |
| `docs/` | 写作规范与统一术语表 |
| `scripts/selfcheck.js` | 结构自检：JS 语法 / JSON 契约 / HTML 区块数 / 锚点是否失效 / CSS 令牌是否齐全 |

自检（零依赖，用 Node 直接跑）：

```bash
node scripts/selfcheck.js     # 全部通过输出 RESULT: all checks passed
```

检查项包括 13 个 `section.module`、78 个 `article.seg`（13×6）、无重复 id、**所有内部锚点都能解析到真实元素**、`data-demo` 均在 `modules.json` 中声明、CSS 引用的变量全部有定义。改结构后请重跑。

## 内容开发怎么写

新增或修改正文前，**必读**：

- [docs/writing-guide.md](./docs/writing-guide.md) —— 硬性规则、风格、图解与 Demo 文案规范
- [docs/glossary.md](./docs/glossary.md) —— 全站唯一中文译名
- [DESIGN.md §5](./DESIGN.md) —— 六段式模板（钩子 / 直觉 / 机制 / 演示 / 误区 / 带走）

每个模块必须能被它的**验收标准**检验（见 `modules.json` 的 `acceptance` 字段），例：

> M07 — 读完能做到：白板画出 Transformer 数据流；解释 O(n²) 复杂度从哪来；说出 RoPE 与绝对位置编码的差异。

## 路线

| 阶段 | 内容 |
|---|---|
| ✅ v0.1 | 设计文档 + 结构骨架 + 数据契约（当前） |
| v0.2 | 样板模块：M07（旗舰注意力演示）+ M01（无公式对照） |
| v0.3 | M02–M06、M08–M10；工程化（构建、CI、搜索）；GitHub Pages |
| v0.4 | M11–M13、术语表、移动端与无障碍打磨 |
| v1.0 | 交互式学习地图、英文版数据骨架 |

开发顺序的取舍见 [DESIGN.md §15](./DESIGN.md)：v0.2 先做难度最高的 M07，用它一次性证伪/证实六段式模板、Demo 挂载机制与图解换色体系，避免架构缺陷到后期才暴露。

## 许可

- 文字与图解内容：CC BY-SA 4.0
- 代码：MIT

## 一句话总结

> **模型能力 ≈ 对数据的压缩质量；智能体只是让模型学会了调用工具。** 这句话，本站打算用 13 个模块证明给你看。
