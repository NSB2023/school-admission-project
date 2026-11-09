# School Admission System — development workflow

Status: working API and React UI implemented. Native PostgreSQL integration and
Chrome acceptance tests pass. Docker configuration validates, but full container
startup remains unverified because this machine's Docker virtual disk is unhealthy.

Based on all five pages of `Asst_Software_Engineer_Project_Assignment.pdf`.
Working mode: Ponytail ultra + ECC tdd-workflow.

Deadline stated in the PDF: **11 November 2026, 11:59:59 PM**. This plan uses
Asia/Dhaka for scheduling; the PDF does not explicitly name a timezone.
Finish the working submission earlier on 11 November and keep time for verification.

## 1. Scope and priorities

Build one C#/.NET 8+ API, one PostgreSQL database, and one React 18+ frontend.
Use one deployable backend with a built-in expiry worker. Each class/shift is
an independent class record with its own capacity.

The priorities are:

1. Exact API contract and correct seat allocation under simultaneous requests.
2. Automatic expiry, ownership, duplicate prevention, and idempotent confirmation.
3. All required actions available through a usable UI.
4. Reliable Docker startup, persisted data, reproducible tests, and documentation.
5. Optional two-backend verification after the required functionality passes.

No login, real payment gateway, lottery, waitlist, Redis, message broker,
microservices, or elaborate UI is needed. Use the payment button to simulate
successful payment as the assignment specifies. Avoid generic repositories,
CQRS, and separate architectural projects for two database entities.

## 2. Small implementation shape

Proposed implementation choices, not additional assignment requirements:

- ASP.NET Core API with explicit request/response DTOs and one admission service.
- Npgsql with parameterized SQL and explicit transactions. An ORM is optional;
  direct SQL makes the capacity lock visible with very little infrastructure.
- React + TypeScript + Vite, native fetch, simple accessible CSS, and local state.
- xUnit for backend tests against a real, isolated PostgreSQL test database.
- Playwright for a small set of browser acceptance tests.
- Pin compatible package/container versions when scaffolding; use matching .NET
  SDK/runtime versions and commit dependency lockfiles.

Planned repository layout:

```text
backend/                    API, admission logic, expiry worker, SQL migrations
backend/tests/              unit and PostgreSQL-backed integration tests
frontend/                   React UI and browser tests
backend/Dockerfile
frontend/Dockerfile
docker-compose.yml          PostgreSQL + backend + frontend
README.md                   startup, URLs, configuration, test commands
ASSUMPTIONS.md              decisions the brief leaves open
AI_USAGE.md                 actual AI assistance, mistakes, and human verification
```

The application and its tests must not depend on the local AI skill collection.
There is currently no application test runner to detect. Resolve the actual
commands after scaffolding; ECC's JavaScript examples do not make this backend
a Node application.

## 3. Contract checklist — freeze before writing features

Base URL: `http://localhost:8080`. Preserve casing, raw array responses, fields,
and status codes. Do not wrap successful responses in a new `data` envelope.
IDs may use any consistent format.

| Endpoint | Required success response |
| --- | --- |
| `POST /classes` | 201; request `name`, `totalSeats`; response `id`, `name`, `totalSeats` |
| `GET /classes` | 200; array containing `id`, `name`, `totalSeats`, `heldSeats`, `confirmedSeats`, `availableSeats` |
| `GET /classes/{classId}` | 200; the same seat-summary fields for one class |
| `POST /classes/{classId}/holds` | 201; `holdId`, `classId`, `studentId`, `status`, `expiresAt`; no capacity returns 409 |
| `GET /holds/{holdId}` | 200; `holdId`, `classId`, `status`, `expiresAt` |
| `POST /holds/{holdId}/confirm` | 200; `holdId`, `status` |
| `DELETE /holds/{holdId}` | 204; empty response body |
| `GET /me/holds` | 200; array containing `holdId`, `classId`, `className`, `status`, `expiresAt` |

Student identity is a **17-digit string** in `X-Student-Id`; never parse it as
a number. The PDF explicitly requires this header for create-hold, confirm,
cancel, and my-holds operations. Decide and document ownership protection for
single-hold reads as well. Class creation and class browsing require no login.

