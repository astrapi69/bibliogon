"""YAML the application reads and writes.

Two concerns, deliberately together:

- :mod:`app.yaml.io` - round-trip read/write that preserves comments, blank
  lines and quote styles, for the config files the Settings UI saves back.
- :mod:`app.yaml.projection` - the contract for projecting one value out of a
  parsed document onto a field of a declared type.

Naming note for a reader inside this package: ``import yaml`` here still means
PyYAML. Python 3 resolves imports absolutely, so a package called ``app.yaml``
shadows nothing.
"""
