/* @flow */
// 模板优化阶段

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
/**
 * 在AST中找出所有静态节点并打上标记；
 * 在AST中找出所有静态根节点并打上标记；
 * @export
 * @param {?ASTElement} root
 * @param {CompilerOptions} options
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  markStatic(root) // 标记静态节点
  // second pass: mark static roots.
  markStaticRoots(root, false) // 标记静态根节点
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

// 标记静态节点
function markStatic (node: ASTNode) {
  /** 
   * type=1 元素节点
   * type=2 含变量的文本节点
   * type = 3 不含变量的纯文本节点
  */
  node.static = isStatic(node)
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    // 递归判断它的子节点是否是静态节点
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) { // 如果当前节点的子节点不是静态节点，则将其也标记为非静态节点
        node.static = false
      }
    }
    if (node.ifConditions) {
      // 递归判断它的ifConditions是否是静态节点
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) { // 如果当前节点的子节点不是静态节点，则将其也标记为非静态节点
          node.static = false
        }
      }
    }
  }
}

// 标记静态根节点
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 判断静态根节点的条件：1、本身为静态节点。2、需要有子节点。3、子节点的长度必须大于1
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    // 判断它的子节点和ifConditions
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression 含变量的文本类型AST节点肯定不是静态节点
    return false
  }
  if (node.type === 3) { // text 不含变量的纯文本AST节点肯定是静态节点
    return true
  }
  // type = 1 则为元素节点
  // 元素节点是否为静态节点需要满足以下条件
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings 不能有v-、@、:开头的属性
    !node.if && !node.for && // not v-if or v-for or v-else // 不能包含v-if,v-for,v-else
    !isBuiltInTag(node.tag) && // not a built-in // 不能是slot或component，即不能是内置组件
    isPlatformReservedTag(node.tag) && // not a component // 不能是组件
    !isDirectChildOfTemplateFor(node) && // 父级不能是带有v-for的template标签
    Object.keys(node).every(isStaticKey) // 所有的key必须是静态节点才有的key，因为vue的key只能是type,tag,attrsList,attrsMap,plain,parent,children,attrs之一；
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