Allowed statuses: `HELD`, `CONFIRMED`, `EXPIRED`, `CANCELLED`.
Use UTC timestamps serialized as ISO 8601. `HOLD_DURATION_SECONDS` defaults to
600 and must be configurable. Database connection and frontend backend URL
must also be configurable through environment variables.

## 4. State and database design

Keep two tables:

- `classes`: id, name, total_seats, created_at.
- `holds`: id, class_id, student_id, status, expires_at, created_at.

Use a foreign key, a positive-capacity check, a status check, and useful indexes
on class/status/expiry and student identity. Add a partial unique index on
`(class_id, student_id)` for stored `HELD` or `CONFIRMED` rows. Expire stale rows
inside the allocation transaction before attempting another hold, so the index
does not prevent a legitimate reapplication after expiry.

```text
                         payment before expiry
                    HELD ----------------------> CONFIRMED
                     |
                     +---- deadline reached ----> EXPIRED
                     |
                     +---- student cancels -----> CANCELLED
```

Count active holds only while `expires_at > current database time`.
`availableSeats = totalSeats - activeHeldSeats - confirmedSeats`.
Keep expired/cancelled rows as application history. Derive seat counts from the
holds table instead of maintaining a second mutable set of counters.

For every operation that changes occupancy:

1. Begin a short database transaction using READ COMMITTED isolation.
2. Lock the relevant class row with `SELECT ... FOR UPDATE`. Use the same
   class-first locking order for creation, confirmation, cancellation, and expiry.
3. Obtain database time **after** waiting for the lock; expire overdue HELD rows.
4. Re-read and validate current state, ownership, duplicate application, and
   available capacity in the transaction. Do not use values read before locking.
5. Apply one state transition and commit. Roll back on failure.

This is the proposed serialization point for each class; different classes can
proceed independently. No correctness rule may depend on an in-memory lock.
Treat first-come-first-served as database allocation order; HTTP arrival order
across concurrent clients is not an exact ordering guarantee.

Run a backend hosted expiry worker on startup and at a short interval, proposed
one second. It must release overdue holds without anyone calling an API and
must recover after a restart. The API must independently reject overdue
confirmation and exclude overdue holds from availability, even before the
worker's next pass. Select expired classes in batches and process one class
transaction at a time to keep locking simple.

## 5. Resolve unspecified behavior in ASSUMPTIONS.md

Before implementing each affected endpoint, record the choice and its reason:

| Question | Proposed choice |
| --- | --- |
| Same student applies again to the same class while HELD or CONFIRMED? | 409; no second occupied seat |
| Same student applies after EXPIRED or CANCELLED? | Allow a new hold if capacity exists |
| Repeated confirmation of their CONFIRMED hold? | 200 with CONFIRMED; no additional occupancy |
| Confirmation at exactly `expiresAt`? | Expired; eligibility requires time strictly before expiry |
| Confirm an expired/cancelled hold? | 409 with a useful JSON error |
| Cancel a confirmed admission? | 409; fee refund/confirmed-seat withdrawal is outside the brief |
| Repeat cancellation of a CANCELLED hold? | 204; cancellation is idempotent |
| Cancel an EXPIRED hold? | 409; leave the historical status EXPIRED |
| Read or mutate another student's hold? | 404, using the student header for single-hold reads too |
| Missing/malformed student header or invalid class input? | 400 with a useful JSON error |
| Unknown class/hold ID? | 404 |
| Negative/zero/non-integer capacity or blank name? | Reject; no artificial maximum unless justified |
| Identity after browser restart? | Persist the student ID locally, then fetch applications from the API |
| Student header security? | Assignment identity convention, not real authentication; use synthetic student IDs in demos |
| Frontend backend-URL configuration? | A documented environment variable; prefer a tiny runtime config if Compose overrides must work without rebuilding |

Do not silently add a rule limiting a student to one class overall: the stated
restriction is per class. Keep admin class creation accessible without inventing
an authentication or role-management flow.

## 6. Delivery phases and TDD gates

For each behavioral change: **write a failing test → run it and observe the
expected failure → implement the smallest complete change → pass → refactor**.
Commit meaningful completed slices as you work; do not manufacture commit history
or leave every commit until the end.

