import assert from "node:assert/strict";
import test from "node:test";
import {
  EQUIPMENT_REGISTER_SELECTOR_LIMIT,
  matchesScheduleDiscoveryQuery,
  parseScheduleDiscoveryQuery,
  prependSelectedOption,
  scheduleSelectorOptions,
} from "../lib/equipment-registration-selector.ts";

test("course search discovers a schedule beyond the initial 200-row bound", () => {
  const allOptions = Array.from({ length: 201 }, (_, index) => ({
    id: `option-${index + 1}`,
    schedule_date: "2049-08-10",
    course_code_snapshot: index === 200 ? "NUR 999" : "NUR 101",
  }));
  const initialOptions = allOptions.slice(0, EQUIPMENT_REGISTER_SELECTOR_LIMIT);
  const target = allOptions.at(-1);
  const query = parseScheduleDiscoveryQuery("NUR 999");

  assert.ok(query);
  assert.ok(!initialOptions.some(({ id }) => id === target.id));
  const discovered = allOptions.filter((option) =>
    matchesScheduleDiscoveryQuery(option, query),
  );

  assert.deepEqual(discovered, [target]);
  assert.deepEqual(scheduleSelectorOptions(initialOptions, discovered, query), [
    target,
  ]);
});

test("date search uses an exact future schedule date", () => {
  assert.deepEqual(parseScheduleDiscoveryQuery("2049-08-10"), {
    kind: "date",
    value: "2049-08-10",
  });
});

test("selected equipment registration option is not duplicated", () => {
  const selectedOption = { id: "option-1" };

  assert.deepEqual(prependSelectedOption([selectedOption], selectedOption), [
    selectedOption,
  ]);
});
