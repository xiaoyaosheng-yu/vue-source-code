/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/ // 匹配<div id="index"> 的 id="index" 属性部分
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
// 匹配起始标签
const startTagOpen = new RegExp(`^<${qnameCapture}`)
// 开始标签的标志，比如>/div> 或者 />
const startTagClose = /^\s*(\/?)>/
// 匹配结束标签
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
// 匹配DOCTYPE标签
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
const comment = /^<!\--/ // 匹配注释标签
// 匹配标签是否为条件注释，比如<!-- [if !IE]> -->我是注释<!--< ![endif] -->
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) {
  // 定义一个栈，用于维护AST节点层级，每遇到一个开始标签，则推入栈中，每遇到一个结束标签，则将栈中对应的开始标签弹出
  // 作用： 1、维护节点层级 2、判断是否正确闭合了标签，没有闭合则报错
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0 // 游标位置
  // last表示剩余未解析的模板字符串，lastTag用于存储位于stack栈顶的元素，方便弹出来
  let last, lastTag
  while (html) { // 判断html内容是否存在
    last = html // 保留html副本
    // Make sure we're not in a plaintext content element like script/style
    // 确保模板内容不是在一个纯文本内容元素中：script、style、textarea，因为这三个标签中不会有HTML标签的
    // isPlainTextElement用于判断是否为是那三个纯文本标签之一，是的话为true
    // !lastTag 用于确保html没有父节点
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      /**
       * 如果html字符串以<开头，则有一下五种可能
       * 开始标签:<div>
       * 结束标签:</div>
       * 注释:<!-- 我是注释 -->
       * 条件注释:<!-- [if !IE] --> <!-- [endif] -->
       * DOCTYPE:<!DOCTYPE html>
      */
      if (textEnd === 0) {
        // 通过正则匹配是否为注释标签
        if (comment.test(html)) {
          // 找到结束标签的下标 --> 
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) { // 如果找到了结束标签
            // 则根据options中的shouldKeepComment属性来判断是否保留注释
            // 哪里来的shouldKeepComment属性？因为<template></template>中可以配置这个东西
            if (options.shouldKeepComment) {
              // 如果保留，调用钩子函数comment，并创建注释类型的AST节点
              // 因为<!--的长度是4，所以从第四个字符开始截取
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 如果不保留，则将游标移动到-->之后，继续解析
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // 解析是否是条件注释标签
        if (conditionalComment.test(html)) {
          // 寻找结束标签的下标
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // 通过正则匹配是否为doctype类型的标签
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:以<div id="demo">{{msg}}</div>为例
        const endTagMatch = html.match(endTag) // 对</div>部分进行处理
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:以<div id="demo">{{msg}}</div>为例
        const startTagMatch = parseStartTag() // 即对<div id="demo">部分进行处理
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      // 如果不是其余的五种文本类型，则为解析类型
      // 以<div>你好，世界</div>为例，如果<在第一个位置，则说明不是解析类型，否则从第一个位置到<符号前面都是文本内容
      if (textEnd >= 0) {
        rest = html.slice(textEnd) // 截取<符号后边的内容，即</div>中的/div>
        while ( // 如果rest后不是tagname，则说明<是属于文本内容例如：<div>这里的字符串"<"是文本内容</div>
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1) // 判断rest中是否还有其他<，即嵌套标签
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        // 将next的内容继续循环匹配
        text = html.substring(0, textEnd)
      }

      // 如果到最后都没有找到<符号，则说明整个HTML都是文本内容
      if (textEnd < 0) {
        text = html
      }

      // 如果找到了文本内容，则将游标移动至文本内容末尾，并继续解析
      if (text) {
        advance(text.length)
      }

      // 将截取出来的test转化为文本类型的AST
      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      // 当开始标签为script、style、textarea时，就将其内部的内容全部当作纯文本内容处理
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    // 如果经过上述处理后html仍没变，则说明不属于任何类型的标签，直接当作纯文本处理，创建文本类型的AST节点，如果抛出了异常，则说明标签格式有误
    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 移动游标
  function advance (n) {
    index += n
    // 将截取后的字符串重新赋值给html变量
    html = html.substring(n)
  }

  // 匹配开始标签
  function parseStartTag () {
    // '<div></div>'.match(startTagOpen)  => ['<div','div',index:0,input:'<div></div>']
    const start = html.match(startTagOpen)
    if (start) {
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      let end, attr
      // 循环提取所有属性标志，且没有匹配到结束标志，并存放到match.attr数组中
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      // 匹配到结束标签，则解析结束
      if (end) {
        match.unarySlash = end[1]
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  // 对parseStartTag函数的解析结果进行进一步处理
  function handleStartTag (match) {
    const tagName = match.tagName // 开始的标签名
    const unarySlash = match.unarySlash // 是否为自闭合标签的标志，是则为""，否则为"/"

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash // 判断是否为自闭合标签

    const l = match.attrs.length // 开始标签的属性的长度
    const attrs = new Array(l) // 构建一个长度与l长度相等的数组
    // 循环处理标签的属性数组，包括但不限于class，id，href等
    for (let i = 0; i < l; i++) {
      // 格式：["class="a"", "class", "=", "a", undefined, undefined, index: 0, input: "class="a" id="b"></div>", groups: undefined]
      const args = match.attrs[i]

      const value = args[3] || args[4] || args[5] || '' // 取定义属性的值
      // 兼容处理，如href链接的换行符或制表符，属性的值的换行符和制表符
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref // 需要对href中的值做兼容处理
        : options.shouldDecodeNewlines // 需要对属性的值做兼容性处理
      // 将属性值以{name: '', value: ''}的形式保存在新数组中
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    // 如果是非自闭合标签，则推入栈中
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }

    // 如果是自闭合，则调用start钩子函数，创建AST节点
    if (options.start) {
      // 调用start钩子函数
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // 对结束标签进行处理
  /**
   * 三个参数都传递，用于处理普通的结束标签
   * 三个参数都不传递，用于处理栈中剩余未处理的标签
   * 只传tagName
   * @param {*} tagName
   * @param {*} start
   * @param {*} end
   */
  function parseEndTag (
    tagName, // 结束标签名：div, li, ul等
    start, // 在html字符串中的开始位置
    end // 在html字符串中的结束位置
  ) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) { // 如果tagName存在，则从栈顶位置开始由后而前匹配stack中与tagName相同的位置的元素所在的位置，pos用于记录在栈中的下标，例如：<div><a></a></div>
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 如果代码正确，那么pos应该等于0，因为字符串是从前往后的，而出栈是从后往前的，字符串第一个结束标签应该是对应栈顶最后一个入栈的元素
      // 如果pos不等于0，那么表示后边的标签都是没有闭合的，或者对应关系错误的，所以依次将错误的标签打印出来
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn( // 依次打印报错内容
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 将栈中所有pos以后的元素都出栈，并且将将lastTag更新为栈顶元素
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') { // 单独对br标签进行处理，因为</br>会被浏览器自动解析为<br>
      if (options.start) {
        // 创建<br>类型的AST类型节点
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') { // 单独对p标签进行处理，因为</p>会被浏览器自动补全为<p></p>
      // 创建开始类型和结束类型的AST节点
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