| Phase | Work | Required exit check |
| --- | --- | --- |
| 0. Contract and setup | Record assumptions, initialize Git, scaffold backend/frontend, migrations, Dockerfiles, Compose, test services | A fresh `docker compose up` builds and starts all three services without a host SDK or npm |
| 1. Classes | Test class creation, invalid input, list/detail shapes, and missing IDs; implement the three class endpoints | Exact JSON contracts; class created in UI remains after backend restart |
| 2. Seat allocation | Write concurrent capacity and duplicate-student tests against PostgreSQL first; implement locked hold creation | Simultaneous requests never create more occupied seats than capacity |
| 3. Lifecycle | Test owner-only confirmation/cancellation, repeated confirmation, expiry boundary, and autonomous release; add expiry worker | Races cannot resurrect an expired/cancelled hold or double-count confirmation |
| 4. Application reads | Test hold status, my-holds filtering/history, seat summaries, and identity validation | All eight API endpoints and required error cases pass contract tests |
| 5. UI | Add browser acceptance tests before completing each user journey; implement identity field, class creation/list, hold details, my applications | All required actions work through the browser |
| 6. Recovery and polish | Test restart persistence, polling, browser reopen, unavailable API, errors, and pending actions | Counts refresh every few seconds; expired holds update without reload; no blank error screens |
| 7. Submission | Run clean Docker smoke test, coverage, browser suite; finish documentation and inspect tracked files | Complete required artifacts, no PDF/secrets in public Git history, all mandatory checks green |
| 8. Bonus | Run two independent backend processes against one database and distribute concurrent requests between both | Same capacity/duplicate/state invariants hold; document evidence |

During setup define executable test commands for backend unit/integration tests,
coverage, frontend browser tests, and lint/build checks. Provide Docker-based test
commands in the README so the reviewer does not need .NET or Node installed.
Test services must be opt-in and must not block ordinary `docker compose up`.

## 7. Tests that prove the difficult behavior

The assignment requires at least three backend automated tests, including a
concurrency test. This workflow goes beyond that floor because state races are
the main risk. Keep tests focused on observable behavior, not private methods.

| Test | Evidence to assert |
| --- | --- |
| Capacity race | For a class with 5 seats, release 50 unique-student requests through a common start barrier; exactly 5 succeed and the rest return 409; persisted occupied seats equal 5 |
| Same-student race | Concurrent requests from one student for one class produce only one active application |
| Confirmation retry/race | Concurrent/repeated confirms on one valid hold leave one CONFIRMED record and one occupied seat |
| Confirmation vs cancellation | Only one valid terminal outcome; seat totals match that outcome |
| Confirmation vs expiry | An overdue hold cannot become CONFIRMED; no freed seat can be allocated twice |
| Autonomous expiry | Create a short hold, send no more API requests, then observe EXPIRED in the test database within the documented worker interval plus tolerance |
| Expiry boundary | Verify times just before, exactly at, and after expiry with a controllable time seam or deterministic fixtures; never change the production machine clock |
| Ownership | A second valid student identity cannot read, confirm, or cancel the first student's hold |
| Reapplication | After expiry/cancellation the same student can create a new hold without violating uniqueness |
| Contract/validation | All eight routes return the required fields/status codes; student IDs remain strings; list routes return arrays |
| Persistence | Normal `docker compose down` then `up` preserves classes and holds; overdue holds are recovered on startup |
| Browser journey | Admin creates class → student applies → pays → sees CONFIRMED after reload |
| Browser expiry/cancellation | Countdown expires and payment disables without reload; cancellation returns capacity; applications reload after reopening the browser |
| Browser error recovery | Sold out, malformed input, expired hold, and unavailable backend produce understandable visible errors and recoverable controls |

Use a real PostgreSQL database for lock/uniqueness tests; an in-memory provider
cannot demonstrate PostgreSQL transaction behavior. Isolate test data and use
independent connections/HTTP requests. Check the database invariant as well as
HTTP results. Re-run concurrency cases enough to catch obvious race regressions;
passing a stress test supplements, rather than replaces, the locking design.

