/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  // ASSET_TYPES = ['component','directive','filter']
  // 用法示例
  // Vue.directive('my-directive', function () {})
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string, // 名称
      definition: Function | Object // 回调
    ): Function | Object | void {
      if (!definition) { // 如果回调不存在，则说明是获取指令，否则就是注册指令
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          // 判断组件名是否合法
          validateComponentName(id)
        }
        // 对三种情况做区分
        // 如果component是一个对象，那么用extend方法转化为vue的子类，如果name不存在，则将id作为组件的name，这也是为什么我们子组件可以不用写name，直接用data的原因
        if (type === 'component' && isPlainObject(definition)) {
          definition.name = definition.name || id
          definition = this.options._base.extend(definition)
        }
        // 如果directive是一个函数，则默认监听bind和update方法
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 用于存放全局指令，全局组件，全局过滤器
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
