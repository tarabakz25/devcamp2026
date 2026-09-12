"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { MentionText, getFallbackAvatarSvg } from "./CommunicationTopicGraph";
import RoomiLogo from "./RoomiLogo";

type Stakeholder = {
  user_id: string;
  user_name: string;
  role: string;
  interests: string;
  avatar: string;
  messages: number;
};

type ChatMessage = {
  id: string;
  user_id: string;
  user_name: string;
  role: string;
  avatar: string;
  text: string;
  ts: string;
  is_bot: boolean;
  is_mention?: boolean | number;
};

type Intervention = {
  should_act: boolean;
  intervene?: number;
  action: string;
  reason: string;
  confidence: number;
  impact: number;
  summary: string;
  text: string;
};

type Playback = {
  mode: "idle" | "script" | "ai" | "done" | "stopped";
  index: number;
  total: number;
  ai_count: number;
  interval_sec: number;
  next_speaker: string | null;
  intervene?: number;
  reason?: string;
};

type RoomState = {
  channel: { id: string; name: string };
  thread_id: string;
  title: string;
  description?: string;
  current_scenario?: string;
  scenarios?: { id: string; title: string; description: string }[];
  llm: string;
  stakeholders: Stakeholder[];
  messages: ChatMessage[];
  audit: {
    action: string;
    reason: string;
    confidence: number;
    impact: number;
    created_at?: string;
  }[];
  playback?: Playback;
};

type Banner = { kind: "info" | "error" | "ai"; text: string } | null;

function avatarFor(person: { user_name?: string; user_id: string; avatar?: string; is_bot?: boolean }) {
  if (person.is_bot || person.user_id === "U-ROOMI") {
    return "/roomi-logo.svg";
  }
  if (person.avatar) return person.avatar;
  return getFallbackAvatarSvg(person.user_name || person.user_id, person.user_id);
}

function formatTs(ts: string): string {
  const num = Number(ts);
  if (!Number.isNaN(num) && num > 1e9) {
    return new Date(num * 1000).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (/^\d{1,2}:\d{2}/.test(ts)) return ts;
  return ts;
}

function formatTypingText(names: string[]): string {
  const uniqueNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (uniqueNames.length === 0) return "";
  if (uniqueNames.length === 1) return `${uniqueNames[0]} が入力中...`;
  return `${uniqueNames.join("、")} が入力中...`;
}

async function readApi(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.detail || data?.hint || data?.error || `HTTP ${response.status}`;
    const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    (error as Error & { status: number }).status = response.status;
    throw error;
  }
  return data;
}

