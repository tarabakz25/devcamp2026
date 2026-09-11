import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import roomiMark from "../../apps/web/public/roomi-logo.svg";
import chatScreenshot from "../../demo-chat-desktop.png";
import graphScreenshot from "../../control-center-after-demo.png";

const FPS = 60;

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

const enter = (frame: number, delay = 0, damping = 18) =>
  spring({
    fps: FPS,
    frame: frame - delay,
    config: {damping, stiffness: 120, mass: 0.85},
    durationInFrames: 48,
  });

const sceneOpacity = (frame: number, duration: number, edge = 18) =>
  interpolate(frame, [0, edge, duration - edge, duration], [0, 1, 1, 0], clamp);

const GridBackground = ({intensity = 1}: {intensity?: number}) => (
  <AbsoluteFill
    className="video-grid"
    style={{"--grid-opacity": intensity} as CSSProperties}
  >
    <div className="video-glow video-glow-a" />
    <div className="video-glow video-glow-b" />
  </AbsoluteFill>
);

const LogoLockup = ({compact = false}: {compact?: boolean}) => (
  <div className={`video-logo-lockup${compact ? " compact" : ""}`}>
    <Img src={roomiMark} className="video-logo-mark" />
    <span>Roomi</span>
  </div>
);

const LogoScene = () => {
  const frame = useCurrentFrame();
  const logo = enter(frame, 4, 16);
  const copy = enter(frame, 48, 20);
  const rule = enter(frame, 74, 24);

  return (
    <AbsoluteFill
      className="video-scene video-logo-scene"
      style={{opacity: interpolate(frame, [0, 16, 164, 180], [0, 1, 1, 0], clamp)}}
    >
      <GridBackground intensity={0.72} />
      <div
        className="video-hero-logo"
        style={{
          opacity: logo,
          transform: `translateY(${(1 - logo) * 30}px) scale(${0.82 + logo * 0.18})`,
        }}
      >
        <LogoLockup />
      </div>
      <div
        className="video-brand-rule"
        style={{transform: `scaleX(${rule})`, opacity: rule}}
      />
      <p
        className="video-tagline"
        style={{opacity: copy, transform: `translateY(${(1 - copy) * 18}px)`}}
      >
        必要な瞬間に、不足を埋めるAI。
      </p>
    </AbsoluteFill>
  );
};

const problemMessages = [
  {name: "葵", role: "プロダクトマネージャー", text: "今週中に方向性を決めたい。", color: "#7b88ff"},
  {name: "凛", role: "プロダクトデザイナー", text: "その前に、利用者の声をもう少し見たい。", color: "#6ed8c3"},
  {name: "湊", role: "エンジニア", text: "どの案を先に試す？", color: "#ff8f7a"},
  {name: "澪", role: "カスタマーサクセス", text: "問い合わせの論点も置いておくね。", color: "#42cfa8"},
];

