"use client";

import { MessageSquare, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { StudioArtifact, WorkspaceContext } from "../lib/studio-session";
import { ResearchStudio } from "./studio";
import styles from "./contextual-assistant.module.css";

export function ContextualAssistant({
  context,
  sessionId,
  open,
  onOpenChange,
  onClose,
  onOpenStudio,
  onSessionChange,
  onSaveArtifact,
}: {
  context: WorkspaceContext;
  sessionId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  onOpenStudio?: (id: string) => void;
  onSessionChange?: (id: string) => void;
  onSaveArtifact?: (artifact: StudioArtifact) => void | Promise<void>;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const [opened, setOpened] = useState(Boolean(open));
  const router = useRouter();
  const isOpen = open ?? localOpen;
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  function restoreFocus() {
    const button = launcher.current;
    if (button && button.getClientRects().length > 0) button.focus();
    else document.getElementById("contextual-assistant-header")?.focus();
  }
  function change(value: boolean) {
    if (value) setOpened(true);
    setLocalOpen(value);
    onOpenChange?.(value);
    if (!value) onClose?.();
  }
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isOpen && !element.open) {
      setOpened(true);
      if (window.matchMedia("(min-width: 1440px)").matches) element.show();
      else element.showModal();
      element
        .querySelector<HTMLButtonElement>(
          "button[aria-label='Close contextual assistant']",
        )
        ?.focus();
    }
    if (!isOpen && element.open) {
      element.close();
      restoreFocus();
    }
  }, [isOpen]);
  return (
    <div className={styles.assistant}>
      <button
        ref={launcher}
        className={styles.launcher}
        onClick={() => change(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="nova-contextual-assistant"
      >
        <span className={styles.core}>
          <MessageSquare size={21} strokeWidth={1.75} />
        </span>
        Ask Nova Ember
      </button>
      <dialog
        id="nova-contextual-assistant"
        ref={dialog}
        className={styles.panel}
        aria-label="Contextual research assistant"
        onCancel={() => change(false)}
        onClose={() => {
          if (isOpen) change(false);
          restoreFocus();
        }}
      >
        <div className={styles.close}>
          <span>Selected context · private browser session</span>
          <button
            className="icon-button"
            aria-label="Close contextual assistant"
            onClick={() => change(false)}
          >
            <X size={18} />
          </button>
        </div>
        {opened && (
          <ResearchStudio
            snapshotId={context.snapshot_id}
            context={context}
            sessionId={sessionId}
            compact
            visible={isOpen}
            onSessionChange={onSessionChange}
            onExpand={(id) => {
              change(false);
              if (onOpenStudio) onOpenStudio(id);
              else router.push(`/app/agent/${id}`);
            }}
            onSaveArtifact={onSaveArtifact}
          />
        )}
      </dialog>
    </div>
  );
}
