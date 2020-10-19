/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed object. Once attached, the observer converts the target object's property keys into getter/setters that collect dependencies and dispatch updates.
 * 附加到每个观察对象的观察者类。附加后，观察者将目标对象的属性键转换为getter/setter，后者收集依赖项并分派更新。
 * Observer类会通过递归的方式把一个对象的所有属性都转化成可观测对象
 */
// 响应式数据原理
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    // 给value新增一个__ob__属性，值为该value的Observer实例
    // 相当于为value打上标记，表示它已经被转化成响应式了，避免重复操作
    def(value, '__ob__', this)
    if (Array.isArray(value)) { // 当value为数组时的逻辑
      // 根据浏览器是否支持__proto__进行不同操作
      if (hasProto) {
        // 如果支持，则直接将数据的__proto__指向 arrayMethods
        // 以下代码等价于 value.__proto__ = arrayMethods
        protoAugment(value, arrayMethods)
      } else {
        // 如果浏览器不支持__proto__，则循环将array中重写的7个方法循环加入到value上
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 如果不是object对象或是vnode对象，则不需要监听
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  // 定义一个ob对象，该作用是标记属性是否被观测了
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * 通过Object.defineProperty方法来定义响应式数据
 * 使一个对象转化成可观测对象
 * @param { Object } obj 对象
 * @param { String } key 对象的key
 * @param { Any } val 对象的某个key的值
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep() // 依赖管理器，每个数据都应该有一个依赖数组

  // 获取obj对象中key属性的描述说明，如value, writable, enumerable, configurable等
  const property = Object.getOwnPropertyDescriptor(obj, key)
  // 如果该对象的描述说明中明确这个属性不能修改或删除，则跳过。
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 获取getter和setters
  const getter = property && property.get
  const setter = property && property.set

  // 如果只传了obj和key，那么val = obj[key]
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 新增__ob__属性，表示已经被监听，避免重复操作
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend() // 收集依赖
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      // 修改值
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify() // 通知依赖进行更新
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
// target：挂载点 key：键名 val：新值
// 用法$set(target, key, val)
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 判断参数target是否为undefined、null或是原始类型，如果是则抛出警告
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 如果当前target是一个数组，且key是一个有效索引
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key) // 对比key和target.length。取最大值作为新数组的长度
    // splice方法已被重写，可以被监听到，成为响应式
    target.splice(key, 1, val)
    return val
  }
  // 如果key已经存在于target中，则说明只需要修改值就行
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  // ob如果是true，则说明其是响应式对象，否则就不是响应式对象
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) { // 如果target是vue实例或是vue的根对象,不允许对vue实例进行修改，则抛出异常
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 如果ob为false，则说明不是要给响应式对象，只要将其新增新属性即可
  if (!ob) {
    target[key] = val
    return val
  }
  // 如果是响应式的，则将其添加到target上
  defineReactive(ob.value, key, val)
  // 通知依赖项进行更新
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  // 同set，先判断target是否为undefined或null或原始类型
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 如果是一个数组且key为一个有效索引，直接删除，因为splice已经重写，所以vue实例可以监听到数组的删除
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) { // 如果是vue实例或根实例，则报错
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  // 如果target不含key，则直接返回
  if (!hasOwn(target, key)) {
    return
  }
  // 否则就删除target中对应的数据
  delete target[key]
  // 如果是非响应式的，直接返回
  if (!ob) {
    return
  }
  // 如果是响应式的，则通知相关依赖项
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