const ProblemScene = () => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, 420, 20);
  const finalBeat = enter(frame, 282, 22);

  return (
    <AbsoluteFill className="video-scene video-problem-scene" style={{opacity}}>
      <GridBackground intensity={0.5} />
      <div className="video-problem-copy">
        {["意見がぶつかる。", "質問が流れる。", "議論は、止まる。"].map((line, i) => {
          const p = enter(frame, 28 + i * 82, 19);
          return (
            <div
              key={line}
              className={i === 2 ? "accent" : undefined}
              style={{opacity: p, transform: `translateY(${(1 - p) * 28}px)`}}
            >
              {line}
            </div>
          );
        })}
        <p style={{opacity: finalBeat}}>
          誰かが気づくまで、会話の不足は見過ごされる。
        </p>
      </div>

      <div className="video-problem-chat">
        <div className="video-mini-appbar">
          <LogoLockup compact />
          <span># onboarding-改善</span>
          <i />
        </div>
        <div className="video-mini-thread">
          {problemMessages.map((message, i) => {
            const p = enter(frame, 20 + i * 62, 18);
            return (
              <div
                className="video-mini-message"
                key={message.name}
                style={{opacity: p, transform: `translateY(${(1 - p) * 36}px)`}}
              >
                <div className="video-avatar" style={{background: message.color}}>
                  {message.name}
                </div>
                <div>
                  <strong>{message.name}</strong>
                  <span>{message.role}</span>
                  <p>{message.text}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="video-unanswered"
          style={{
            opacity: finalBeat,
            transform: `translateY(${(1 - finalBeat) * 24}px) scale(${0.96 + finalBeat * 0.04})`,
          }}
        >
          <span>未回答の質問</span>
          <strong>どの案を先に試す？</strong>
        </div>
      </div>
    </AbsoluteFill>
  );
};

type FeatureShellProps = {
  frame: number;
  number: string;
  kicker: string;
  title: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
};

const FeatureShell = ({frame, number, kicker, title, children, align = "left"}: FeatureShellProps) => {
  const titleIn = enter(frame, 12, 19);
  const screenIn = enter(frame, 30, 20);
  return (
    <AbsoluteFill className={`video-feature-shell ${align}`}>
      <GridBackground intensity={0.45} />
      <div
        className="video-feature-copy"
        style={{opacity: titleIn, transform: `translateY(${(1 - titleIn) * 24}px)`}}
      >
        <span className="video-feature-number">{number}</span>
        <p>{kicker}</p>
        <h2>{title}</h2>
      </div>
      <div
        className="video-feature-visual"
        style={{
          opacity: screenIn,
          transform: `translateY(${(1 - screenIn) * 60}px) scale(${0.94 + screenIn * 0.06})`,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

const BrowserFrame = ({children, className = ""}: {children: ReactNode; className?: string}) => (
  <div className={`video-browser ${className}`}>
    <div className="video-browser-bar">
      <div className="video-browser-dots"><i /><i /><i /></div>
      <span>Roomi Control Center</span>
      <div className="video-browser-status">LIVE</div>
    </div>
    <div className="video-browser-content">{children}</div>
  </div>
);

const ChatFeature = () => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + Math.sin(frame / 10) * 0.1;
  const message = enter(frame, 82, 18);
  return (
    <AbsoluteFill style={{opacity: sceneOpacity(frame, 240)}}>
      <FeatureShell
        frame={frame}
        number="01"
        kicker="In the conversation"
        title={<>必要な瞬間だけ、<br /><em>Slackへ。</em></>}
      >
        <BrowserFrame>
          <Img src={chatScreenshot} className="video-screenshot chat" />
          <div
            className="video-chat-highlight"
            style={{boxShadow: `0 0 0 2px rgba(123,136,255,${pulse}), 0 0 44px rgba(123,136,255,.24)`}}
          />
          <div
            className="video-intervention-chip"
            style={{opacity: message, transform: `translateY(${(1 - message) * 18}px)`}}
          >
            <Img src={roomiMark} />
            <span>Roomi が介入</span>
            <strong>確信度 92%</strong>
          </div>
        </BrowserFrame>
      </FeatureShell>
    </AbsoluteFill>
  );
};

const GraphFeature = () => {
  const frame = useCurrentFrame();
  const focus = interpolate(frame, [28, 210], [1.08, 1.01], clamp);
  const labels = [
    ["議論中", "#7b88ff"],
    ["確認中", "#e9af4b"],
    ["合意済み", "#6ed8c3"],
    ["保留", "#ff8f7a"],
  ];
  return (
    <AbsoluteFill style={{opacity: sceneOpacity(frame, 240)}}>
      <FeatureShell
        frame={frame}
        number="02"
        kicker="See the whole picture"
        title={<>関係と詰まりを、<br /><em>ひと目で。</em></>}
        align="right"
      >
        <BrowserFrame className="graph-browser">
          <Img src={graphScreenshot} className="video-screenshot graph" style={{transform: `scale(${focus})`}} />
          <div className="video-graph-pills">
            {labels.map(([label, color], i) => {
              const p = enter(frame, 78 + i * 16, 18);
              return (
                <span key={label} style={{opacity: p, transform: `translateY(${(1 - p) * 12}px)`}}>
                  <i style={{background: color}} />{label}
                </span>
              );
            })}
          </div>
        </BrowserFrame>
      </FeatureShell>
    </AbsoluteFill>
  );
};

const TimelineUi = ({compact = false}: {compact?: boolean}) => {
  const frame = useCurrentFrame();
  const messages = [
    ["凛", "既存ユーザーには設定画面から任意で試せる形がよさそう。", "09:42"],
    ["湊", "フラグを分ければ両方対応できる。", "09:44"],
    ["葵", "新規向けを必須、既存向けを任意として進めよう。", "09:46"],
    ["Roomi", "論点を整理：対象と表示条件は合意。次は検証方法を決めよう。", "09:47"],
  ];
  return (
    <div className={`video-timeline-ui${compact ? " compact" : ""}`}>
      <aside>
        <div className="video-ui-brand"><Img src={roomiMark} /><strong>Roomi</strong></div>
        {["トップ", "メンバーリスト", "ディスカッション", "エージェント"].map((item, i) => (
          <div key={item} className={i === 2 ? "active" : ""}><i />{item}</div>
        ))}
      </aside>
      <main>
        <header>
          <span>DISCUSSIONS / #onboarding-改善</span>
          <h3>新メンバーのオンボーディング改善</h3>
          <p>新規ユーザーが最初の1週間で迷うポイントを減らす。</p>
          <div className="video-ui-stats"><b>5 人</b><b>14 件</b><b>AI介入 2</b></div>
        </header>
        <section>
          <span className="video-ui-kicker">タイムライン</span>
          {messages.map(([name, text, time], i) => {
            const p = enter(frame, 46 + i * 24, 20);
            return (
              <div className={name === "Roomi" ? "roomi" : ""} key={name + time} style={{opacity: p}}>
                <div className="video-avatar" style={{background: name === "Roomi" ? "#7b88ff" : ["#6ed8c3", "#ff8f7a", "#2b7ffb"][i]}}>
                  {name === "Roomi" ? <Img src={roomiMark} /> : name}
                </div>
                <p><strong>{name}</strong><time>{time}</time><span>{text}</span></p>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
};

const TimelineFeature = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{opacity: sceneOpacity(frame, 240)}}>
      <FeatureShell
        frame={frame}
        number="03"
        kicker="Never lose the context"
        title={<>議論の流れまで、<br /><em>あとから追える。</em></>}
      >
        <BrowserFrame><TimelineUi /></BrowserFrame>
      </FeatureShell>
    </AbsoluteFill>
  );
};

const DiscussionsUi = () => (
  <div className="video-discussions-ui">
    <div className="video-ui-brand"><Img src={roomiMark} /><strong>Roomi</strong></div>
    <h3>ディスカッション</h3>
    <p>いま動いている話と、止まった話。</p>
    {[
      ["新メンバーのオンボーディング改善", "確認中", "5 人 · 14 件 · AI 2"],
      ["朝食会場を決めよう", "議論中", "4 人 · 11 件 · AI 1"],
      ["デモ当日の役割分担", "合意済み", "6 人 · 20 件"],
    ].map(([title, status, meta], i) => (
      <div className="video-discussion-row" key={title}>
        <span>{String(i + 1).padStart(2, "0")}</span>
        <strong>{title}</strong>
        <em>{status}</em>
        <small>{meta}</small>
      </div>
    ))}
  </div>
);

const AgentUi = () => (
  <div className="video-agent-ui">
    <div className="video-ui-brand"><Img src={roomiMark} /><strong>Roomi</strong></div>
    <span>AGENT</span><h3>エージェント</h3>
    <p>Roomi がいつ口を挟むか、どんな口調で入るか。</p>
    <section>
      <h4>介入ポリシー</h4>
      <label><i className="on" /><b>自動介入を有効にする</b></label>
      <label><i className="on" /><b>メンションされたら必ず返す</b></label>
      <div className="video-agent-meter"><span>最低確信度</span><strong>70%</strong><i><b style={{width: "70%"}} /></i></div>
      <div className="video-agent-meter"><span>最低インパクト</span><strong>70%</strong><i><b style={{width: "70%"}} /></i></div>
    </section>
  </div>
);

const MontageCard = ({children, label, style}: {children: ReactNode; label: string; style?: CSSProperties}) => (
  <div className="video-montage-card" style={style}>
    <span className="video-montage-label">{label}</span>
    {children}
  </div>
);

const MontageScene = () => {
  const frame = useCurrentFrame();
  const beats = [0, 62, 124, 186];
  const current = Math.min(3, Math.floor(frame / 62));
  const screenIn = enter(frame - beats[current], 0, 24);
  const final = enter(frame, 238, 22);
  const items = [
    <Img src={chatScreenshot} className="video-montage-image" />,
    <Img src={graphScreenshot} className="video-montage-image" />,
    <DiscussionsUi />,
    <AgentUi />,
  ];
  const labels = ["会話への介入", "関係性の可視化", "ディスカッション", "エージェント設定"];

  return (
    <AbsoluteFill className="video-scene video-montage-scene" style={{opacity: sceneOpacity(frame, 300, 14)}}>
      <GridBackground intensity={0.35} />
      <div className="video-montage-heading">
        <span>ROOMI CONTROL CENTER</span>
        <h2>会話のすべてを、ひとつの場所で。</h2>
      </div>
      <MontageCard
        label={labels[current]}
        style={{opacity: 1 - final, transform: `translateY(${(1 - screenIn) * 32}px) scale(${0.96 + screenIn * 0.04})`}}
      >
        {items[current]}
      </MontageCard>
      <div className="video-montage-grid" style={{opacity: final, transform: `scale(${0.92 + final * 0.08})`}}>
        <div><Img src={chatScreenshot} /></div>
        <div><Img src={graphScreenshot} /></div>
        <div><DiscussionsUi /></div>
        <div><AgentUi /></div>
      </div>
    </AbsoluteFill>
  );
};

const CtaScene = () => {
  const frame = useCurrentFrame();
  const logo = enter(frame, 10, 18);
  const copy = enter(frame, 44, 20);
  const cta = enter(frame, 74, 18);
  return (
    <AbsoluteFill className="video-scene video-cta-scene">
      <GridBackground intensity={0.7} />
      <div style={{opacity: logo, transform: `scale(${0.86 + logo * 0.14})`}}>
        <LogoLockup />
      </div>
      <h2 style={{opacity: copy, transform: `translateY(${(1 - copy) * 20}px)`}}>
        必要な瞬間だけ、会話を前へ。
      </h2>
      <div className="video-cta" style={{opacity: cta, transform: `translateY(${(1 - cta) * 16}px)`}}>
        Roomiを試す <span>→</span>
      </div>
    </AbsoluteFill>
  );
};

export const RoomiLaunch = () => (
  <AbsoluteFill className="video-root">
    <Sequence from={0} durationInFrames={180}><LogoScene /></Sequence>
    <Sequence from={180} durationInFrames={420}><ProblemScene /></Sequence>
    <Sequence from={600} durationInFrames={240}><ChatFeature /></Sequence>
    <Sequence from={840} durationInFrames={240}><GraphFeature /></Sequence>
    <Sequence from={1080} durationInFrames={240}><TimelineFeature /></Sequence>
    <Sequence from={1320} durationInFrames={300}><MontageScene /></Sequence>
    <Sequence from={1620} durationInFrames={180}><CtaScene /></Sequence>
  </AbsoluteFill>
);
