import MarkdownIt from 'markdown-it'

type SimpleMarkdownRenderOptions = {
  emptyHtml?: string
  autoNestList?: boolean
  imageBasePath?: string
  workspace?: string
  authToken?: string
}

const markdownRenderer = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})

markdownRenderer.enable([
  'table',
  'strikethrough',
  'linkify',
])

const defaultLinkOpenRule = markdownRenderer.renderer.rules.link_open
markdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token?.attrGet('href') || ''
  if (/^https?:\/\//i.test(href)) {
    token?.attrSet('target', '_blank')
    token?.attrSet('rel', 'noreferrer noopener')
  }

  if (defaultLinkOpenRule) {
    return defaultLinkOpenRule(tokens, idx, options, env, self)
  }
  return self.renderToken(tokens, idx, options)
}

const defaultImageRule = markdownRenderer.renderer.rules.image
markdownRenderer.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token?.attrGet('src') || ''
  
  if (src && !/^https?:\/\//i.test(src) && !/^data:/i.test(src)) {
    const imageBasePath = (env as any)?.imageBasePath as string | undefined
    const workspace = (env as any)?.workspace as string | undefined
    const authToken = (env as any)?.authToken as string | undefined
    
    if (imageBasePath && workspace) {
      const resolvedPath = resolveImagePath(src, imageBasePath)
      let apiSrc = `/api/files/get?path=${encodeURIComponent(resolvedPath)}&workspace=${encodeURIComponent(workspace)}&binary=true`
      if (authToken) {
        apiSrc += `&token=${encodeURIComponent(authToken)}`
      }
      token?.attrSet('src', apiSrc)
    }
  }
  
  if (defaultImageRule) {
    return defaultImageRule(tokens, idx, options, env, self)
  }
  return self.renderToken(tokens, idx, options)
}

function resolveImagePath(src: string, basePath: string): string {
  if (src.startsWith('/')) {
    return src.slice(1)
  }
  
  if (src.startsWith('./')) {
    src = src.slice(2)
  }
  
  const normalizedBase = basePath.replace(/\\/g, '/')
  const lastSlash = normalizedBase.lastIndexOf('/')
  const baseDir = lastSlash >= 0 ? normalizedBase.substring(0, lastSlash) : ''
  
  while (src.startsWith('../')) {
    src = src.slice(3)
    const lastSlash = baseDir.lastIndexOf('/')
    if (lastSlash >= 0) {
      return baseDir.substring(0, lastSlash) + '/' + src
    }
    return src
  }
  
  return baseDir ? `${baseDir}/${src}` : src
}

function normalizeLeadingIndent(line: string): string {
  const match = line.match(/^([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]*)(.*)$/u)
  if (!match) return line
  const leading = (match[1] || '').replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/gu, ' ')
  const body = (match[2] || '').replace(/^[•·●▪◦‣⁃]\s*/u, '- ')
  return `${leading}${body}`
}