Under ECC TDD, target at least **80% measured backend application coverage**,
including branch coverage where the chosen tool supports it. Exclude generated
code and migrations with a documented reason. Report browser acceptance results
separately; do not invent a combined unit/integration/E2E coverage percentage.
Frontend automated tests are a PDF bonus, but are included in this chosen TDD plan.

## 8. UI acceptance checklist

- Student ID input at the top; restore the value after refresh/browser reopen.
- Class creation form for name and seat capacity.
- Class list showing total, currently held, confirmed, and available seats.
- Apply action showing success, sold-out conflict, or duplicate-application error.
- Hold details with status, remaining time, pay, and cancel actions.
- My applications showing all the selected student's applications and statuses.
- Poll server state every few seconds, proposed three seconds; clean up timers.
- Countdown locally each second; at zero, disable payment immediately and
  reconcile status with the backend. The backend remains authoritative.
- After mutations, refetch affected class/application data; display errors and
  disable controls while requests are pending. Ignore stale responses after the
  student identity changes so one student's view does not replace another's.

## 9. Docker and submission checklist

- Root `docker-compose.yml`, backend/frontend Dockerfiles, PostgreSQL named volume.
- Backend reachable on host port 8080; frontend URL documented.
- Database readiness health check, deterministic schema setup, backend readiness,
  and useful startup failures. One migration step must avoid concurrent startup races.
- Configurable connection string, backend URL, and `HOLD_DURATION_SECONDS=600`.
- Frontend configuration must resolve the backend from the browser, not assume
  the browser can resolve a Docker-internal service hostname.
- Restrict CORS to the configured frontend origin when requests are cross-origin.
- Verify a fresh build without local node_modules, build output, or host SDKs.
- Verify normal down/up persistence; `down -v` intentionally removes the named
  volume and is a separate destructive reset, not the persistence test.
- README: startup/shutdown, frontend URL, configuration, tests, limitations.
- ASSUMPTIONS.md: record the selected policy choices and concurrency approach.
- AI_USAGE.md: record actual Codex/Ponytail/ECC assistance and actual corrections;
  do not invent AI mistakes or claim human verification that did not happen.
- Keep the assignment PDF and rendered/extracted copies out of the public repo.
  Check tracked files and history before publishing; `.gitignore` alone does not
  remove something already committed.
- Publish the finished code to the candidate's public GitHub repository and
  submit its URL through the form linked on PDF page 5 before the deadline.
  Publishing and form submission remain manual steps in this planning task.

## 10. Suggested schedule

| Date, Asia/Dhaka | Target |
| --- | --- |
| 9 November | Freeze contract/assumptions; Docker/test foundation; class endpoints; prove allocation concurrency |
| 10 November | Finish expiry/confirmation/cancellation and all API contracts; connect every required UI action |
| 11 November, first half | Browser recovery/error tests; coverage; clean Docker startup and persistence checks |
| 11 November, afternoon/evening | Documentation, repo review, submission; bonus only after all mandatory checks pass |

If time tightens, cut visual polish and the two-instance bonus first. Preserve
the required UI, exact API behavior, automatic expiry, concurrency safety,
minimum backend tests, Docker startup, and required documents.

## References for implementation

- [PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html): the class-row serialization strategy above is a project design based on these lock semantics.
- [Npgsql basic usage](https://www.npgsql.org/doc/basic-usage.html): parameterized SQL, connection pooling, and transactions.
- [ASP.NET Core integration tests](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests): HTTP test hosting with real supporting infrastructure where needed.
- [Playwright](https://playwright.dev/docs/intro): browser acceptance testing.

Implemented: application code, dependency lockfiles, Docker configuration, Git
initialization, all eight endpoints, background expiry, and the royal-blue,
foggy-white, orange-accented UI. Verified: 13 PostgreSQL-backed tests, 6 browser
tests, production frontend build, and Compose configuration. Measured backend
coverage: 96.4% lines and 94.73% branches.

Still required before release: execute full Docker build/startup/down-up persistence
on a healthy Docker engine, candidate review, public repository publication, and
submission. The optional two-process bonus has not been exercised. The CI workflow
is provided but has not run remotely. Every occupancy-changing code path follows
the same class-row database-lock protocol.
