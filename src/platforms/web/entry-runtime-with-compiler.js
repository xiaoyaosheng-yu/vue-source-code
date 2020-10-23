/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// $mount 先定义运行时版本的$mount方法，再定义完整版本的$mount方法
// 两个版本都需要通过$mount进行模板挂载，所以，完整版在模板编译完成后生成render函数，然后直接调用运行时版本的$mount进入挂载阶段即可
// 运行时版本不需要进入模板编译阶段，因为运行时版本就已经是render函数的写法了

const mount = Vue.prototype.$mount // 缓存运行时版本的$mount

// 定义完整版的$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)

  /* istanbul ignore if */
  if (el === document.body || el === document.documentElement) {
    // 不允许将根节点挂载在body和html上
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 判断用户是否有手写render，如果没有就获取默认的template模板
  if (!options.render) {
    let template = options.template
    if (template) { // 如果模板存在
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') { // 判断挂载点是不是一个ID，如果是，则将该DOM元素的innerHTML作为模板
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) { // 判断是否是一个DOM元素，如果是，则将该DOM元素的innerHTML作为模板
        template = template.innerHTML
      } else { // 如果既不是ID也不是DOM元素，则抛出异常
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 如果模板不存在，则根据el获取外部模板
      template = getOuterHTML(el)
    }
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }
      // 如果render函数不存在，将模板转化为render函数
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      // 将render函数和staticRenderFns【数组类型】挂载至实例的$options和staticRenderFns
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }

  // 调用运行时版本的$mount进入挂载阶段
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
