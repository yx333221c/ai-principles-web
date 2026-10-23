/* ==========================================================================
   m05-microcalc.js · 旗舰 Demo 桩（DESIGN.md §6.4 D-M05 微积分计算器）
   状态：skeleton —— 仅实现 Demo 契约的空壳，使挂载机制可被验证；
        画布逻辑在 v0.2 实现。

   契约（§6.3）：mount / update / reset / destroy / pause / resume / frames
   ========================================================================== */
(function (AIP) {
  'use strict';
  if (!AIP) return;

  function MicroCalc() {
    var host = null, canvas = null, state = { weights: {}, activation: 'relu' };
    var raf = null, running = false;

    return {
      /* 挂载：v0.2 在此构建可拖拽计算图（SVG 连线 + Canvas 热力） */
      mount: function (el) {
        host = el;
        canvas = el.querySelector('.demo__canvas');
        this.reset();
        return this;
      },

      /* 参数变化入口，key ∈ state 字段 */
      update: function (key, value) {
        state[key] = value;
        // TODO(v0.2): 前向值即时更新；改权重后重算各节点 ∂L/∂node
        return this;
      },

      /* 必须提供（§6.3） */
      reset: function () {
        state = { weights: {}, activation: 'relu' };
        // TODO(v0.2): 恢复默认计算图与权重
        if (canvas && canvas.dataset.marked !== 'done') {
          canvas.textContent = 'M05 微积分计算器 · 待实现（见 DESIGN.md §6.4）';
        }
        return this;
      },

      pause: function () { running = false; if (raf) { cancelAnimationFrame(raf); raf = null; } },
      resume: function () { /* TODO(v0.2) */ },
      destroy: function () { this.pause(); host = canvas = null; },

      /* C 类动画：反向传播逐帧着色（§6.2 档 C） */
      frames: {
        total: 0,                 // TODO(v0.2): 计算图节点数决定帧数
        seek: function (/* i */) { /* TODO(v0.2): 第 i 步梯度回流着色 + 右侧 ∂L/∂node 列表 */ }
      }
    };
  }

  AIP.register('m05-microcalc', function () { return new MicroCalc(); });
})(window.AIPrinciples);