export default function SlackDemoChat() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [speakerId, setSpeakerId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newInterests, setNewInterests] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const playTimer = useRef<number | null>(null);
  const typingTimer = useRef<number | null>(null);
  const playingRef = useRef(false);

  function addTypingUser(name: string) {
    if (!name) return;
    setTypingUsers((current) => (current.includes(name) ? current : [...current, name]));
  }

  function setTypingOnly(...names: string[]) {
    const valid = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
    setTypingUsers(valid);
  }

  function clearTyping() {
    setTypingUsers([]);
  }

  const speaker = useMemo(
    () => room?.stakeholders.find((person) => person.user_id === speakerId) || room?.stakeholders[0],
    [room, speakerId]
  );

  async function refresh() {
    const data = (await readApi("/api/demo")) as RoomState;
    setRoom(data);
    setSpeakerId((current) => {
      if (current && data.stakeholders.some((person) => person.user_id === current)) {
        return current;
      }
      return data.stakeholders[0]?.user_id || "";
    });
    return data;
  }

  useEffect(() => {
    refresh()
      .catch((err: Error & { status?: number }) => {
        if (err.status === 503) {
          setBanner({
            kind: "error",
            text: "バックエンド API に接続できないよ。Cloudflare Worker または `task dash` の稼働状況を確認してね。",
          });
        } else {
          setBanner({ kind: "error", text: err.message });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room?.messages.length, typingUsers.length, thinking]);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      clearAllTimers();
    };
  }, []);

  function clearPlayTimer() {
    if (playTimer.current) {
      window.clearTimeout(playTimer.current);
      playTimer.current = null;
    }
  }

  function clearTypingTimer() {
    if (typingTimer.current) {
      window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
  }

  function clearAllTimers() {
    clearPlayTimer();
    clearTypingTimer();
  }

  function applyRoomPatch(data: {
    messages?: ChatMessage[];
    audit?: RoomState["audit"];
    stakeholders?: Stakeholder[];
    playback?: Playback;
    channel?: RoomState["channel"];
    title?: string;
  }) {
    setRoom((current) =>
      current
        ? {
            ...current,
            messages: data.messages ?? current.messages,
            audit: data.audit ?? current.audit,
            stakeholders: data.stakeholders ?? current.stakeholders,
            playback: data.playback ?? current.playback,
            channel: data.channel ?? current.channel,
            title: data.title ?? current.title,
          }
        : current
    );
  }

  function schedulePlayTick(playback?: Playback) {
    clearAllTimers();
    const mode = playback?.mode;
    if (!playingRef.current || (mode !== "script" && mode !== "ai")) {
      playingRef.current = false;
      clearTyping();
      return;
    }
    const defaultWait = mode === "ai" ? 3 : 10;
    const waitSec = Math.max(1, playback?.interval_sec || defaultWait);
    const wait = waitSec * 1000;
    const nextName = playback?.next_speaker || (mode === "ai" ? "関係者" : "次の人");

    // 発言の少し前に入力中を表示して自然なチャットの流れを作る
    const typingLeadTime = Math.min(4000, Math.max(1500, Math.floor(wait / 2)));
    const typingDelay = Math.max(0, wait - typingLeadTime);

    typingTimer.current = window.setTimeout(() => {
      if (!playingRef.current) return;
      if (mode === "ai") {
        setTypingOnly(nextName, "Roomi");
      } else {
        setTypingOnly(nextName);
      }
    }, typingDelay);

    playTimer.current = window.setTimeout(() => {
      void tickPlay(nextName);
    }, wait);
  }

  function describeIntervention(intervention: Intervention) {
    if (!intervention.should_act) {
      return `介入なし（${intervention.reason}）`;
    }
    const conf = Math.round(intervention.confidence * 100);
    return `Roomi が ${intervention.action} で介入 · 確信度 ${conf}% · ${intervention.reason}`;
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!speaker || sending) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setThinking(true);
    setDraft("");

    // 送信者の発言を即時反映
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      user_id: speaker.user_id,
      user_name: speaker.user_name,
      role: speaker.role || "",
      avatar: speaker.avatar || "",
      text,
      ts: String(Date.now() / 1000),
      is_bot: false,
    };
    setRoom((current) =>
      current ? { ...current, messages: [...current.messages, tempUserMsg] } : current
    );

    // Roomi が思考・入力中であることを表示
    setTypingOnly("Roomi");

    try {
      const data = await readApi("/api/demo/messages", {
        method: "POST",
        body: JSON.stringify({ user_id: speaker.user_id, text }),
      });

      // Roomi の介入メッセージがある場合、自然なタイピング表示時間を確保
      if (data.bot_message) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      applyRoomPatch(data);
      setBanner({
        kind: data.intervention?.should_act ? "ai" : "info",
        text: describeIntervention(data.intervention),
      });
    } catch (err: any) {
      setDraft(text);
      setBanner({ kind: "error", text: err.message });
      await refresh().catch(() => {});
    } finally {
      setSending(false);
      setThinking(false);
      clearTyping();
      inputRef.current?.focus();
    }
  }

  async function intervene() {
    if (thinking) return;
    setThinking(true);
    setTypingOnly("Roomi");
    try {
      const data = await readApi("/api/demo/intervene", { method: "POST" });
      if (data.bot_message) {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      applyRoomPatch(data);
      setBanner({
        kind: data.intervention?.should_act ? "ai" : "info",
        text: describeIntervention(data.intervention),
      });
    } catch (err: any) {
      setBanner({ kind: "error", text: err.message });
    } finally {
      setThinking(false);
      clearTyping();
    }
  }

  function describePlayback(playback?: Playback, intervention?: Intervention) {
    if (!playback) return "実例を再生したよ。";
    if (playback.mode === "ai") {
      const extra = intervention?.should_act
        ? describeIntervention(intervention)
        : "Roomi が介入したので、ここからは関係者AIが返すよ。";
      return extra;
    }
    if (playback.mode === "script") {
      const bit = playback.intervene ?? (intervention?.intervene ?? (intervention?.should_act ? 1 : 0));
      const why = playback.reason || intervention?.reason || "";
      const judge = why ? `判定 ${bit} · ${why}` : `判定 ${bit}`;
      return `${judge} · ${playback.index}/${playback.total} · ${playback.interval_sec}秒後に次の発言`;
    }
    if (playback.mode === "done") {
      return "実例の再生はここまで。この続きは手で話せるよ。";
    }
    if (playback.mode === "stopped") {
      if (intervention?.should_act) {
        return `${describeIntervention(intervention)} · Roomiが再介入したため再生を一時停止したよ。`;
      }
      return "再生を止めたよ。";
    }
    return "実例を再生したよ。";
  }

  async function switchScenario(scenarioId: string) {
    if (thinking || playingRef.current) return;
    clearAllTimers();
    clearTyping();
    setThinking(true);
    try {
      const data = (await readApi("/api/demo/scenario", {
        method: "POST",
        body: JSON.stringify({ scenario_id: scenarioId }),
      })) as RoomState;
      setRoom(data);
      setSpeakerId(data.stakeholders[0]?.user_id || "");
      setBanner({
        kind: "info",
        text: `シナリオを「${data.title}」に切り替えたよ。「実例を再生」でこの議論を再生できるよ。`,
      });
    } catch (err: any) {
      setBanner({ kind: "error", text: err.message });
    } finally {
      setThinking(false);
    }
  }

  async function startPlay() {
    clearAllTimers();
    clearTyping();
    playingRef.current = true;
    setThinking(true);
    try {
      const data = await readApi("/api/demo/play/start", {
        method: "POST",
        body: JSON.stringify({ scenario_id: room?.current_scenario }),
      });
      if (data.channel || data.title || data.stakeholders) {
        setRoom((current) => ({
          channel: data.channel || current?.channel || { id: "demo", name: "03_rooms_discussion" },
          thread_id: data.thread_id || current?.thread_id || "demo-live",
          title: data.title || current?.title || "朝食会場を決めよう",
          description: data.description || current?.description || "",
          current_scenario: data.current_scenario || current?.current_scenario || "breakfast",
          scenarios: data.scenarios || current?.scenarios || [],
          llm: data.llm || current?.llm || "",
          stakeholders: data.stakeholders || current?.stakeholders || [],
          messages: data.messages || [],
          audit: data.audit || [],
          playback: data.playback,
        }));
        if (data.stakeholders?.length) {
          setSpeakerId((cur) =>
            data.stakeholders.some((s: Stakeholder) => s.user_id === cur) ? cur : data.stakeholders[0].user_id
          );
        }
      } else {
        applyRoomPatch(data);
      }
      setBanner({
        kind: data.intervention?.should_act ? "ai" : "info",
        text: describePlayback(data.playback, data.intervention),
      });
      schedulePlayTick(data.playback);
    } catch (err: any) {
      playingRef.current = false;
      clearTyping();
      setBanner({ kind: "error", text: err.message });
    } finally {
      setThinking(false);
    }
  }

  async function tickPlay(speakerName: string) {
    if (!playingRef.current) return;
    clearTypingTimer();
    setThinking(true);
    addTypingUser(speakerName);

    try {
      const data = await readApi("/api/demo/play/tick", { method: "POST" });
      if (!playingRef.current) return;

      // Roomi の介入メッセージがある場合は、まず発言者のメッセージを表示し、
      // 続けて「Roomi が入力中...」を表示してから Roomi のメッセージを表示する
      if (data.bot_message) {
        const botId = data.bot_message.id;
        const messagesWithoutBot = (data.messages || []).filter(
          (m: ChatMessage) => m.id !== botId
        );
        applyRoomPatch({ ...data, messages: messagesWithoutBot });

        const nextSpeaker = data.playback?.next_speaker;
        if (nextSpeaker && data.playback?.mode === "ai") {
          setTypingOnly("Roomi", nextSpeaker);
        } else {
          setTypingOnly("Roomi");
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (!playingRef.current) return;

        applyRoomPatch(data);
        clearTyping();
      } else {
        applyRoomPatch(data);
        clearTyping();
      }

      setBanner({
        kind: data.intervention?.should_act || data.playback?.mode === "ai" ? "ai" : "info",
        text: describePlayback(data.playback, data.intervention),
      });

      const shouldContinue =
        data.playback?.mode === "script" ||
        (data.playback?.mode === "ai" && !data.intervention?.should_act && !data.bot_message);
      if (shouldContinue) {
        schedulePlayTick(data.playback);
      } else {
        playingRef.current = false;
        clearAllTimers();
        clearTyping();
      }
    } catch (err: any) {
      playingRef.current = false;
      clearAllTimers();
      clearTyping();
      setBanner({ kind: "error", text: err.message });
    } finally {
      setThinking(false);
    }
  }

  async function stopPlay() {
    playingRef.current = false;
    clearAllTimers();
    clearTyping();
    try {
      const data = await readApi("/api/demo/play/stop", { method: "POST" });
      applyRoomPatch(data);
      setBanner({ kind: "info", text: describePlayback(data.playback) });
    } catch (err: any) {
      setBanner({ kind: "error", text: err.message });
    }
  }

  async function resetChat() {
    if (!window.confirm("このチャンネルの会話と介入ログを消す？関係者は残るよ。")) return;
    try {
      const data = (await readApi("/api/demo/reset", {
        method: "POST",
        body: JSON.stringify({ keep_stakeholders: true }),
      })) as RoomState;
      playingRef.current = false;
      clearAllTimers();
      clearTyping();
      setRoom(data);
      setBanner({ kind: "info", text: "会話をリセットしたよ。" });
    } catch (err: any) {
      setBanner({ kind: "error", text: err.message });
    }
  }

  async function addPerson(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      const person = (await readApi("/api/demo/stakeholders", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          role: newRole.trim(),
          interests: newInterests.trim(),
        }),
      })) as Stakeholder;
      await refresh();
      setSpeakerId(person.user_id);
      setNewName("");
      setNewRole("");
      setNewInterests("");
      setAddOpen(false);
      setBanner({ kind: "info", text: `${person.user_name} を関係者に追加したよ。この人として発言できる。` });
    } catch (err: any) {
      setBanner({ kind: "error", text: err.message });
    }
  }

  async function removePerson(userId: string, name: string) {
    if (!window.confirm(`${name} を関係者から外す？`)) return;
    try {
      await readApi(`/api/demo/stakeholders/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const data = await refresh();
      setBanner({ kind: "info", text: `${name} を外したよ。` });
      if (speakerId === userId) {
        setSpeakerId(data.stakeholders[0]?.user_id || "");
      }
    } catch (err: any) {
      setBanner({ kind: "error", text: err.message });
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const messages = room?.messages || [];
  const people = room?.stakeholders || [];
  const isPlaying = room?.playback?.mode === "script" || room?.playback?.mode === "ai";

  return (
    <div className="slack-demo-shell">
      <div className="slack-demo-workspace">
        <aside className="slack-demo-sidebar" aria-label="チャンネルと関係者">
          <div className="slack-demo-workspace-name">
            <span className="slack-demo-workspace-badge" aria-hidden="true">
              <RoomiLogo size={28} />
            </span>
            <div>
              <strong>Roomi Workspace</strong>
              <span>DevCamp 2026</span>
            </div>
          </div>

          <div className="slack-demo-side-section slack-demo-channels">
            <span className="slack-demo-side-label">チャンネル</span>
            <div className="slack-demo-channel active">
              <span aria-hidden="true">#</span>
              {room?.channel.name || "03_rooms_discussion"}
            </div>
          </div>

          <div className="slack-demo-side-section slack-demo-people">
            <span className="slack-demo-side-label">
              関係者
              <em>{people.length}</em>
            </span>
            <p className="slack-demo-side-hint">クリックした人として発言する</p>
            <div className="slack-demo-people-list">
              {people.map((person) => (
                <div
                  key={person.user_id}
                  className={`slack-demo-person${speakerId === person.user_id ? " speaking" : ""}`}
                >
                  <button
                    type="button"
                    className="slack-demo-person-main"
                    onClick={() => setSpeakerId(person.user_id)}
                  >
                    <span className="slack-demo-presence" aria-hidden="true" />
                    <img src={avatarFor(person)} alt="" />
                    <span className="slack-demo-person-copy">
                      <strong>{person.user_name}</strong>
                      <span>{person.role || "役割未設定"}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="slack-demo-person-remove"
                    aria-label={`${person.user_name} を外す`}
                    onClick={() => void removePerson(person.user_id, person.user_name)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {addOpen ? (
              <form className="slack-demo-add-form" onSubmit={addPerson}>
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="名前"
                  aria-label="関係者の名前"
                  required
                />
                <input
                  value={newRole}
                  onChange={(event) => setNewRole(event.target.value)}
                  placeholder="役割（PM、エンジニア…）"
                  aria-label="関係者の役割"
                />
                <input
                  value={newInterests}
                  onChange={(event) => setNewInterests(event.target.value)}
                  placeholder="関心ごと"
                  aria-label="関係者の関心ごと"
                />
                <div className="slack-demo-add-actions">
                  <button type="submit">追加</button>
                  <button type="button" onClick={() => setAddOpen(false)}>
                    閉じる
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="slack-demo-add-toggle"
                onClick={() => setAddOpen(true)}
              >
                + 関係者を追加
              </button>
            )}
          </div>
        </aside>

        <section className="slack-demo-main" aria-label="デモチャンネル">
          <div className="slack-demo-header">
            <div>
              <div className="slack-demo-header-title-row">
                <h1>
                  <span aria-hidden="true">#</span> {room?.channel.name || "03_rooms_discussion"}
                </h1>
                {room?.title && (
                  <span className="slack-demo-scenario-badge" title={room.description || room.title}>
                    {room.title}
                  </span>
                )}
              </div>
              <p>{room?.description || room?.title || "ステークホルダーを指定して会話する"}</p>
            </div>
            <div className="slack-demo-header-actions">
              <div className="slack-demo-scenario-select-wrapper">
                <label htmlFor="scenario-select" className="sr-only">シナリオ</label>
                <select
                  id="scenario-select"
                  className="slack-demo-scenario-select"
                  value={room?.current_scenario || "breakfast"}
                  onChange={(e) => void switchScenario(e.target.value)}
                  disabled={thinking || isPlaying}
                  title="再生する実例シナリオを選択"
                >
                  <option value="breakfast">🍳 朝食会場を決めよう</option>
                  <option value="eblock">🔋 BASEのe-block充電運用</option>
                  <option value="hygiene">🧼 キッチンのふきん除菌・洗濯</option>
                </select>
              </div>
              {isPlaying ? (
                <button type="button" className="playing" onClick={() => void stopPlay()}>
                  再生を止める
                </button>
              ) : (
                <button type="button" onClick={() => void startPlay()} disabled={thinking}>
                  実例を再生
                </button>
              )}
              <button type="button" onClick={() => void intervene()} disabled={!messages.length || thinking}>
                Roomiに介入させる
              </button>
              <button type="button" onClick={() => void resetChat()} disabled={thinking}>
                リセット
              </button>
            </div>
          </div>

          {banner && (
            <div className={`slack-demo-banner ${banner.kind}`} role="status">
              {banner.text}
            </div>
          )}

          <div className="slack-demo-messages" aria-live="polite">
            {loading && <p className="slack-demo-empty">チャンネルを読み込み中...</p>}
            {!loading && messages.length === 0 && (
              <div className="slack-demo-empty">
                <h2>#{room?.channel.name || "03_rooms_discussion"}</h2>
                <p>
                  左の関係者を選んで、Slackと同じように会話してみて。質問が溜まると Roomi が割り込むよ。
                  「実例を再生」で、実際の朝食会場スレを流す。毎発言を 0/1 で判定し、1 なら Roomi が介入して関係者AIが返す。
                </p>
              </div>
            )}
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const grouped =
                previous &&
                previous.user_id === message.user_id &&
                Number(message.ts) - Number(previous.ts) < 300;
              return (
                <article
                  key={message.id}
                  className={`slack-demo-msg${message.is_bot ? " bot" : ""}${grouped ? " grouped" : ""}`}
                >
                  {grouped ? (
                    <span className="slack-demo-msg-gutter" />
                  ) : (
                    <img src={avatarFor(message)} alt="" className="slack-demo-msg-avatar" />
                  )}
                  <div className="slack-demo-msg-body">
                    {!grouped && (
                      <header>
                        <strong>{message.user_name}</strong>
                        {message.is_bot && <span className="slack-demo-app-badge">APP</span>}
                        {!message.is_bot && message.role && (
                          <span className="slack-demo-role">{message.role}</span>
                        )}
                        <time dateTime={message.ts}>{formatTs(message.ts)}</time>
                      </header>
                    )}
                    <p>
                      <MentionText text={message.text} />
                    </p>
                  </div>
                </article>
              );
            })}
            {typingUsers.length > 0 && (
              <div className="slack-demo-typing">
                <span className="slack-demo-typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {formatTypingText(typingUsers)}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form className="slack-demo-composer" onSubmit={sendMessage}>
            <label className="slack-demo-speaker">
              発言者
              <select
                value={speaker?.user_id || ""}
                onChange={(event) => setSpeakerId(event.target.value)}
                disabled={!people.length || isPlaying}
              >
                {people.map((person) => (
                  <option key={person.user_id} value={person.user_id}>
                    {person.user_name}
                    {person.role ? `（${person.role}）` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="slack-demo-composer-box">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposerKey}
                placeholder={
                  speaker
                    ? `#${room?.channel.name || "03_rooms_discussion"} へ ${speaker.user_name} として送信（@Roomi でメンション）`
                    : "先に関係者を追加してね"
                }
                rows={2}
                disabled={!speaker || sending || isPlaying}
              />
              <div className="slack-demo-composer-bar">
                <span>Enter で送信 / Shift+Enter で改行</span>
                <button type="submit" disabled={!speaker || !draft.trim() || sending || isPlaying}>
                  送信
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
