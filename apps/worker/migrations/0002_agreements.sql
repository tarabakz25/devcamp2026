-- Agreement-loop data. The legacy `decisions` table remains untouched.
CREATE TABLE IF NOT EXISTS decision_items (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  decision_text TEXT NOT NULL,
  proposal TEXT NOT NULL DEFAULT '',
  proposal_version INTEGER NOT NULL DEFAULT 1 CHECK (proposal_version >= 1),
  method TEXT NOT NULL CHECK (method IN ('owner_decides', 'required_approvals', 'no_objection', 'unanimous')),
  status TEXT NOT NULL DEFAULT 'discovering' CHECK (status IN ('discovering', 'gathering', 'ready', 'decided', 'reopened')),
  owner_user_id TEXT,
  deadline TEXT,
  evidence_message_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_message_ids)),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  snapshot_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decision_items_thread_status
  ON decision_items(thread_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_items_owner
  ON decision_items(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS decision_participants (
  decision_id TEXT NOT NULL REFERENCES decision_items(id) ON DELETE CASCADE,
  proposal_version INTEGER NOT NULL CHECK (proposal_version >= 1),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('owner', 'required', 'consulted', 'informed')),
  stance TEXT NOT NULL DEFAULT 'unknown' CHECK (stance IN ('agreed', 'conditional', 'objected', 'unknown', 'not_applicable')),
  stance_source TEXT NOT NULL DEFAULT 'analysis' CHECK (stance_source IN ('analysis', 'explicit')),
  condition_text TEXT,
  condition_resolution TEXT,
  evidence_message_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_message_ids)),
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  contact_state TEXT NOT NULL DEFAULT 'not_contacted' CHECK (contact_state IN ('not_contacted', 'queued', 'contacted', 'responded', 'failed')),
  contact_mode TEXT NOT NULL DEFAULT 'thread' CHECK (contact_mode IN ('thread', 'dm')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (decision_id, proposal_version, user_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_participants_decision_stance
  ON decision_participants(decision_id, proposal_version, stance, role);
CREATE INDEX IF NOT EXISTS idx_decision_participants_user
  ON decision_participants(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agreement_events (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decision_items(id) ON DELETE CASCADE,
  proposal_version INTEGER NOT NULL CHECK (proposal_version >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'decision_created', 'proposal_changed', 'participant_added', 'stance_recorded',
    'condition_recorded', 'action_sent', 'action_completed', 'decision_decided',
    'decision_reopened', 'manual_correction'
  )),
  actor_user_id TEXT,
  participant_user_id TEXT,
  message_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agreement_events_decision_created
  ON agreement_events(decision_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_agreement_events_message
  ON agreement_events(message_id) WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_actions (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decision_items(id) ON DELETE CASCADE,
  proposal_version INTEGER NOT NULL CHECK (proposal_version >= 1),
  snapshot_token TEXT NOT NULL,
  participant_user_id TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'announce_decision', 'approve_decision', 'identify_owner', 'identify_required_participant', 'request_stance',
    'identify_deadline', 'resolve_condition', 'address_objection', 'clarify_role'
  )),
  delivery_mode TEXT NOT NULL DEFAULT 'thread' CHECK (delivery_mode IN ('thread', 'dm')),
  question TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  requires_approval INTEGER NOT NULL DEFAULT 1 CHECK (requires_approval IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'completed', 'failed', 'cancelled')),
  external_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (decision_id, proposal_version, snapshot_token, participant_user_id, action_type, question)
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_decision_status
  ON agent_actions(decision_id, proposal_version, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_actions_dedupe
  ON agent_actions(decision_id, proposal_version, snapshot_token, participant_user_id, action_type, question);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_actions_dedupe_unique
  ON agent_actions(decision_id, proposal_version, snapshot_token, COALESCE(participant_user_id, ''), action_type, question);

CREATE TABLE IF NOT EXISTS slack_receipts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'interaction')),
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_slack_receipts_status_updated
  ON slack_receipts(status, updated_at);
