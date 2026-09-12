import { DEMO_CAST } from "./demoCast";

export type MemberPresence = "active" | "away" | "offline";

export type WorkspaceMember = {
  id: string;
  name: string;
  realName: string;
  title: string;
  location: string;
  stance: string;
  presence: MemberPresence;
  kind: "person" | "agent";
  avatar?: string;
  messages: number;
};

const LOCATION_BY_ROLE: Record<string, string> = {
  寮スタッフ: "スタッフ棟",
  寮運営学生: "学生寮",
  学生: "学生寮",
  パートナー連携: "本部",
  モノラボ: "モノラボ",
};

const LOCATION_BY_ID: Record<string, string> = {
  "U-SASAKI": "スタッフ棟",
  "U-OGASAHARA": "スタッフ棟",
  "U-SAKUMA": "A棟",
  "U-OZAKI": "A棟",
  "U-KUWAHARA": "本部",
  "U-YAMAJI": "モノラボ",
  "U-SUGIURA": "B棟",
  "U-MATSUI": "A棟",
  "U-MERRITT": "B棟",
  "U-KIZUKI": "A棟",
};

const PRESENCE_CYCLE: MemberPresence[] = ["active", "active", "away", "active", "offline"];

const MESSAGE_COUNTS: Record<string, number> = {
  "U-SASAKI": 2,
  "U-OGASAHARA": 2,
  "U-SAKUMA": 1,
  "U-OZAKI": 2,
  "U-KUWAHARA": 2,
  "U-YAMAJI": 1,
  "U-SUGIURA": 1,
  "U-MATSUI": 0,
  "U-MERRITT": 0,
  "U-KIZUKI": 1,
};

export const WORKSPACE_MEMBERS: WorkspaceMember[] = [
  ...DEMO_CAST.map((person, index) => ({
    id: person.user_id,
    name: person.demo_name,
    realName: person.real_name,
    title: person.role,
    location: LOCATION_BY_ID[person.user_id] || LOCATION_BY_ROLE[person.role] || "学内",
    stance: person.stance,
    presence: PRESENCE_CYCLE[index % PRESENCE_CYCLE.length],
    kind: "person" as const,
    messages: MESSAGE_COUNTS[person.user_id] ?? 0,
  })),
  {
    id: "U-ROOMI",
    name: "Roomi",
    realName: "Roomi",
    title: "AI エージェント",
    location: "ワークスペース",
    stance: "議論に入って、止まっている一点を問う",
    presence: "active",
    kind: "agent",
    avatar: "/roomi-logo.svg",
    messages: 1,
  },
];

export const MEMBER_TITLES = Array.from(
  new Set(WORKSPACE_MEMBERS.map((member) => member.title)),
);

export const MEMBER_LOCATIONS = Array.from(
  new Set(WORKSPACE_MEMBERS.map((member) => member.location)),
);

const SILHOUETTE_PALETTES = [
  { bg: "#2b3244", fg: "#8d95a8" },
  { bg: "#f4d4de", fg: "#e11d5e" },
  { bg: "#d7e4ff", fg: "#1f7aee" },
  { bg: "#e6d8fb", fg: "#6d3cc9" },
  { bg: "#d6d9e0", fg: "#8f96a3" },
  { bg: "#d4f1e8", fg: "#187a62" },
  { bg: "#ffe1c6", fg: "#c24d00" },
  { bg: "#1f2535", fg: "#6d7588" },
];

export function getDirectoryPhotoSvg(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = SILHOUETTE_PALETTES[Math.abs(hash) % SILHOUETTE_PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice"><rect width="200" height="240" fill="${palette.bg}"/><circle cx="100" cy="92" r="44" fill="${palette.fg}"/><ellipse cx="100" cy="228" rx="78" ry="78" fill="${palette.fg}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function memberPhoto(member: WorkspaceMember): string {
  if (member.avatar) return member.avatar;
  return getDirectoryPhotoSvg(member.id);
}

export function getMember(id: string) {
  return WORKSPACE_MEMBERS.find((member) => member.id === id) || null;
}
