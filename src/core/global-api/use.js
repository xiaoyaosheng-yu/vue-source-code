/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    // 用于存放已经安装过的插件
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    if (installedPlugins.indexOf(plugin) > -1) { // 如果安装过了，直接返回
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    args.unshift(this) // 保证以vue开头
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args) // 完成插件安装
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args) // 将plugin当作install方法执行
    }
    // 标记已安装过了
    installedPlugins.push(plugin)
    return this
  }
}
