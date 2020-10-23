/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

/**
 * 依次递归需要深度监听的数据的每一个内部数据
 * 读取一个值就会将其收集到对应数据的依赖列表中
 *
 * @param {*} val
 * @param {SimpleSet} seen
 */
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)

  // 如果当前内部值不是一个对象或者数组，或者已经被冻结了，则直接退出程序
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }

  // seen是一个Set对象，有去重效果，保证存入的id不会重复，即不会重复收集
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }

  // 如果是数组，则依次递归遍历其内部值，对其进行读取和监听
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else { // 如果是对象，也对其内部值依次进行读取和监听
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
