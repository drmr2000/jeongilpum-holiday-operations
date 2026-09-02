"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown, GripVertical } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, ReactNode } from "react";

export type DataTableSortValue = string | number | Date | null | undefined;

export type DataTableColumn<Row> = {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  sortValue?: (row: Row) => DataTableSortValue;
  width?: string;
  align?: "left" | "center" | "right";
  multiline?: boolean;
  cellLayout?: "inline" | "stacked";
};

export type DataTableGroup<Row> = {
  id: string;
  header: ReactNode;
  rows: Row[];
};

export type DataTableProps<Row> = {
  rows?: Row[];
  columns: DataTableColumn<Row>[];
  getRowId: (row: Row) => string;
  groups?: DataTableGroup<Row>[];
  rowBackground?: (row: Row) => string | undefined;
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
};

type SortState = {
  columnId: string;
  direction: "asc" | "desc";
} | null;

function compareValues(left: DataTableSortValue, right: DataTableSortValue) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "ko-KR", { numeric: true, sensitivity: "base" });
}

export function DataTable<Row>({
  rows,
  columns,
  getRowId,
  groups,
  rowBackground,
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
}: DataTableProps<Row>) {
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState>(
    initialSort ? { columnId: initialSort.columnId, direction: initialSort.direction ?? "asc" } : null,
  );
  const effectiveRows = useMemo(
    () => groups ? groups.flatMap((group) => group.rows) : rows ?? [],
    [groups, rows],
  );
  const activeSelectedIds = selectedIds ?? internalSelectedIds;
  const selectedIdSet = useMemo(() => new Set(activeSelectedIds), [activeSelectedIds]);
  const selectedAll = effectiveRows.length > 0 && effectiveRows.every((row) => selectedIdSet.has(getRowId(row)));

  const sortedRows = useMemo(() => {
    if (groups || !sort) return effectiveRows;
    const column = columns.find((item) => item.id === sort.columnId);
    if (!column?.sortValue) return effectiveRows;
    return [...effectiveRows].sort((left, right) => {
      const value = compareValues(column.sortValue?.(left), column.sortValue?.(right));
      return sort.direction === "asc" ? value : -value;
    });
  }, [columns, effectiveRows, groups, sort]);

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
    const style: CSSProperties | undefined = rowBackground?.(row)
      ? { backgroundColor: rowBackground(row) }
      : undefined;
    return (
      <tr
        key={id}
        className={[
          clickable ? "ui-data-table__row--clickable" : "",
          groups ? "ui-data-table__row--grouped" : "",
          rowClassName?.(row) ?? "",
        ].filter(Boolean).join(" ")}
        style={style}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onRowClick?.(row) : undefined}
        onKeyDown={(event) => onRowKeyDown(event, row)}
        onDragOver={onRowDragOver ? (event) => onRowDragOver(row, event) : undefined}
        onDrop={onRowDrop ? (event) => onRowDrop(row, event) : undefined}
      >
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
        {columns.map((column) => (
          <td
            key={column.id}
            className={[
              "ui-data-table__cell",
              column.multiline ? "ui-data-table__cell--multiline" : "",
              `ui-data-table__cell--${column.cellLayout ?? "inline"}`,
            ].filter(Boolean).join(" ")}
            style={{ width: column.width, textAlign: column.align ?? "left" }}
          >
            {column.cell(row)}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="ui-data-table__scroll">
      <table className="ui-data-table" aria-label={ariaLabel}>
        <colgroup>
          <col style={{ width: "42px" }} />
          {columns.map((column) => <col key={column.id} style={column.width ? { width: column.width } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="ui-data-table__selection">
              <input
                type="checkbox"
                checked={selectedAll}
                onChange={toggleAll}
                aria-label="전체 선택"
              />
            </th>
            {columns.map((column) => {
              const sortable = !groups && Boolean(column.sortValue);
              const sorted = sortable && sort?.columnId === column.id;
              const style = column.width ? { width: column.width } : undefined;
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
                <td colSpan={columns.length + 1}>{group.header}</td>
              </tr>
              {group.rows.map(renderRow)}
            </Fragment>
          )) : sortedRows.map(renderRow)}
          {!effectiveRows.length ? (
            <tr>
              <td className="ui-data-table__empty" colSpan={columns.length + 1}>{emptyMessage}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
