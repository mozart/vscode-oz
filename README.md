vscode-oz brings the magic of Oz to vscode
==========================================

[![Latest Version](https://img.shields.io/github/tag/mozart/vscode-oz.svg?style=flat-square)](https://github.com/mozart/vscode-oz/releases)
[![Published version](https://img.shields.io/visual-studio-marketplace/v/mozart-oz.vscode-oz.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=mozart-oz.vscode-oz)
[![Installs](https://img.shields.io/visual-studio-marketplace/d/mozart-oz.vscode-oz.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=mozart-oz.vscode-oz)
[![Issues](https://img.shields.io/github/issues/mozart/vscode-oz.svg?style=flat-square)](https://github.com/mozart/vscode-oz/issues)

This extension adds support for the Mozart/Oz language to Visual Studio Code. It provides code evaluation, syntax coloring, and common snippets.

For this extension to work, you first have to install Oz on your machine, which is installed with the Mozart Programming System.
Please visit the [Mozart website](http://mozart2.org/) and follow instructions.

The usual shortcuts are implemented to evaluate code fragments:

- `ctrl+. ctrl+l` (feed line)
- `ctrl+. ctrl+b` (feed file)
- `ctrl+. ctrl+r` (feed selection)
- `ctrl+alt+x` (feed paragraph)

Linter
------

To use the linter included in this extension set `oz.enableLinter` to `true`. This linter will only show any error or warning when feeding code to the engine for the current file.
