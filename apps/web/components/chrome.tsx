"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Compass,
  FlaskConical,
  GitCompareArrows,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Preferences } from "../lib/workspace-backup";
import type { WorkspaceContext } from "../lib/research-context";
import { BrandEmber } from "./brand-ember";

export function Mark() {
  return (
    <svg className="brand-mark" aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M18.4 6.1A8.4 8.4 0 1 0 20 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15 3.8a8.4 8.4 0 0 1 4.8 4.9"
        fill="none"
        stroke="#F06449"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12.6 7.4c.5 2.9-3.5 3.4-3.5 6.3a3 3 0 0 0 6 0c0-1.8-1.4-2.8-2.5-6.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Wordmark({
  reducedMotion,
  onNavigate,
}: {
  reducedMotion: boolean;
  onNavigate: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Link
      href="/app"
      className="wordmark"
      aria-label="Nova Ember"
      onClick={onNavigate}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Mark />
      <span className="wordmark-text" aria-hidden="true">
        NOV
        <span className="wordmark-letter">
          A
          <BrandEmber
            active={hovered || focused}
            reducedMotion={reducedMotion}
            className="wordmark-ember"
          />
        </span>{" "}
        EMBER
      </span>
    </Link>
  );
}

const destinations = [
  {
    id: "investigations",
    title: "Investigations",
    href: "/app/investigations",
    icon: Compass,
  },
  {
    id: "compare",
    title: "Compare",
    href: "/app/compare",
    icon: GitCompareArrows,
  },
  { id: "lab", title: "Data & models", href: "/app/lab", icon: FlaskConical },
  {
    id: "agent",
    title: "Research assistant",
    href: "/app/agent",
    icon: MessageSquare,
  },
  { id: "cases", title: "Your research", href: "/app/cases", icon: BookOpen },
];
const furtherDestinations = [
  { id: "help", title: "How to use Nova Ember", href: "/app/help" },
  { id: "coverage", title: "Evidence & sources", href: "/app/coverage" },
  { id: "dashboards", title: "Research figures", href: "/app/dashboards" },
  { id: "jobs", title: "Running tasks", href: "/app/jobs" },
  { id: "agents", title: "Custom research assistants", href: "/app/agents" },
  { id: "settings", title: "Settings & backup", href: "/app/settings" },
];

export function Shell({
  section,
  children,
  theme,
  onTheme,
  onBackup,
  onRestore,
  preferences,
  context,
  assistantOpen,
  onAsk,
}: {
  section: string;
  snapshot: string | null;
  children: React.ReactNode;
  theme: "light" | "dark";
  onTheme: () => void;
  onBackup: () => void;
  onRestore: () => void;
  assistantOpen?: boolean;
  onAsk?: () => void;
  preferences?: Preferences;
  context?: WorkspaceContext | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [command, setCommand] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const current = [...destinations, ...furtherDestinations].find(
    (item) => item.id === section,
  );
  const query = command.trim().toLowerCase();
  const links = [...destinations, ...furtherDestinations].filter((item) =>
    item.title.toLowerCase().includes(query),
  );
  useEffect(() => {
    const element = dialog.current;
    if (commandOpen && !element?.open) {
      element?.showModal();
      element?.querySelector("input")?.focus();
    }
    if (!commandOpen && element?.open) element.close();
  }, [commandOpen]);
  useEffect(() => {
    const element = drawer.current;
    if (open && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        preferences?.command_shortcut !== false &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [preferences?.command_shortcut]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const close = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  function navigate(href: string) {
    setOpen(false);
    setCommandOpen(false);
    router.push(href);
  }
  return (
    <div
      className="app-shell research-shell"
      data-assistant-open={assistantOpen || undefined}
      data-theme={theme}
      data-density={preferences?.density}
      data-reduce-transparency={preferences?.reduce_transparency || undefined}
      data-reduce-motion={preferences?.reduce_motion || undefined}
    >
      <a className="skip-link" href="#research-content">
        Skip to research content
      </a>
      <header className="site-header">
        <Wordmark
          reducedMotion={preferences?.reduce_motion ?? false}
          onNavigate={() => setOpen(false)}
        />
        <nav className="site-nav" aria-label="Research">
          {destinations.map(({ id, title, href }) => (
            <Link
              key={id}
              href={href}
              aria-current={section === id ? "page" : undefined}
            >
              {title}
            </Link>
          ))}
        </nav>
        <div className="site-tools">
          <button
            className="icon-button"
            aria-label="Find a page or tool"
            onClick={() => setCommandOpen(true)}
          >
            <Search size={19} />
          </button>
          <button
            className="icon-button theme-control"
            onClick={onTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <Link
            className="icon-button settings-control"
            href="/app/settings"
            aria-label="Settings and backup"
          >
            <Settings size={19} />
          </Link>
          <button
            ref={menu}
            className="icon-button site-menu"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="research-navigation"
            onClick={() => setOpen(true)}
          >
            <Menu size={21} />
          </button>
        </div>
      </header>
      <div className="site-sectionbar">
        <div className="site-breadcrumb">
          <Link href="/app">Home</Link>
          {section !== "overview" && (
            <>
              <ChevronRight size={14} />
              <span>{current?.title ?? "Research"}</span>
            </>
          )}
        </div>
        <div className="site-selection">
          {!!context?.investigations?.length && section !== "overview" && (
            <Link
              href={`/app/compare?ids=${context.investigations.join(",")}&snapshot=${context.snapshot_id}`}
            >
              {context.investigations.length} selected investigation
              {context.investigations.length === 1 ? "" : "s"}
            </Link>
          )}
          {onAsk && section !== "agent" && section !== "overview" && (
            <button
              id="contextual-assistant-header"
              className="text-button"
              onClick={onAsk}
            >
              <MessageSquare size={16} />
              Ask about this page
            </button>
          )}
        </div>
      </div>
      <main
        id="research-content"
        className="research-content site-content"
        tabIndex={-1}
      >
        {children}
      </main>
      <footer className="site-footer">
        <span>
          Nova Ember <span className="footer-separator">/</span> NASA combustion
          research, connected.
        </span>
        <nav aria-label="Further research tools">
          {furtherDestinations
            .filter((item) => ["help", "coverage", "jobs"].includes(item.id))
            .map((item) => (
              <Link key={item.id} href={item.href}>
                {item.title}
              </Link>
            ))}
        </nav>
        <span className="footer-credit">Built by StrawHat Pirates</span>
      </footer>
      <dialog
        ref={drawer}
        id="research-navigation"
        className="research-navigation"
        aria-label="Research navigation"
        onCancel={() => setOpen(false)}
        onClose={() => {
          setOpen(false);
          menu.current?.focus();
        }}
      >
        <div className="command-heading">
          <h2>Explore Nova Ember</h2>
          <button
            className="icon-button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav>
          {destinations.map(({ id, title, href, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              aria-current={section === id ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              {title}
              <ArrowRight size={16} />
            </Link>
          ))}
        </nav>
        <nav className="further-navigation">
          {furtherDestinations.map((item) => (
            <Link key={item.id} href={item.href} onClick={() => setOpen(false)}>
              {item.title}
              <ChevronRight size={16} />
            </Link>
          ))}
        </nav>
      </dialog>
      <dialog
        ref={dialog}
        className="command-palette"
        aria-label="Find a page or tool"
        onCancel={() => setCommandOpen(false)}
        onClose={() => setCommandOpen(false)}
      >
        <div className="command-heading">
          <h2>Find a page or tool</h2>
          <button
            className="icon-button"
            aria-label="Close search"
            onClick={() => setCommandOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <label>
          What do you need?
          <input
            autoFocus
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Investigations, data, backup…"
          />
        </label>
        <nav aria-label="Search results">
          {links.map((item) => (
            <button key={item.id} onClick={() => navigate(item.href)}>
              {item.title}
              <ChevronRight size={16} />
            </button>
          ))}
        </nav>
        {!links.length && (
          <p>
            No matching page.{" "}
            <button
              className="text-button"
              onClick={() =>
                navigate(`/app/investigations?q=${encodeURIComponent(command)}`)
              }
            >
              Search investigations instead
            </button>
          </p>
        )}
        {(!query || "backup restore".includes(query)) && (
          <div className="command-backup">
            <button
              className="text-button"
              onClick={() => {
                setCommandOpen(false);
                onBackup();
              }}
            >
              Download research backup
            </button>
            <button
              className="text-button"
              onClick={() => {
                setCommandOpen(false);
                onRestore();
              }}
            >
              Restore a backup
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}

export function Notice({
  children,
  kind = "neutral",
}: {
  children: React.ReactNode;
  kind?: "neutral" | "caution" | "error";
}) {
  return (
    <div
      className={`notice notice-${kind}`}
      role={kind === "error" ? "alert" : undefined}
    >
      {children}
    </div>
  );
}

export function LoadingRows({
  label = "Loading the current evidence snapshot",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <p>{label}…</p>
      {[1, 2, 3, 4].map((key) => (
        <div className="skeleton-row" key={key} />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <Notice kind="error">
      <strong>Evidence could not be loaded</strong>
      <p>{message}</p>
      {retry && (
        <button className="button button-small" onClick={retry}>
          Try again
        </button>
      )}
    </Notice>
  );
}
