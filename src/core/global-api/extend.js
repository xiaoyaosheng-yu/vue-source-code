/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */
  // 创建一个继承自Vue类的子类
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {} // 用户传入的参数
    const Super = this // 继承vue类的属性
    const SuperId = Super.cid // 获取父类唯一标识
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {}) // 创建的子类的缓存池存放地
    if (cachedCtors[SuperId]) { // 如果该子类已经创建过了，则直接返回该子类
      return cachedCtors[SuperId]
    }

    // 获取子类的name属性
    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      // 校验name命名是否合法，即是否和内部一些属性名称冲突
      validateComponentName(name)
    }

    // 创建需要继承vue类的子类
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    Sub.prototype = Object.create(Super.prototype) // 继承父类的原型
    Sub.prototype.constructor = Sub
    Sub.cid = cid++ // 定义子类唯一标识
    // 合并父类的options和用户传入的options
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    // 挂载super属性，并将父类关联到super属性上
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    if (Sub.options.props) {
      // 初始化props，在initProps中会设置好代理
      initProps(Sub)
    }
    if (Sub.options.computed) {
      // 初始化computed
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 继承父类的一些属性
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    // ASSET_TYPES = ['component','directive','filter']
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    // 设置子类独有的属性
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 将子类放入缓存池
    cachedCtors[SuperId] = Sub
    // 返回创建好的子类
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    // 设置代理
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  // 将computed中的属性全部挂载至子类的原型上
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
