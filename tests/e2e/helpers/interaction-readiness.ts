import { expect, type Locator } from "@playwright/test";

type ReadyAssertion = () => Promise<void>;

const readinessOptions = {
  intervals: [100, 250, 500],
  timeout: 15_000,
};

export async function clickUntilState(trigger: Locator, ready: ReadyAssertion) {
  await expect(async () => {
    try {
      await ready();
      return;
    } catch {
      // The server-rendered control can be visible before React owns the event.
    }

    await trigger.click();
    await ready();
  }).toPass(readinessOptions);
}

export async function openCombobox(combobox: Locator) {
  await clickUntilState(combobox, () =>
    expect(combobox).toHaveAttribute("aria-expanded", "true", {
      timeout: 1_000,
    }),
  );
}

export async function setInputFilesUntilState(
  input: Locator,
  files: Parameters<Locator["setInputFiles"]>[0],
  ready: ReadyAssertion,
) {
  await expect(async () => {
    try {
      await ready();
      return;
    } catch {
      // Retry the change event after hydration, clearing the same-file value first.
    }

    await input.setInputFiles([]);
    await input.setInputFiles(files);
    await ready();
  }).toPass({ ...readinessOptions, timeout: 20_000 });
}
