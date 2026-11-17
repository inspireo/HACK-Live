import { test, expect } from "@playwright/test";
import { clearFixtures, createFixtureUser, fixtureDb, password } from "../fixtures";
import { emptyDetails } from "../../shared/profile";
import { photoFixture } from "../photo-fixture";

for (const transition of ["different account", "same account recreated"] as const) {
  test(`pending real photo read cannot save into ${transition}`, async ({ page }) => {
    await clearFixtures();
    for (const memberUid of ["pending-owner-a", "pending-owner-b"]) {
      await createFixtureUser(memberUid);
      await fixtureDb.doc(`profileDetails/${memberUid}`).set({ ...emptyDetails(), professional: { bio: `Private ${memberUid}` }, contacts: { phone: memberUid.endsWith("-a") ? "+6581234567" : "+6587654321" } });
    }
    // Hold delivery of the real FileReader result; no upload/Auth/API substitute.
    await page.addInitScript(() => {
      const actualRead = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function(file) {
        const delivered = this.onload;
        this.onload = event => {
          (window as any).releaseOwnerPhotoRead = () => delivered?.call(this, event);
          (window as any).ownerPhotoReadReady = true;
        };
        actualRead.call(this, file);
      };
      const actualFetch = window.fetch.bind(window);
      (window as any).ownerPhotoSaveRequests = [];
      window.fetch = (...args) => {
        const pending = actualFetch(...args);
        if (String(args[0]).includes("/api/identity/save-profile")) (window as any).ownerPhotoSaveRequests.push(pending.then(response => response.clone().json()));
        return pending;
      };
    });
    await page.goto("/account");
    async function signIn(memberUid: string) {
      await page.getByLabel("Email", { exact: true }).fill(`${memberUid}@example.test`);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in with email", exact: true }).click();
      await expect(page.getByLabel("Bio", { exact: true })).toHaveValue(`Private ${memberUid}`);
    }
    await signIn("pending-owner-a");
    await page.getByLabel("Name", { exact: true }).fill("Private A pending name");
    await page.getByLabel("Photo (optional)", { exact: true }).setInputFiles(await photoFixture());
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).ownerPhotoReadReady)).toBe(true);
    expect((await fixtureDb.doc("profilePhotos/pending-owner-a").get()).exists).toBe(false);
    let targetUid: string;
    if (transition === "different account") {
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await signIn("pending-owner-b");
      targetUid = "pending-owner-b";
    } else {
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "Delete profile", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Create your profile", exact: true })).toBeVisible();
      await page.getByLabel("Name", { exact: true }).fill("Fresh recreated profile");
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toBeVisible();
      await expect.poll(async () => (await fixtureDb.doc("profiles/pending-owner-a").get()).data()?.name).toBe("Fresh recreated profile");
      await expect(page.getByLabel("Bio", { exact: true })).toHaveValue("");
      await expect(page.getByRole("alert")).toHaveCount(0);
      targetUid = "pending-owner-a";
    }
    const beforeName = (await fixtureDb.doc(`profiles/${targetUid}`).get()).data();
    const beforeDetails = (await fixtureDb.doc(`profileDetails/${targetUid}`).get()).data();
    const attemptedRequests = await page.evaluate(async () => {
      (window as any).releaseOwnerPhotoRead();
      // Newly signed-in B has a fresh cached real token. Flush the submit/token
      // microtasks, then await any actual HTTP mutation before checking storage.
      await new Promise(resolve => setTimeout(resolve, 0));
      await Promise.all((window as any).ownerPhotoSaveRequests);
      return (window as any).ownerPhotoSaveRequests.length;
    });
    expect((await fixtureDb.doc(`profiles/${targetUid}`).get()).data()).toEqual(beforeName);
    expect((await fixtureDb.doc(`profileDetails/${targetUid}`).get()).data()).toEqual(beforeDetails);
    expect((await fixtureDb.doc(`profilePhotos/${targetUid}`).get()).exists).toBe(false);
    expect(attemptedRequests).toBe(0);
    await expect(page.getByRole("status")).not.toHaveText("Profile saved.");
  });
}


test("first profile creation opens the private editor after committed activation without reload", async ({ page }) => {
  await clearFixtures(); await createFixtureUser("first-profile-owner");
  await fixtureDb.doc("profiles/first-profile-owner").delete();
  await page.goto("/account");
  await page.getByLabel("Email", { exact: true }).fill("first-profile-owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in with email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create your profile", exact: true })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("First fresh profile");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByLabel("Bio", { exact: true })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Mobile country code", exact: true })).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect((await fixtureDb.doc("profiles/first-profile-owner").get()).data()).toEqual({ name: "First fresh profile", state: "active" });
});
