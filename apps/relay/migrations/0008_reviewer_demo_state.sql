CREATE TABLE IF NOT EXISTS reviewer_demo_files (
  user_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, path),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviewer_demo_undo (
  user_id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  previous_content TEXT,
  previous_existed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
