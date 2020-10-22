/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

/**
 * var Child = {
    inject: ['foo'],
  }
 * 父组件先初始化完成，所以这个时候可以拿到foo的值
 * @param {*} vm 
 */
export function initInjections (vm: Component) {
  // 将inject中的数据转化为键值对的形式
  const result = resolveInject(vm.$options.inject, vm)
  if (result) {
    toggleObserving(false) // 不对 inject 进行监听，这也是为什么 inject 的值不是响应式的原因
    // 循环遍历result中的键值对数据，并将其绑定至当前实例
    Object.keys(result).forEach(key => {
      /* istanbul ignore else */
      // 可忽略if中的代码
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        // 将result中的每一对数据添加到当前实例上
        /* 
          vm = {
            .....
            foo: function () {
              .......
            }
          }
          这个时候可以在data等地方用this.foo()调用到inject的函数
        */
        defineReactive(vm, key, result[key])
      }
    })
    toggleObserving(true)
  }
}

// 将inject中的数据转化为键值对的形式
// 从当前实例开始逐级往上查找inject中的值，并作相应处理
// inject有3种写法，在合并options时已经通过 normalizeInject 转化为了统一格式，函数地址：src/core/util/options.js
/* 统一的格式
  inject: {
    键名: {
      from: 'foo', // 来源
      default: 'xxx'  // 默认值，如果用户设置了默认值就会有default属性
    }
  }
*/
export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null) // 用于存放provide提供的key以及值
    // 获取inject中所有的key，因为现在可以用Symbol作为键名，所以对此做了兼容处理
    const keys = hasSymbol
      ? Reflect.ownKeys(inject)
      : Object.keys(inject) 

    // 循环遍历inject的keys，从当前实例开始逐级向上查找keys对应的值
    // 如果找到了就将keys及找到的值放在result中
    // 如果没有找到则查看是否有默认值，如果有就用默认值，如果没有则报错
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      // 获取inject中每个key的from属性
      const provideKey = inject[key].from
      // 从当前实例开始查找
      let source = vm
      // 从当前实例开始逐级往上寻找对应的provide
      // 如果找到了则终止查找
      while (source) {
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      // 如果查找的结果为空，则表示从本实例到根实例都没有找到对应的值
      if (!source) {
        // 判断是否有默认值，如果有，则使用默认值，如果没有则抛出警告
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}
