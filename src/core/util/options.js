/* @flow */

import config from '../config'
import { warn } from './debug'
import { set } from '../observer/index'
import { unicodeRegExp } from './lang'
import { nativeWatch, hasSymbol } from './env'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize, // 驼峰法命名转换
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject // 判断是不是对象类型
} from 'shared/util'

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
const strats = config.optionMergeStrategies

/**
 * Options with restrictions
 */
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}

/**
 * Helper that recursively merges two data objects together.
 */
function mergeData (to: Object, from: ?Object): Object {
  if (!from) return to
  let key, toVal, fromVal

  const keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from)

  for (let i = 0; i < keys.length; i++) {
    key = keys[i]
    // in case the object is already observed...
    if (key === '__ob__') continue
    toVal = to[key]
    fromVal = from[key]
    if (!hasOwn(to, key)) {
      set(to, key, fromVal)
    } else if (
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      mergeData(toVal, fromVal)
    }
  }
  return to
}

/**
 * Data
 * data的合并策略
 */
// 合并两个组件中data的属性，比如子组件中props和data合并
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // in a Vue.extend merge, both should be functions
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal
      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  /**
  * Vue.extend 方法里面是这么合并属性的：
  * Sub.options = mergeOptions(
  *   Super.options,
  *   extendOptions
  * )
  * 在Vue的组件继承树上的merge是不存在vm的
  */
  if (!vm) {
    // 判断data是不是一个函数类型，则返回父属性的值，这也是为什么data要函数类型的原因
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }
    return mergeDataOrFn(parentVal, childVal)
  }
  // childVal可以视为是data函数中定义的变量，parentVal不熟悉可以先用undefined代替
  return mergeDataOrFn(parentVal, childVal, vm)
}

/**
 * Hooks and props are merged as arrays.
 * 生命周期钩子的合并策略
 */
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  const res = childVal // child是否存在
    ? parentVal
      ? parentVal.concat(childVal) // child和parent都存在则直接合并字段
      : Array.isArray(childVal) // 如果parent不存在，则判断child是不是一个数组，因为child还有可能是一个funciton
        ? childVal // 如果是数组则直接返回数组
        : [childVal] // 如果不是数组，则将child封装成数组返回
    : parentVal // 如果child不存在，则直接返回parent或者空，因为parent有可能不传

  // 问题：为什么要封装成数组，因为vue允许vue.mixin向实例混入自定义行为
  // 设置成数组是为了在同一个钩子时能够同时触发用户自定义的钩子函数和vue自身自带的钩子函数
  return res
    ? dedupeHooks(res)
    : res
}

function dedupeHooks (hooks) {
  const res = []
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i])
    }
  }
  return res
}

/** 
 * 循环挂载hooks至策略上
 * LIFECYCLE_HOOKS位于src/shared/constants.js中
 * 主要包含vue的各个生命周期名称
*/
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  const res = Object.create(parentVal || null)
  if (childVal) {
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)
    return extend(res, childVal)
  } else {
    return res
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined
  /* istanbul ignore if */
  if (!childVal) return Object.create(parentVal || null)
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = {}
  extend(ret, parentVal)
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]
    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  return ret
}

/**
 * Other object hashes.
 */
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }
  if (!parentVal) return childVal
  const ret = Object.create(null)
  extend(ret, parentVal)
  if (childVal) extend(ret, childVal)
  return ret
}
strats.provide = mergeDataOrFn

/**
 * Default strategy.
 */
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names
 * 验证options字段的合法性
 */
function checkComponents (options: Object) {
  for (const key in options.components) {
    validateComponentName(key)
  }
}

