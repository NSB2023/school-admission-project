# AI usage

Codex assisted with reading the assignment, writing WORKFLOW.md, implementing
the API, PostgreSQL transaction design, expiry worker, React UI, Docker setup,
tests, and documentation. The local Ponytail ultra and ECC TDD/frontend/security
skills were used as development guidance. The user specified the royal-blue,
foggy-white, and restrained-orange palette.

Tests were written against placeholder backend/UI implementations first. The
initial API contract test failed because class creation returned 501, and the
initial browser test failed because the admissions screen was not implemented.
Subsequent checks ran against real PostgreSQL and Chrome.

Issues caught and corrected during AI-assisted verification:

- ASP.NET's default binding behavior returned an empty 400 body for malformed
  fields in Production, even though the Development-host test passed. A separate
  production-mode regression test exposed this. Request-binding errors were then
  routed through the API's JSON error handler.
- The reservation cancellation browser test exposed a missing space between the
  visible seat count and its label. The UI text was corrected and the suite rerun.
- A settings review caught that changing the Compose PostgreSQL password would
  leave the default backend connection string using the old password. Compose
  interpolation now keeps those settings together.
- A runtime-configuration self-check caught that a line-based control-character
  check did not reject newline characters. An explicit single-line check was
  added before generating the browser's JSON configuration.
- Docker Desktop could not start because its existing virtual disk reported
  filesystem errors. Verification used a temporary .NET SDK and isolated native
  PostgreSQL server instead. Docker data was not reset, and container startup is
  explicitly reported as unverified rather than passed.

Automated results are documented in the README and generated test reports.
No claim is made that the candidate has personally reviewed every generated line.
Before submission, the candidate should review the transaction and expiry logic,
run Docker on a healthy engine, and ensure this file reflects their actual usage.
