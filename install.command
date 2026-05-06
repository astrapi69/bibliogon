#!/usr/bin/env bash
# Bibliogon macOS doppelklickbar wrapper.
# Finder runs this file directly; cd to its directory, then invoke
# install.sh which carries the canonical version. No version
# placeholder lives here so this file does NOT participate in the
# release-time sync chain. Adding a ".command" extension is what
# makes Finder treat the file as runnable on a double-click.
set -e
cd "$(dirname "$0")"
bash install.sh