export function validateComponentName (name: string) {
  if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'should conform to valid custom element name in html5 specification.'
    )
  }
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/** 
 * 将props数据转化为统一格式，因为props有三种写法，具体不做分析，分析原理可参照normalizeInject
 * 输入写法
  // 写法一
  props: ['name']

  // 写法二
  props: {
      name: String, // [String, Number]
  }

  // 写法三
  props: {
      name:{
        type: String
      }
  }

 * 输出结果
  {
    props: {
      name: {
        type: String // [String, Number, null]
      }
    }
  }

 * @param {*} options
 * @param {*} vm
*/
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return // 用户未定义 props 则不需要统一化
  const res = {} // 用于存储统一后的结果
  let i, val, name
  // 第一种写法
  if (Array.isArray(props)) {
    i = props.length
    // 循环遍历
    /* 
      输出的结果：
      {
        name: {
          type: null
        }
      }
    */
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        // 将key转化为驼峰法
        name = camelize(val)
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') { // 如果元素不是字符串，则抛出异常
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) { // 判断是不是对象类型
    // 循环 props 的 keys
    for (const key in props) {
      val = props[key]
      name = camelize(key) // 驼峰命名处理
      res[name] = isPlainObject(val) // 判断key的值是不是对象，从而判断是第几种写法
        ? val // 如果是第三种写法，则输入格式为{name: {type: String}}
        : { type: val } // 如果是第二种写法，则输出格式为{name: {type: String}}
    }
  } else if (process.env.NODE_ENV !== 'production') { // 如果既不是数组也不是对象，则抛出错误
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }

  // 输出结果
  options.props = res
}

// 将inject中的值转化为统一格式，因为inject有3种写法格式
/** 
  // 写法一
  var Child = {
    inject: ['foo']
  }
  转化为：
  inject: {
    foo: {
      from: 'foo'
    }
  }

  // 写法二
  const Child = {
    inject: {
      foo: { default: 'xxx' }
    }
  }
  转化为：
  inject: {
    foo: {
      from: 'foo',
      default: 'xxx'
    }
  }

  // 写法三
  const Child = {
    inject: {
      foo
    }
  }
  转化为：
  inject: {
    foo: {
      from: 'foo',
      default: 'xxx'
    }
  }
*/
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject
  if (!inject) return // 如果inject不存在，则直接返回，跳出函数程序
  const normalized = options.inject = {}
  if (Array.isArray(inject)) { // 如果时第一种写法，则循环遍历
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] } // 转化为inject:{foo:{from:'foo'}}形式
    }
  } else if (isPlainObject(inject)) {
    for (const key in inject) {
      const val = inject[key]
      // 对第二种和第三种写法进行处理，转化为统一格式
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 */
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key]
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 * 将parent和child两个对象进行策略合并，策略模式
 * 
 */
export function mergeOptions (
  parent: Object, // Vue的构造函数
  child: Object, // 传入的是options属性
  vm?: Component // 如果是根节点，则是Vue原型，子节点为undefined，这里保证了Vue的一致性，可以视为单例模式
): Object {
  if (process.env.NODE_ENV !== 'production') {
    // 验证options字段的合法性
    checkComponents(child)
  }

  if (typeof child === 'function') {
    child = child.options
  }
  // 统一props格式
  normalizeProps(child, vm)
  normalizeInject(child, vm)
  // 统一directives的格式
  normalizeDirectives(child)

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  if (!child._base) {
    // 递归合并参数
    // 将mixins和extends合并到parent上
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm)
    }
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm)
      }
    }
  }

  // 循环遍历parent
  const options = {}
  let key
  for (key in parent) {
    mergeField(key)
  }
  // 循环遍历在child中，但不在parent的属性，将其添加至options中
  for (key in child) { // 循环子级对象的key值，如果父级对象中没有对应key，则将该key和值存入父级对象中
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }
  /** 
   * @method mergeField 将不存在parent中但存在child中的属性添加至options中
   * 并不是简单的字段合并，而是遵循一定的合并策略，如果data有自己的策略，watch有自己的策略
   * 相关策略在本文件中有注解
  */
  function mergeField (key) {
    // strats表示策略规则
    const strat = strats[key] || defaultStrat
    options[key] = strat(parent[key], child[key], vm, key)
  }
  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  /* istanbul ignore if */
  if (typeof id !== 'string') {
    return
  }
  // 从当前实例的options中获取需要的属性，比如如果是过滤器，那么type就等于filter
  const assets = options[type]
  // check local registration variations first
  // 先从本地注册中查找
  // 如果当前实例中有，那么直接用当前实例的
  if (hasOwn(assets, id)) return assets[id]
  // 如果没有，则转化为驼峰
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  // 如果还没有就转化为首字母大写
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  // 再从原型中查找，如果有就返回，如果没有就抛出警告
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}
