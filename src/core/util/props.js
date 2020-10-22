/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

/**
 * 检验props的数据类型是否匹配，并返回 key 所对应的 value
 * @export
 * @param {string} key
 * @param {Object} propOptions
 * @param {Object} propsData
 * @param {Component} [vm]
 * @returns {*}
 */
export function validateProp (
  key: string, // 属性键名
  propOptions: Object, // 规范化后的props属性
  propsData: Object, // 父组件传入的props数据
  vm?: Component // 当前实例
): any {
  // 获取到props中当前的value
  /*
    prop: {
      name: {
        type: String
      }
    }
  */
  const prop = propOptions[key]
  // 父组件是否传入了该值的标识，父级组件不一定所有的props都传了
  const absent = !hasOwn(propsData, key)
  // 查询key在父组件中对应的值
  let value = propsData[key]
  // 判断当前的value是否为布尔值
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  // 如果是布尔类型，则进行边界处理
  if (booleanIndex > -1) {
    if (absent && !hasOwn(prop, 'default')) { // 1、如果父级组件没有传入该值，且当前实例没有默认值，则value为false
      value = false
    } else if (value === '' || value === hyphenate(key)) { // 2、如果属性值为空字符串或与key相同，驼峰法的key会转化为用 - 连接的字符串再比较
      const stringIndex = getTypeIndex(String, prop.type)
      if (stringIndex < 0 || booleanIndex < stringIndex) { // 如果prop的type属性中不存在String类型 或 boolean的优先级比字符串的优先级更高
        value = true
      }
    }
  }
  // 如果父级组件没有传入该值，则该值将会为undefined,此时获取该属性的默认值
  if (value === undefined) {
    // 获取默认值
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    const prevShouldObserve = shouldObserve
    // 设置成响应式
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) { // 如果父组件传入了该属性值，且有对应的值，则判断传入的值的类型与props的type是否相同
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * 根据当前实例中props的key获取其默认值
 * prop: {
    name: {
      type: String
    }
  }
 *
 * @param {?Component} vm
 * @param {PropOptions} prop
 * @param {string} key
 * @returns {*}
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) { // 如果没有默认值，则直接返回undefined
    return undefined
  }
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // 如果非生产环境下是一个对象，则抛出警告
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    // 对象或数组的默认值必须从工厂函数中获取
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  // 如果父级组件没有传入，但vm._props存在默认值，则直接取其默认值
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 如果def是一个函数，则返回这个函数的值作为默认值
  // 如果def不是函数，则将def作为默认值返回
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 * 校验父组件传来的真实值是否与prop的type类型相匹配
 * 如果不匹配则在非生产环境下抛出警告。
 * 
 * @param {PropOptions} prop
 * @param {string} name
 * @param {*} value
 * @param {?Component} vm
 * @param {boolean} absent
 */
function assertProp (
  prop: PropOptions, // 子组件prop的选项
  name: string, // key名称
  value: any, // 父组件的propsData传进来的真实数据
  vm: ?Component, // 当前实例
  absent: boolean // 父组件是否传了这个值
) {
  if (prop.required && absent) { // 如果该选项设置了必填，但是父组件没有传，则抛出异常
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  if (value == null && !prop.required) { // 如果是非必填，但是值不存在，则直接返回
    return
  }

  let type = prop.type // 获取值的类型
  let valid = !type || type === true // 输出结果，即校验是否成功，默认成功，如果是这种写法，则标识不需要校验：props:{name:true}，这时的type就等于true
  const expectedTypes = [] // 抛错的结果数组
  if (type) {
    // 如果设置了type属性，则统一转化为数组类型
    if (!Array.isArray(type)) {
      // 如果不是Array，则转化为Array
      type = [type]
    }
    /// 遍历type数组，因为type值的数组可以是多选的，!valid表示只要有一个成功则立即结束循环
    for (let i = 0; i < type.length && !valid; i++) {
      /* 
      assertedType 返回的结果
      {
        vaild: true,       // 表示是否校验成功
        expectedType：'Boolean'   // 表示被校验的类型
      }
      */
      const assertedType = assertType(value, type[i]) // 进行校验
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  if (!valid) { // 未通过则抛出异常
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }

  // 自定义校验函数
  const validator = prop.validator // 获取自定义校验函数
  if (validator) {
    if (!validator(value)) { // 校验失败则抛出异常
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

/**
 * 判断属性是否存在某个类型
 * 
 * @param {*} type
 * @param {*} expectedTypes
 * @returns {number} 找到了则返回下标，如果不存在则返回-1
 */
function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (expectedTypes.length === 1 &&
      isExplicable(expectedType) &&
      !isBoolean(expectedType, receivedType)) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable (value) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
