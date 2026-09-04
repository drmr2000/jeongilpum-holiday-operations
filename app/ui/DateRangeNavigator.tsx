"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { addOperationalDays, isValidOperationalDate } from "../lib/operational-date";
import { Button } from "./Button";
import { FieldInput } from "./Field";

type DateRangeNavigatorProps = {
  ariaLabel: string;
  dateFrom: string;
  dateFromId: string;
  dateFromLabel: ReactNode;
  dateTo?: string;
  dateToId?: string;
  dateToLabel?: ReactNode;
  onChange: (dateFrom: string, dateTo?: string) => void;
};

export function DateRangeNavigator({
  ariaLabel,
  dateFrom,
  dateFromId,
  dateFromLabel,
  dateTo,
  dateToId,
  dateToLabel,
  onChange,
}: DateRangeNavigatorProps) {
  const includesDateTo = dateTo !== undefined;
  const canNavigate = isValidOperationalDate(dateFrom)
    && (!includesDateTo || isValidOperationalDate(dateTo));

  const move = (days: number) => {
    if (!canNavigate) return;
    onChange(
      addOperationalDays(dateFrom, days),
      includesDateTo ? addOperationalDays(dateTo, days) : undefined,
    );
  };

  return (
    <div className="ui-date-range" role="group" aria-label={ariaLabel}>
      <Button
        aria-label="이전 날짜"
        iconOnly
        leadingIcon={<ChevronLeft size={16} />}
        size="sm"
        variant="ghost"
        disabled={!canNavigate}
        onClick={() => move(-1)}
      />
      <div className="ui-date-range__fields">
        <FieldInput
          id={dateFromId}
          className="ui-date-range__field"
          label={dateFromLabel}
          type="date"
          value={dateFrom}
          onChange={(event) => onChange(event.target.value, dateTo)}
        />
        {includesDateTo && dateToId && dateToLabel ? (
          <FieldInput
            id={dateToId}
            className="ui-date-range__field"
            label={dateToLabel}
            type="date"
            value={dateTo}
            onChange={(event) => onChange(dateFrom, event.target.value)}
          />
        ) : null}
      </div>
      <Button
        aria-label="다음 날짜"
        iconOnly
        leadingIcon={<ChevronRight size={16} />}
        size="sm"
        variant="ghost"
        disabled={!canNavigate}
        onClick={() => move(1)}
      />
    </div>
  );
}
