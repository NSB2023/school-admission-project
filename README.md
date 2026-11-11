# Schoolgate — School Admission System

A school-admission portal with temporary seat reservations, automatic expiry,
simulated payment, and application history. The paper-cut landing page uses deep
blue `rgb(11, 58, 99)` and fog white `rgb(228, 232, 237)`, with a wide textured
school illustration and an oval fog transition that returns to blue at the footer.
Orange `rgb(255, 145, 0)` accents the rounded sun rays, paper-plane icons, search,
class-card borders, selected text, and the graduation cap's ribbon.

## Run with Docker

Install and start Docker, then run from the repository root:

```sh
docker compose up --build
```

- Frontend: **http://localhost:3000**
- Backend: **http://localhost:8080**
- Database-backed health endpoint: **http://localhost:8080/health**

No host .NET SDK, Node, or PostgreSQL installation is required for this path.
The database schema is initialized on backend startup. A PostgreSQL advisory
lock serializes schema setup if multiple API instances start together.
The fresh database starts empty: choose **Create class** in the UI, enter a
class/shift name and seat count. Each shift is a separate class, such as
`Class 6 – Morning Shift` and `Class 6 – Day Shift`.

Under **Who is applying?**, enter a synthetic 17-digit birth registration number
such as `20152691234567890`. This selects the student for subsequent actions;
entering the number alone does not create an application. Changing the number
switches whose applications are shown. No sign-in or sign-out is required, and
the number is not verified against government records. Class creation is the
school admin's action and does not require a student number.

Select **Apply now**, then **Pay admission fee** before the reservation expires.
Payment is simulated; no payment details or money are collected. Cancel from
the reservation dialog, or find the selected student's application history through
**My applications**. **Available classes** and **My applications** scroll directly
to their lists. The **Classes** count includes each class/shift entry; **Available
seats** shows the remaining capacity across all classes, alongside total capacity.

Stop with `docker compose down`. Normal down/up preserves the named PostgreSQL
volume. **`docker compose down -v` intentionally deletes the stored data.**

## Configuration

Defaults work without an environment file. For overrides, copy `.env.example`
to `.env` and adjust it before starting Compose.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `admission-local` | Local Compose database password; default connection string follows this value |
| `DATABASE_CONNECTION_STRING` | Built from the Compose database settings | Optional full PostgreSQL connection string override |
| `HOLD_DURATION_SECONDS` | `600` | Positive reservation duration in seconds |
| `BACKEND_URL` | `http://localhost:8080` | Backend URL used by the browser; loaded at frontend container startup, without a rebuild |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Allowed frontend origin for CORS |

For running the API outside Compose, set `ConnectionStrings__Database` directly.
For Vite development, set `VITE_API_URL` (default `http://localhost:8080`).
The development origin `http://localhost:5173` and Docker browser-test origin
`http://frontend` are also allowed. Never put database credentials in a browser
environment variable. The default database password is for local development.

## Tests

Backend integration tests use a separate, temporary PostgreSQL service and never
target the normal Compose application's database:

```sh
docker compose --profile test run --build --rm backend-tests --collect:"XPlat Code Coverage" --results-directory /results
```

The suite covers all eight endpoint contracts, validation in production mode,
ownership, duplicate-student races, confirmation retries, cancellation races,
expiry without API traffic, and 50 simultaneous attempts for five seats.
Coverage reports are written under `backend/TestResults/`; the ECC target is
at least 80% backend application line coverage, with branch coverage also reported.
The supplied GitHub Actions workflow enforces at least 80% for both metrics and
runs the Docker build and browser suite on a healthy runner when pushed.

Run browser tests after starting the app:

```sh
docker compose up --build -d
docker compose --profile test run --build --rm frontend-tests
```

The browser suite verifies create/apply/pay, identity restoration after reload,
cancellation and capacity release, validation, network errors, mobile layout,
frontend expiry behavior, navigation to both lists, the shift-controlled sun/cloud
scene, desktop headline placement, and tablet button alignment. The frontend expiry test uses controlled API
responses; autonomous database expiry is tested against PostgreSQL separately.
**Browser tests create synthetic classes/applications in the running app's
database. Use a disposable Compose project for an isolated browser test run:**

```sh
docker compose -p schoolgate-browser up --build -d
docker compose -p schoolgate-browser --profile test run --build --rm frontend-tests
docker compose -p schoolgate-browser down
```

Stop another project using host ports 3000/8080 first. This separate project
uses its own named database volume. Add `-v` to the final teardown only when
you intend to discard that test project's data.

For local development with the .NET 10 SDK and an existing PostgreSQL database:

```sh
export ConnectionStrings__Database='Host=localhost;Database=admission_tests;Username=admission;Password=your-local-password'
dotnet test backend/tests/Admission.Tests.csproj --collect:"XPlat Code Coverage"
```

To run the frontend locally with a compatible Node version:

```sh
cd frontend
npm ci
npm run dev
npm run build
npm test
```

Local browser tests use installed Google Chrome. In a machine without Chrome,
install Playwright's Chromium and run with `CI=1 npm test`. The Docker browser
test image includes its browsers. `APP_URL` and `API_URL` can point browser
tests at another running frontend/backend pair.

## Implementation

- .NET 10 Minimal API and Npgsql parameterized SQL.
- PostgreSQL with two tables and a unique index for active student/class pairs.
- Every occupancy mutation locks its class row in a database transaction.
  Confirmation, cancellation, new reservations, and background expiry follow
  the same class-first locking order. Database time is read after lock acquisition.
- A hosted worker expires overdue reservations every second and on startup.
  API reads also derive the correct expiry state; confirmation checks expiry
  inside its transaction, independently of the worker schedule.
- React + TypeScript + Vite; native fetch, three-second polling, a one-second
  countdown, and a locally saved student identity. Expired reservations do not
  permit payment. Native dialogs provide modal focus behavior.
- Both fonts are bundled locally with their OFL licenses. No analytics, payment
  service, or third-party runtime font requests are used.

See `ASSUMPTIONS.md` for policy decisions and `AI_USAGE.md` for AI assistance.
The confidential assignment PDF is excluded from Git and Docker build contexts.
The `.agents` skill collection is local development tooling and is not part of
the application build.

## Verification on this development machine

Verified locally as of 11 November 2026:

- **13 backend test cases passed** against native PostgreSQL; measured backend
  coverage was **96.4% lines and 94.73% branches**.
- **10 Chrome browser tests passed** against the Docker application, covering the
  admission flow and UI behavior. Navigation and mobile-layout checks also passed
  after the subsequent wording update.
- Production frontend builds and Docker Compose startup passed. PostgreSQL,
  backend, and frontend containers report healthy.
- A complete `docker compose down` followed by `docker compose up -d --wait`
  preserved all existing class and application records. A temporary class with
  one confirmed admission and one active reservation retained its application
  states, expiry timestamp, and seat totals. Only those temporary verification
  records were removed afterward; the database was backed up before the check.
- Production-mode malformed-input JSON responses and browser CORS were checked.

The optional two-backend-process bonus has not been exercised. PostgreSQL row
locks provide the coordination, but that deployment scenario remains unverified.
