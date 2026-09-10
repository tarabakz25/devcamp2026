"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MaterialIcon from "../../components/MaterialIcon";
import {
  MEMBER_LOCATIONS,
  MEMBER_TITLES,
  WORKSPACE_MEMBERS,
  memberPhoto,
  type WorkspaceMember,
} from "../../mocks/members";
import { discussionsForMember } from "../../mocks/discussions";

type SortKey = "recommended" | "name" | "title";

const PRESENCE_LABEL: Record<WorkspaceMember["presence"], string> = {
  active: "アクティブ",
  away: "離席中",
  offline: "オフライン",
};

export default function MembersPage() {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("all");
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = WORKSPACE_MEMBERS.find((member) => member.id === selectedId) || null;
  const selectedThreads = selected ? discussionsForMember(selected.id) : [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = WORKSPACE_MEMBERS.filter((member) => {
      if (title !== "all" && member.title !== title) return false;
      if (location !== "all" && member.location !== location) return false;
      if (!needle) return true;
      return [member.name, member.realName, member.title, member.location, member.stance]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ja");
      if (sort === "title") return a.title.localeCompare(b.title, "ja") || a.name.localeCompare(b.name, "ja");
      const agentA = a.kind === "agent" ? 1 : 0;
      const agentB = b.kind === "agent" ? 1 : 0;
      if (agentA !== agentB) return agentA - agentB;
      return b.messages - a.messages;
    });
  }, [query, title, location, sort]);

  return (
    <section className="roomi-page-stage directory-stage" aria-label="メンバーリスト">
      <div className="directory-toolbar">
        <label className="directory-search">
          <MaterialIcon name="search" className="directory-search-icon" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="メンバーを検索"
            aria-label="メンバーを検索"
          />
        </label>
        <button type="button" className="directory-invite" disabled>
          メンバーを招待
        </button>
      </div>

      <div className="directory-filters">
        <label className="directory-select">
          <span>役職</span>
          <select value={title} onChange={(event) => setTitle(event.target.value)}>
            <option value="all">すべて</option>
            {MEMBER_TITLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="directory-select">
          <span>場所</span>
          <select value={location} onChange={(event) => setLocation(event.target.value)}>
            <option value="all">すべて</option>
            {MEMBER_LOCATIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <span className="directory-filter-count">
          <MaterialIcon name="filter_list" />
          {filtered.length} 人
        </span>
        <label className="directory-select directory-sort">
          <span className="roomi-visually-hidden">並び替え</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="recommended">おすすめ順</option>
            <option value="name">名前順</option>
            <option value="title">役職順</option>
          </select>
        </label>
      </div>

      <div className="directory-grid">
        {filtered.map((member) => (
          <button
            key={member.id}
            type="button"
            className={`directory-card${selectedId === member.id ? " selected" : ""}${
              member.kind === "agent" ? " agent" : ""
            }`}
            onClick={() => setSelectedId(member.id)}
          >
            <img
              className="directory-card-photo"
              src={memberPhoto(member)}
              alt=""
              style={
                member.kind === "agent"
                  ? { objectFit: "contain", padding: "28%", background: "#1a2140" }
                  : undefined
              }
            />
            <div className="directory-card-meta">
              <span className="directory-card-name">
                {member.name}
                <MaterialIcon name="open_in_new" className="directory-card-open" />
              </span>
              <span className="directory-card-title">
                {member.title}
                {member.location ? ` / ${member.location}` : ""}
              </span>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="directory-empty">条件に合うメンバーはいないよ。</p>
      )}

      {selected && (
        <div className="directory-drawer-scrim" onClick={() => setSelectedId(null)}>
          <aside
            className="directory-drawer"
            onClick={(event) => event.stopPropagation()}
            aria-label={`${selected.name} のプロフィール`}
          >
            <button
              type="button"
              className="directory-drawer-close"
              onClick={() => setSelectedId(null)}
              aria-label="閉じる"
            >
              <MaterialIcon name="close" />
            </button>
            <div className="directory-drawer-hero">
              <img
                src={memberPhoto(selected)}
                alt=""
                className={selected.kind === "agent" ? "agent" : undefined}
              />
            </div>
            <div className="directory-drawer-body">
              <p className={`directory-presence ${selected.presence}`}>
                {PRESENCE_LABEL[selected.presence]}
              </p>
              <h2>{selected.name}</h2>
              <p className="directory-drawer-role">
                {selected.title} · {selected.location}
              </p>
              {selected.kind === "person" && (
                <p className="directory-drawer-real">担当: {selected.realName}</p>
              )}
              <p className="directory-drawer-stance">{selected.stance}</p>
              <dl className="directory-drawer-stats">
                <div>
                  <dt>発言</dt>
                  <dd>{selected.messages}</dd>
                </div>
                <div>
                  <dt>ディスカッション</dt>
                  <dd>{selectedThreads.length}</dd>
                </div>
              </dl>
              {selectedThreads.length > 0 && (
                <div className="directory-drawer-threads">
                  <span>参加中</span>
                  {selectedThreads.map((thread) => (
                    <Link key={thread.id} href={`/discussions/${thread.id}`}>
                      {thread.title}
                    </Link>
                  ))}
                </div>
              )}
              {selected.kind === "person" && selected.messages > 0 && (
                <Link href={`/?person=${encodeURIComponent(selected.id)}`} className="directory-drawer-graph">
                  グラフで見る
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
