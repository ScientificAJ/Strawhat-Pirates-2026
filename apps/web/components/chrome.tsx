"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  ChevronRight,
  Compass,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

const destinations = [
  { id: "overview", title: "Overview", href: "/app", icon: LayoutDashboard },
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
  { id: "lab", title: "Laboratory", href: "/app/lab", icon: FlaskConical },
  {
    id: "agent",
    title: "Research Studio",
    href: "/app/agent",
    icon: MessageSquare,
  },
  { id: "cases", title: "Research cases", href: "/app/cases", icon: BookOpen },
];

export function Shell({
  section,
  snapshot,
  children,
  theme,
  onTheme,
  onBackup,
  onRestore,
}: {
  section: string;
  snapshot: string | null;
  children: React.ReactNode;
  theme: "light" | "dark";
  onTheme: () => void;
  onBackup: () => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openedBefore = useRef(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 960px)");
    const changed = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", changed);
    return () => desktop.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (!open) {
      if (openedBefore.current) menuRef.current?.focus();
      openedBefore.current = false;
      return;
    }
    openedBefore.current = true;
    closeRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(
        navigationRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [open]);
  const current = destinations.find((item) => item.id === section);
  return (
    <div className="app-shell" data-theme={theme}>
      <a className="skip-link" href="#research-content">
        Skip to research content
      </a>
      {open && (
        <button
          className="navigation-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="mobile-navigation"
        ref={navigationRef}
        className={`navigation ${open ? "navigation-open" : ""}`}
        aria-label="Application navigation"
      >
        <button
          ref={closeRef}
          className="icon-button mobile-close"
          aria-label="Close navigation"
          onClick={() => {
            setOpen(false);
          }}
        >
          <X size={18} />
        </button>
        <Link href="/app" className="wordmark" onClick={() => setOpen(false)}>
          <Mark />
          <span>Nova Ember</span>
        </Link>
        <div className="workspace-label">
          <Monitor size={15} />
          <span>On this device</span>
        </div>
        <nav aria-label="Research">
          {destinations.map(({ id, title, href, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              className={`navigation-link ${section === id ? "is-active" : ""}`}
              aria-current={section === id ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} strokeWidth={1.75} />
              <span>{title}</span>
            </Link>
          ))}
        </nav>
        <div className="navigation-bottom">
          <div className="workspace-note">
            <span className="small-dot" />
            <span>Your personal workspace</span>
            <p>Cases and notes stay in this browser.</p>
          </div>
          <button className="navigation-link" onClick={onBackup}>
            <ArrowDownToLine size={18} />
            <span>Back up workspace</span>
          </button>
          <button className="navigation-link" onClick={onRestore}>
            <ArrowUpFromLine size={18} />
            <span>Restore backup</span>
          </button>
          <Link
            className="navigation-link"
            href="/app/help"
            onClick={() => setOpen(false)}
          >
            <BookOpen size={18} />
            <span>Research guide</span>
          </Link>
          <div className="navigation-theme">
            <span>Appearance</span>
            <button
              className="icon-button"
              onClick={onTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>
      </aside>
      <div
        className="main-shell"
        inert={open || undefined}
        aria-hidden={open || undefined}
      >
        <header className="app-header">
          <button
            ref={menuRef}
            className="icon-button mobile-menu"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label={open ? "Close navigation" : "Open navigation"}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <span>{current?.title ?? "Research guide"}</span>
          </div>
          <div className="header-actions">
            <Link className="header-search" href="/app/investigations">
              <Search size={17} />
              <span>Search evidence</span>
            </Link>
            <span className="header-divider" />
            <button
              className="icon-button"
              onClick={onTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>
        <main id="research-content" className="research-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="context-footer">
          <span>
            <span className="small-dot" />
            NASA PSI evidence
          </span>
          <span title={snapshot ?? undefined}>
            {snapshot
              ? `Snapshot ${snapshot.slice(0, 18)}`
              : "Snapshot not loaded"}
          </span>
          <span>No scenario selected</span>
        </footer>
        <nav className="mobile-bottom-nav" aria-label="Quick navigation">
          <Link
            href="/app"
            aria-current={section === "overview" ? "page" : undefined}
          >
            <LayoutDashboard size={19} />
            <span>Overview</span>
          </Link>
          <Link
            href="/app/investigations"
            aria-current={section === "investigations" ? "page" : undefined}
          >
            <Compass size={19} />
            <span>Investigations</span>
          </Link>
          <Link
            href="/app/agent"
            aria-current={section === "agent" ? "page" : undefined}
          >
            <MessageSquare size={19} />
            <span>Studio</span>
          </Link>
          <button onClick={() => setOpen(true)} aria-expanded={open}>
            <Menu size={19} />
            <span>More</span>
          </button>
        </nav>
      </div>
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
