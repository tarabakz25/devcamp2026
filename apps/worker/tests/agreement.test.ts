import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeAgreementGaps,
  detectDecisionChange,
  isDecisionSatisfied,
  selectNextAgreementAction,
} from "../src/agreement.ts";
import type { DecisionItem, DecisionMethod, DecisionParticipant } from "../src/agreement.ts";

const timestamp = "2026-09-12T00:00:00.000Z";

function decision(method: DecisionMethod, overrides: Partial<DecisionItem> = {}): DecisionItem {
  return {
    id: "decision-1",
    threadId: "thread-1",
    decisionText: "試行を実施するか",
    proposal: "木曜にA棟2階で1日試す",
    proposalVersion: 1,
    method,
    status: "gathering",
    ownerUserId: "owner",
    deadline: null,
    evidenceMessageIds: ["message-1"],
    confidence: 0.9,
    snapshotToken: "snapshot-1",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function participant(
  userId: string,
  role: DecisionParticipant["role"],
  stance: DecisionParticipant["stance"],
  overrides: Partial<DecisionParticipant> = {},
): DecisionParticipant {
  return {
    decisionId: "decision-1",
    proposalVersion: 1,
    userId,
    userName: userId,
    role,
    stance,
    stanceSource: "analysis",
    condition: null,
    conditionResolution: null,
    evidenceMessageIds: [],
    confidence: 0.9,
    contactState: "responded",
    contactMode: "thread",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("isDecisionSatisfied", () => {
  it("owner_decides requires the owner's agreement", () => {
    const item = decision("owner_decides");
    assert.equal(isDecisionSatisfied(item, [participant("owner", "owner", "agreed")]), true);
    assert.equal(isDecisionSatisfied(item, [participant("owner", "owner", "unknown")]), false);
    assert.equal(isDecisionSatisfied(item, []), false);
  });

  it("required_approvals requires every owner and required participant", () => {
    const item = decision("required_approvals");
    const agreed = [participant("owner", "owner", "agreed"), participant("staff", "required", "agreed")];
    assert.equal(isDecisionSatisfied(item, agreed), true);
    assert.equal(
      isDecisionSatisfied(item, [agreed[0], participant("staff", "required", "unknown")]),
      false,
    );
    assert.equal(
      isDecisionSatisfied(item, [...agreed, participant("observer", "informed", "unknown")]),
      true,
    );
    assert.equal(isDecisionSatisfied(item, [participant("staff", "required", "agreed")]), false);
    assert.equal(isDecisionSatisfied(item, [participant("owner", "owner", "agreed")]), false);
    assert.deepEqual(
      computeAgreementGaps(item, [participant("staff", "required", "agreed")]).map((gap) => gap.kind),
      ["missing_owner"],
    );
  });

  it("uses ownerUserId as the authoritative owner", () => {
    const item = decision("owner_decides", { ownerUserId: "owner" });
    assert.equal(isDecisionSatisfied(item, [participant("other", "owner", "agreed")]), false);
    assert.equal(computeAgreementGaps(item, [participant("other", "owner", "agreed")])[0].kind, "missing_owner");
  });

  it("no_objection accepts silence only after contact and the deadline", () => {
    const item = decision("no_objection", { deadline: "2026-09-12T01:00:00.000Z" });
    const silent = participant("student", "consulted", "unknown", { contactState: "contacted" });
    assert.equal(isDecisionSatisfied(item, [silent], "2026-09-12T00:59:59.000Z"), false);
    assert.equal(isDecisionSatisfied(item, [silent], "2026-09-12T01:00:00.000Z"), true);
    assert.equal(
      isDecisionSatisfied(
        item,
        [participant("student", "consulted", "unknown", { contactState: "not_contacted" })],
        "2026-09-12T02:00:00.000Z",
      ),
      false,
    );
    assert.equal(
      isDecisionSatisfied(item, [participant("student", "consulted", "objected")], "2026-09-12T02:00:00.000Z"),
      false,
    );
  });

  it("unanimous requires every non-informed participant to agree", () => {
    const item = decision("unanimous");
    assert.equal(
      isDecisionSatisfied(item, [participant("owner", "owner", "agreed"), participant("student", "consulted", "agreed")]),
      true,
    );
    assert.equal(
      isDecisionSatisfied(item, [participant("owner", "owner", "agreed"), participant("student", "consulted", "unknown")]),
      false,
    );
    assert.equal(
      isDecisionSatisfied(item, [participant("owner", "owner", "agreed"), participant("student", "consulted", "not_applicable")]),
      false,
    );
  });

  it("requires a target and a deadline for no-objection decisions", () => {
    const noDeadline = decision("no_objection", { deadline: null });
    assert.deepEqual(
      computeAgreementGaps(noDeadline, [participant("student", "consulted", "unknown")]).map((gap) => gap.kind),
      ["missing_deadline", "awaiting_response"],
    );
    assert.deepEqual(computeAgreementGaps(decision("no_objection"), []).map((gap) => gap.kind), [
      "missing_required_participant",
      "missing_deadline",
    ]);
    assert.equal(
      isDecisionSatisfied(
        decision("no_objection", { deadline: "2026-09-12" }),
        [participant("student", "consulted", "not_applicable")],
        "2026-09-13T00:00:00+09:00",
      ),
      false,
    );
  });

  it("treats a date-only no-objection deadline as end of day in Japan", () => {
    const item = decision("no_objection", { deadline: "2026-09-12" });
    const silent = participant("student", "consulted", "unknown", { contactState: "contacted" });
    assert.equal(isDecisionSatisfied(item, [silent], "2026-09-12T23:59:00+09:00"), false);
    assert.equal(isDecisionSatisfied(item, [silent], "2026-09-13T00:00:00+09:00"), true);
  });

  it("does not mark discovering or reopened decisions satisfied", () => {
    const owner = participant("owner", "owner", "agreed");
    assert.equal(isDecisionSatisfied(decision("owner_decides", { status: "discovering" }), [owner]), false);
    assert.equal(isDecisionSatisfied(decision("owner_decides", { status: "reopened" }), [owner]), false);
  });
});

describe("agreement gaps and actions", () => {
  it("keeps a conditional agreement as a blocking unmet-condition gap", () => {
    const item = decision("required_approvals");
    const gaps = computeAgreementGaps(item, [
      participant("owner", "owner", "agreed"),
      participant("staff", "required", "conditional", { condition: "当番を決める" }),
    ]);
    assert.deepEqual(gaps.map((gap) => [gap.kind, gap.blocking]), [["unresolved_condition", true]]);
    assert.match(gaps[0].description, /当番を決める/);
  });

  it("asks for a resolution plan, then asks the person to confirm again", () => {
    const item = decision("required_approvals");
    const owner = participant("owner", "owner", "agreed");
    const conditional = participant("staff", "required", "conditional", { condition: "清掃当番を決める" });
    const resolutionAction = selectNextAgreementAction(item, [owner, conditional]);
    assert.equal(resolutionAction?.kind, "resolve_condition");

    const reconfirmAction = selectNextAgreementAction(item, [
      owner,
      { ...conditional, conditionResolution: "山田さんが金曜までに当番表を作る" },
    ]);
    assert.equal(reconfirmAction?.kind, "request_stance");
    assert.match(reconfirmAction?.question || "", /もう一度|合意できる/);
  });

  it("chooses one deterministic action and marks low-confidence actions for approval", () => {
    const item = decision("owner_decides", { confidence: 0.75 });
    const owner = participant("owner", "owner", "unknown");
    const first = selectNextAgreementAction(item, [owner]);
    const second = selectNextAgreementAction(item, [owner]);
    assert.deepEqual(first, second);
    assert.equal(first?.kind, "request_stance");
    assert.equal(first?.requiresApproval, true);
    assert.equal(first?.confidence, 0.75);
  });

  it("does not select a follow-up when no-objection silence is non-blocking", () => {
    const item = decision("no_objection", { deadline: "2026-09-12T01:00:00.000Z" });
    const silent = participant("student", "consulted", "unknown", { contactState: "contacted" });
    const gaps = computeAgreementGaps(item, [silent], "2026-09-12T02:00:00.000Z");
    assert.equal(gaps[0].blocking, false);
    assert.equal(selectNextAgreementAction(item, [silent], gaps), null);
  });
});

describe("detectDecisionChange", () => {
  it("ignores formatting-only changes but detects a changed proposal", () => {
    assert.equal(detectDecisionChange("木曜に 試す", " 木曜に\n試す "), false);
    assert.equal(detectDecisionChange("木曜に試す", "金曜に試す"), true);
    assert.deepEqual(detectDecisionChange({ proposal: "木曜", proposalVersion: 2 }, "金曜"), {
      changed: true,
      previousProposal: "木曜",
      nextProposal: "金曜",
      previousVersion: 2,
      nextVersion: 3,
    });
  });
});
