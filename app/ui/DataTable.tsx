"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown, Download, GripVertical } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, ReactNode } from "react";
import { createCsv, datedCsvFilename, type CsvCellValue } from "../lib/csv";
import { Button } from "./Button";
import { Toolbar } from "./Toolbar";

export type DataTableSortValue = string | number | Date | null | undefined;

export type DataTableColumn<Row> = {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  sortValue?: (row: Row) => DataTableSortValue;
  exportValue?: (row: Row) => CsvCellValue;
  exportHeader?: string;
  width?: string;
  align?: "left" | "center" | "right";
  rowHeader?: boolean;
  multiline?: boolean;
  cellLayout?: "inline" | "stacked";
};

export type DataTableGroup<Row> = {
  id: string;
  header: ReactNode;
  rows: Row[];
};

export type DataTableHierarchyColumn = {
  id: string;
  content: ReactNode;
  colSpan?: number;
  align?: "left" | "center" | "right";
  rowHeader?: boolean;
  multiline?: boolean;
  cellLayout?: "inline" | "stacked";
  className?: string;
};

export type DataTableHierarchyRow = {
  id: string;
  columns: DataTableHierarchyColumn[];
  children?: DataTableHierarchyRow[];
  expansion?: {
    expanded: boolean;
    onToggle: () => void;
    label: ReactNode;
    ariaLabel: string;
  };
  className?: string;
  onRowClick?: () => void;
};

type DataTableFlatProps<Row> = {
  rows?: Row[];
  columns: DataTableColumn<Row>[];
  getRowId: (row: Row) => string;
  groups?: DataTableGroup<Row>[];
  rowClassName?: (row: Row) => string | undefined;
  onRowClick?: (row: Row) => void;
  onRowDragOver?: (row: Row, event: DragEvent<HTMLTableRowElement>) => void;
  onRowDrop?: (row: Row, event: DragEvent<HTMLTableRowElement>) => void;
  onGroupDragOver?: (group: DataTableGroup<Row>, event: DragEvent<HTMLTableRowElement>) => void;
  onGroupDrop?: (group: DataTableGroup<Row>, event: DragEvent<HTMLTableRowElement>) => void;
  onRowDragHandleStart?: (row: Row, event: DragEvent<HTMLButtonElement>) => void;
  onRowDragHandleEnd?: (row: Row) => void;
  onRowDragHandleKeyDown?: (row: Row, event: KeyboardEvent<HTMLButtonElement>) => void;
  rowDragHandleDisabled?: (row: Row) => boolean;
  getRowDragHandleLabel?: (row: Row) => string;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  initialSort?: { columnId: string; direction?: "asc" | "desc" };
  emptyMessage?: ReactNode;
  ariaLabel?: string;
  exportName?: string;
};

type DataTableHierarchyProps = {
  hierarchyRows: DataTableHierarchyRow[];
  columnWidths?: string[];
  emptyMessage?: ReactNode;
  ariaLabel?: string;
};

export type DataTableProps<Row> = DataTableFlatProps<Row> | DataTableHierarchyProps;

type SortState = {
  columnId: string;
  direction: "asc" | "desc";
} | null;

type DataTableCellStyle = {
  multiline?: boolean;
  cellLayout?: "inline" | "stacked";
  className?: string;
};

function compareValues(left: DataTableSortValue, right: DataTableSortValue) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "ko-KR", { numeric: true, sensitivity: "base" });
}

function dataTableCellClassName({ multiline, cellLayout, className }: DataTableCellStyle) {
  return [
    "ui-data-table__cell",
    multiline ? "ui-data-table__cell--multiline" : "",
    `ui-data-table__cell--${cellLayout ?? "inline"}`,
    className ?? "",
  ].filter(Boolean).join(" ");
}

function exportHeader<Row>(column: DataTableColumn<Row>) {
  return column.exportHeader ?? (typeof column.header === "string" ? column.header : column.id);
}

