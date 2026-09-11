import React, { useState } from 'react';
import {
  CheckCircle,
  Folder,
  Play,
  Film,
  Clock,
  Info,
  X,
  Copy,
  Check,
  FileText,
  Hash,
  Tag,
  Share2,
} from 'lucide-react';
import { ProjectSession, ClipJob } from '../types';
import { formatSecondsToTimestamp } from '../utils/timestamps';
import { safeCopyToClipboard } from '../utils/clipboard';

interface Step6ResultsProps {
  session: ProjectSession;
}

export const Step6Results: React.FC<Step6ResultsProps> = ({ session }) => {
  const [activePreviewClip, setActivePreviewClip] = useState<ClipJob | null>(
    session.clipJobs.find((j) => j.status === 'completed') || null
  );
  const [detailsModalClip, setDetailsModalClip] = useState<ClipJob | null>(null);

  // Copy feedback state for modal
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const completedClips = session.clipJobs.filter((j) => j.status === 'completed');
  const processingClips = session.clipJobs.filter((j) => j.status === 'processing');

  // Helper to retrieve hashtags and keywords from either clipJob or validationResult
  const getClipMetadata = (clip: ClipJob) => {
    const matchingJsonClip = session.validationResult?.clips?.find(
      (c) => String(c.id) === String(clip.clipId)
    );
    const hashtags: string[] =
      clip.hashtags && clip.hashtags.length > 0
        ? clip.hashtags
        : matchingJsonClip?.hashtags || [];
    const keywords: string[] =
      clip.keywords && clip.keywords.length > 0
        ? clip.keywords
        : matchingJsonClip?.keywords || [];

    const formattedHashtags = hashtags
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .join(' ');

    const outputFolder = session.outputDir || '';
    const fullPath = clip.outputPath
      ? clip.outputPath
      : outputFolder && clip.outputFilename
      ? `${outputFolder}/${clip.outputFilename}`
      : clip.outputFilename || '';

    return {
      matchingJsonClip,
      hashtags,
      keywords,
      formattedHashtags,
      fullPath,
    };
  };

  const handleCopyText = async (text: string, fieldName: string) => {
    await safeCopyToClipboard(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const modalMeta = detailsModalClip ? getClipMetadata(detailsModalClip) : null;

  return (
    <div id="step-6-results-container" className="max-w-6xl mx-auto space-y-5">
      {/* Header & Output Location */}
      <div className="ws-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-[var(--success-subtle)] text-[var(--success-text)] flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold ws-title">
                Stage 5: Results & Playback
              </h2>
              <p className="text-xs ws-muted mt-0.5 max-w-2xl">
                Review and preview your generated 9:16 vertical clips. All clips have been rendered and saved to your computer.
              </p>
            </div>
          </div>
        </div>

        {/* Clean Informational Destination Status (Strictly non-clickable information) */}
        <div className="pt-3 border-t border-[var(--border-default)] flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 text-xs">
          <div className="space-y-0.5 min-w-0">
            <div className="font-semibold ws-title flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
              <span>
                {completedClips.length} {completedClips.length === 1 ? 'Clip' : 'Clips'} Saved to Folder
              </span>
            </div>
            <div
              className="text-[11px] font-mono ws-muted select-all truncate max-w-2xl"
              title={session.outputDir || 'Configured Project Directory'}
            >
              {session.outputDir || 'Configured Project Directory'}
            </div>
          </div>

          <div className="text-[11px] ws-muted font-medium sm:text-right shrink-0">
            9:16 Vertical • 1080×1920
          </div>
        </div>
      </div>

      {/* Main Results Showcase: Single 9:16 Player & Clip Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: 9:16 Vertical Video Player (Video preview only - NO duplicate show details button) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="ws-panel p-4">
            <div className="text-xs font-bold ws-title mb-2 flex items-center gap-2 truncate">
              <Film className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
              <span className="truncate">{activePreviewClip ? activePreviewClip.title : '9:16 Vertical Player'}</span>
            </div>

            {/* Vertical 9:16 Aspect Player */}
            <div className="rounded overflow-hidden bg-black aspect-[9/16] max-h-[520px] mx-auto border border-[var(--border-default)] relative shadow-inner flex items-center justify-center">
              {activePreviewClip ? (
                <video
                  id="active-vertical-video-player"
                  key={activePreviewClip.clipId}
                  controls
                  playsInline
                  className="w-full h-full object-contain ws-video-stage"
                  src={`/api/media/clip-stream/${session.sessionId}/${activePreviewClip.clipId}`}
                />
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs">
                  <Play className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  Select a completed clip on the right to preview
                </div>
              )}
            </div>

            {/* Concise player status bar */}
            {activePreviewClip && (
              <div className="mt-3 flex items-center justify-between text-[11px] ws-muted font-mono px-1">
                <span>1080×1920 • {activePreviewClip.durationSec}s</span>
                <span className="text-[var(--brand-text)] truncate max-w-[180px]" title={activePreviewClip.outputFilename}>
                  {activePreviewClip.outputFilename}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Clips Gallery with Show Details Modal Trigger */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold ws-title flex items-center gap-2">
              <span>Completed Clips</span>
              <span className="text-xs font-normal ws-muted">
                ({completedClips.length} available)
              </span>
            </h3>

            {processingClips.length > 0 && (
              <span className="text-xs text-[var(--warning-text)] font-medium animate-pulse">
                {processingClips.length} rendering in background...
              </span>
            )}
          </div>

          {completedClips.length === 0 ? (
            <div className="ws-panel p-10 text-center ws-muted text-xs">
              No clips completed yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {completedClips.map((clip, index) => {
                const isSelected = activePreviewClip?.clipId === clip.clipId;
                const meta = getClipMetadata(clip);

                return (
                  <div
                    key={clip.clipId}
                    id={`result-clip-card-${clip.clipId}`}
                    onClick={() => setActivePreviewClip(clip)}
                    className={`p-3.5 rounded border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected
                        ? 'ws-card-selected'
                        : 'ws-panel hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-7 h-7 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] border border-[var(--brand-border)] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {String(index + 1).padStart(2, '0')}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="text-xs font-bold ws-title flex items-center gap-2 truncate">
                          <span className="truncate">{clip.title}</span>
                          <span className="font-mono text-[11px] font-semibold ws-badge-brand px-1 py-0.2 shrink-0">
                            {clip.durationSec}s
                          </span>
                        </div>

                        {clip.description && (
                          <p className="text-[11px] ws-title line-clamp-2">
                            {clip.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] ws-muted font-mono pt-0.5">
                          <span>Timeline: {formatSecondsToTimestamp(clip.startSec)} – {formatSecondsToTimestamp(clip.endSec)}</span>
                          {clip.formattedSize && <span>Size: {clip.formattedSize}</span>}
                          {clip.hasTrackedFace ? (
                            <span className="text-[var(--brand-text)] font-semibold flex items-center gap-1">
                              <span>•</span> AI Face Tracked
                            </span>
                          ) : (
                            <span className="text-[var(--success-text)] font-semibold">Framed & Cropped</span>
                          )}
                        </div>

                        {/* Hashtag summary chips */}
                        {meta.hashtags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            {meta.hashtags.slice(0, 3).map((h, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 text-[10px] rounded ws-badge-neutral font-mono"
                              >
                                {h.startsWith('#') ? h : `#${h}`}
                              </span>
                            ))}
                            {meta.hashtags.length > 3 && (
                              <span className="text-[10px] ws-muted">
                                +{meta.hashtags.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons: Preview & Show Details */}
                    <div
                      className="flex items-center gap-2 shrink-0 self-end sm:self-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setActivePreviewClip(clip)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
                          isSelected
                            ? 'bg-[var(--brand-primary)] text-white'
                            : 'ws-btn-secondary'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isSelected ? 'Playing' : 'Preview'}</span>
                      </button>

                      {/* Show Details Modal Trigger Button */}
                      <button
                        id={`btn-show-details-${clip.clipId}`}
                        type="button"
                        onClick={() => setDetailsModalClip(clip)}
                        className="ws-btn-secondary text-[var(--brand-text)] font-semibold"
                        title="Show title, description, hashtags and keywords modal for posting"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Show Details</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Show Details Modal Dialog */}
      {detailsModalClip && modalMeta && (
        <div
          id="clip-details-modal-backdrop"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setDetailsModalClip(null)}
        >
          <div
            id="clip-details-modal-dialog"
            className="ws-panel max-w-2xl w-full p-6 shadow-xl space-y-5 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center font-bold text-xs">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold ws-title">Clip Details & Social Metadata</h3>
                  <p className="text-xs ws-muted">
                    Ready to copy for TikTok, Instagram Reels, and YouTube Shorts.
                  </p>
                </div>
              </div>

              <button
                id="btn-close-details-modal"
                type="button"
                onClick={() => setDetailsModalClip(null)}
                className="ws-btn-secondary p-1.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Actions Bar */}
            <div className="ws-section p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs ws-title flex items-center gap-1.5 font-medium">
                <Share2 className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                <span>One-Click Full Social Post:</span>
              </div>

              <button
                id="btn-copy-full-social-post"
                type="button"
                onClick={() => {
                  const postContent = `${detailsModalClip.title}\n\n${detailsModalClip.description}\n\n${modalMeta.formattedHashtags}`;
                  handleCopyText(postContent, 'full-post');
                }}
                className="ws-btn-primary"
              >
                {copiedField === 'full-post' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied Full Post!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full Social Post (Title + Desc + Tags)</span>
                  </>
                )}
              </button>
            </div>

            {/* Field 1: Title */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold ws-title">Clip Title</span>
                <button
                  type="button"
                  onClick={() => handleCopyText(detailsModalClip.title, 'title')}
                  className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                >
                  {copiedField === 'title' ? (
                    <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> Copied Title
                    </span>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy Title
                    </>
                  )}
                </button>
              </div>
              <div className="ws-well p-3 text-xs font-semibold ws-title select-text">
                {detailsModalClip.title}
              </div>
            </div>

            {/* Field 2: Timestamps, Duration & File Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="ws-well p-3 space-y-1">
                <div className="text-[11px] ws-muted flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3 text-[var(--brand-primary)]" /> Timeline & Duration
                </div>
                <div className="text-xs font-mono font-semibold ws-title">
                  {formatSecondsToTimestamp(detailsModalClip.startSec)} &rarr; {formatSecondsToTimestamp(detailsModalClip.endSec)} ({detailsModalClip.durationSec} seconds)
                </div>
              </div>

              <div className="ws-well p-3 space-y-1">
                <div className="flex items-center justify-between text-[11px] ws-muted font-medium">
                  <span className="flex items-center gap-1">
                    <Folder className="w-3 h-3 text-[var(--brand-primary)]" /> Output File
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(modalMeta.fullPath, 'filepath')}
                    className="text-[11px] text-[var(--brand-text)] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    {copiedField === 'filepath' ? (
                      <span className="text-[var(--success-text)] flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" /> Copied Path
                      </span>
                    ) : (
                      <>
                        <Copy className="w-2.5 h-2.5" /> Copy Path
                      </>
                    )}
                  </button>
                </div>
                <div className="text-xs font-mono font-semibold text-[var(--brand-text)] truncate" title={modalMeta.fullPath}>
                  {detailsModalClip.outputFilename || 'Completed clip'}
                </div>
              </div>
            </div>

            {/* Field 3: Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold ws-title">Description</span>
                <button
                  type="button"
                  onClick={() => handleCopyText(detailsModalClip.description, 'description')}
                  className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                >
                  {copiedField === 'description' ? (
                    <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                      <Check className="w-3 h-3" /> Copied Description
                    </span>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy Description
                    </>
                  )}
                </button>
              </div>
              <div className="ws-well p-3 text-xs ws-title leading-relaxed whitespace-pre-wrap select-text">
                {detailsModalClip.description || 'No description provided.'}
              </div>
            </div>

            {/* Field 4: Hashtags */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold ws-title flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5 text-[var(--brand-primary)]" /> Hashtags
                </span>
                {modalMeta.hashtags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(modalMeta.formattedHashtags, 'hashtags')}
                    className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                  >
                    {copiedField === 'hashtags' ? (
                      <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Copied Hashtags
                      </span>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy All Hashtags
                      </>
                    )}
                  </button>
                )}
              </div>

              {modalMeta.hashtags.length > 0 ? (
                <div className="ws-well p-3 flex flex-wrap gap-1.5">
                  {modalMeta.hashtags.map((tag, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleCopyText(tag.startsWith('#') ? tag : `#${tag}`, `tag-${idx}`)}
                      className="px-2.5 py-1 text-xs font-mono rounded bg-[var(--brand-subtle)] hover:bg-[var(--surface-hover)] text-[var(--brand-text)] border border-[var(--brand-border)] transition flex items-center gap-1 cursor-pointer"
                      title="Click to copy single hashtag"
                    >
                      <span>{tag.startsWith('#') ? tag : `#${tag}`}</span>
                      {copiedField === `tag-${idx}` && <Check className="w-2.5 h-2.5 text-[var(--success-solid)]" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="ws-well p-3 text-xs ws-muted">
                  No hashtags specified in the JSON response.
                </div>
              )}
            </div>

            {/* Field 5: Keywords */}
            {modalMeta.keywords.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold ws-title flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-[var(--brand-primary)]" /> Keywords
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(modalMeta.keywords.join(', '), 'keywords')}
                    className="text-xs text-[var(--brand-text)] hover:underline flex items-center gap-1 font-medium transition cursor-pointer"
                  >
                    {copiedField === 'keywords' ? (
                      <span className="text-[var(--success-text)] flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Copied Keywords
                      </span>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy Keywords
                      </>
                    )}
                  </button>
                </div>
                <div className="ws-well p-3 flex flex-wrap gap-1.5">
                  {modalMeta.keywords.map((kw, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-xs rounded ws-badge-neutral"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="border-t border-[var(--border-default)] pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailsModalClip(null)}
                className="ws-btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
