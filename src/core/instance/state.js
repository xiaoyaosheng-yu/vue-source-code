/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

/**
 * 作用：初始化实例的状态选项
 * props、methods、data、computed、watch 统称为状态选项
 * 
 * vm.$options中有什么选项就初始化什么选项
 * 严格按照props，methods，data，computed，watch的顺序初始化，因为后者可能有对前者数据的调用
 * @export
 * @param {Component} vm
 */
export function initState (vm: Component) {
  vm._watchers = [] // 存储当前实例中所有的watcher实例
  const opts = vm.$options
  // opts.props是规范化以后的数据，规范化在合并options时就已经处理了
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) { // 如果存在data属性，则初始化
    initData(vm)
  } else { // 如果没有则自动添加一个空的对象，并转化为响应式数据
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

/**
 * 初始化props状态选项
 * 合并options时规范化后的 props 数据，文件地址：src/core/util/options.js 的 normalizeProps 函数
 * normalizeProps 处理后的输出结果
  {
    props: {
      name: {
        type: String // [String, Number, null]
      }
    }
  }

 * @param {Component} vm
 * @param {Object} propsOptions
 */
function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {} // 父组件传入的真实数据
  const props = vm._props = {} // 所有props的属性都会添加至vm._props中
  // cache prop keys so that future props updates can iterate using Array instead of dynamic object key enumeration.
  // 缓存props中的keys如果更新了props，则只需要遍历vm.$options._propKeys就能够得到所有的key
  // 遗留问题：为什么要设置vm.$options._propKeys？
  const keys = vm.$options._propKeys = [] 
  const isRoot = !vm.$parent
  // root instance props should be converted
  // 如果不是根组件，则不需要设置为响应式
  if (!isRoot) {
    toggleObserving(false)
  }
  // 遍历规范化后的props
  for (const key in propsOptions) {
    keys.push(key)
    // 检验props传入的数据类型是否合法并且将返回传入的值
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    // 可忽略if中的代码
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // 将键和值绑定到vm._props中
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 将键和值绑定到vm._props中
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 检验key是否在vm实例中，如果不存在就设置代理，使this.demo = this._props.demo
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

/**
 * 作用：初始化data
 * 思路：
 *   1、将data统一格式，最终值必须是一个对象
 *   2、判断data最终值是不是一个对象，如果不是则跑错、抛出错误
 *   3、判断data是否和methods或props中的某个属性重复，如果重复，则抛出错误
 *   4、如果以上条件都通过，则将其挂载至vm._data上，并设置好代理
 *   5、将data做响应式监听
 * @param {Component} vm
 */
function initData (vm: Component) {
  // 获取到用户传入的data选项
  let data = vm.$options.data
  // 如果data是一个函数，则通过getData获取其返回值，并将其挂载至_data上，如果不是函数，则直接将其挂载至_data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm) // 查找并返回一个对象，保证data最终值必须是一个对象
    : data || {}

  if (!isPlainObject(data)) { // 判断data的最终值是不是一个对象，如果不是，则抛出异常
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length

  // 判断data命名是否合法
  while (i--) { // 循环data中的键名，判断是否和methods和props中的键名重复
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') { // 判断是否和methods中的方法名称重复
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) { // 判断是否和props的键名重复
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 代理数据，当访问this.xxx时，实际是代理到了this.data.xxx或者是this._data.xxx;
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 将data设置成响应式
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true } // 默认该计算属性没有获取过，即watcher的value为空，当修改(即执行watcher.evaluate()的方法)时，该值才会改变

/**
 * 作用：初始化计算属性computed
 *
 * @param {Component} vm
 * @param {Object} computed
 */
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  // 为vm实例添加_computedWatchers属性
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  // 循环遍历用户传入的computed属性
  for (const key in computed) {
    const userDef = computed[key] // 获取当前选项的值
    const getter = typeof userDef === 'function' ? userDef : userDef.get // 如果不是一个方法，则默认为取值器getter
    if (process.env.NODE_ENV !== 'production' && getter == null) { // 如果getter的两种情况都拿不到值，则抛出错误
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) { // 判断是不是服务端渲染
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) { // 判断是否重复定义，如果没有就调用defineComputed方法为实例vm上设置计算属性。
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

/**
 * 为target上定义一个属性key，并且属性key的getter和setter根据userDef的值来设置
 * sharedPropertyDefinition是默认的属性描述符
 * 
 * @export
 * @param {*} target 实例
 * @param {string} key 计算属性的键名
 * @param {(Object | Function)} userDef 计算属性的值
 */
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering() // 标记是否缓存数据，必须是非ssr环境下才能缓存数据
  // 针对userDef的两种情况进行区分，并设置其getter和setter
  if (typeof userDef === 'function') { // 如果userDef是一个函数
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else { // 如果不是一个函数
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }

  // 为防止用户修改计算属性
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }

  // 为该计算属性设置响应式监听
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 将computedGetter作为sharedPropertyDefinition的getter，即获取计算属性其实最终就是执行了computedGetter方法
function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // 判断一下是不是依赖的数据引起的变化，如果是，则重新计算，否则不计算
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

/**
 * 作用：初始化methonds
 * 思路：
 *  1、判断method是否存在
 *  2、判断method的命名符是否符合命名规范
 *  3、如果以上两点都通过，则挂载至vm上
 * 
 * @param {Component} vm
 * @param {Object} methods
 */
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  // 循环遍历 methods 选项中的每一个对象
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      // 如果methods的选项不是一个方法，则抛出异常
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }

      // 如果methods的选项和props中某个属性名冲突了，则抛出异常
      if (props && hasOwn(props, key)) { 
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      
      // 如果该选项名在实例中存在属性名或方法名且选项名是以 _ 或 $ 开头的，则抛出异常
      if ((key in vm) && isReserved(key)) { // 判断methods的名称是否合法，即是否和内置方法重复了，防止重写内部方法
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // 如果以上条件都通过，则将其挂载至vm实例上
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

// 初始化watch
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) { // 如果是数组，则依次对数组中的值创建watcher
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      // 如果不是数组，则直接对其创建watcher
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component, // 当前实例
  expOrFn: string | Function, // 被监听的表达式
  handler: any, // 选项的值
  options?: Object
) {
  /** 
    如果是对象，那么watch写法是
    watch: {
      c: {
          handler: function (val, oldVal) {},
          deep: true
        }
    }
  */
  if (isPlainObject(handler)) { // 判断是否为一个对象
    options = handler
    handler = handler.handler
  }
  /**
    如果是字符串，那么watch的写法是
    watch: {
      // methods选项中的方法名
      b: 'someMethod',
    }
  */
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  // 如果既不是对象，也不是字符串，那么就是函数，不做任何处理
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)
  
  // this.$set(Vue,'message', 'new1111');
  // set就是Object.defineProtoType方法的代理，但是并未调用，这个概念非常重要
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // this.$watch方法的实现
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) { // 判断是否为一个对象
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true // 用于区分用户创建的watch和内部创建的watcher实例
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) { // 是否立即用被观察数据的当前值作为回调函数的参数
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    return function unwatchFn () { // 停止触发回调
      watcher.teardown() // 取消观察
    }
  }
}
