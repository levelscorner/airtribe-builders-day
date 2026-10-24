import { useEffect, useState } from "react";
import { ChevronDown, LoaderCircle, RotateCcw } from "lucide-react";
import { generationLabel, mediaUrl, scriptReview } from "./generation";
import { progressCopy, type MediaProgressEvent } from "../media-contract";

export function ProviderLine({
  source,
  fallback,
}: {
  source: unknown;
  fallback?: string;
}) {
  return (
    <span className="provider-label">{generationLabel(source, fallback)}</span>
  );
}

export function MediaPlayer({
  url,
  kind = "video",
  name,
}: {
  url?: string;
  kind?: "audio" | "video";
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [url]);
  const src = mediaUrl(url);
  if (!src || failed)
    return (
      <div className="media-unavailable" role="status">
        <p>
          {failed
            ? `${name} couldn’t load.`
            : `${name} isn’t available to play yet.`}
        </p>
        <small>
          {!src
            ? "A playable file will appear here when generation finishes."
            : "Your work is saved. Try loading this file again."}
        </small>
        {src && (
          <button
            className="text-button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            <RotateCcw size={14} />
            Load again
          </button>
        )}
      </div>
    );
  return (
    <div className="generated-player">
      {kind === "audio" ? (
        <audio
          key={`${src}-${attempt}`}
          aria-label={name}
          controls
          preload="none"
          src={src}
          onError={() => setFailed(true)}
        />
      ) : (
        <video
          key={`${src}-${attempt}`}
          aria-label={name}
          controls
          playsInline
          preload="metadata"
          src={src}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export function ScriptReviewPanel({
  source,
  busy,
  onApply,
}: {
  source: unknown;
  busy: boolean;
  onApply: (note: string) => void;
}) {
  const review = scriptReview(source);
  if (!review) return null;
  const notes = (
    Array.isArray(review.output) ? review.output : review.output.split(/\n+/)
  )
    .map((s) => s.trim())
    .filter(Boolean);
  const score =
    review.confidence === undefined
      ? undefined
      : Math.round(
          Math.max(
            0,
            Math.min(
              100,
              review.confidence <= 1
                ? review.confidence * 100
                : review.confidence,
            ),
          ),
        );
  const status =
    review.status === "mocked"
      ? "Sample review"
      : review.status === "completed"
        ? "Reviewed"
        : review.status === "hitl_triggered"
          ? "Needs your review"
          : "Review unavailable";
  return (
    <details className="script-review">
      <summary>
        <span>Script review</span>
        <span>
          {status}
          {score !== undefined ? ` · ${score}%` : ""}
        </span>
        <ChevronDown size={14} />
      </summary>
      {(review.warning ||
        ["failed", "budget_exceeded"].includes(review.status)) && (
        <p className="review-warning">
          The automated review could not finish. You can still review and
          approve the script yourself.
          {review.status === "mocked" ? " Suggestions below are examples." : ""}
        </p>
      )}
      {notes.length > 0 && (
        <ul>
          {notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => onApply(notes.join("\n"))}
        >
          Use suggestions to revise
        </button>
      )}
      <p className="muted">
        You make the final decision. Revisions show a credit estimate before
        generation.
      </p>
    </details>
  );
}

export function GenerationProgress({
  events,
}: {
  events: MediaProgressEvent[];
}) {
  const pending = events.filter((event) => event.status !== "done");
  if (!pending.length) return null;
  return (
    <section
      className="generation-status"
      aria-label="Generation progress"
      aria-live="polite"
    >
      {pending.map((event) => (
        <div
          key={event.artefactId}
          className={event.status === "failed" ? "generation-error" : ""}
        >
          {event.status !== "failed" && (
            <LoaderCircle size={14} className="spin" />
          )}
          <span>
            {event.kind === "voice"
              ? "Voice"
              : event.kind === "clip"
                ? "Clip"
                : "Frame"}{" "}
            · {progressCopy(event)}
          </span>
          <ProviderLine source={event} />
        </div>
      ))}
    </section>
  );
}
