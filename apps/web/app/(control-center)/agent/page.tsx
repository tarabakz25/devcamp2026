"use client";

import { useEffect, useState } from "react";
import MaterialIcon from "../../components/MaterialIcon";
import RoomiLogo from "../../components/RoomiLogo";
import { COMMUNICATION_DEMO } from "../../mocks/communicationDemo";

type AgentSettings = {
  displayName: string;
  persona: string;
  enabled: boolean;
  mentionAlways: boolean;
  cooldownSec: number;
  minConfidence: number;
  minImpact: number;
  tone: "direct" | "casual" | "polite";
};

const STORAGE_KEY = "roomi-agent-settings";

const DEFAULT_SETTINGS: AgentSettings = {
  displayName: "Roomi",
  persona: "議論に入って、止まっている一点を問う。正しさの勝負にしない。",
  enabled: true,
  mentionAlways: true,
  cooldownSec: 600,
  minConfidence: 0.7,
  minImpact: 0.7,
  tone: "direct",
};

const TONE_LABEL = {
  direct: "直接的",
  casual: "カジュアル",
  polite: "丁寧",
} as const;

function loadSettings(): AgentSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function AgentPage() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update<K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSavedAt(null);
  }

  function save() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSavedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
  }

  function reset() {
    setSettings(DEFAULT_SETTINGS);
    window.localStorage.removeItem(STORAGE_KEY);
    setSavedAt(null);
  }

  return (
    <section className="roomi-page-stage agent-stage" aria-label="エージェント設定">
      <header className="roomi-page-head">
        <span className="roomi-page-kicker">Agent</span>
        <h1>エージェント</h1>
        <p>Roomi がいつ口を挟むか、どんな口調で入るかをここで決める。</p>
      </header>

      <div className="agent-layout">
        <div className="agent-main">
          <section className="agent-card">
            <div className="agent-profile">
              <div className="agent-avatar">
                <RoomiLogo size={56} />
              </div>
              <div>
                <label className="agent-field">
                  <span>表示名</span>
                  <input
                    value={settings.displayName}
                    onChange={(event) => update("displayName", event.target.value)}
                  />
                </label>
                <label className="agent-field">
                  <span>立ち位置</span>
                  <textarea
                    rows={3}
                    value={settings.persona}
                    onChange={(event) => update("persona", event.target.value)}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="agent-card">
            <h2>介入ポリシー</h2>
            <label className="agent-toggle">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => update("enabled", event.target.checked)}
              />
              <span>
                <strong>自動介入を有効にする</strong>
                <em>オフだと、メンション以外では黙る</em>
              </span>
            </label>
            <label className="agent-toggle">
              <input
                type="checkbox"
                checked={settings.mentionAlways}
                onChange={(event) => update("mentionAlways", event.target.checked)}
              />
              <span>
                <strong>メンションされたら必ず返す</strong>
                <em>しきい値やクールダウンより優先する</em>
              </span>
            </label>

            <label className="agent-slider">
              <span>
                クールダウン
                <strong>{settings.cooldownSec <= 0 ? "なし (0秒)" : settings.cooldownSec < 60 ? `${settings.cooldownSec} 秒` : `${Math.round(settings.cooldownSec / 60)} 分`}</strong>
              </span>
              <input
                type="range"
                min={0}
                max={1800}
                step={30}
                value={settings.cooldownSec}
                onChange={(event) => update("cooldownSec", Number(event.target.value))}
              />
            </label>
            <label className="agent-slider">
              <span>
                最低確信度
                <strong>{Math.round(settings.minConfidence * 100)}%</strong>
              </span>
              <input
                type="range"
                min={0.3}
                max={0.95}
                step={0.05}
                value={settings.minConfidence}
                onChange={(event) => update("minConfidence", Number(event.target.value))}
              />
            </label>
            <label className="agent-slider">
              <span>
                最低インパクト
                <strong>{Math.round(settings.minImpact * 100)}%</strong>
              </span>
              <input
                type="range"
                min={0.3}
                max={0.95}
                step={0.05}
                value={settings.minImpact}
                onChange={(event) => update("minImpact", Number(event.target.value))}
              />
            </label>
          </section>

          <section className="agent-card">
            <h2>口調</h2>
            <div className="agent-tone">
              {(Object.keys(TONE_LABEL) as Array<keyof typeof TONE_LABEL>).map((tone) => (
                <button
                  key={tone}
                  type="button"
                  className={settings.tone === tone ? "active" : undefined}
                  onClick={() => update("tone", tone)}
                >
                  {TONE_LABEL[tone]}
                </button>
              ))}
            </div>
          </section>

          <div className="agent-actions">
            <button type="button" className="agent-save" onClick={save}>
              <MaterialIcon name="save" />
              設定を保存
            </button>
            <button type="button" className="agent-reset" onClick={reset}>
              初期値に戻す
            </button>
            {savedAt && <span className="agent-saved">{savedAt} に保存した</span>}
          </div>
        </div>

        <aside className="agent-side">
          <section className="agent-card">
            <h2>いまの判定</h2>
            <ul className="agent-preview">
              <li>
                <span>状態</span>
                <strong>{settings.enabled ? "介入する" : "黙る"}</strong>
              </li>
              <li>
                <span>メンション</span>
                <strong>{settings.mentionAlways ? "必ず返す" : "通常判定"}</strong>
              </li>
              <li>
                <span>クールダウン</span>
                <strong>{settings.cooldownSec <= 0 ? "なし (0秒)" : settings.cooldownSec < 60 ? `${settings.cooldownSec} 秒` : `${Math.round(settings.cooldownSec / 60)} 分`}</strong>
              </li>
              <li>
                <span>確信度 / インパクト</span>
                <strong>
                  {Math.round(settings.minConfidence * 100)}% / {Math.round(settings.minImpact * 100)}%
                </strong>
              </li>
            </ul>
          </section>

          <section className="agent-card">
            <h2>最近の介入</h2>
            <div className="roomi-audit-list">
              {COMMUNICATION_DEMO.audit.map((item, idx) => (
                <div key={idx} className="roomi-audit-card">
                  <div className="audit-card-header">
                    <span className="audit-action-tag">{item.action}</span>
                    <span className="audit-conf">確信度 {Math.round(item.confidence * 100)}%</span>
                  </div>
                  <p className="audit-reason">{item.reason}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
