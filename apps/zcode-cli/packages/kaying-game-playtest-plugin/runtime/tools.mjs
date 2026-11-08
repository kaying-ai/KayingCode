const str = (maxLength = 4000) => ({ type: "string", minLength: 1, maxLength });
const num = (minimum, maximum, integer = false) => ({
  type: integer ? "integer" : "number",
  minimum,
  maximum,
});
const one = (values) => ({ type: "string", enum: values });
const arr = (items, maxItems = 100) => ({ type: "array", items, maxItems });
const obj = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const SECTION_KEYS = [
  "summary",
  "information",
  "coverage",
  "mechanics",
  "onboarding",
  "gameplay",
  "audiovisual",
  "retention",
  "innovation",
  "issues",
  "evidence",
  "recommendations",
];
export const DIMENSIONS = [
  "gameplay",
  "onboarding",
  "controls",
  "visual",
  "audio",
  "stability",
  "retention",
  "innovation",
];
export const CERTAINTY = ["observed", "inferred", "unverified"];
const evidenceIds = arr(str(100));
const progressStatus = one(["not-tested", "partial", "verified", "blocked", "not-applicable"]);
const region = obj(
  {
    x: num(0, 20000, true),
    y: num(0, 20000, true),
    width: num(1, 20000, true),
    height: num(1, 20000, true),
  },
  ["x", "y", "width", "height"],
);
const source = obj(
  { kind: one(["android", "web"]), path: str(), packageName: str(200), url: str() },
  ["kind"],
);
const point = { x: num(0, 20000, true), y: num(0, 20000, true) };
const action = obj(
  {
    type: one(["tap", "swipe", "long-press", "back", "wait"]),
    ...point,
    toX: point.x,
    toY: point.y,
    durationMs: num(1, 10000, true),
  },
  ["type"],
);
const review = obj({
  gameName: str(200),
  lede: str(1000),
  sections: arr(
    obj(
      {
        key: one(SECTION_KEYS),
        text: str(20000),
        certainty: one(CERTAINTY),
        status: progressStatus,
        evidenceIds,
        media: arr(obj({ artifactId: str(100), caption: str(1000) }, ["artifactId", "caption"]), 6),
      },
      ["key", "text", "certainty", "evidenceIds"],
    ),
    12,
  ),
  scores: arr(
    obj(
      {
        dimension: one(DIMENSIONS),
        score: { anyOf: [num(0, 10), { type: "null" }] },
        confidence: num(0, 1),
        evidenceIds,
        reason: str(),
      },
      ["dimension", "score", "confidence", "evidenceIds", "reason"],
    ),
    8,
  ),
  issues: arr(
    obj(
      {
        title: str(300),
        severity: one(["P0", "P1", "P2", "P3"]),
        steps: arr(str(), 30),
        expected: str(),
        actual: str(),
        recommendation: str(),
        evidenceIds,
      },
      ["title", "severity", "steps", "expected", "actual", "recommendation", "evidenceIds"],
    ),
    50,
  ),
});

