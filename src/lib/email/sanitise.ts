import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col',
  'colgroup', 'dd', 'div', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'q', 's',
  'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height', 'style'],
  '*': ['style', 'class', 'align', 'valign'],
}

export function sanitiseEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    // Strip tracking pixels
    transformTags: {
      img: (tagName, attribs) => {
        const src = attribs.src ?? ''
        // Keep inline data images; strip external 1×1 tracking pixels
        if (
          !src.startsWith('data:') &&
          !src.startsWith('cid:') &&
          (attribs.width === '1' || attribs.height === '1')
        ) {
          return { tagName: 'span', attribs: {} }
        }
        // Force external images to open blank
        return { tagName, attribs }
      },
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
      }),
    },
  })
}
