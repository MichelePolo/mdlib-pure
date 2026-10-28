---
title: Release notes
date: 2026-10-28
tags: [markdown, commonmark]
---

# Front matter is not rendered

The YAML block at the top stays out of the HTML: `getFrontmatter(root)`
returns its raw text, with no YAML parser (zero dependencies).
