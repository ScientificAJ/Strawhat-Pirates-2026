"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useResource, type Catalog, type Dossier } from "../lib/api";
import type { ResearchCase } from "../lib/workspace-storage";
import {
  listDocuments,
  saveDocument,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import {
  researchDocumentHref,
  researchDocumentLabel,
  visibleResearchDocuments,
} from "../lib/research-history";
import { ErrorState, LoadingRows, Notice } from "./chrome";
import { sourceUrl } from "./workbench-common";

const questions = [
  "How does airflow affect flame spread in microgravity?",
  "Which NASA investigations study smoke detection?",
  "What evidence is useful for choosing spacecraft materials?",
];
const topics = [
  {
    title: "How do materials catch fire and burn?",
    description:
      "Explore solid fuels, flame spread and the conditions an experiment tested.",
    query: "solid",
    label: "Materials & flame spread",
  },
  {
    title: "How can a fire be detected?",
    description:
      "Find smoke and aerosol investigations relevant to detecting a fire early.",
    query: "smoke",
    label: "Smoke & detection",
  },
  {
    title: "What makes a flame go out?",
    description:
      "Investigate fuel droplets, surrounding gases and flame extinction.",
    query: "extinguishment",
    label: "Extinction & suppression",
  },
  {
    title: "What might this mean for Earth?",
    description:
      "Follow NASA’s application research and examine where conditions differ.",
    href: "/app/lab/evidence/earth",
    label: "Earth applications",
  },
];

export function ResearchHome({
  snapshotId,
  catalog,
  loading,
  error,
  retry,
  cases,
}: {
  snapshotId: string;
  catalog: Catalog | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  cases: ResearchCase[];
}) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [problem, setProblem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const example = useResource<Dossier>(
    `/v1/investigations/PSI-25?snapshot_id=${snapshotId}`,
  );
  const image = example.data?.assets.find(
    (asset) => asset.media_type === "image/jpeg" && asset.license === "CC0-1.0",
  );
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listDocuments()
        .then((values) => {
          if (active) setDocuments(visibleResearchDocuments(values));
        })
        .catch(() => {
          if (active)
            setProblem(
              "Recent research could not be loaded. You can still ask a question or browse investigations.",
            );
        });
    };
    refresh();
    window.addEventListener("nova-ember-workspace-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("nova-ember-workspace-changed", refresh);
    };
  }, []);
  const recent = [
    ...documents.map((document) => ({
      id: document.id,
      title: document.title,
      href: researchDocumentHref(document),
      kind: researchDocumentLabel(document.kind),
      updated: document.updated_at,
    })),
    ...cases.map((item) => ({
      id: item.id,
      title: item.title,
      href: `/app/cases/${item.id}`,
      kind: "Notebook",
      updated: item.updated_at,
    })),
  ]
    .filter((item) => item.href)
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 3);
  async function ask() {
    if (!question.trim() || busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setProblem("");
    try {
      const intent = await saveDocument({
        kind: "studio_intent",
        title: question.trim().slice(0, 100),
        snapshot_id: snapshotId,
        data: {
          question: question.trim(),
          snapshot_id: snapshotId,
          investigations: [],
          auto_submit: true,
        },
      });
      router.push(`/app/agent?intent=${intent.id}`);
    } catch {
      busy.current = false;
      setSubmitting(false);
      setProblem(
        "Your question could not be saved. Keep it here and try again, or open the research assistant.",
      );
    }
  }
  return (
    <div className="research-home">
      <section className="research-introduction" aria-labelledby="home-title">
        <div className="home-opening">
          <h1 id="home-title">
            Understand fire.
            <br />
            Beyond Earth.
          </h1>
          <p>
            Explore NASA’s combustion research to understand how fire starts,
            spreads and goes out in space.
          </p>
          <p className="home-purpose">
            Ask a question, follow the evidence and put the data to work.
          </p>
          <form
            className="home-question"
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
            aria-busy={submitting}
          >
            <label htmlFor="research-question">
              What would you like to understand?
            </label>
            <textarea
              ref={input}
              id="research-question"
              rows={2}
              maxLength={5000}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="How does airflow change the way a fire spreads in space?"
            />
            <div className="home-question-actions">
              <span>Answers connected to NASA evidence</span>
              <button
                className="button button-primary"
                type="submit"
                disabled={!question.trim() || submitting}
              >
                {submitting ? "Opening your question…" : "Ask Nova Ember"}
                <ArrowRight size={17} />
              </button>
            </div>
          </form>
          <div className="home-examples">
            <span>Try a question</span>
            {questions.map((text) => (
              <button
                key={text}
                onClick={() => {
                  setQuestion(text);
                  input.current?.focus();
                }}
              >
                {text}
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
          {problem && (
            <Notice kind="error">
              {problem} <Link href="/app/agent">Open assistant</Link>
            </Notice>
          )}
        </div>
        <figure className="home-science-image">
          {image ? (
            <img
              src={sourceUrl(image, snapshotId, "media/preview")}
              alt="A NASA BASS-II flame test, with the burning sample inside the experimental apparatus."
            />
          ) : (
            <div className="home-image-placeholder">
              <LoadingRows label="Loading a NASA experiment image" />
            </div>
          )}
          <figcaption>
            <div>
              <strong>Fire behaves differently in microgravity.</strong>
              <p>
                Without buoyancy lifting hot gases, airflow and diffusion take
                on a different role.
              </p>
            </div>
            <Link href={`/app/investigations/PSI-25?snapshot=${snapshotId}`}>
              See the BASS-II investigation
              <ArrowRight size={16} />
            </Link>
            <span>Experiment image: NASA · BASS-II</span>
          </figcaption>
        </figure>
      </section>
      {recent.length > 0 && (
        <section className="home-recent">
          <div className="section-heading">
            <h2>Pick up where you left off</h2>
            <Link className="text-button" href="/app/cases">
              Your research
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="recent-research-list">
            {recent.map((item) => (
              <Link key={item.id} href={item.href!}>
                <BookOpen size={19} />
                <span>
                  <small>{item.kind}</small>
                  <strong>{item.title}</strong>
                </span>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="home-explore" aria-labelledby="explore-title">
        <div className="home-explore-heading">
          <div>
            <h2 id="explore-title">Start with the science</h2>
            <p>
              An investigation is a NASA study of a specific question. Explore
              what was tested, inspect its sources and decide what the evidence
              can tell you.
            </p>
          </div>
          <Link className="button" href="/app/investigations">
            Browse {catalog ? `${catalog.total} ` : ""}investigations
            <ArrowRight size={16} />
          </Link>
        </div>
        {error && <ErrorState message={error} retry={retry} />}
        <div className="science-topic-list">
          {topics.map((topic) => (
            <Link
              key={topic.title}
              href={
                topic.href ??
                `/app/investigations?q=${encodeURIComponent(topic.query!)}`
              }
            >
              <div>
                <h3>{topic.title}</h3>
                <p>{topic.description}</p>
              </div>
              <ArrowRight size={21} />
            </Link>
          ))}
        </div>
      </section>
      <section className="home-data-path">
        <div>
          <h2>From a research question to usable data</h2>
          <p>
            Compare what investigations studied. Inspect source tables, select
            variables, build a figure and export data with its source
            references.
          </p>
          <Link className="text-button" href="/app/lab">
            Explore data & models
            <ArrowRight size={17} />
          </Link>
        </div>
        <ol>
          <li>
            <Search size={18} />
            <span>Find relevant investigations</span>
          </li>
          <li>
            <BookOpen size={18} />
            <span>Understand the evidence and conditions</span>
          </li>
          <li>
            <Check size={18} />
            <span>Compare, calculate and export</span>
          </li>
        </ol>
      </section>
    </div>
  );
}
