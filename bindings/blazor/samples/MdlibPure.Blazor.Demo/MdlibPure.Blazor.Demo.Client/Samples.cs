namespace MdlibPure.Blazor.Demo.Client;

/// <summary>Markdown shown by the demo pages.</summary>
public static class Samples
{
    public const string Welcome = """
        ---
        title: Release notes
        ---

        # Release notes

        Write on the left, read on the right: the preview follows **every keystroke**,
        the C# value below follows after a short pause.

        ## What's new

        - [x] Tables, task lists and ~~strikethrough~~ (GFM)
        - [x] ==Highlights==, footnotes[^1] and autolinks: www.commonmark.org
        - [ ] Your feature here

        | Render mode | Preview | C# value |
        |:--|:--|:--|
        | Static SSR | in the browser | on form POST |
        | Interactive | in the browser | after a pause |

        > [!TIP]
        > Use the toolbar, or Ctrl+B, Ctrl+I, Ctrl+K.

        ::: warning Raw HTML is off
        <script>alert(1)</script> shows up as text, and [javascript: links](javascript:alert(1)) lose their URL.
        :::

        ## Math and diagrams

        Euler's identity, $e^{i\pi} + 1 = 0$, and a display formula:

        $$
        \int_0^1 x^2\,dx = \frac{1}{3}
        $$

        ```mermaid
        graph LR
          A[Markdown] --> B(mdlib-pure) --> C{Preview}
        ```

        Definition list
        : Term and definition, Pandoc style.

        [^1]: Rendered at the end, with a back reference.
        """;

    public const string Short = """
        **mdlib-pure** renders this in the browser: *CommonMark*, GFM tables, $\sqrt{2}$ and more.

        | Viewer | Editor |
        |--|--|
        | `<Markdown>` | `<MarkdownEditor>` |
        """;
}
