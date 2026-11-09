# Assumptions and decisions

- One class row represents one class/shift. Students can apply to multiple
  different classes but can hold only one HELD or CONFIRMED application per class.
- Class creation and browsing are public, as the assignment requires no login.
  `X-Student-Id` is the assignment's identity convention, not secure authentication.
  Validate 17 ASCII digits and keep the value as a string, including leading zeroes.
  Single-hold reads also require the owner's header; another identity receives 404.
- The student identity is saved only in this browser's local storage so applications
  can be restored after reopening it. Changing the number changes the selected
  student's view. Use synthetic identities for demonstrations.
- Capacity must be a positive integer, class names cannot be blank, and unknown
  resources return 404. Invalid input returns 400 with a JSON message. Full classes
  and incompatible application state transitions return 409.
- UTC database time controls expiry. A hold is expired at `expires_at <= now`.
  The database clock is sampled after acquiring the class lock, so a request
  waiting on another allocation does not use its earlier transaction-start time.
- Every mutation locks the same class row first. Under READ COMMITTED, occupancy
  and state are re-read after locking. The worker uses this same protocol.
  The partial unique index is a second guard against duplicate active applications.
  Expired HELD rows are transitioned before reapplication checks. Capacity is
  derived from holds rather than stored in separate mutable counters.
- First-come-first-served means allocation in database serialization order, not
  an exact promise about HTTP arrival order across clients or network connections.
- Confirmation is idempotent: repeated confirmation of an owned CONFIRMED hold
  returns 200. Cancellation is idempotent for CANCELLED holds and returns 204.
  CONFIRMED admissions cannot be cancelled because refunds are outside this brief.
  EXPIRED/CANCELLED holds cannot be confirmed. Cancelling EXPIRED returns 409.
- Expired and cancelled records remain in application history. Students can
  reapply after either state if capacity is available. Public hold responses keep
  their original expiry timestamp even in terminal states.
- The worker runs approximately once per second while the API is running; it
  resumes after restart. No work can execute while every backend is stopped.
  Overdue holds are nevertheless excluded from availability and rejected during
  confirmation, independently of whether a worker pass has completed.
- The UI polls every three seconds, updates its countdown every second, and
  blocks payment at expiry. The backend remains authoritative if the client clock
  is inaccurate or a competing request changes availability.
- Each shift is inferred from its display name only for optional UI filtering.
  This adds no shift field or requirement to the supplied API contract.
- The displayed academic year is the next calendar year; class names and
  capacities are configured through the UI. The database starts empty.
- The revised visual palette is deep blue `rgb(11, 58, 99)` and fog white
  `rgb(228, 232, 237)`. Orange `rgb(255, 145, 0)` is applied to the user-selected
  outlines, icons, labels, guide digits, and graduation ribbon. Schoolgate is the portal name.
- The school is a generated, transparent paper-cut illustration based on the
  user's architectural reference. Weather is a separate presentation layer:
  Morning places the sun on the right with clouds; Day places it above the school
  and hides both clouds. The two hero controls share the class filter's state.
  All shifts defaults to the morning scene while showing every class.
- The School sign and clearer analog clock are SVG facade details aligned to
  the original image's coordinate system, so they scale with the building.
  Buttons use pill shapes, and tablet hero controls share the same width/alignment.
- Browser tests are an optional assignment feature included in this TDD workflow.
  Two-process deployment is not required for the core submission. The locking
  design has no in-memory coordination requirement, but multi-process and Docker
  runtime verification must be reported separately from single-host test results.
- The PDF's deadline is interpreted in Asia/Dhaka for planning; no timezone is
  explicitly printed in the source brief.
