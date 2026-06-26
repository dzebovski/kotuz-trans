"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import {
  flexRender,
  type Header,
} from "@tanstack/react-table";

type SortDirection = false | "asc" | "desc";

export function getHeaderAriaSort(
  sortDirection: SortDirection,
): "ascending" | "descending" | "none" {
  if (sortDirection === "asc") {
    return "ascending";
  }
  if (sortDirection === "desc") {
    return "descending";
  }
  return "none";
}

type SortableHeaderButtonProps<TData, TValue> = {
  header: Header<TData, TValue>;
  className: string;
  activeClassName: string;
  iconSize?: number;
  role?: "columnheader";
};

export function SortableHeaderButton<TData, TValue>({
  header,
  className,
  activeClassName,
  iconSize = 12,
  role,
}: SortableHeaderButtonProps<TData, TValue>) {
  const sortDirection = header.column.getIsSorted();
  const isActive = Boolean(sortDirection);
  const content = flexRender(
    header.column.columnDef.header,
    header.getContext(),
  );

  return (
    <button
      type="button"
      className={`${className}${isActive ? ` ${activeClassName}` : ""}`}
      role={role}
      aria-sort={role ? getHeaderAriaSort(sortDirection) : undefined}
      onClick={header.column.getToggleSortingHandler()}
    >
      <span>{content}</span>
      {sortDirection === "desc" ? (
        <ArrowDown size={iconSize} aria-hidden />
      ) : null}
      {sortDirection === "asc" ? (
        <ArrowUp size={iconSize} aria-hidden />
      ) : null}
    </button>
  );
}