function FlatDataTable<Row>({
  rows,
  columns,
  getRowId,
  groups,
  rowClassName,
  onRowClick,
  onRowDragOver,
  onRowDrop,
  onGroupDragOver,
  onGroupDrop,
  onRowDragHandleStart,
  onRowDragHandleEnd,
  onRowDragHandleKeyDown,
  rowDragHandleDisabled,
  getRowDragHandleLabel,
  selectedIds,
  onSelectedIdsChange,
  initialSort,
  emptyMessage = "표시할 항목이 없습니다.",
  ariaLabel,
  exportName,
}: DataTableFlatProps<Row>) {
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState>(
    initialSort ? { columnId: initialSort.columnId, direction: initialSort.direction ?? "asc" } : null,
  );
  const effectiveRows = useMemo(
    () => groups ? groups.flatMap((group) => group.rows) : rows ?? [],
    [groups, rows],
  );
  const selectionEnabled = Boolean(onSelectedIdsChange);
  const activeSelectedIds = useMemo(
    () => selectionEnabled ? selectedIds ?? internalSelectedIds : [],
    [internalSelectedIds, selectedIds, selectionEnabled],
  );
  const selectedIdSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);
  const selectedAll = effectiveRows.length > 0 && effectiveRows.every((row) => selectedIdSet.has(getRowId(row)));
  const selectionColumnWidth = onRowDragHandleStart ? "64px" : "42px";

  const sortedRows = useMemo(() => {
    if (groups || !sort) return effectiveRows;
    const column = columns.find((item) => item.id === sort.columnId);
    if (!column?.sortValue) return effectiveRows;
    return [...effectiveRows].sort((left, right) => {
      const value = compareValues(column.sortValue?.(left), column.sortValue?.(right));
      return sort.direction === "asc" ? value : -value;
    });
  }, [columns, effectiveRows, groups, sort]);
  const exportRows = groups ? effectiveRows : sortedRows;

  const downloadCsv = () => {
    if (!exportName) return;
    const content = createCsv(
      columns.map(exportHeader),
      exportRows.map((row) => columns.map((column) => (column.exportValue ?? column.sortValue)?.(row))),
    );
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = datedCsvFilename(exportName);
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateSelectedIds = (nextIds: string[]) => {
    if (selectedIds === undefined) setInternalSelectedIds(nextIds);
    onSelectedIdsChange?.(nextIds);
  };

  const toggleAll = () => {
    updateSelectedIds(selectedAll ? [] : effectiveRows.map(getRowId));
  };

  const toggleRow = (row: Row) => {
    const id = getRowId(row);
    updateSelectedIds(
      selectedIdSet.has(id)
        ? activeSelectedIds.filter((value) => value !== id)
        : [...activeSelectedIds, id],
    );
  };

  const toggleSort = (column: DataTableColumn<Row>) => {
    if (groups || !column.sortValue) return;
    setSort((current) => {
      if (current?.columnId !== column.id) return { columnId: column.id, direction: "asc" };
      return { columnId: column.id, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (!onRowClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onRowClick(row);
  };

  const renderRow = (row: Row) => {
    const id = getRowId(row);
    const clickable = Boolean(onRowClick);
    return (
      <tr
        key={id}
        className={[
          clickable ? "ui-data-table__row--clickable" : "",
          groups ? "ui-data-table__row--grouped" : "",
          rowClassName?.(row) ?? "",
        ].filter(Boolean).join(" ")}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onRowClick?.(row) : undefined}
        onKeyDown={(event) => onRowKeyDown(event, row)}
        onDragOver={onRowDragOver ? (event) => onRowDragOver(row, event) : undefined}
        onDrop={onRowDrop ? (event) => onRowDrop(row, event) : undefined}
      >
        {selectionEnabled ? (
          <td className="ui-data-table__selection" onClick={(event) => event.stopPropagation()}>
            <span className="ui-data-table__selection-controls">
              <input
                type="checkbox"
                checked={selectedIdSet.has(id)}
                onChange={() => toggleRow(row)}
                aria-label={`${id} 선택`}
              />
              {onRowDragHandleStart ? (
                <button
                  type="button"
                  className="ui-data-table__drag-handle"
                  draggable={!rowDragHandleDisabled?.(row)}
                  disabled={rowDragHandleDisabled?.(row)}
                  aria-label={getRowDragHandleLabel?.(row) ?? `${id} 순서 이동`}
                  onDragStart={(event) => onRowDragHandleStart(row, event)}
                  onDragEnd={() => onRowDragHandleEnd?.(row)}
                  onKeyDown={(event) => onRowDragHandleKeyDown?.(row, event)}
                >
                  <GripVertical size={14} aria-hidden="true" />
                </button>
              ) : null}
            </span>
          </td>
        ) : null}
        {columns.map((column) => {
          const className = dataTableCellClassName(column);
          const style = { width: column.width, textAlign: column.align ?? "left" };
          return column.rowHeader ? (
            <th key={column.id} scope="row" className={className} style={style}>
              {column.cell(row)}
            </th>
          ) : (
            <td key={column.id} className={className} style={style}>
              {column.cell(row)}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <>
      {exportName ? (
        <Toolbar
          actions={(
            <Button variant="ghost" size="sm" leadingIcon={<Download size={16} />} onClick={downloadCsv}>
              엑셀 다운로드
            </Button>
          )}
        />
      ) : null}
      <div className="ui-data-table__scroll">
        <table className="ui-data-table" aria-label={ariaLabel}>
        <colgroup>
          {selectionEnabled ? <col style={{ width: selectionColumnWidth }} /> : null}
          {columns.map((column) => <col key={column.id} style={column.width ? { width: column.width } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            {selectionEnabled ? (
              <th className="ui-data-table__selection">
                <input
                  type="checkbox"
                  checked={selectedAll}
                  onChange={toggleAll}
                  aria-label="전체 선택"
                />
              </th>
            ) : null}
            {columns.map((column) => {
              const sortable = !groups && Boolean(column.sortValue);
              const sorted = sortable && sort?.columnId === column.id;
              const style = { width: column.width, textAlign: column.align ?? "left" };
              return (
                <th key={column.id} style={style} aria-sort={sorted ? (sort?.direction === "asc" ? "ascending" : "descending") : undefined}>
                  {sortable ? (
                    <button className="ui-data-table__sort" type="button" onClick={() => toggleSort(column)}>
                      <span>{column.header}</span>
                      {sorted ? (
                        sort?.direction === "asc"
                          ? <ChevronUp size={15} aria-hidden="true" />
                          : <ChevronDown size={15} aria-hidden="true" />
                      ) : <ChevronsUpDown size={15} aria-hidden="true" />}
                    </button>
                  ) : column.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups ? groups.map((group) => (
            <Fragment key={group.id}>
              <tr
                className="ui-data-table__group-row"
                onDragOver={onGroupDragOver ? (event) => onGroupDragOver(group, event) : undefined}
                onDrop={onGroupDrop ? (event) => onGroupDrop(group, event) : undefined}
              >
                <td colSpan={columns.length + (selectionEnabled ? 1 : 0)}>{group.header}</td>
              </tr>
              {group.rows.map(renderRow)}
            </Fragment>
          )) : sortedRows.map(renderRow)}
          {!effectiveRows.length ? (
            <tr>
              <td className="ui-data-table__empty" colSpan={columns.length + (selectionEnabled ? 1 : 0)}>{emptyMessage}</td>
            </tr>
          ) : null}
        </tbody>
        </table>
      </div>
    </>
  );
}

function hierarchyColumnCount(rows: DataTableHierarchyRow[]): number {
  return rows.reduce((maximum, row) => Math.max(
    maximum,
    row.columns.reduce((count, column) => count + (column.colSpan ?? 1), 0) + (row.expansion ? 1 : 0),
    hierarchyColumnCount(row.children ?? []),
  ), 0);
}

function HierarchyDataTable({
  hierarchyRows,
  columnWidths,
  emptyMessage = "표시할 항목이 없습니다.",
  ariaLabel,
}: DataTableHierarchyProps) {
  const columnCount = Math.max(hierarchyColumnCount(hierarchyRows), columnWidths?.length ?? 0, 1);

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: DataTableHierarchyRow) => {
    if (!row.onRowClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    row.onRowClick();
  };

  const renderRows = (rows: DataTableHierarchyRow[], depth: number): ReactNode[] => rows.flatMap((row) => {
    const clickable = Boolean(row.onRowClick);
    const style = {
      "--ui-data-table-hierarchy-indent": `${depth * 20}px`,
    } as CSSProperties;
    const cells = row.columns.map((column) => {
      const Cell = column.rowHeader ? "th" : "td";
      return (
        <Cell
          key={column.id}
          className={dataTableCellClassName(column)}
          colSpan={column.colSpan}
          scope={column.rowHeader ? "row" : undefined}
          style={{ textAlign: column.align ?? "left" }}
        >
          {column.content}
        </Cell>
      );
    });

    if (row.expansion) {
      cells.push(
        <td key={`${row.id}-toggle`} className="ui-data-table__hierarchy-toggle-cell">
          <button
            type="button"
            className="ui-data-table__hierarchy-toggle"
            aria-expanded={row.expansion.expanded}
            aria-label={row.expansion.ariaLabel}
            onClick={(event) => {
              event.stopPropagation();
              row.expansion?.onToggle();
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <span>{row.expansion.label}</span>
            <ChevronDown className={row.expansion.expanded ? "" : "ui-data-table__hierarchy-toggle-icon--collapsed"} size={15} aria-hidden="true" />
          </button>
        </td>,
      );
    }

    const rendered = [
      <tr
        key={row.id}
        className={[
          "ui-data-table__row--hierarchy",
          clickable ? "ui-data-table__row--clickable" : "",
          row.className ?? "",
        ].filter(Boolean).join(" ")}
        tabIndex={clickable ? 0 : undefined}
        style={style}
        onClick={clickable ? row.onRowClick : undefined}
        onKeyDown={(event) => onRowKeyDown(event, row)}
      >
        {cells}
      </tr>,
    ];

    if (!row.children?.length || (row.expansion && !row.expansion.expanded)) return rendered;
    return [...rendered, ...renderRows(row.children, depth + 1)];
  });

  return (
    <div className="ui-data-table__scroll">
      <table className="ui-data-table" aria-label={ariaLabel}>
        <colgroup>
          {Array.from({ length: columnCount }, (_, index) => (
            <col key={index} style={columnWidths?.[index] ? { width: columnWidths[index] } : undefined} />
          ))}
        </colgroup>
        <tbody>
          {hierarchyRows.length ? renderRows(hierarchyRows, 0) : (
            <tr>
              <td className="ui-data-table__empty" colSpan={columnCount}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DataTable<Row>(props: DataTableProps<Row>) {
  if ("hierarchyRows" in props) return <HierarchyDataTable {...props} />;
  return <FlatDataTable {...props} />;
}
