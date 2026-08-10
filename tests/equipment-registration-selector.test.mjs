import assert from "node:assert/strict";
import test from "node:test";
import {
  EQUIPMENT_REGISTER_SELECTOR_LIMIT,
  prependSelectedOption,
} from "../lib/equipment-registration-selector.ts";

test("selected equipment registration option remains available past the 200-row bound", () => {
  const allOptions = Array.from({ length: 201 }, (_, index) => ({
    id: `option-${index + 1}`,
  }));
  const initialOptions = allOptions.slice(0, EQUIPMENT_REGISTER_SELECTOR_LIMIT);
  const selectedOption = allOptions.at(-1);

  const options = prependSelectedOption(initialOptions, selectedOption);

  assert.equal(options.length, 201);
  assert.equal(options[0].id, "option-201");
  assert.equal(options.at(-1).id, "option-200");
});

test("selected equipment registration option is not duplicated", () => {
  const selectedOption = { id: "option-1" };

  assert.deepEqual(prependSelectedOption([selectedOption], selectedOption), [
    selectedOption,
  ]);
});
