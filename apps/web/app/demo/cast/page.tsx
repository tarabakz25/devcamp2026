import type { Metadata } from "next";
import Link from "next/link";
import RoomiLogo from "../../components/RoomiLogo";
import { DEMO_CAST, DEMO_CAST_ROLE_ORDER } from "../../mocks/demoCast";

export const metadata: Metadata = {
  title: "デモ担当一覧 — Roomi",
  description: "デモチャットの架空名と、実際の担当の対応表",
};

export default function DemoCastPage() {
  const groups = DEMO_CAST_ROLE_ORDER.map((role) => ({
    role,
    members: DEMO_CAST.filter((person) => person.role === role),
  })).filter((group) => group.members.length > 0);

  return (
    <div className="slack-demo-shell">
      <header className="slack-demo-topbar">
        <div className="slack-demo-topbar-brand">
          <span className="slack-demo-topbar-mark" aria-hidden="true">
            <RoomiLogo size={28} />
          </span>
          <div>
            <strong>デモ担当一覧</strong>
            <span>チャット上は架空名。ここで誰がどの役か確認する</span>
          </div>
        </div>
        <div className="slack-demo-topbar-actions">
          <Link href="/demo" className="slack-demo-topbar-link">
            デモチャット
          </Link>
          <Link href="/" className="slack-demo-topbar-link">
            ホーム
          </Link>
        </div>
      </header>

      <main className="demo-cast">
        <section className="demo-cast-intro">
          <p>
            デモ中の <code>#03_rooms_discussion</code> では実名を出さない。
            下の表が、架空名と担当の対応だよ。
          </p>
        </section>

        {groups.map((group) => (
          <section key={group.role} className="demo-cast-group">
            <h2>
              {group.role}
              <em>{group.members.length}</em>
            </h2>
            <div className="demo-cast-grid">
              {group.members.map((person) => (
                <article key={person.user_id} className="demo-cast-card">
                  <span className="demo-cast-avatar" aria-hidden="true">
                    {person.demo_name[0]}
                  </span>
                  <div className="demo-cast-card-body">
                    <div className="demo-cast-names">
                      <strong>{person.demo_name}</strong>
                      <span className="demo-cast-role">{person.role}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>担当</dt>
                        <dd>{person.real_name}</dd>
                      </div>
                      <div>
                        <dt>立場</dt>
                        <dd>{person.stance}</dd>
                      </div>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
