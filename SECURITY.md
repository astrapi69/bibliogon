# Security Policy

## Supported Versions

Bibliogon is pre-1.0 software. Only the latest minor version
(currently v0.30.x) receives security fixes. Users on older
versions should upgrade to the latest minor.

| Version | Supported          |
| ------- | ------------------ |
| 0.30.x  | :white_check_mark: |
| < 0.30  | :x:                |

## Reporting a Vulnerability

Please report security vulnerabilities through GitHub's
**Private Vulnerability Reporting** feature:

1. Navigate to https://github.com/astrapi69/bibliogon/security
2. Click "Report a vulnerability"
3. Provide a clear description, reproduction steps, and an
   impact assessment

We aim to acknowledge reports within 7 days and provide a
fix or mitigation timeline within 14 days for confirmed
vulnerabilities.

Please do **not** open a public GitHub Issue for security
reports. Public Issues for non-security bugs remain the right
channel.

## Out of Scope

Bibliogon runs locally on user machines via Docker. The
following are explicitly out of scope:

- Issues that require physical access to the user's machine
- Issues in third-party dependencies that have not been
  reported upstream first
- Issues in user-provided plugins not maintained by the
  Bibliogon team

## Disclosure Policy

We follow coordinated disclosure: a vulnerability is publicly
disclosed only after a fix is available, typically as part of
the next patch release with a security note in the CHANGELOG.

## Acknowledgments

Reporters who follow this process receive credit in the
release notes unless they prefer to remain anonymous.