function isFenceDelimiter(line: string): boolean {
  return /^[ \t]{0,3}(```+|~~~+)/.test(line)
}

function splitTableCells(line: string): string[] {
  const trimmedStart = line.trimStart()
  const trimmedEnd = line.trimEnd()
  const raw = line.split('|')
  let start = 0
  let end = raw.length

  if (trimmedStart.startsWith('|')) start += 1
  if (trimmedEnd.endsWith('|')) end -= 1

  return raw.slice(start, end).map((cell) => cell.trim())
}

function parseTableSeparatorLine(line: string): { colCount: number } | null {
  const cells = splitTableCells(line)
  if (cells.length < 2) return null
  for (const cell of cells) {
    if (!/^:?-{3,}:?$/.test(cell)) return null
  }
  return { colCount: cells.length }
}

function normalizeGfmTableBlocks(lines: string[]): string[] {
  let hasSeparator = false
  let inFence = false
  for (const line of lines) {
    if (isFenceDelimiter(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (/\|\s*:?-{3,}:?\s*\|/.test(line)) {
      hasSeparator = true
      break
    }
  }
  if (!hasSeparator) return lines

  const expanded: string[] = []
  inFence = false

  for (const line of lines) {
    if (isFenceDelimiter(line)) {
      inFence = !inFence
      expanded.push(line)
      continue
    }
    if (inFence) {
      expanded.push(line)
      continue
    }

    if (/\|\s*:?-{3,}:?\s*\|/.test(line) && /\|\s+\|/.test(line)) {
      expanded.push(...line.replace(/\|\s+\|/g, '|\n|').split('\n'))
      continue
    }

    expanded.push(line)
  }

  const repaired: string[] = []
  inFence = false
  for (const line of expanded) {
    if (isFenceDelimiter(line)) {
      inFence = !inFence
      repaired.push(line)
      continue
    }
    if (inFence) {
      repaired.push(line)
      continue
    }

    const separator = parseTableSeparatorLine(line)
    if (separator && repaired.length > 0) {
      const headerLine = repaired[repaired.length - 1] || ''
      const headerCells = splitTableCells(headerLine)

      if (headerCells.length === separator.colCount + 1) {
        const title = headerCells[0]?.trim() || ''
        const cells = headerCells.slice(1)
        repaired.pop()
        if (title) repaired.push(title)
        repaired.push(`| ${cells.join(' | ')} |`)
      }
    }

    repaired.push(line)
  }

  return repaired
}

function normalizeGroupingText(content: string): string {
  return content
    .trim()
    .replace(/[*_`~]/g, '')
}

function looksLikeGroupTitle(content: string): boolean {
  const text = normalizeGroupingText(content)
  if (!text) return false
  const hasMarkdownLink = /\[[^\]]+]\(https?:\/\/[^)\s]+\)/.test(text)
  if (/[：:]/.test(text)) return false
  if (/[。！？!?]\s*$/.test(text)) return false
  if (!hasMarkdownLink && /https?:\/\//i.test(text)) return false
  if (/^(支持|新增|增加|修复|修正|优化|调整|移除|删除|合并|拆分|更新|改进|减少|提供|暴露|规范化)/u.test(text)) return false
  if (text.length > 60) return false

  if (hasMarkdownLink) return true
  if (/[\/]/.test(text)) return true
  if (/[()（）]/.test(text)) return true
  if (/(Changes|Fixes)\b/.test(text)) return true
  if (/(支持|增强|能力|改进|修复)\s*$/u.test(text)) return true

  if (text.length <= 20 && /[\p{Script=Han}]/u.test(text)) return true
  if (text.length <= 24 && /^[A-Za-z][A-Za-z0-9 ._-]*$/.test(text)) return true

  return false
}

function looksLikeGroupSubItem(content: string): boolean {
  const text = normalizeGroupingText(content)
  if (!text) return false
  if (/^(摘要|要点|点评|锐评|结论|说明|来源|备注|时间|链接)\s*[:：]/.test(text)) return true
  if (/^「[^」]{1,20}」\s*(锐评|点评|评论)\s*[:：]/.test(text)) return true
  return false
}

function looksLikeStrongGroupTitle(content: string): boolean {
  const text = normalizeGroupingText(content)
  if (!text) return false
  const hasMarkdownLink = /\[[^\]]+]\(https?:\/\/[^)\s]+\)/.test(text)
  if (/[：:]/.test(text)) return false
  if (/[。！？!?]\s*$/.test(text)) return false
  if (!hasMarkdownLink && /https?:\/\//i.test(text)) return false
  if (/^(支持|新增|增加|修复|修正|优化|调整|移除|删除|合并|拆分|更新|改进|减少|提供|暴露|规范化)/u.test(text)) return false
  if (text.length > 60) return false
  if (hasMarkdownLink) return true
  if (/[\/]/.test(text)) return true
  if (/[()（）]/.test(text)) return true
  if (/(Changes|Fixes)\b/.test(text)) return true
  if (/(支持|增强|能力|改进|修复)\s*$/u.test(text)) return true
  return false
}

