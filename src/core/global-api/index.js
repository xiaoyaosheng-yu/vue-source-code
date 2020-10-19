/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }

  /*
    【Vue.config】 各种全局配置项

    【Vue.util】 各种工具函数，还有一些兼容性的标志位（哇，不用自己判断浏览器了，Vue已经判断好了）

    【Vue.set/delete】 这个你文档应该见过

    【Vue.nextTick】

    【Vue.options】 这个options和我们上面用来构造实例的options不一样。这个是Vue默认提供的资源（组件指令过滤器）。

    【Vue.use】 通过initUse方法定义

    【Vue.mixin】 通过initMixin方法定义

    【Vue.extend】通过initExtend方法定义
  */

  // 挂载Vue.config
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  Vue.set = set // 为某个数据添加属性，因为vue不能探测普通的新增属性，如this.obj.name = 'H1'，不会触发试图更新
  Vue.delete = del // 删除某个对象的属性，原理同Vue.set
  Vue.nextTick = nextTick // 在下次DOM更新循环结束之后执行延迟回调

  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    // 为Vue.options 挂载 component，directive，filter属性
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object components with in Weex's multi-instance scenarios.
  // 这用于标识“base”构造函数，以在Weex的多实例场景中扩展所有plain-object组件
  Vue.options._base = Vue

  // builtInComponents: keepAlive
  extend(Vue.options.components, builtInComponents)

  initUse(Vue)
  initMixin(Vue)
  initExtend(Vue)
  initAssetRegisters(Vue)
}
