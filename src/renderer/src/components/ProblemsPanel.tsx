import { useEffect, useMemo, type ReactElement } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type { ValidationIssue } from "@mmx/content-schema";
import type { ProjectIssue } from "@mmx/project-io";
import type { DockviewPanelApi } from "dockview-react";
import { editor, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { cx, panel, scroll } from "../ui.js";

const dot = "inline-block w-2 h-2 rounded-full flex-none";

/** Extra per-column classes for the Problems table cells. */
const cellCls = (id: string): string =>
  id === "msg"
    ? "w-full"
    : id === "code"
      ? "text-muted font-mono text-[10px] whitespace-nowrap"
      : "";

type ProblemRow = {
  severity: "error" | "warning";
  code: string;
  message: string;
  objectId?: string;
  path?: string;
};

const column = createColumnHelper<ProblemRow>();
const problemColumns: ColumnDef<ProblemRow, string>[] = [
  column.display({
    id: "dot",
    cell: (ctx) => (
      <span
        className={cx(dot, ctx.row.original.severity === "error" ? "bg-danger" : "bg-warning")}
      />
    ),
  }) as ColumnDef<ProblemRow, string>,
  column.accessor("message", { id: "msg", cell: (c) => c.getValue() }),
  column.accessor("code", { id: "code", cell: (c) => c.getValue() }),
];

function toProblemRows(
  levelIssues: ValidationIssue[],
  projectIssues: ProjectIssue[],
): ProblemRow[] {
  const projectRows = projectIssues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: `${issue.path}: ${issue.message}`,
    path: issue.path,
  }));
  const levelRows = levelIssues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    objectId: issue.objectId,
  }));
  return [...projectRows, ...levelRows];
}

/** Movable dock panel: the live validation Problems table. Tab title tracks the issue count. */
export function ProblemsPanel({ api }: { api?: DockviewPanelApi }): ReactElement {
  const snap = useEditorSnapshot();
  const project = useProjectSession();
  const validation = snap.validation;
  const issues = toProblemRows(validation.issues, project.issues);
  const errorCount =
    validation.errorCount + project.issues.filter((issue) => issue.severity === "error").length;
  const warningCount =
    validation.warningCount +
    project.issues.filter((issue) => issue.severity === "warning").length;

  const problemsTitle = useMemo(() => {
    if (errorCount + warningCount === 0) return "Problems";
    const e = `${errorCount} error${errorCount === 1 ? "" : "s"}`;
    const w = `${warningCount} warning${warningCount === 1 ? "" : "s"}`;
    return `Problems — ${e}, ${w}`;
  }, [errorCount, warningCount]);

  useEffect(() => api?.setTitle(problemsTitle), [api, problemsTitle]);

  const table = useReactTable({
    data: issues,
    columns: problemColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={panel}>
      <div className={scroll}>
        {issues.length === 0 ? (
          <div className="px-3 py-3.5 text-xs text-[#7f91aa]">
            <span className={cx(dot, "bg-success mr-[7px]")} /> No problems detected. Ready to play.
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-popover-hover"
                  onClick={() => row.original.objectId && editor.focusObject(row.original.objectId)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cx("py-[5px] px-3 align-baseline", cellCls(cell.column.id))}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
