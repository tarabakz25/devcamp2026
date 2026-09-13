import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getScenario, SCENARIOS } from "../src/seed.ts";

describe("demo scenarios", () => {
  it("contains the three selectable topics with matching speakers", () => {
    assert.deepEqual(Object.keys(SCENARIOS), ["breakfast", "eblock", "hygiene"]);

    for (const scenario of Object.values(SCENARIOS)) {
      assert.ok(scenario.title);
      assert.ok(scenario.description);
      assert.ok(scenario.stakeholders.length > 0);
      assert.ok(scenario.messages.length > 0);

      const stakeholderIds = new Set(scenario.stakeholders.map((person) => person.user_id));
      assert.ok(
        scenario.messages.every((message) => stakeholderIds.has(message.user_id)),
        `${scenario.id} has a scripted message from an unknown stakeholder`,
      );
    }
  });

  it("falls back to breakfast only for internal compatibility reads", () => {
    assert.equal(getScenario("unknown").id, "breakfast");
    assert.equal(getScenario(null).id, "breakfast");
  });
});
