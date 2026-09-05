"use client";

import type { ComponentProps } from "react";
import { FieldSelect } from "../ui";
import { WORK_STATUS_LABELS, WORK_STATUS_OPTIONS, type WorkStatus } from "../lib/work-status";

type WorkStatusSelectProps = Omit<ComponentProps<typeof FieldSelect>, "children" | "value" | "onChange"> & {
  value: WorkStatus;
  onChange: (status: WorkStatus) => void;
};

export default function WorkStatusSelect({ value, onChange, ...props }: WorkStatusSelectProps) {
  return (
    <FieldSelect
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value as WorkStatus)}
    >
      {WORK_STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>{WORK_STATUS_LABELS[status]}</option>
      ))}
    </FieldSelect>
  );
}
