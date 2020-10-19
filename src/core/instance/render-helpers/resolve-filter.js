/* @flow */

import { identity, resolveAsset } from 'core/util/index'

/**
 * Runtime helper for resolving filters
 */
export function resolveFilter (id: string): Function {
  // identity 是一个和参数id一样的值
  return resolveAsset(this.$options, 'filters', id, true) || identity
}
