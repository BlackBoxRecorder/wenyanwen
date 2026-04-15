// AST 节点工厂函数

// === Block 节点 ===

export function createDocument(meta, children) {
  return { type: 'document', meta, children };
}

export function createHeading(level, children) {
  return { type: 'heading', level, children };
}

export function createParagraph(children) {
  return { type: 'paragraph', children };
}

export function createTranslation(children) {
  return { type: 'translation', children };
}

export function createParagraphGroup(paragraph, translation) {
  return { type: 'paragraph_group', paragraph, translation: translation || null };
}

export function createPoetryBlock(title, meta, lines) {
  return { type: 'poetry_block', title: title || null, meta: meta || null, lines };
}

export function createBlockquote(children) {
  return { type: 'blockquote', children };
}

export function createSectionBreak() {
  return { type: 'section_break' };
}

// === Inline 节点 ===

export function createText(value) {
  return { type: 'text', value };
}

export function createRuby(base, annotation) {
  return { type: 'ruby', base, annotation };
}

export function createAnnotate(text, note) {
  return { type: 'annotate', text, note };
}

export function createEmphasis(children) {
  return { type: 'emphasis', children };
}

export function createProperNoun(children) {
  return { type: 'proper_noun', children };
}

export function createBookTitle(title) {
  return { type: 'book_title', title };
}
