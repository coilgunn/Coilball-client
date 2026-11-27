export function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

const SAFE_HTML_TAGS = new Set(['strong', 'em', 'b', 'i', 'code', 'kbd', 'br', 'span', 'div', 'p', 'h4', 'small']);
const DROPPED_HTML_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript']);
const SAFE_HTML_ATTRS = new Set(['class', 'title', 'style']);
const UNSAFE_CSS_RE = /(?:url\s*\(|expression\s*\(|javascript:|@import)/i;

function appendSanitizedNodes(parent, nodeList) {
  for (const node of nodeList) {
    if (node.nodeType === 3) {
      parent.appendChild(document.createTextNode(node.nodeValue || ''));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const tag = node.tagName.toLowerCase();
    if (DROPPED_HTML_TAGS.has(tag)) continue;
    if (!SAFE_HTML_TAGS.has(tag)) {
      appendSanitizedNodes(parent, node.childNodes);
      continue;
    }
    const clone = document.createElement(tag);
    for (const attr of node.attributes) {
      const name = attr.name.toLowerCase();
      if (!SAFE_HTML_ATTRS.has(name)) continue;
      if (name === 'style' && UNSAFE_CSS_RE.test(attr.value)) continue;
      clone.setAttribute(name, attr.value);
    }
    appendSanitizedNodes(clone, node.childNodes);
    parent.appendChild(clone);
  }
}

/** Parse and render HTML into an element using a strict tag/attribute allowlist. */
export function setSafeHtml(el, html) {
  if (!el) return;
  const raw = String(html ?? '');
  if (!raw) {
    el.replaceChildren();
    return;
  }
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const frag = document.createDocumentFragment();
  appendSanitizedNodes(frag, doc.body.childNodes);
  el.replaceChildren(frag);
}
