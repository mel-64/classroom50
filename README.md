# classroom50-prototype

Prototype monorepo. Work in progress.

This repo is a sandbox for prototyping several independent components in one place. Each top-level folder is a self-contained piece that may eventually ship from its own repository.

## Layout

| Folder                   | Contents                                                      |
| ------------------------ | ------------------------------------------------------------- |
| [cli/](cli/)             | Command-line tools, packaged as `gh` CLI extensions.          |
| [workflows/](workflows/) | Reusable GitHub Actions workflows, consumable by other repos. |
| [web/](web/)             | Static web frontend, intended for GitHub Pages.               |

Each folder has its own README with a bit more detail.
