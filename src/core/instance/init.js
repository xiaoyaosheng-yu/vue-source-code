/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) { // 此时的Vue并没有实例化
  Vue.prototype._init = function (options?: Object) { // options = {el: "#app", data: {…}}
    const vm: Component = this
    // a uid
    // 为组件绑定key值
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    // 可以忽视这行代码
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    // 用于判断是否需要监测变化

    vm._isVue = true
    /* 截止上述代码，vm仅做了两件事，_uid和_isVue */
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation since dynamic options merging is pretty slow, and none of the internal component options needs special treatment.
      // 优化内部组件实例化，因为动态选项合并速度很慢, 而且没有一个内部组件选项需要特殊处理
      initInternalComponent(vm, options)
    } else {
      // 合并构造函数的options和new Vue(options)实例化传入的options，并挂载在options上
      vm.$options = mergeOptions(
        // resolveConstructorOptions传送的参数是原型的构造函数,返回的是vm.constructor.options
        // 位于src/core/global-api/index.js中
        // 返回的具体属性是{component: {},directive: {},filter: {}}及内置组件的合集
        // 内置组件有<keep-alive>、<transition> 和<transition-group>，这也是内置组件不需要注册的原因
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    // 也可以忽略此段代码
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }

    // expose real self
    // 此时的vm打印后是这样的：Vue {_uid: 0, _isVue: true, $options: {"components":{},"directives":{},"filters":{},"el":"#app", data () {}}, _renderProxy: Proxy}
    vm._self = vm
    initLifecycle(vm) // 初始化生命周期
    initEvents(vm) // 初始化事件
    initRender(vm) // 初始化渲染，为组件实例初始化$attr和$createElement等属性
    callHook(vm, 'beforeCreate') // 触发beforeCreate生命周期函数
    initInjections(vm) // 初始化injections // resolve injections before data/props
    // 初始化vm的状态，prop/data/computed/method/watch都在这里完成初始化，因此也是Vue实例create的关键
    initState(vm)
    initProvide(vm) // 初始化provide， resolve provide after data/props
    callHook(vm, 'created') // 调用生命周期钩子函数

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // render & mount
    // 如果存在挂载节点el，则进入模板编译与挂载阶段
    // 如果节点el，则需要用户自己手动触发$mount方法才能进入下一个阶段
    // 这也是面试题中el为什么在created周期后的原因
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 合并构造函数的options
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  // 刚开始时的Vue类并没有super等属性，所以返回的是vm.$options
  if (Ctor.super) { // 判断是否为Vue的子类
    const superOptions = resolveConstructorOptions(Ctor.super) // 如果存在继承关系，则递归合并构造函数的options
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) { // 判断父类中的options有没有发生变化，因为Vue.extend(options)和Vue.mixin(options)会引起父类的options变化
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