const definitions = [
  [
    "android_emulator",
    "Inspect existing Android devices/AVDs or start an existing AVD with host GPU and no snapshots. Reuse devices first; never wipe, restart existing devices or silently fall back to software rendering. Inspect bootCompleted and GLES after launch.",
    { operation: one(["inspect", "start"]), avd: str(200), serial: str(200) },
    ["operation"],
    false,
  ],
  [
    "playtest_prepare",
    "Inspect a local APK or H5 URL and Android devices; no installation. Download URLs must first be resolved to an authorized local APK. Missing tools are reported as limitations.",
    { source, serial: str(200) },
    ["source"],
    false,
  ],
  [
    "playtest_start",
    "Create a playtest session. Android installs and launches the APK on an explicit or sole device; Web records the URL for Browser Use. Returns durable session id.",
    {
      source,
      serial: str(200),
      title: str(300),
      depth: one(["quick", "standard", "deep"]),
      strategy: one(["explore", "objective", "regression"]),
      objective: str(),
      focus: arr(str(100), 8),
      budgetMinutes: num(1, 120, true),
      maxActions: num(1, 1000, true),
      reportKind: one(["evaluation", "diagnostic"]),
      relatedSessionIds: arr(str(100), 10),
      goals: arr(
        obj({ id: str(100), title: str(300), acceptance: str() }, ["id", "title", "acceptance"]),
        20,
      ),
    },
    ["source"],
    false,
  ],
  [
    "playtest_resume",
    "Resume a paused/interrupted session; recheck device ownership and invalidate old observations. Pending actions are never replayed.",
    {},
    [],
  ],
  [
    "playtest_status",
    "Read session progress, budget, artifacts, events and action counts. Does not imply gameplay success.",
    {},
    [],
  ],
  [
    "device_observe",
    "Capture Android PNG and dimensions with a fresh observation id. Inspect the returned image before choosing an action. Web uses Browser Use and playtest_attach.",
    { previewMaxWidth: num(128, 1080, true) },
    [],
  ],
  [
    "device_act",
    "Perform one bounded Android action from the latest unconsumed screenshot. Coordinates are original screenshot pixels. Every action requires a new observation afterwards.",
    {
      observationId: str(100),
      action,
      observe: { type: "boolean" },
      waitForChangeMs: num(0, 5000, true),
      waitFor: one(["change", "stable"]),
      settleRegion: region,
      previewMaxWidth: num(128, 1080, true),
    },
    ["observationId", "action"],
  ],
  [
    "playtest_goal",
    "Update one acceptance goal with status, reason and evidence. Successful device input does not verify a goal or level completion.",
    { goalId: str(100), status: progressStatus, reason: str(), evidenceIds },
    ["goalId", "status", "reason", "evidenceIds"],
  ],
  [
    "playtest_external_action",
    "Record a Web action ALREADY executed through Browser Use. This tool never controls the browser. Supply the prior imported screenshot observation and real operation receipt.",
    { observationId: str(100), description: str(), outcome: one(["sent", "failed"]) },
    ["observationId", "description", "outcome"],
  ],
  [
    "playtest_record",
    "Record an observed event or inference with artifact evidence. Mark unverified claims honestly; never infer fun, FPS or audio from a saved file alone.",
    {
      kind: one([
        "launch",
        "mechanic",
        "first-success",
        "failure",
        "highlight",
        "issue",
        "blocked",
        "finding",
      ]),
      summary: str(),
      certainty: one(CERTAINTY),
      evidenceIds,
      section: one(SECTION_KEYS),
    },
    ["kind", "summary", "certainty", "evidenceIds"],
  ],
  [
    "playtest_attach",
    "Copy an existing workspace PNG/MP4/WebM/log into session evidence. For Web PNG captures, create a fresh observation id. Returns artifact metadata, not large media bytes.",
    {
      path: str(),
      kind: one(["screenshot", "recording", "log"]),
      label: str(300),
      startedAt: str(100),
    },
    ["path", "kind"],
  ],
  [
    "capture_recording",
    "Record a bounded Android segment (default 60s, max 180s, 15fps, no audio). After natural completion finalize; stop may end early. Probe playable media before registering.",
    { operation: one(["start", "stop", "finalize"]), durationSeconds: num(1, 180, true) },
    ["operation"],
  ],
  [
    "capture_highlight",
    "Cut a 1–60 second MP4 clip from a registered recording using FFmpeg. The interval must be inside the source duration. No video is fabricated.",
    {
      artifactId: str(100),
      startSeconds: num(0, 7200),
      durationSeconds: num(1, 60),
      label: str(300),
    },
    ["artifactId", "startSeconds", "durationSeconds"],
  ],
  [
    "playtest_stop",
    "Stop recording, collect Android logs, release the device and save projections. pause=true allows explicit resume. Does not clear or uninstall the game.",
    { pause: { type: "boolean" } },
    [],
  ],
  [
    "report_generate",
    "Generate a reader-facing new-game report: design style, rules, gameplay loop, highlights and captioned media. Technical facts and scores follow in an appendix; diagnostic keeps its run-focused format. Review patches merge by section/dimension; replace is explicit.",
    {
      review,
      reviewMode: one(["merge", "replace"]),
      reportKind: one(["evaluation", "diagnostic"]),
      relatedSessionIds: arr(str(100), 10),
    },
    [],
  ],
  [
    "report_compare",
    "Compare two reports from this workspace identity. Returns score deltas and environment caveats, not a claim of causal improvement.",
    { previousSessionId: str(100) },
    ["previousSessionId"],
  ],
];
export const TOOLS = definitions.map(
  ([name, description, properties, required, session = true]) => ({
    name,
    description,
    inputSchema: obj(
      {
        workspacePath: str(),
        workspaceIdentity: str(),
        ...(session ? { sessionId: str(100) } : {}),
        ...properties,
      },
      ["workspacePath", ...(session ? ["sessionId"] : []), ...required],
    ),
  }),
);

export function validate(schema, value, path = "arguments") {
  if (schema.anyOf) {
    if (
      !schema.anyOf.some((candidate) => {
        try {
          validate(candidate, value, path);
          return true;
        } catch {
          return false;
        }
      })
    )
      throw new Error(`${path}: invalid value`);
    return;
  }
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (schema.type === "integer" ? !Number.isInteger(value) : type !== schema.type)
    throw new Error(`${path}: expected ${schema.type}`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: unsupported value`);
  if (
    type === "string" &&
    (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity))
  )
    throw new Error(`${path}: invalid length`);
  if (
    type === "number" &&
    (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)
  )
    throw new Error(`${path}: out of range`);
  if (type === "object") {
    for (const key of schema.required ?? [])
      if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key}: required`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key))
        throw new Error(`${path}.${key}: unexpected field`);
      validate(schema.properties[key], value[key], `${path}.${key}`);
    }
  }
  if (type === "array") {
    if (value.length > schema.maxItems) throw new Error(`${path}: too many items`);
    value.forEach((item, i) => validate(schema.items, item, `${path}[${i}]`));
  }
}
