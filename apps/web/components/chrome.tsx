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
  Settings,
  Activity,
  Map,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  activeWorkspaceId,
  localWorkspaces,
  addLocalWorkspace,
  selectLocalWorkspace,
  type LocalWorkspace,
} from "../lib/local-workspaces";
import type { Preferences } from "../lib/workspace-backup";
import type { WorkspaceContext } from "../lib/research-context";

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
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<LocalWorkspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState("primary");
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [command, setCommand] = useState("");
  const commands = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      setWorkspaces(localWorkspaces());
      setActiveWorkspace(activeWorkspaceId());
    } catch (reason) {
      setWorkspaceError(String(reason));
    }
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        preferences?.command_shortcut !== false &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [preferences?.command_shortcut]);
  useEffect(() => {
    const element = commands.current;
    if (commandOpen && !element?.open) element?.showModal();
    if (!commandOpen && element?.open) element.close();
  }, [commandOpen]);
  function switchWorkspace(id: string) {
    if (id === activeWorkspace) return;
    if (
      !window.confirm(
        "Switch local workspaces? Save any open draft first. Temporary server jobs keep running and remain accessible to this browser until expiry.",
      )
    )
      return;
    try {
      selectLocalWorkspace(id);
      window.location.assign("/app");
    } catch (reason) {
      setWorkspaceError(String(reason));
    }
  }
  function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    try {
      const item = addLocalWorkspace(workspaceName);
      setWorkspaces(localWorkspaces());
      setCreating(false);
      setWorkspaceName("");
      switchWorkspace(item.id);
    } catch (reason) {
      setWorkspaceError(String(reason));
    }
  }
  const utilityDestinations = [
    {
      id: "dashboards",
      title: "Dashboards",
      href: "/app/dashboards",
      icon: LayoutDashboard,
    },
    {
      id: "jobs",
      title: "Jobs and activity",
      href: "/app/jobs",
      icon: Activity,
    },
    {
      id: "coverage",
      title: "Evidence coverage",
      href: "/app/coverage",
      icon: Map,
    },
    {
      id: "settings",
      title: "Settings",
      href: "/app/settings",
      icon: Settings,
    },
  ];
  const commandItems = [
    ...destinations,
    ...utilityDestinations,
    {
      id: "learning",
      title: "Learning mode",
      href: "/app/learning",
      icon: BookOpen,
    },
    {
      id: "stewardship",
      title: "Source stewardship",
      href: "/app/stewardship",
      icon: BookOpen,
    },
  ].filter((item) => item.title.toLowerCase().includes(command.toLowerCase()));
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
  const current = [...destinations, ...utilityDestinations].find(
    (item) => item.id === section,
  );
  const selected = context?.investigations ?? [];
  const actions = [
    {
      id: "compare-selected",
      title: "Compare selected investigations",
      hint: "Open condition comparison",
      disabled: selected.length < 2,
      run: () =>
        router.push(
          `/app/compare?ids=${selected.join(",")}&snapshot=${context?.snapshot_id}`,
        ),
    },
    {
      id: "ask-selection",
      title: "Ask about selection",
      hint: "Review context before any model request",
      disabled: !onAsk,
      run: () => onAsk?.(),
    },
    {
      id: "inspect-source",
      title: "Inspect selected source",
      hint: "Open the exact source snapshot",
      disabled: !selected.length,
      run: () =>
        router.push(
          `/app/investigations/${selected[0]}?section=sources&snapshot=${context?.snapshot_id}`,
        ),
    },
    {
      id: "save-case",
      title: "Save research case",
      hint: "Open a local case draft",
      disabled: false,
      run: () => router.push("/app/cases/new"),
    },
    {
      id: "export",
      title: "Export a frozen research case",
      hint: "Choose a case and review the export",
      disabled: false,
      run: () => router.push("/app/cases"),
    },
  ].filter((item) => item.title.toLowerCase().includes(command.toLowerCase()));
  return (
    <div
      className="app-shell"
      data-assistant-open={assistantOpen || undefined}
      data-theme={theme}
      data-density={preferences?.density}
      data-compact-rail={preferences?.compact_rail || undefined}
      data-reduce-transparency={preferences?.reduce_transparency || undefined}
      data-reduce-motion={preferences?.reduce_motion || undefined}
    >
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
        <div className="workspace-switcher">
          <label className="workspace-label" htmlFor="local-workspace">
            <Monitor size={15} />
            <span>Local workspace</span>
          </label>
          <select
            id="local-workspace"
            aria-label="Local workspace"
            value={activeWorkspace}
            onChange={(event) => switchWorkspace(event.target.value)}
          >
            {workspaces.length ? (
              workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))
            ) : (
              <option value="primary">On this device</option>
            )}
          </select>
          <button
            className="text-button"
            onClick={() => setCreating((value) => !value)}
          >
            New workspace
          </button>
          {creating && (
            <form onSubmit={createWorkspace}>
              <label>
                Workspace name
                <input
                  autoFocus
                  maxLength={100}
                  required
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                />
              </label>
              <button className="button button-small" type="submit">
                Create
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
            </form>
          )}
          {workspaceError && <p role="alert">{workspaceError}</p>}
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
        <nav className="navigation-utilities" aria-label="Workspace tools">
          {utilityDestinations.map(({ id, title, href, icon: Icon }) => (
            <Link
              key={id}
              className={`navigation-link ${section === id ? "is-active" : ""}`}
              aria-current={section === id ? "page" : undefined}
              href={href}
              onClick={() => setOpen(false)}
            >
              <Icon size={18} />
              <span>{title}</span>
            </Link>
          ))}
        </nav>
        <div className="navigation-bottom">
          <div className="workspace-note">
            <span className="small-dot" />
            <span>Your personal workspace</span>
            <p>
              Saved research stays in this browser. Back up to move devices.
            </p>
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
            <button
              className="header-search"
              onClick={() => setCommandOpen(true)}
              aria-label="Open command palette"
            >
              <Search size={17} />
              <span>Go to…</span>
              <kbd>
                {preferences?.command_shortcut === false
                  ? "Commands"
                  : "⌘ / Ctrl K"}
              </kbd>
            </button>
            {onAsk && (
              <button
                id="contextual-assistant-header"
                className="icon-button"
                aria-label="Ask about selected context"
                onClick={onAsk}
              >
                <MessageSquare size={18} />
              </button>
            )}
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
          <span>
            {context?.scenario && Object.keys(context.scenario).length
              ? "Scenario selected"
              : "No scenario selected"}{" "}
            · {context?.investigations?.length ?? 0} investigations ·{" "}
            {context?.selected_sources?.length ?? 0} selected sources
          </span>
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
      <dialog
        className="command-palette"
        ref={commands}
        aria-label="Command palette"
        onCancel={() => setCommandOpen(false)}
        onClose={() => setCommandOpen(false)}
      >
        <div className="command-heading">
          <h2>Go to a research workspace</h2>
          <button
            className="icon-button"
            aria-label="Close command palette"
            onClick={() => setCommandOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <label>
          Find a destination
          <input
            autoFocus
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Investigations, models, jobs…"
          />
        </label>
        <nav aria-label="Research commands">
          <h3>Research actions</h3>
          {actions.map((item) => (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => {
                setCommandOpen(false);
                item.run();
              }}
            >
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.hint}
                  {item.disabled ? " · Select the required context first" : ""}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </nav>
        <nav aria-label="Command destinations">
          <h3>Go to</h3>
          {commandItems.map(({ id, title, href, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setCommandOpen(false);
                router.push(href);
              }}
            >
              <Icon size={18} />
              {title}
              <ChevronRight size={16} />
            </button>
          ))}
          {!commandItems.length && (
            <p>
              No matching destination. Use Investigations to search the public
              evidence catalog.
            </p>
          )}
        </nav>
        <p>Navigation only. No model request or computation starts here.</p>
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
