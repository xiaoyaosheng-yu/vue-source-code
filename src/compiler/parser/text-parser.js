/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

/**
 * 文本解析器的作用
 * 判断传入的文本是否包含变量
 * 将文本中的变量和非变量提取出来
 * 构造expression
 * 构造tokens
 * @export
 * @param {string} text
 * @param {[string, string]} [delimiters]
 * @returns {(TextParseResult | void)}
 */
export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  // 用于检测文本中是否包含{{}}
  // eg：默认为{{}}，但也可以是别的，这个符号可以是通过传入参数的 delimiters 决定
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  if (!tagRE.test(text)) { // 如果文本中不包含变量，则直接返回
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  while ((match = tagRE.exec(text))) {
    // 以 text = "hello {{name}}，I am {{age}}" 为例
    // match = ["{{name}}", "name", index: 6, input: "hello {{name}}，I am {{age}}", groups: undefined]
    // 如果text = "hello", 那么match = null，不会进入循环中
    index = match.index
    // push text token
    if (index > lastIndex) {
      // 先把'{{'前面的文本放入tokens中
      rawTokens.push(tokenValue = text.slice(lastIndex, index))
      tokens.push(JSON.stringify(tokenValue))
    }
    // tag token
    // 取出'{{ }}'中间的变量exp
    const exp = parseFilters(match[1].trim())
    // 把变量exp改成_s(exp)形式也放入tokens中
    tokens.push(`_s(${exp})`)
    // 将变量exp也改成 {'@binding': exp} 的形式放入rawTokens中
    rawTokens.push({ '@binding': exp })
    // 设置下一轮循环，开始下标为}}后边的第一个字符串的位置
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    // 当lastIndex < text.length时,说明text中已经不能匹配到变量了，即所有变量已经处理完毕，将剩余的text推入tokens中
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {
    expression: tokens.join('+'),
    tokens: rawTokens
  }
}
