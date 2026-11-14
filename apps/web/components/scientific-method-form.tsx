"use client";
import { useId, useState } from "react";
import styles from "./laboratory-workbench.module.css";
export type MethodSchema = {
  title?: string;
  description?: string;
  type?: string;
  default?: unknown;
  const?: unknown;
  enum?: unknown[];
  $ref?: string;
  $defs?: Record<string, MethodSchema>;
  properties?: Record<string, MethodSchema>;
  required?: string[];
  items?: MethodSchema;
  anyOf?: MethodSchema[];
  additionalProperties?: boolean | MethodSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
};
export function resolveSchema(
  schema: MethodSchema,
  root: MethodSchema,
): MethodSchema {
  if (schema.$ref)
    return resolveSchema(
      root.$defs?.[schema.$ref.split("/").at(-1) ?? ""] ?? {},
      root,
    );
  if (schema.anyOf)
    return resolveSchema(
      schema.anyOf.find((item) => item.type !== "null") ?? {},
      root,
    );
  return schema;
}
export function emptyMethodValue(
  input: MethodSchema,
  root: MethodSchema,
): unknown {
  const schema = resolveSchema(input, root);
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.type === "object" || schema.properties)
    return Object.fromEntries(
      Object.entries(schema.properties ?? {})
        .filter(([name]) => schema.required?.includes(name))
        .map(([name, child]) => [name, emptyMethodValue(child, root)]),
    );
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return false;
  return "";
}
export function ScientificMethodFields({
  schema: input,
  root,
  value,
  onChange,
  label = "Parameters",
  depth = 0,
}: {
  schema: MethodSchema;
  root: MethodSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  label?: string;
  depth?: number;
}) {
  const id = useId();
  const [page, setPage] = useState(0);
  const schema = resolveSchema(input, root);
  const name = label.replaceAll("_", " ");
  if (schema.const !== undefined)
    return (
      <p className={styles.muted}>
        {name}: {String(schema.const)}
      </p>
    );
  if (schema.type === "object" || schema.properties) {
    const object =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    if (!schema.properties && schema.additionalProperties) {
      const item =
        typeof schema.additionalProperties === "object"
          ? schema.additionalProperties
          : { type: "string" };
      return (
        <fieldset className={styles.stack}>
          <legend>{name}</legend>
          {Object.entries(object).map(([key, child], index) => (
            <div className={styles.inline} key={index}>
              <label className={styles.field}>
                Condition / field
                <input
                  value={key}
                  onChange={(event) => {
                    const next = { ...object };
                    delete next[key];
                    next[event.target.value] = child;
                    onChange(next);
                  }}
                />
              </label>
              <ScientificMethodFields
                schema={item}
                root={root}
                value={child}
                onChange={(next) => onChange({ ...object, [key]: next })}
                label={key || "Value"}
                depth={depth + 1}
              />
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const next = { ...object };
                  delete next[key];
                  onChange(next);
                }}
              >
                Remove field
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button-small"
            onClick={() =>
              onChange({
                ...object,
                [`condition_${Object.keys(object).length + 1}`]:
                  emptyMethodValue(item, root),
              })
            }
          >
            Add field
          </button>
        </fieldset>
      );
    }
    return (
      <fieldset className={styles.stack}>
        <legend>{name}</legend>
        {schema.description && (
          <p className={styles.caption}>{schema.description}</p>
        )}
        <div className={styles.fields}>
          {Object.entries(schema.properties ?? {}).map(([key, child]) => {
            const required = schema.required?.includes(key);
            const node = resolveSchema(child, root);
            const complex =
              node.type === "object" ||
              node.type === "array" ||
              Boolean(node.properties);
            if (key === "context" && depth === 0)
              return (
                <details
                  key={key}
                  className={`${styles.details} ${styles.full}`}
                >
                  <summary>Input origin & source references</summary>
                  <ScientificMethodFields
                    schema={child}
                    root={root}
                    value={object[key]}
                    onChange={(next) => onChange({ ...object, [key]: next })}
                    label="Source references"
                    depth={depth + 1}
                  />
                </details>
              );
            return (
              <div key={key} className={complex ? styles.full : undefined}>
                {!required && !(key in object) ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      onChange({
                        ...object,
                        [key]: emptyMethodValue(child, root),
                      })
                    }
                  >
                    Add {key.replaceAll("_", " ")} (optional)
                  </button>
                ) : (
                  <ScientificMethodFields
                    schema={child}
                    root={root}
                    value={object[key]}
                    onChange={(next) => onChange({ ...object, [key]: next })}
                    label={`${key}${required ? " *" : ""}`}
                    depth={depth + 1}
                  />
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  }
  if (schema.type === "array") {
    const items = Array.isArray(value) ? value : [];
    return (
      <fieldset className={styles.stack}>
        <legend>
          {name} ({items.length})
        </legend>
        {items.slice(page * 50, (page + 1) * 50).map((item, localIndex) => {
          const index = page * 50 + localIndex;
          return (
            <div key={index} className={styles.item}>
              <ScientificMethodFields
                schema={schema.items ?? { type: "string" }}
                root={root}
                value={item}
                onChange={(next) =>
                  onChange(items.map((old, i) => (i === index ? next : old)))
                }
                label={`Entry ${index + 1}`}
                depth={depth + 1}
              />
              <button
                type="button"
                className="text-button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                Remove entry {index + 1}
              </button>
            </div>
          );
        })}
        {items.length > 50 && (
          <p className={styles.warning}>
            All {items.length} entries are retained. Showing {page * 50 + 1}–
            {Math.min((page + 1) * 50, items.length)}; computation uses the full
            selected input.
            <button
              type="button"
              className="button button-small"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous entries
            </button>
            <button
              type="button"
              className="button button-small"
              disabled={(page + 1) * 50 >= items.length}
              onClick={() => setPage((value) => value + 1)}
            >
              Next entries
            </button>
          </p>
        )}
        <button
          type="button"
          className="button button-small"
          disabled={
            schema.maxItems !== undefined && items.length >= schema.maxItems
          }
          onClick={() =>
            onChange([
              ...items,
              emptyMethodValue(schema.items ?? { type: "string" }, root),
            ])
          }
        >
          Add {name.toLowerCase()} entry
        </button>
      </fieldset>
    );
  }
  if (schema.enum)
    return (
      <label className={styles.field} htmlFor={id}>
        {name}
        <select
          id={id}
          aria-label={name}
          value={String(value ?? schema.enum[0] ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          {schema.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option).replaceAll("_", " ")}
            </option>
          ))}
        </select>
        {schema.description && <small>{schema.description}</small>}
      </label>
    );
  if (schema.type === "boolean")
    return (
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        {name}
      </label>
    );
  const number = schema.type === "number" || schema.type === "integer";
  return (
    <label className={styles.field} htmlFor={id}>
      {name}
      <input
        id={id}
        type={number ? "number" : "text"}
        step={schema.type === "integer" ? 1 : "any"}
        min={schema.minimum}
        max={schema.maximum}
        value={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
        onChange={(event) =>
          onChange(
            number && event.target.value !== ""
              ? Number(event.target.value)
              : event.target.value,
          )
        }
      />
      {schema.description && <small>{schema.description}</small>}
    </label>
  );
}
