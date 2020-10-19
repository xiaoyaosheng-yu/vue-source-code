/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype

// 创建一个对象作为拦截器
export const arrayMethods = Object.create(arrayProto)

// 改变数组自身的7个方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method] // 缓存原生的arr方法，此处的arrayProto = Array.prototype，见最开始的第二行代码
  /* 
    以下代码的另一种写法
    Object.defineProperty(arrayMethods, method, {
      enumerable: false,
      configurable: true,
      writable: true,
      value:function mutator(...args){
        const result = original.apply(this, args)
        return result
      }
    })
  */
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    ob.dep.notify()
    return result
  })
})
