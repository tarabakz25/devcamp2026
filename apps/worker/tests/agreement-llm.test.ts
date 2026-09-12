import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeAgreement } from "../src/llm.ts";

const candidates = [
  { user_id: "U-STAFF", name: "寮スタッフ", role: "寮スタッフ", interests: "居住環境" },
  { user_id: "U-STUDENT", name: "学生代表", role: "学生", interests: "朝の準備負担" },
];

describe("dummy agreement analysis", () => {
  it("does not turn a completed status update into a decision", async () => {
    const analysis = await analyzeAgreement(
      {},
      "dummy",
      [
        { id: "m1", user_id: "U-STAFF", text: "明日の朝食は7時からA棟2階で用意します。" },
        { id: "m2", user_id: "U-STUDENT", text: "確認しました。全員への共有も完了しました。" },
      ],
      candidates,
    );

    assert.equal(analysis.is_decision, false);
  });

  it("uses past roles for relevance but not as evidence of a current stance", async () => {
    const analysis = await analyzeAgreement(
      {},
      "dummy",
      [{ id: "m1", user_id: "U-STUDENT", text: "朝食会場をA棟2階へ移す案はどう決めますか？" }],
      candidates,
    );

    assert.equal(analysis.is_decision, true);
    assert.equal(analysis.participants.find((person) => person.user_id === "U-STAFF")?.stance, "unknown");
    assert.deepEqual(
      analysis.participants.find((person) => person.user_id === "U-STAFF")?.evidence_message_ids,
      [],
    );
  });

  it("requires explicit change evidence before versioning a prior proposal", async () => {
    const unchanged = await analyzeAgreement(
      {},
      "dummy",
      [{ id: "m1", user_id: "U-STUDENT", text: "朝食会場はA棟2階を使う案について確認したいです。" }],
      candidates,
      "学生の朝食会場をA棟2階へ移す",
    );
    const changed = await analyzeAgreement(
      {},
      "dummy",
      [{ id: "m2", user_id: "U-STUDENT", text: "A棟2階ではなく、別案としてB棟に変更したいです。" }],
      candidates,
      "学生の朝食会場をA棟2階へ移す",
    );

    assert.equal(unchanged.proposal_changed, false);
    assert.equal(changed.proposal_changed, true);
    assert.deepEqual(changed.proposal_change_evidence_message_ids, ["m2"]);
  });

  it("prefers the latest explicit change over an older pilot proposal", async () => {
    const analysis = await analyzeAgreement(
      {},
      "dummy",
      [
        { id: "m1", user_id: "U-STUDENT", text: "木曜日にBASEで1日試す案を提案します。" },
        { id: "m2", user_id: "U-STAFF", text: "その試行案はやめて、別案として朝食会場をB棟に変更したいです。" },
      ],
      candidates,
      "木曜日にBASEで1日朝食運用を試し、影響と負担を確認する",
    );

    assert.equal(analysis.proposal_changed, true);
    assert.equal(analysis.decision.proposal, "学生の朝食会場をB棟へ移す");
  });

  it("starts a separate topic instead of keeping an older breakfast decision", async () => {
    const analysis = await analyzeAgreement(
      {},
      "dummy",
      [
        { id: "m1", user_id: "U-STUDENT", text: "朝食会場はA棟2階で試す案です。" },
        { id: "m2", user_id: "U-STAFF", text: "次は共用部の清掃当番を誰にするか決めたいです。" },
      ],
      candidates,
      "学生の朝食会場をA棟2階で試す",
    );

    assert.equal(analysis.is_decision, true);
    assert.equal(analysis.decision.title, "清掃の運用");
    assert.match(analysis.decision.proposal, /清掃当番/);
  });

  it("uses a person's latest explicit stance when they change their mind", async () => {
    const analysis = await analyzeAgreement(
      {},
      "dummy",
      [
        { id: "m1", user_id: "U-STAFF", text: "A棟2階へ移す案に賛成です。" },
        { id: "m2", user_id: "U-STUDENT", text: "条件を整理しましょう。" },
        { id: "m3", user_id: "U-STAFF", text: "やっぱりこの案には反対です。" },
      ],
      candidates,
      "学生の朝食会場をA棟2階へ移す",
    );
    const staff = analysis.participants.find((participant) => participant.user_id === "U-STAFF");

    assert.equal(staff?.stance, "objected");
    assert.deepEqual(staff?.evidence_message_ids, ["m3"]);
  });
});
