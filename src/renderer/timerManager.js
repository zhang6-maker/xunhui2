/**
 * timerManager.js - 全局定时器管理（第一阶段：消除内存泄漏）
 *
 * 所有 setTimeout / setInterval 必须通过此模块注册，
 * 组件销毁时调用 TimerManager.clearGroup(groupName) 统一清理，
 * 彻底解决残留定时器导致的内存升高和响应变慢问题。
 */

const TimerManager = (() => {
  // Map<groupName, Set<timerId>>
  const _timeouts = new Map();
  const _intervals = new Map();

  function _ensureGroup(map, group) {
    if (!map.has(group)) map.set(group, new Set());
  }

  return {
    /**
     * 注册一个 setTimeout
     * @param {string} group  所属分组（如 'state', 'hunger', 'idle'）
     * @param {Function} fn
     * @param {number} delay
     * @returns {number} timerId
     */
    setTimeout(group, fn, delay) {
      _ensureGroup(_timeouts, group);
      const id = setTimeout(() => {
        // 执行后自动从集合中移除
        _timeouts.get(group)?.delete(id);
        fn();
      }, delay);
      _timeouts.get(group).add(id);
      return id;
    },

    /**
     * 注册一个 setInterval
     * @param {string} group
     * @param {Function} fn
     * @param {number} interval
     * @returns {number} timerId
     */
    setInterval(group, fn, interval) {
      _ensureGroup(_intervals, group);
      const id = setInterval(fn, interval);
      _intervals.get(group).add(id);
      return id;
    },

    /**
     * 清除单个 timeout（通过 id）
     * @param {string} group
     * @param {number} id
     */
    clearTimeout(group, id) {
      if (id == null) return;
      clearTimeout(id);
      _timeouts.get(group)?.delete(id);
    },

    /**
     * 清除单个 interval（通过 id）
     * @param {string} group
     * @param {number} id
     */
    clearInterval(group, id) {
      if (id == null) return;
      clearInterval(id);
      _intervals.get(group)?.delete(id);
    },

    /**
     * 清除某个分组下的所有定时器（组件销毁时调用）
     * @param {string} group
     */
    clearGroup(group) {
      const timeouts = _timeouts.get(group);
      if (timeouts) {
        timeouts.forEach(id => clearTimeout(id));
        timeouts.clear();
      }
      const intervals = _intervals.get(group);
      if (intervals) {
        intervals.forEach(id => clearInterval(id));
        intervals.clear();
      }
    },

    /**
     * 清除所有定时器（应用退出时调用）
     */
    clearAll() {
      _timeouts.forEach((set) => set.forEach(id => clearTimeout(id)));
      _intervals.forEach((set) => set.forEach(id => clearInterval(id)));
      _timeouts.clear();
      _intervals.clear();
    },

    /**
     * 调试用：打印当前所有活跃定时器数量
     */
    debug() {
      let total = 0;
      _timeouts.forEach((set, group) => {
        if (set.size > 0) console.log(`[TimerManager] timeout group="${group}" count=${set.size}`);
        total += set.size;
      });
      _intervals.forEach((set, group) => {
        if (set.size > 0) console.log(`[TimerManager] interval group="${group}" count=${set.size}`);
        total += set.size;
      });
      console.log(`[TimerManager] 活跃定时器总数: ${total}`);
    }
  };
})();

window.TimerManager = TimerManager;
