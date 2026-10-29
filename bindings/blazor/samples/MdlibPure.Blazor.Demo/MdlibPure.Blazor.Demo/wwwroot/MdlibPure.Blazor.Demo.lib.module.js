// The app's own JS initializer: Blazor loads `<AssemblyName>.lib.module.js`
// from the app's wwwroot by itself, like the one of MdlibPure.Blazor.
//
// It registers a named config, selected in Razor with Config="demo". Options
// that are functions (syntax highlighting, URL policy, extra attributes…) can
// only be set here, in JavaScript, never from C# or from attributes.
export async function beforeWebStart() {
  const { defineElements } = await import('./_content/MdlibPure.Blazor/dist/mdlib-element.js')
  defineElements({
    configs: {
      demo: {
        // External links open in a new tab.
        attributes: (node) => (node.type === 'link' && /^https?:/i.test(node.url) ? { target: '_blank', rel: 'noopener noreferrer' } : null),
      },
    },
  })
}
