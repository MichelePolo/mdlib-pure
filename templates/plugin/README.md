# Plugin template

A complete, tested plugin to copy. It implements emoji shortcodes
(`:tada:` → 🎉) and runs as part of `npm test`, so it never goes stale.

```sh
cp -r templates/plugin src/plugins/my-feature   # or into your own project
```

Then:

1. Pick the extension point (decision tree in [`AGENTS.md`](../../AGENTS.md)).
2. Replace the rule, the node type and the render function.
3. Document the AST node shape at the top of `plugin.ts`.
4. Keep the five test groups: positive, negative, interaction with core
   syntax, AST shape, adversarial input.
5. Run `npm run verify`.
