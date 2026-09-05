"use client";

import { CalendarDays } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type {
  ChangeEventHandler,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import {
  caretPositionForRawLength,
  formatInputValue,
  rawInputValue,
  type InputFormat,
} from "../lib/input-format";

export type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Field({ id, label, hint, error, className, children }: FieldProps) {
  const classes = ["ui-field", error ? "ui-field--error" : "", className].filter(Boolean).join(" ");

  return (
    <label className={classes} htmlFor={id}>
      <span className="ui-field__label">{label}</span>
      {children}
      {error ? <span className="ui-field__error" role="alert">{error}</span> : null}
      {!error && hint ? <span className="ui-field__hint">{hint}</span> : null}
    </label>
  );
}

export type FormattedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "id" | "onChange" | "type" | "value"> & {
  format: InputFormat;
  id: string;
  onValueChange: (value: string) => void;
  value: string;
};

export function FormattedInput({
  format,
  id,
  onValueChange,
  value,
  inputMode,
  ...props
}: FormattedInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const formattedValue = formatInputValue(format, value);

  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const input = inputRef.current;
    if (caret === null || !input || document.activeElement !== input) return;
    input.setSelectionRange(caret, caret);
    pendingCaret.current = null;
  }, [formattedValue]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const enteredValue = event.currentTarget.value;
    const rawValue = rawInputValue(enteredValue);
    const rawLengthBeforeCaret = rawInputValue(enteredValue.slice(0, event.currentTarget.selectionStart ?? enteredValue.length)).length;
    const nextFormattedValue = formatInputValue(format, rawValue);
    const nextCaret = caretPositionForRawLength(nextFormattedValue, rawLengthBeforeCaret);

    pendingCaret.current = nextCaret;
    event.currentTarget.value = nextFormattedValue;
    event.currentTarget.setSelectionRange(nextCaret, nextCaret);
    onValueChange(rawValue);
  };

  return (
    <input
      {...props}
      ref={inputRef}
      id={id}
      type="text"
      inputMode={inputMode ?? (format === "phone" ? "tel" : "numeric")}
      value={formattedValue}
      onChange={handleChange}
    />
  );
}

export type FieldInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & Omit<FieldProps, "children"> & {
  format?: InputFormat;
  onValueChange?: (value: string) => void;
};

type NativeDateTimeType = "date" | "datetime-local";

type LocalizedDateTimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
  type: NativeDateTimeType;
  invalid: boolean;
};

function stringValue(value: InputHTMLAttributes<HTMLInputElement>["value"]) {
  return typeof value === "string" ? value : "";
}

function formatDateTimeValue(type: NativeDateTimeType, value: string, placeholder?: string) {
  if (!value) return placeholder ?? (type === "date" ? "날짜 선택" : "날짜 및 시간 선택");
  const [date, time] = value.split("T");
  const formattedDate = date.replaceAll("-", ".");
  return type === "date" || !time ? formattedDate : `${formattedDate} ${time.slice(0, 5)}`;
}

function isNativeDateTimeType(type: InputHTMLAttributes<HTMLInputElement>["type"]): type is NativeDateTimeType {
  return type === "date" || type === "datetime-local";
}

function LocalizedDateTimeInput({
  id,
  type,
  invalid,
  value,
  defaultValue,
  placeholder,
  onChange,
  ...props
}: LocalizedDateTimeInputProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(() => stringValue(defaultValue));
  const currentValue = value === undefined ? uncontrolledValue : stringValue(value);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (value === undefined) setUncontrolledValue(event.currentTarget.value);
    onChange?.(event);
  };

  return (
    <span className={["ui-field__native-date", props.disabled ? "ui-field__native-date--disabled" : ""].filter(Boolean).join(" ")}>
      <span className="ui-field__native-date-value" aria-hidden="true">
        {formatDateTimeValue(type, currentValue, placeholder)}
      </span>
      <CalendarDays className="ui-field__native-date-icon" size={18} aria-hidden="true" />
      <input
        {...props}
        id={id}
        type={type}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="ui-field__control ui-field__control--native-date"
        aria-invalid={invalid || undefined}
        onChange={handleChange}
      />
    </span>
  );
}

export function FieldInput({ id, label, hint, error, className, type, format, onValueChange, ...props }: FieldInputProps) {
  const nativeDateTimeType = isNativeDateTimeType(type) ? type : null;

  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      {nativeDateTimeType ? (
        <LocalizedDateTimeInput id={id} type={nativeDateTimeType} invalid={Boolean(error)} {...props} />
      ) : format && onValueChange && typeof props.value === "string" ? (
        <FormattedInput
          {...props}
          id={id}
          className="ui-field__control"
          aria-invalid={Boolean(error) || undefined}
          format={format}
          value={props.value}
          onValueChange={onValueChange}
        />
      ) : (
        <input id={id} type={type} className="ui-field__control" aria-invalid={Boolean(error) || undefined} {...props} />
      )}
    </Field>
  );
}

export type FieldSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & Omit<FieldProps, "children"> & {
  children: ReactNode;
};

export function FieldSelect({ id, label, hint, error, className, children, ...props }: FieldSelectProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <select id={id} className="ui-field__control ui-field__control--select" aria-invalid={Boolean(error) || undefined} {...props}>
        {children}
      </select>
    </Field>
  );
}

export type FieldTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & Omit<FieldProps, "children">;

export function FieldTextarea({ id, label, hint, error, className, ...props }: FieldTextareaProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <textarea id={id} className="ui-field__control ui-field__control--textarea" aria-invalid={Boolean(error) || undefined} {...props} />
    </Field>
  );
}
