# Changelog

The extension has its own version. Each entry says which version of the Skeudo format it reads, since sketches follow the format's version, listed in the [main changelog](https://github.com/wlezzar/skeudo/blob/main/CHANGELOG.md).

## 0.1.0

The first release. It reads format 0.1.

- Highlights sketches in `.skeudo` files and in Markdown fences tagged `skeudo` or `sketch`, for both views, `code` and `data`.
- Renders sketches in the Markdown preview, with highlighted variables, `::doc` explanations, and data sketches you step through.
- Opens `::src` links in a local copy of the repository a sketch names with `::repo`, and marks them amber when the file has changed since the sketch's revision.
