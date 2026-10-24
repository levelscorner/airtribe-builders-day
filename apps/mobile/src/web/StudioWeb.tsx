import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "expo-router";
import {
  ArrowUp,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  PanelLeft,
  PanelRight,
  X,
  Check,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Download,
  LoaderCircle,
  SlidersHorizontal,
} from "lucide-react";
import type {
  ApprovalCardMessage,
  ArtefactSummary,
  ChatMessage,
  QuestionMessage,
  RegeneratePreviewResponse,
} from "@chotu/shared";
import {
  useStudioRuntime,
  generationLabel,
  generationError,
  isSample,
  isSampleUrl,
  mediaUrl,
  type StudioRuntime,
} from "./generation";
import {
  ProviderLine,
  MediaPlayer,
  ScriptReviewPanel,
  GenerationProgress,
} from "./GenerationUI";
import { getStudioClient } from "../api";
import { openQuestion } from "../chat/open-question";
import { useWebChat } from "./useWebChat";
import {
  readLocal,
  saveLocal,
  storeFile,
  restoreFiles,
  fileMetadata,
  type ReferenceFile,
  type RecentChat,
} from "./storage";
import "./fonts.css";
import "./studio.css";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const records = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
const label: Record<string, string> = {
  brief: "Shaping your idea",
  script: "Writing your story",
  cast: "Finding the look",
  prompts: "Planning the scenes",
  images: "Your visual direction",
  clips: "Bringing scenes to life",
  audio: "Adding the voices",
  final: "Putting it together",
  done: "Ready to share",
};
function IconButton({
  title,
  children,
  onClick,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Brand() {
  return <span className="brand">SLB2</span>;
}
function Shell({
  children,
  credits,
  canvasOpen = false,
  onCanvas,
  hasCanvas = false,
  chatId,
}: {
  children: ReactNode;
  credits?: number | null;
  canvasOpen?: boolean;
  onCanvas?: () => void;
  hasCanvas?: boolean;
  chatId?: string;
}) {
  const router = useRouter();
  const runtime = useStudioRuntime();
  useEffect(() => {
    document.title = "SLB2 — Video Studio";
  }, []);
  const [expanded, setExpanded] = useState(false);
  const recent = readLocal<RecentChat[]>("recents", []);
  return (
    <div
      className={`chotu-web ${canvasOpen ? "canvas-open" : ""} ${expanded ? "rail-expanded" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to conversation
      </a>
      <aside className="rail" aria-label="Your studio">
        <IconButton
          title={expanded ? "Close sidebar" : "Open sidebar"}
          onClick={() => setExpanded(!expanded)}
        >
          <PanelLeft size={20} />
        </IconButton>
        <button
          className="new-chat"
          onClick={() => {
            setExpanded(false);
            router.push("/");
          }}
          aria-label="New video"
        >
          <Plus size={21} />
          {expanded && <span>New video</span>}
        </button>
        {expanded && (
          <div className="recent-list">
            <p>Recent conversations</p>
            {recent.length ? (
              recent.map((item) => (
                <button
                  className={chatId === item.id ? "current" : ""}
                  key={item.id}
                  onClick={() => {
                    setExpanded(false);
                    router.push(`/chat/${item.id}?videoId=${item.videoId}`);
                  }}
                >
                  <MessageCircle size={16} />
                  <span>{item.title}</span>
                </button>
              ))
            ) : (
              <span className="muted">Your stories will appear here.</span>
            )}
          </div>
        )}
        <span className="rail-bottom" title="SLB2 Studio">
          SLB2
        </span>
      </aside>
      {expanded && (
        <button
          className="rail-scrim"
          aria-label="Close sidebar"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className="studio-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open sidebar"
              onClick={() => setExpanded(!expanded)}
            >
              <PanelLeft size={19} />
            </button>
            <button
              className="brand-home"
              aria-label="SLB2 home"
              onClick={() => router.push("/")}
            >
              <Brand />
            </button>
            <span className="studio-name">Studio</span>
          </div>
          <div className="topbar-actions">
            <span className="demo-badge">
              {runtime?.mock === true
                ? "Sample mode"
                : runtime?.mock === false
                  ? "Connected"
                  : "Studio"}
              <span className="demo-dot" />
            </span>
            {credits !== undefined && (
              <span
                className="credit-balance"
                title="Sample credits. No payment is required."
              >
                {credits ?? "—"} credits
              </span>
            )}
            {hasCanvas && (
              <button
                aria-label="Visual canvas"
                className={`canvas-toggle ${canvasOpen ? "selected" : ""}`}
                aria-expanded={canvasOpen}
                onClick={onCanvas}
              >
                <PanelRight size={17} />
                <span>Canvas</span>
              </button>
            )}
            <button
              className="mobile-new icon-button"
              aria-label="New video"
              onClick={() => router.push("/")}
            >
              <Plus size={20} />
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
function Files({
  files,
  onRemove,
}: {
  files: ReferenceFile[];
  onRemove?: (id: string) => void;
}) {
  return files.length ? (
    <div className="reference-list">
      {files.map((file) => (
        <div className="reference" key={file.id}>
          {file.type.startsWith("image/") && file.url ? (
            <img src={file.url} alt="" />
          ) : (
            <FileText size={19} />
          )}
          <span>
            {file.url ? (
              <a href={file.url} target="_blank" rel="noreferrer">
                {file.name}
              </a>
            ) : (
              file.name
            )}
            <small>
              {Math.max(1, Math.round(file.size / 1024))} KB
              {!file.url ? " · unavailable in this browser" : ""}
            </small>
          </span>
          {onRemove && (
            <IconButton
              title={`Remove ${file.name}`}
              onClick={() => onRemove(file.id)}
            >
              <X size={14} />
            </IconButton>
          )}
        </div>
      ))}
    </div>
  ) : null;
}
function Composer({
  value,
  onChange,
  onSend,
  files,
  setFiles,
  busy,
  placeholder,
  home = false,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  files: ReferenceFile[];
  setFiles: (files: ReferenceFile[]) => void;
  busy: boolean;
  placeholder: string;
  home?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);
  async function attach(incoming: FileList | null) {
    if (!incoming) return;
    setFileError("");
    if (files.length + incoming.length > 4) {
      setFileError("Add up to four reference files.");
      return;
    }
    const accepted = Array.from(incoming);
    if (accepted.some((file) => file.size > 10 * 1024 * 1024)) {
      setFileError("Choose files smaller than 10 MB.");
      return;
    }
    if (
      accepted.some(
        (file) =>
          !/^(image\/(png|jpeg|webp)|application\/pdf|text\/plain)$/.test(
            file.type,
          ),
      )
    ) {
      setFileError("Choose a PNG, JPG, WebP, PDF, or text file.");
      return;
    }
    setUploading(true);
    try {
      setFiles([...files, ...(await Promise.all(accepted.map(storeFile)))]);
    } catch (e) {
      setFileError(
        e instanceof Error ? e.message : "Could not save that file. Try again.",
      );
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className={`composer-wrap ${home ? "home-composer" : ""}`}>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !uploading && value.trim()) onSend();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void attach(e.dataTransfer.files);
        }}
      >
        <Files
          files={files}
          onRemove={(id) => setFiles(files.filter((file) => file.id !== id))}
        />
        <textarea
          ref={textareaRef}
          aria-label={home ? "Describe your video" : "Message SLB2"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={home ? 2 : 1}
          maxLength={4000}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (!busy && !uploading && value.trim()) onSend();
            }
          }}
        />
        <div className="composer-toolbar">
          <div>
            <IconButton
              title="Attach reference files"
              onClick={() => input.current?.click()}
            >
              <Plus size={22} />
            </IconButton>
            {home && (
              <span className="composer-hint">
                Describe it. We’ll shape it together.
              </span>
            )}
            {uploading && <span className="muted">Saving reference…</span>}
          </div>
          <button
            type="submit"
            className="send-button"
            aria-label="Send message"
            disabled={busy || uploading || !value.trim()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={19} />
            ) : (
              <ArrowUp size={20} />
            )}
          </button>
        </div>
        <input
          type="file"
          className="visually-hidden"
          tabIndex={-1}
          ref={input}
          accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
          multiple
          onChange={(e) => void attach(e.target.files)}
        />
      </form>
      {fileError && (
        <p className="error-note" role="alert">
          {fileError}
        </p>
      )}
      {files.length > 0 && (
        <p className="composer-footnote">
          References stay in this browser. Only your written prompt and
          configurations are sent for generation.
        </p>
      )}
    </div>
  );
}
export function WebHome() {
  const router = useRouter();
  const [draft, setDraft] = useState(() => readLocal("draft", ""));
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const profileCreated = useRef(false);
  useEffect(() => {
    void restoreFiles(readLocal("draftFiles", []))
      .then(setFiles)
      .catch(() => {});
  }, []);
  function updateDraft(value: string) {
    setDraft(value);
    saveLocal("draft", value);
  }
  function updateFiles(value: ReferenceFile[]) {
    setFiles(value);
    saveLocal("draftFiles", fileMetadata(value));
  }
  async function create() {
    const client = getStudioClient();
    const chat = await client.createChat({
      initialMessage: draft.trim(),
      experience: "chat_canvas",
      title: draft.trim().slice(0, 80),
    });
    saveLocal(`references.${chat.chatId}`, fileMetadata(files));
    const recent = readLocal<RecentChat[]>("recents", []);
    saveLocal(
      "recents",
      [
        {
          id: chat.chatId,
          videoId: chat.videoId,
          title: draft.trim().slice(0, 60),
        },
        ...recent,
      ].slice(0, 20),
    );
    saveLocal("draft", "");
    saveLocal("draftFiles", []);
    sessionStorage.setItem("chotu-arriving", chat.chatId);
    router.replace(`/chat/${chat.chatId}?videoId=${chat.videoId}`);
  }
  async function begin() {
    if (!draft.trim() || busy) return;
    setSubmitted(true);
    setBusy(true);
    setError("");
    try {
      try {
        await getStudioClient().getMe();
      } catch (e) {
        const status = e && typeof e === "object" && "status" in e ? Number(e.status) : NaN;
        const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
        if (status === 401 || status === 404 || code === "no_user") {
          setNeedsProfile(true);
          return;
        }
        throw e;
      }
      await create();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not start. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!profileCreated.current) {
        await getStudioClient().createUser({
          displayName: name.trim(),
          phoneOrEmail: email.trim(),
        });
        profileCreated.current = true;
      }
      await create();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not start. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <main
        id="main-content"
        className={`home ${submitted ? "home-submitted" : ""}`}
      >
        <div className="home-content">
          {!submitted ? (
            <>
              <h1>
                Wake up to <em>Reality</em>
              </h1>
              <Composer
                home
                value={draft}
                onChange={updateDraft}
                files={files}
                setFiles={updateFiles}
                busy={busy}
                onSend={() => void begin()}
                placeholder="A little idea, a whole story, anything…"
                textareaRef={textarea}
              />
              <div className="examples" aria-label="Ideas to get you started">
                {[
                  "Why do bees make honey?",
                  "A launch video for my brand",
                  "A story worth sharing",
                ].map((text, i) => (
                  <button
                    key={text}
                    onClick={() => {
                      updateDraft(
                        [
                          "A 45 second English cartoon video explaining why bees make honey for kids, in vertical format.",
                          "A short product ad for my brand",
                          "A faceless story about the Indian monsoon",
                        ][i]!,
                      );
                      textarea.current?.focus();
                    }}
                  >
                    {text}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="submitted-idea">
                <span className="author">You</span>
                <p>{draft}</p>
                <Files files={files} />
              </div>
              {needsProfile && (
                <section className="profile-step">
                  <span className="assistant-name">
                    <Brand />
                  </span>
                  <h2>Let’s make this yours.</h2>
                  <p>
                    What should we call you? Add your email to save this
                    conversation.
                  </p>
                  <form onSubmit={(e) => void signup(e)}>
                    <label>
                      Your name
                      <input
                        autoFocus
                        required
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                      />
                    </label>
                    <label>
                      Email
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </label>
                    <button
                      className="primary-button"
                      disabled={busy || !name.trim()}
                    >
                      {busy ? "Starting…" : "Continue"}
                      <ArrowUpRight size={16} />
                    </button>
                  </form>
                  <small>
                    Your idea and references stay here while you continue.
                  </small>
                </section>
              )}
              {busy && !needsProfile && (
                <p className="thinking">
                  <LoaderCircle size={16} className="spin" />
                  Getting your conversation ready…
                </p>
              )}
              {error && (
                <div className="error-note" role="alert">
                  {error}
                  <button onClick={() => void begin()}>Try again</button>
                </div>
              )}
              <button
                className="text-button back-to-idea"
                onClick={() => {
                  setSubmitted(false);
                  setNeedsProfile(false);
                }}
                disabled={busy}
              >
                <ArrowLeft size={15} />
                Edit your idea
              </button>
            </>
          )}
        </div>
        <p className="home-note">
          Your idea, your direction. We’ll ask before creating.
        </p>
      </main>
    </Shell>
  );
}
function Question({
  message,
  busy,
  onAnswer,
  onDefaults,
}: {
  message: QuestionMessage;
  busy: boolean;
  onAnswer: (id: string, label: string) => void;
  onDefaults: () => void;
}) {
  const questionCopy: Record<string, string> = {
    genre: "What kind of video are we making?",
    aspect_ratio: "Where will your video live?",
    target_seconds: "How long should the story be?",
    language: "Which language should we tell it in?",
    art_style: "What should it look like?",
  };
  return (
    <section className="question-step">
      <p className="question-title">
        {questionCopy[message.field] || message.prompt}
      </p>
      <div
        className={`choices ${message.field === "aspect_ratio" ? "dimension-choices" : ""}`}
      >
        {message.options?.map((option) => (
          <button
            disabled={busy}
            key={option.id}
            onClick={() => onAnswer(option.id, option.label)}
          >
            {message.field === "aspect_ratio" && (
              <span
                aria-hidden="true"
                className={`ratio-icon ratio-${option.id.replace(":", "-")}`}
              />
            )}
            <span>{option.label}</span>
            {message.field === "aspect_ratio" && (
              <small>
                {
                  {
                    "9:16": "Reels & Shorts",
                    "16:9": "YouTube & web",
                    "1:1": "Social posts",
                  }[option.id]
                }
              </small>
            )}
          </button>
        ))}
      </div>
      {message.allowFreeText && (
        <p className="muted">Or tell me in your own words below.</p>
      )}
      <button
        className="text-button defaults-button"
        disabled={busy}
        onClick={onDefaults}
      >
        <SlidersHorizontal size={15} />
        Choose the remaining details for me
      </button>
      <p className="defaults-note">
        Keeps your choices · otherwise 45s, vertical, illustrated, English
      </p>
    </section>
  );
}
function Script({
  message,
  artefact,
  busy,
  onApprove,
  onRevise,
  onReviewFix,
  runtime,
}: {
  message: ApprovalCardMessage;
  artefact?: ArtefactSummary;
  busy: boolean;
  onApprove: () => void;
  onRevise: () => void;
  onReviewFix: (note: string) => void;
  runtime: StudioRuntime | null;
}) {
  const payload = artefact?.payload ?? message.preview;
  const version = artefact?.version ?? Number(payload.version || 1);
  const [selected, setSelected] = useState(version);
  const [versions, setVersions] = useState<
    Record<string, Record<string, unknown>>
  >(() => ({
    ...readLocal(`script.${message.artefactId}`, {}),
    ...Object.fromEntries(
      records(payload.previousVersions).map((v) => [String(v.version), v]),
    ),
  }));
  useEffect(() => {
    setVersions((prev) => {
      const next = { ...prev, [version]: payload };
      saveLocal(`script.${message.artefactId}`, next);
      return next;
    });
    setSelected(version);
  }, [version, payload, message.artefactId]);
  const scenes = records((versions[selected] ?? payload).scenes);
  const approved = (artefact?.state ?? message.state) === "approved";
  let cursor = 0;
  return (
    <article className="script-message">
      <div className="script-heading">
        <FileText size={18} />
        <h2>Your script</h2>
        <label className="version-select">
          <span className="visually-hidden">Script version</span>
          <select
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {Object.keys({ ...versions, [version]: payload }).map((v) => (
              <option key={v} value={v}>
                Version {v}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </label>
      </div>
      <p className="script-intro">
        A first draft of your story. Read it through, or tell me what you’d like
        to change.
      </p>
      <div className="script-scenes">
        {scenes.map((scene, index) => {
          const start = cursor;
          cursor += Number(scene.durationMs || 0) / 1000;
          return (
            <section key={index}>
              <div className="scene-meta">
                <span>
                  {String(index + 1).padStart(2, "0")} · {str(scene.title)}
                </span>
                <time>
                  {Math.round(start)}–{Math.round(cursor)}s
                </time>
              </div>
              <p>{str(scene.narration)}</p>
            </section>
          );
        })}
      </div>
      <p className="script-sample">
        {runtime?.mock || isSample(artefact)
          ? "Sample script"
          : generationLabel(artefact, "Script draft")}{" "}
        · review factual details before publishing.
      </p>
      {selected === version && (
        <ScriptReviewPanel
          source={artefact ?? { payload }}
          busy={busy || approved}
          onApply={onReviewFix}
        />
      )}
      {!scenes.length && (
        <p className="error-note">
          The script is not ready yet. Retry generation below.
        </p>
      )}
      {selected < version && (
        <p className="muted">
          Previous version · switch to Version {version} to approve.
        </p>
      )}
      {approved ? (
        <div className="approved-line">
          <Check size={16} />
          Script approved
        </div>
      ) : (
        selected === version && (
          <div className="script-actions">
            <button
              className="primary-button"
              disabled={busy || !scenes.length}
              onClick={onApprove}
            >
              Approve script & explore visuals
              <ArrowUpRight size={16} />
            </button>
            <button className="text-button" disabled={busy} onClick={onRevise}>
              Let’s change something
            </button>
          </div>
        )
      )}
    </article>
  );
}
const visualKinds = new Set([
  "image",
  "identity",
  "sheet",
  "anchor",
  "voice_sample",
]);
function SceneImage({
  index,
  alt,
  url,
}: {
  index: number;
  alt: string;
  url?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed || (!isSampleUrl(url) && !mediaUrl(url)))
    return (
      <div className="frame-placeholder" role="status">
        <ImageIcon size={22} />
        <span>
          {failed ? "Image couldn’t load" : "Image not available yet"}
        </span>
      </div>
    );
  return isSampleUrl(url) ? (
    <div
      role="img"
      aria-label={`${alt} — sample honey illustration`}
      className={`story-art art-${index % 3}`}
    />
  ) : (
    <img
      className="real-frame"
      src={mediaUrl(url)}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
function Canvas({
  artefacts,
  messages,
  open,
  onClose,
  onFeedback,
  onApprove,
  busy,
  stage,
}: {
  artefacts: ArtefactSummary[];
  messages: ChatMessage[];
  open: boolean;
  onClose: () => void;
  onFeedback: (item: ArtefactSummary) => void;
  onApprove: (id: string) => void;
  busy: boolean;
  stage: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const overview = useRef<HTMLDivElement>(null);
  const inspectorBack = useRef<HTMLButtonElement>(null);
  const frameButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const returnFrame = useRef<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const frames = artefacts.filter((a) => a.kind === "image");
  const representative =
    frames.length > 3
      ? [
          frames[0]!,
          frames[Math.floor(frames.length / 2)]!,
          frames[frames.length - 1]!,
        ]
      : frames;
  const shownFrames = showAll ? frames : representative;
  const characters = artefacts.filter(
    (a) => a.kind === "identity" && !a.payload.failedStage,
  );
  const script = artefacts.find((a) => a.kind === "script");
  const scenes = records(script?.payload.scenes);
  const selected = artefacts.find((a) => a.id === focus);
  const sampleFrames = frames.some(isSample);
  const preparationFailed = artefacts.some((a) => a.state === "failed");
  const providerCreditsNeeded = artefacts.some(a => a.state === "failed" && /not_enough_credits/.test(str(a.payload.error)));
  const scenery =
    frames.find((a) => mediaUrl(a.payload.url) && !isSample(a)) ?? frames[0];
  useEffect(() => {
    panel.current?.toggleAttribute("inert", !open);
    if (open && window.matchMedia("(max-width: 760px)").matches)
      closeButton.current?.focus();
  }, [open]);
  useEffect(() => {
    overview.current?.toggleAttribute("inert", Boolean(focus));
    if (open && focus) inspectorBack.current?.focus();
    else if (open && returnFrame.current) {
      const origin = returnFrame.current;
      returnFrame.current = null;
      frameButtons.current[origin]?.focus();
    }
  }, [open, focus]);
  return (
    <aside
      ref={panel}
      aria-label="Visual canvas"
      aria-hidden={!open}
      className="visual-canvas"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (focus) setFocus(null);
          else onClose();
        }
        if (
          open &&
          e.key === "Tab" &&
          window.matchMedia("(max-width: 760px)").matches
        ) {
          const items = Array.from(
            panel.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), a[href], audio, video",
            ) ?? [],
          ).filter(
            (item) =>
              !item.closest("[inert]") && item.getClientRects().length > 0,
          );
          if (!items?.length) return;
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="canvas-overview" ref={overview}>
        <div className="canvas-heading">
          <div>
            <span className="canvas-title">Visual canvas</span>
            <span className="canvas-subtitle">
              A space for your story to take shape
            </span>
          </div>
          <button
            className="icon-button"
            ref={closeButton}
            title="Close canvas"
            aria-label="Close canvas"
            onClick={onClose}
          >
            <span className="canvas-back-label">Back to chat</span>
            <X size={19} />
          </button>
        </div>
        <div className="canvas-scroll">
          <div className="canvas-intro">
            <h2>
              Finding the <em>feeling.</em>
            </h2>
            <p>Characters, places, and a first glimpse of your story.</p>
            <span className="sample-label">
              {sampleFrames
                ? "Sample artwork"
                : frames.length
                  ? "AI-generated visuals"
                  : preparationFailed
                    ? providerCreditsNeeded ? "Higgsfield API credits needed" : "Visual preparation needs attention"
                    : "Preparing your visuals"}
            </span>
          </div>
          <section className="frame-section">
            <div className="section-heading">
              <h3>A few moments from your story</h3>
              <span>
                {frames.length ? "Opening · middle · ending" : "Preparing…"}
              </span>
            </div>
            <div className="frame-grid">
              {frames.length
                ? shownFrames.map((item, sampleIndex) => {
                    const i = frames.indexOf(item);
                    const scene = scenes[i] ?? {};
                    return (
                      <button
                        key={item.id}
                        className="frame-card"
                        ref={(node) => {
                          frameButtons.current[item.id] = node;
                        }}
                        onClick={() => {
                          returnFrame.current = item.id;
                          setFocus(item.id);
                        }}
                      >
                        <div className="frame-image">
                          <SceneImage
                            index={sampleIndex}
                            url={str(item.payload.url)}
                            alt={`Scene ${i + 1}`}
                          />
                          <span className="frame-index">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {item.state === "approved" && (
                            <span className="frame-approved">
                              <Check size={14} />
                            </span>
                          )}
                          <span className="frame-expand">
                            <ArrowUpRight size={17} />
                          </span>
                        </div>
                        <span className="frame-title">
                          {item.version > 1 ? `v${item.version} · ` : ""}
                          {str(scene.title) || `Scene ${i + 1}`}
                        </span>
                        <ProviderLine source={item} />
                        {!!item.payload.needsRegeneration && (
                          <span className="review-warning">
                            Character changed · regenerate this scene
                          </span>
                        )}
                        <span className="frame-caption">
                          {str(scene.narration)}
                        </span>
                      </button>
                    );
                  })
                : [0, 1, 2].map((i) => (
                    <div className="frame-placeholder" key={i}>
                      <ImageIcon size={23} />
                      <span>
                        {preparationFailed
                          ? "Frame not created yet"
                          : `Preparing scene ${i + 1}`}
                      </span>
                    </div>
                  ))}
            </div>
            {frames.length > 3 && (
              <button
                className="text-button"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll
                  ? "Show representative frames"
                  : `Review all ${frames.length} scenes`}
                <ChevronDown size={13} />
              </button>
            )}
            <p className="canvas-note">
              These establish the look before your full video.{" "}
              {sampleFrames
                ? "Sample frames use a honey storyboard to demonstrate this review."
                : "Review the actual generated frames before continuing."}
            </p>
          </section>
          <section>
            <div className="section-heading">
              <h3>Your characters</h3>
              <span>Character references</span>
            </div>
            <div className="character-grid">
              {characters.map((item, i) => {
                const castId = str(item.payload.castId);
                const name = str(item.payload.name) || `Character ${i + 1}`;
                const reference =
                  artefacts.find(
                    (a) =>
                      ["sheet", "anchor"].includes(a.kind) &&
                      a.payload.castId === castId &&
                      mediaUrl(a.payload.url) &&
                      !isSample(a),
                  ) ??
                  artefacts.find(
                    (a) =>
                      ["sheet", "anchor"].includes(a.kind) &&
                      a.payload.castId === castId,
                  );
                const characterUrl =
                  str(reference?.payload.url) ||
                  str(item.payload.sheetUrl) ||
                  str(item.payload.anchorUrl);
                const sampleCharacter =
                  isSampleUrl(characterUrl) &&
                  ["preset_chintu", "preset_mini", "preset_riya"].includes(
                    castId,
                  );
                return (
                  <article className="character" key={item.id}>
                    {castId !== "preset_narrator" &&
                      (sampleCharacter ? (
                        <div
                          className={`character-art character-${castId === "preset_mini" ? 1 : castId === "preset_riya" ? 2 : 0}`}
                          role="img"
                          aria-label={`${name}, sample character model`}
                        />
                      ) : (
                        <div className="character-reference">
                          <SceneImage
                            index={0}
                            url={characterUrl}
                            alt={`${name}, character reference`}
                          />
                        </div>
                      ))}
                    <div className="character-copy">
                      <h4>
                        {name}
                        {item.state === "approved" && <Check size={14} />}
                      </h4>
                      <p>{str(item.payload.identityText)}</p>
                      <ProviderLine
                        source={reference ?? item}
                        fallback={
                          characterUrl
                            ? "Character reference"
                            : "Reference pending"
                        }
                      />
                      {reference && (
                        <button
                          className="text-button"
                          disabled={busy || reference.state === "approved"}
                          onClick={() => onFeedback(reference)}
                        >
                          Revise reference
                        </button>
                      )}
                      {!!item.payload.directionNote && (
                        <p className="direction-note">
                          Your direction: {str(item.payload.directionNote)}
                          {sampleCharacter ? " · sample model unchanged" : ""}
                        </p>
                      )}
                      <button
                        className="text-button"
                        disabled={busy || item.state === "approved"}
                        onClick={() => onFeedback(item)}
                      >
                        Suggest a change
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {artefacts.filter((a) => a.kind === "voice_sample").length > 0 && (
              <details className="voice-details">
                <summary>
                  Listen to voices
                  <ChevronDown size={14} />
                </summary>
                {artefacts.some(
                  (a) => a.kind === "voice_sample" && isSample(a),
                ) && (
                  <p className="muted">Sample audio is a silent placeholder.</p>
                )}
                {artefacts
                  .filter((a) => a.kind === "voice_sample")
                  .map((a) => (
                    <div key={a.id}>
                      <ProviderLine source={a} />
                      <MediaPlayer
                        kind="audio"
                        name={str(a.payload.line) || "Voice sample"}
                        url={str(a.payload.url)}
                      />
                    </div>
                  ))}
              </details>
            )}
          </section>
          <section className="scenery-section">
            <div className="section-heading">
              <h3>The world around them</h3>
              <span>Scenery reference</span>
            </div>
            {scenery ? (
              <div className="scenery-reference">
                <SceneImage
                  index={0}
                  url={str(scenery.payload.url)}
                  alt="Scenery from your story"
                />
              </div>
            ) : (
              <p className="muted">
                Your scenery will appear with the first generated frame.
              </p>
            )}
            <div className="scenery-caption">
              <span>From your story</span>
              <span>
                {scenery ? generationLabel(scenery) : "Reference pending"}
              </span>
            </div>
          </section>
          {["clips", "audio", "final", "done"].includes(stage) && (
            <section className="later-media">
              <h3>{label[stage]}</h3>
              {messages
                .filter((m) => m.kind === "video")
                .map(
                  (m) =>
                    m.kind === "video" && (
                      <MediaPlayer key={m.id} name="Final video" url={m.url} />
                    ),
                )}
              <p className="muted">
                AI-created content · review before publishing
              </p>
            </section>
          )}
        </div>
        <footer className="canvas-footer">
          <span>
            <Check size={14} />
            You’re in control of the final look.
          </span>
          <span>Click a frame to review</span>
        </footer>
      </div>
      {selected && (
        <div
          className="frame-inspector"
          role="region"
          aria-label="Scene inspector"
        >
          <div className="inspector-top">
            <button
              ref={inspectorBack}
              className="text-button"
              onClick={() => setFocus(null)}
            >
              <ArrowLeft size={16} />
              Back to canvas
            </button>
            <span>
              Scene {frames.findIndex((a) => a.id === selected.id) + 1}
            </span>
          </div>
          <div className="inspector-image">
            <SceneImage
              index={frames.findIndex((a) => a.id === selected.id)}
              url={str(selected.payload.url)}
              alt="Selected scene"
            />
          </div>
          <p>
            {str(
              scenes[frames.findIndex((a) => a.id === selected.id)]?.narration,
            )}
          </p>
          <span className="sample-label">
            {generationLabel(selected)} · v{selected.version}
          </span>
          {!!selected.payload.feedback && (
            <p>Your direction: {str(selected.payload.feedback)}</p>
          )}
          <div className="inspector-actions">
            <button
              className="primary-button"
              disabled={
                busy ||
                selected.state === "approved" ||
                Boolean(selected.payload.needsRegeneration)
              }
              onClick={() => onApprove(selected.id)}
            >
              {selected.state === "approved" ? "Approved" : "Approve frame"}
              <Check size={16} />
            </button>
            <button
              className="secondary-button"
              disabled={busy || selected.state === "approved"}
              onClick={() => {
                returnFrame.current = null;
                onFeedback(selected);
                setFocus(null);
              }}
            >
              Suggest a change
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
export function WebConversation({
  chatId,
  videoId: initialVideoId,
}: {
  chatId: string;
  videoId?: string;
}) {
  const chat = useWebChat(chatId);
  const videoId = chat.videoId || initialVideoId || "";
  const [draft, setDraft] = useState(() => readLocal(`composer.${chatId}`, ""));
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [references, setReferences] = useState<ReferenceFile[]>([]);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<ArtefactSummary | null>(
    null,
  );
  const [revision, setRevision] = useState<{
    targets: ArtefactSummary[];
    note: string;
    quote: RegeneratePreviewResponse;
  } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const firstCanvas = useRef(false);
  const question = openQuestion(chat.messages);
  const script = chat.artefacts.find((a) => a.kind === "script");
  const hasCanvas = chat.artefacts.some((a) => visualKinds.has(a.kind));
  const awaiting = chat.artefacts.filter(
    (a) => a.state === "awaiting_approval",
  );
  const activity = chat.messages.filter((m) => m.kind === "progress");
  const [arriving] = useState(
    () => sessionStorage.getItem("chotu-arriving") === chatId,
  );
  useEffect(() => {
    sessionStorage.removeItem("chotu-arriving");
    void restoreFiles(readLocal(`references.${chatId}`, []))
      .then(setReferences)
      .catch(() => {});
    void restoreFiles(readLocal(`composerFiles.${chatId}`, []))
      .then(setFiles)
      .catch(() => {});
  }, [chatId]);
  useEffect(() => {
    if (hasCanvas && !firstCanvas.current) {
      firstCanvas.current = true;
      setCanvasOpen(readLocal(`canvas.${chatId}`, true));
    }
  }, [hasCanvas, chatId]);
  useEffect(() => {
    const el = scroll.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 380)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [chat.messages.length, chat.busy]);
  function updateDraft(value: string) {
    setDraft(value);
    saveLocal(`composer.${chatId}`, value);
  }
  function updateFiles(value: ReferenceFile[]) {
    setFiles(value);
    saveLocal(`composerFiles.${chatId}`, fileMetadata(value));
  }
  function toggleCanvas(value: boolean) {
    setCanvasOpen(value);
    saveLocal(`canvas.${chatId}`, value);
    if (!value) requestAnimationFrame(() => textarea.current?.focus());
  }
  function requestFeedback(target: ArtefactSummary) {
    setFeedbackTarget(target);
    if (window.matchMedia("(max-width: 760px)").matches) toggleCanvas(false);
    textarea.current?.focus();
  }
  async function send() {
    if (!draft.trim() || chat.busy || quoting) return;
    const note = draft.trim();
    const target =
      feedbackTarget ??
      (script && script.state !== "approved" ? script : undefined);
    const targets = target
      ? [target]
      : chat.stage === "cast"
        ? chat.artefacts.filter(
            (a) => a.kind === "image" && a.state !== "approved",
          )
        : [];
    if (targets.length) {
      setQuoting(true);
      try {
        const quotes = await Promise.all(
          targets.map((a) => chat.client.regenerateArtefact(a.id, 0)),
        );
        const previews = quotes.filter(
          (q): q is RegeneratePreviewResponse => "canAfford" in q,
        );
        if (previews.length !== targets.length)
          throw new Error(
            "Could not estimate this revision. Please try again.",
          );
        const creditCost = previews.reduce((sum, q) => sum + q.creditCost, 0);
        const balance = previews[0]!.balance;
        setRevision({
          targets,
          note,
          quote: {
            ...previews[0]!,
            creditCost,
            balance,
            canAfford: chat.creditsEnabled ? balance >= creditCost : true,
          },
        });
      } catch (e) {
        chat.setError(
          e instanceof Error ? e.message : "Could not get a revision estimate.",
        );
      } finally {
        setQuoting(false);
      }
      return;
    }
    const attachmentsText = files.length
      ? `\n\nReferences (saved in this browser): ${files.map((f) => f.name).join(", ")}`
      : "";
    const ok = await chat.run(() =>
      chat.client.postMessage(
        chatId,
        question
          ? { text: note, answer: { field: question.field, freeText: note } }
          : { text: note + attachmentsText },
      ),
    );
    if (ok) {
      updateDraft("");
      if (files.length) {
        const next = [...references, ...files];
        setReferences(next);
        saveLocal(`references.${chatId}`, fileMetadata(next));
        updateFiles([]);
      }
    }
  }
  async function confirmRevision() {
    if (!revision) return;
    const { targets, note } = revision;
    const ok = await chat.run(async () => {
      await chat.client.postMessage(chatId, { text: note });
      for (const target of targets) {
        if (target.state !== "rejected" && target.state !== "failed")
          await chat.client.rejectArtefact(target.id, { rejectNote: note });
        const result = await chat.client.regenerateArtefact(target.id, 1, note);
        if ("artefact" in result && result.artefact.state === "failed")
          throw new Error(
            "This revision could not finish. Your note is saved; retry this item.",
          );
      }
    });
    if (ok) {
      updateDraft("");
      setRevision(null);
      setFeedbackTarget(null);
    }
  }
  function approve(id: string) {
    void chat.run(() => chat.client.approveArtefact(id));
  }
  const lastQuestionId = question?.id;
  const firstQuestion = chat.messages.findIndex((m) => m.kind === "question");
  const firstReview = chat.messages.findIndex((m) => m.kind === "approval");
  const intakeReplies = new Set(
    chat.messages
      .filter(
        (m, i) =>
          m.role === "user" &&
          firstQuestion >= 0 &&
          i > firstQuestion &&
          (firstReview < 0 || i < firstReview),
      )
      .map((m) => m.id),
  );
  const selections = chat.messages.flatMap((m, i) => {
    if (m.kind !== "question") return [];
    const answer = chat.messages
      .slice(i + 1)
      .find((next) => next.role === "user");
    return answer?.kind === "text" && intakeReplies.has(answer.id)
      ? [answer.text]
      : [];
  });
  const firstVisualMessage = chat.messages.find(
    (m) => m.kind === "approval" && visualKinds.has(m.artefactKind),
  );
  return (
    <Shell
      chatId={chatId}
      credits={chat.creditsEnabled ? chat.credits : undefined}
      canvasOpen={canvasOpen}
      hasCanvas={hasCanvas}
      onCanvas={() => toggleCanvas(!canvasOpen)}
    >
      <main className="conversation-workspace" id="main-content">
        <section className="conversation" aria-label="Conversation">
          <div className="conversation-scroll" ref={scroll}>
            <div className="conversation-content">
              {!chat.loaded && (
                <div className="thinking">
                  <LoaderCircle size={16} className="spin" />
                  Opening your conversation…
                </div>
              )}
              {chat.messages.map((message, index) => {
                if (message.kind === "progress" || message.role === "system")
                  return null;
                if (message.kind === "text") {
                  if (intakeReplies.has(message.id)) return null;
                  if (
                    message.role === "assistant" &&
                    message.text.startsWith("Your video is set:")
                  ) {
                    const settings = message.text
                      .split("\n")
                      .slice(1)
                      .map((line) => {
                        const colon = line.indexOf(":");
                        return [
                          line.slice(0, colon),
                          line.slice(colon + 1).trim(),
                        ];
                      });
                    return (
                      <div className="message assistant" key={message.id}>
                        <span className="assistant-name">
                          <Brand />
                        </span>
                        <section
                          className="configuration-summary"
                          aria-label="Video configuration summary"
                        >
                          <h2>
                            <Check size={18} />
                            Here’s your video plan.
                          </h2>
                          <dl className="summary-grid">
                            {settings.map(([name, value]) => (
                              <div key={name}>
                                <dt>{name}</dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      </div>
                    );
                  }
                  if (
                    message.role === "assistant" &&
                    /Brief lock|Regenerate dabao|Brief already locked/.test(
                      message.text,
                    )
                  )
                    return null;
                  return (
                    <div
                      key={message.id}
                      className={`message ${message.role} ${index === 0 && arriving ? "idea-arriving" : ""}`}
                    >
                      <span className="author">
                        {message.role === "user" ? "You" : "SLB2"}
                      </span>
                      <p>{message.text}</p>
                      {index === 0 && <Files files={references} />}
                    </div>
                  );
                }
                if (message.kind === "question")
                  return message.id === lastQuestionId ? (
                    <div
                      className="message assistant configuration-block"
                      key="configuration"
                    >
                      <span className="assistant-name">
                        <Brand />
                      </span>
                      {selections.length > 0 && (
                        <div
                          className="configuration-selections"
                          aria-label="Your selections"
                        >
                          {selections.map((selection, i) => (
                            <span key={i}>{selection}</span>
                          ))}
                        </div>
                      )}
                      <Question
                        message={message}
                        busy={chat.busy}
                        onAnswer={(id, text) => {
                          void chat.run(() =>
                            chat.client.postMessage(chatId, {
                              text,
                              answer: { field: message.field, optionId: id },
                            }),
                          );
                        }}
                        onDefaults={() => {
                          void chat.run(() =>
                            chat.client.postMessage(chatId, {
                              text: "Choose the remaining details for me",
                              answer: {
                                field: "__defaults",
                                useDefaults: true,
                              },
                            }),
                          );
                        }}
                      />
                    </div>
                  ) : null;
                if (message.kind === "approval") {
                  const art = chat.artefacts.find(
                    (a) => a.id === message.artefactId,
                  );
                  if (message.artefactKind === "script")
                    return (
                      <div className="message assistant" key={message.id}>
                        <span className="assistant-name">
                          <Brand />
                        </span>
                        <Script
                          message={message}
                          artefact={art}
                          runtime={chat.runtime}
                          onReviewFix={(note) => {
                            if (art) {
                              requestFeedback(art);
                              updateDraft(note);
                            }
                          }}
                          busy={chat.busy || quoting || Boolean(revision)}
                          onApprove={() => approve(message.artefactId)}
                          onRevise={() => {
                            if (art) requestFeedback(art);
                          }}
                        />
                      </div>
                    );
                  if (visualKinds.has(message.artefactKind)) {
                    if (message.id !== firstVisualMessage?.id) return null;
                    return (
                      <div
                        className="message assistant visual-invitation"
                        key={message.id}
                      >
                        <span className="assistant-name">
                          <Brand />
                        </span>
                        <p>Let’s see your story take shape.</p>
                        <p className="muted">
                          I’ve opened a canvas for the characters, scenery, and
                          first frames. Take a look and tell me what feels
                          right.
                        </p>
                        <button
                          className="canvas-link"
                          onClick={() => toggleCanvas(true)}
                        >
                          <div className="canvas-link-thumb">
                            <SceneImage
                              index={0}
                              url={str(
                                chat.artefacts.find((a) => a.kind === "image")
                                  ?.payload.url,
                              )}
                              alt="Your visual direction"
                            />
                          </div>
                          <span>
                            <strong>Your visual direction</strong>
                            <small>Characters & scene previews</small>
                          </span>
                          <ArrowUpRight size={19} />
                        </button>
                      </div>
                    );
                  }
                  if (message.artefactKind === "prompt")
                    return art?.state === "approved" ? null : (
                      <details className="message" key={message.id}>
                        <summary>
                          Scene direction
                          <ChevronDown size={14} />
                        </summary>
                        <p>{str(message.preview.imagePrompt)}</p>
                        <button
                          className="secondary-button"
                          onClick={() => approve(message.artefactId)}
                          disabled={chat.busy}
                        >
                          Approve direction
                        </button>
                      </details>
                    );
                  return (
                    <article className="message media-message" key={message.id}>
                      <h3>{message.title}</h3>
                      <ProviderLine
                        source={art ?? { payload: message.preview }}
                      />
                      <MediaPlayer
                        kind={
                          ["audio", "voice"].includes(message.artefactKind) ? "audio" : "video"
                        }
                        name={message.title}
                        url={str((art?.payload ?? message.preview).url)}
                      />
                      <p className="muted">
                        AI-created content · review before publishing
                      </p>
                      {art?.state === "approved" ? (
                        <span className="approved-line">
                          <Check size={15} />
                          Approved
                        </span>
                      ) : (
                        <div className="script-actions">
                          <button
                            className="primary-button"
                            disabled={chat.busy}
                            onClick={() => approve(message.artefactId)}
                          >
                            Approve
                          </button>
                          {art && (
                            <button
                              className="text-button"
                              disabled={chat.busy}
                              onClick={() => requestFeedback(art)}
                            >
                              Request a change
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                }
                if (message.kind === "video")
                  return (
                    <div className="message" key={message.id}>
                      <h2>Your video is ready.</h2>
                      <MediaPlayer name="Final video" url={message.url} />
                      {mediaUrl(message.url) && !isSampleUrl(message.url) ? (
                        <a
                          className="secondary-button"
                          href={`/v1/videos/${videoId}/download`}
                        >
                          <Download size={16} />
                          Download video
                        </a>
                      ) : (
                        <p className="muted">
                          Download becomes available when the server returns a
                          playable video.
                        </p>
                      )}
                      <p className="muted">
                        {isSampleUrl(message.url)
                          ? "Sample output"
                          : "AI-created content"}
                      </p>
                    </div>
                  );
                return null;
              })}
              {hasCanvas &&
                chat.stage === "cast" &&
                awaiting.some((a) => visualKinds.has(a.kind)) && (
                  <div className="visual-approval">
                    <p>How does the direction feel?</p>
                    <p className="muted">
                      Approve the characters, reference sheets, voices, and
                      frames when you’re happy with the look.
                    </p>
                    <button
                      className="primary-button"
                      disabled={chat.busy || quoting || Boolean(revision)}
                      onClick={() =>
                        void chat.run(() =>
                          chat.client.approveAllRemaining(videoId),
                        )
                      }
                    >
                      Approve visuals & continue
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                )}
              {chat.artefacts
                .filter((a) => a.state === "failed")
                .map((a) => (
                  <div className="error-note" key={a.id} role="alert">
                    <p>This generation didn’t finish.</p>
                    <p>
                      {generationError(a.payload.error)}
                    </p>
                    {a.payload.failedStage && a.kind !== "script" ? (
                      <button
                        disabled={chat.busy}
                        onClick={() =>
                          void chat.run(() =>
                            chat.client.regenerateArtefact(a.id, 1),
                          )
                        }
                      >
                        Retry this step
                      </button>
                    ) : (
                      <button onClick={() => requestFeedback(a)}>
                        Retry with a note
                      </button>
                    )}
                  </div>
                ))}
              <GenerationProgress events={chat.mediaProgress} />
              {revision && (
                <section
                  className="revision-confirm"
                  aria-label="Confirm revision"
                >
                  <h3>
                    {revision.targets.length > 1
                      ? `Update all ${revision.targets.length} scenes?`
                      : "Let’s try a new version."}
                  </h3>
                  <p>“{revision.note}”</p>
                  <p className="muted">
                    {chat.creditsEnabled ? (
                      <>
                        {revision.quote.creditCost} sample credits ·{" "}
                        {revision.quote.balance} available.{" "}
                      </>
                    ) : null}
                    {revision.targets[0]?.kind === "script"
                      ? "You’ll review the new script before any visuals are created."
                      : "You’ll review this item again before continuing."}
                  </p>
                  {!chat.creditsEnabled || revision.quote.canAfford ? (
                    <button
                      className="primary-button"
                      disabled={chat.busy}
                      onClick={() => void confirmRevision()}
                    >
                      <RotateCcw size={15} />
                      {chat.creditsEnabled
                        ? `Regenerate · ${revision.quote.creditCost} credits`
                        : "Regenerate"}
                    </button>
                  ) : (
                    <p role="alert">
                      Not enough sample credits for this revision.
                    </p>
                  )}
                  <button
                    className="text-button"
                    disabled={chat.busy}
                    onClick={() => setRevision(null)}
                  >
                    Keep editing
                  </button>
                </section>
              )}
              {chat.busy && (
                <p className="thinking" role="status">
                  <LoaderCircle className="spin" size={16} />
                  {revision
                    ? "Making those changes…"
                    : activity.length &&
                        activity[activity.length - 1]?.kind === "progress"
                      ? (activity[activity.length - 1] as { text: string }).text
                      : label[chat.stage]}
                </p>
              )}
              {activity.length > 0 && (
                <details className="activity">
                  <summary>
                    Behind the scenes
                    <ChevronRight size={13} />
                  </summary>
                  {activity.map(
                    (m) => m.kind === "progress" && <p key={m.id}>{m.text}</p>,
                  )}
                </details>
              )}
            </div>
          </div>
          <div className="conversation-bottom">
            {chat.error && (
              <div role="alert" className="error-note">
                {chat.error === "not_found" || chat.error === "unauthorized"
                  ? "This session has expired. Start a new video to continue."
                  : chat.error}
                <button onClick={() => chat.setError("")}>Dismiss</button>
              </div>
            )}
            {feedbackTarget && (
              <div className="feedback-context">
                <span>
                  Revising{" "}
                  {feedbackTarget.kind === "script"
                    ? "your script"
                    : feedbackTarget.kind === "image"
                      ? "this scene"
                      : str(feedbackTarget.payload.name) || "this visual"}
                </span>
                <IconButton
                  title="Cancel revision"
                  onClick={() => setFeedbackTarget(null)}
                >
                  <X size={14} />
                </IconButton>
              </div>
            )}
            <Composer
              value={draft}
              onChange={updateDraft}
              files={files}
              setFiles={updateFiles}
              busy={chat.busy || quoting || !chat.loaded}
              onSend={() => void send()}
              textareaRef={textarea}
              placeholder={
                feedbackTarget || (script && script.state !== "approved")
                  ? "What would you like to change?"
                  : question
                    ? "Tell me what you have in mind…"
                    : "Keep shaping your story…"
              }
            />
            <p className="composer-footnote">
              {chat.runtime?.mock
                ? "Sample mode · sample generations and credits"
                : "Review each step before continuing · sample credit balance"}
            </p>
          </div>
        </section>
        <Canvas
          artefacts={chat.artefacts}
          messages={chat.messages}
          stage={chat.stage}
          open={canvasOpen}
          onClose={() => toggleCanvas(false)}
          onFeedback={requestFeedback}
          onApprove={approve}
          busy={chat.busy || quoting || Boolean(revision)}
        />
      </main>
    </Shell>
  );
}
