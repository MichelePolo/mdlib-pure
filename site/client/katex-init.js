// Typeset the output of the math plugin (\(…\) and \[…\]) with KaTeX
// auto-render. Only rendered output is touched, never the Markdown sources.
for (const el of document.querySelectorAll('[data-katex]')) {
  window.renderMathInElement(el, {
    delimiters: [
      { left: '\\(', right: '\\)', display: false },
      { left: '\\[', right: '\\]', display: true },
    ],
    throwOnError: false,
  })
}