function autoNestListLines(lines: string[]): { lines: string[]; changed: boolean } {
  const next = [...lines]
  let inFence = false
  let changed = false

  type ListItem = {
    index: number
    indent: number
    content: string
    isTitle: boolean
    isStrongTitle: boolean
  }

  const readIndentWidth = (prefix: string) => prefix.replace(/\t/g, '    ').length
  const parseListItem = (line: string): { indent: number; content: string } | null => {
    const unordered = line.match(/^([ \t]*)([-*+])\s+(.+)$/)
    if (unordered) return { indent: readIndentWidth(unordered[1] || ''), content: unordered[3] || '' }
    const ordered = line.match(/^([ \t]*)(\d{1,9}\.)\s+(.+)$/)
    if (ordered) return { indent: readIndentWidth(ordered[1] || ''), content: ordered[3] || '' }
    return null
  }

  let segment: ListItem[] = []

  const flushSegment = () => {
    if (segment.length === 0) return

    const baseIndent = Math.min(...segment.map((item) => item.indent))
    const baseItems = segment.filter((item) => item.indent === baseIndent)
    const titleCount = baseItems.reduce((acc, item) => acc + (item.isTitle ? 1 : 0), 0)
    const firstTitle = baseItems.find((item) => item.isTitle)
    const canGroupAll =
      titleCount >= 2 ||
      (titleCount === 1 && firstTitle?.isStrongTitle)

    let inGroup = false
    for (const item of baseItems) {
      if (item.isTitle) {
        inGroup = true
        continue
      }
      if (!inGroup) continue

      const shouldIndent = canGroupAll || looksLikeGroupSubItem(item.content)
      if (!shouldIndent) continue

      next[item.index] = `  ${next[item.index]}`
      changed = true
    }

    segment = []
  }

  for (let i = 0; i < next.length; i += 1) {
    const line = next[i] || ''

    if (isFenceDelimiter(line)) {
      flushSegment()
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const parsed = parseListItem(line)
    if (!parsed) {
      if (line.trim()) flushSegment()
      continue
    }

    segment.push({
      index: i,
      indent: parsed.indent,
      content: parsed.content,
      isTitle: looksLikeGroupTitle(parsed.content),
      isStrongTitle: looksLikeStrongGroupTitle(parsed.content),
    })
  }

  flushSegment()

  return { lines: next, changed }
}

function normalizeMarkdownInput(markdown: string, options: { autoNestList: boolean }): string {
  const rawLines = markdown.replace(/\r\n/g, '\n').split('\n')
  const normalizedLines: string[] = []
  let inFence = false

  for (const line of rawLines) {
    if (isFenceDelimiter(line)) {
      inFence = !inFence
      normalizedLines.push(line)
      continue
    }
    if (inFence) {
      normalizedLines.push(line)
      continue
    }
    normalizedLines.push(normalizeLeadingIndent(line))
  }

  let lines = normalizedLines
  if (options.autoNestList) {
    const nested = autoNestListLines(normalizedLines)
    lines = nested.changed ? nested.lines : normalizedLines
  }

  return normalizeGfmTableBlocks(lines).join('\n')
}

export function renderSimpleMarkdown(markdown: string, options: SimpleMarkdownRenderOptions = {}): string {
  const normalized = normalizeMarkdownInput(markdown || '', { autoNestList: options.autoNestList ?? false })
  if (!normalized.trim()) {
    return options.emptyHtml || ''
  }
  
  const env: Record<string, unknown> = {}
  if (options.imageBasePath) {
    env.imageBasePath = options.imageBasePath
  }
  if (options.workspace) {
    env.workspace = options.workspace
  }
  if (options.authToken) {
    env.authToken = options.authToken
  }
  
  return markdownRenderer.render(normalized, env)
}

export function extractTocHeadings(markdown: string): { level: number; text: string; id: string }[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const headings: { level: number; text: string; id: string }[] = []
  
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1]?.length || 1
      const text = (match[2] || '').trim()
      const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      headings.push({ level, text, id })
    }
  }
  
  return headings
}
