/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

/**
 * 父组件给子组件的注册事件中，把自定义事件传给子组件，在子组件实例化的时候进行初始化；而浏览器原生事件是在父组件中处理
 * 换句话说：实例初始化阶段调用的初始化事件函数initEvents，实际上初始化的是"父组件在模板中使用v-on或@注册的(监听子组件内触发的)事件"。
 * @param {*} vm 
 */
export function initEvents (vm: Component) {
  // 创建事件对象，用于存储事件
  vm._events = Object.create(null)
  vm._hasHookEvent = false

  // _parentListeners其实是父组件模板中写的v-on
  // 将父组件向子组件注册的事件注册到子组件的实例中
  const listeners = vm.$options._parentListeners
  if (listeners) {
    // 对比新旧listeners，并对旧listeners进行注册或卸载操作
    updateComponentListeners(vm, listeners)
  }
}

let target: any

function add (event, fn) {
  target.$on(event, fn)
}

function remove (event, fn) {
  target.$off(event, fn)
}

function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  // 对比新旧事件的不同，并通过对比新增和卸载相关事件
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

export function eventsMixin (Vue: Class<Component>) {
  // 4个事件相关的实例方法：on,once,off,emit。
  const hookRE = /^hook:/
  // 用法vm.$on( event, callback )
  // 新增自定义事件监听器
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) { // 如果是一个数组，则表示订阅多个事件
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn) // 用递归将多个事件分解为订阅单个事件
      }
    } else { // 单个事件处理方法
      // 如果当前事件中心_events中没有事件列表，则将传入的回调传入进去，事件触发时则触发回调fn，如果有，则绑定事件中心中的事件
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  // 用法vm.$off( [event, callback] )
  // 移除自定义事件监听器
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    if (!arguments.length) { // 如果参数不存在，则直接重置事件中心为空,清除全部事件监听
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    if (Array.isArray(event)) { // 如果event是一个数组，则说明需要移除多个事件监听器
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn) // 展开事件数组，平铺为单个事件
      }
      return vm
    }
    // specific event
    // 获取事件中心里对应的事件
    const cbs = vm._events[event]
    if (!cbs) { // 如果事件不存在对应的事件，则直接返回
      return vm
    }
    if (!fn) { // 如果有对应事件，但回调不存在，则直接移除该事件的所有监听器
      vm._events[event] = null
      return vm
    }
    // specific handler
    // 如果事件和回调同时存在，则移除该回调的所有监听器
    let cb
    let i = cbs.length
    while (i--) {
      // 获取该事件的回调
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  // 调用方法vm.$emit( eventName, […args] )
  // event:需要触发的事件名称
  // 触发自定义事件监听器
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    // 从事件中心_events中获取到对应的事件回调函数cbs
    let cbs = vm._events[event]
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      // 获取传入的参数
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      for (let i = 0, l = cbs.length; i < l; i++) {
        // 依次执行回调函数，并将参数带入
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
