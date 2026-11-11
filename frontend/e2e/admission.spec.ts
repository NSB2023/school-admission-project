import { test, expect } from "@playwright/test";

const studentId = "20152691234567890";
const backendUrl = process.env.API_URL || "http://localhost:8080";

test("main navigation brings classes and applications into view", async ({
  page,
}) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation.getByRole("button", { name: "Available classes" }).click();
  await expect(
    page.getByRole("heading", { name: /Find your next classroom/ }),
  ).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await navigation.getByRole("button", { name: /My applications/ }).click();
  await expect(
    page.getByRole("heading", { name: /Your applications/ }),
  ).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await navigation.getByRole("button", { name: "Available classes" }).click();
  await expect(
    page.getByRole("heading", { name: /Find your next classroom/ }),
  ).toBeInViewport();
});

test.beforeEach(async ({ page }) => {
  if (process.env.API_URL) {
    await page.route("**/config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.__CONFIG__ = ${JSON.stringify({ apiUrl: backendUrl })};`,
      }),
    );
  }
});

test("create a class, apply, pay, and restore applications after reopening", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create a class" });
  const name = `Class 6 – Morning ${Date.now()}`;
  await dialog.getByLabel("Class name").fill(name);
  await dialog.getByLabel("Total seats").fill("5");
  await dialog
    .getByRole("button", { name: "Create class", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("Birth registration number").fill(studentId);
  const card = page.getByRole("article", { name });
  await card.getByRole("button", { name: "Apply now" }).click();
  await expect(
    page.getByRole("dialog", { name: "Your seat is reserved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pay admission fee" }).click();
  await expect(
    page.getByRole("dialog", { name: "Admission confirmed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: /My applications/ })
    .first()
    .click();
  await expect(
    page.getByRole("article", { name }).getByText("Confirmed", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Birth registration number")).toHaveValue(
    studentId,
  );
  await page
    .getByRole("button", { name: /My applications/ })
    .first()
    .click();
  await expect(page.getByRole("article", { name })).toBeVisible();
});

test("cancel a reservation and release its seat", async ({ page, request }) => {
  const name = `Class 7 – Day ${Date.now()}`;
  const created = await request.post(`${backendUrl}/classes`, {
    data: { name, totalSeats: 1 },
  });
  expect(created.status()).toBe(201);
  await page.goto("/");
  await page.getByLabel("Birth registration number").fill(studentId);
  const card = page.getByRole("article", { name });
  await card.getByRole("button", { name: "Apply now" }).click();
  await page.getByRole("button", { name: "Cancel reservation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Your seat is reserved" }),
  ).not.toBeVisible();
  await expect(
    card.getByText("1 seat available", { exact: true }),
  ).toBeVisible();
});

test("invalid identity is explained before a request is sent", async ({
  page,
  request,
}) => {
  const name = `Class 8 – Morning ${Date.now()}`;
  await request.post(`${backendUrl}/classes`, {
    data: { name, totalSeats: 2 },
  });
  await page.goto("/");
  await page.getByLabel("Birth registration number").fill("123");
  await page
    .getByRole("article", { name })
    .getByRole("button", { name: "Apply now" })
    .click();
  await expect(page.getByRole("alert")).toContainText("17-digit");
});

test("network failures show a useful recovery action", async ({ page }) => {
  await page.route("**/classes", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("connect");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("mobile layout stays inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A bright future starts here." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("expired reservations update and stop payment without a reload", async ({
  page,
}) => {
  let hold: Record<string, unknown> | null = null;
  await page.route("**/classes", (route) =>
    route.fulfill({
      json: [
        {
          id: "expiry-class",
          name: "Class 9 – Morning Shift",
          totalSeats: 1,
          heldSeats: 0,
          confirmedSeats: 0,
          availableSeats: 1,
        },
      ],
    }),
  );
  await page.route("**/me/holds", (route) =>
    route.fulfill({ json: hold ? [hold] : [] }),
  );
  await page.route("**/classes/expiry-class/holds", (route) => {
    hold = {
      holdId: "expiry-hold",
      classId: "expiry-class",
      className: "Class 9 – Morning Shift",
      studentId,
      status: "HELD",
      expiresAt: new Date(Date.now() + 2000).toISOString(),
    };
    return route.fulfill({ status: 201, json: hold });
  });
  await page.goto("/");
  await page.getByLabel("Birth registration number").fill(studentId);
  await page
    .getByRole("article", { name: "Class 9 – Morning Shift" })
    .getByRole("button", { name: "Apply now" })
    .click();
  await expect(
    page.getByRole("button", { name: "Pay admission fee" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("dialog", { name: "This reservation has expired" }),
  ).toBeVisible({ timeout: 6000 });
  await expect(
    page.getByRole("button", { name: "Pay admission fee" }),
  ).toHaveCount(0);
});

test("paper-cut scene follows the selected shift and filters its classes", async ({
  page,
}) => {
  await page.route("**/classes", (route) =>
    route.fulfill({
      json: [
        {
          id: "morning",
          name: "Class 6 – Morning Shift",
          totalSeats: 10,
          availableSeats: 10,
          heldSeats: 0,
          confirmedSeats: 0,
        },
        {
          id: "day",
          name: "Class 6 – Day Shift",
          totalSeats: 10,
          availableSeats: 10,
          heldSeats: 0,
          confirmedSeats: 0,
        },
      ],
    }),
  );
  await page.goto("/");
  const selector = page.getByRole("group", { name: "Choose your shift" });
  const school = page.getByRole("img", { name: "Paper-cut school building" });
  const sun = page.getByRole("img", { name: "Sun", exact: true });
  const clouds = page.getByRole("img", { name: "Clouds", includeHidden: true });
  await selector
    .getByRole("button", { name: "Morning shift", exact: true })
    .click();
  await expect(clouds).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Class 6 – Day Shift" }),
  ).toHaveCount(0);
  await expect
    .poll(async () => {
      const a = (await sun.boundingBox())!,
        b = (await school.boundingBox())!;
      return a.x + a.width / 2 > b.x + b.width * 0.65;
    })
    .toBe(true);
  await selector
    .getByRole("button", { name: "Day shift", exact: true })
    .click();
  await expect(clouds).toBeHidden();
  await expect(
    page.getByRole("article", { name: "Class 6 – Morning Shift" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: "Class 6 – Day Shift" }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const a = (await sun.boundingBox())!,
        b = (await school.boundingBox())!;
      return (
        Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) < b.width * 0.12 &&
        a.y < b.y
      );
    })
    .toBe(true);
});

test("desktop headline sits beside the school rather than covering it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const heading = await page
    .getByRole("heading", { name: "A bright future starts here." })
    .boundingBox();
  const school = await page
    .getByRole("img", { name: "Paper-cut school building" })
    .boundingBox();
  expect(heading).not.toBeNull();
  expect(school).not.toBeNull();
  expect(heading!.x + heading!.width).toBeLessThanOrEqual(school!.x + 30);
  expect(heading!.y).toBeLessThan(school!.y + school!.height);
});

test("hero action and shift buttons align at tablet width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 1050 });
  await page.goto("/");
  const action = (await page
    .getByRole("button", { name: "Find your place", exact: true })
    .boundingBox())!;
  const group = page.getByRole("group", { name: "Choose your shift" });
  for (const name of ["Morning shift", "Day shift"]) {
    const shift = (await group
      .getByRole("button", { name, exact: true })
      .boundingBox())!;
    expect(Math.abs(shift.x - action.x)).toBeLessThan(1);
    expect(Math.abs(shift.width - action.width)).toBeLessThan(1);
  }
});
