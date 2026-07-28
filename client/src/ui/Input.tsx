import { useId, type InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, id, className, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputClasses = [styles.input, error ? styles.hasError : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={inputClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...rest}
      />
      {error && (
        <span id={`${inputId}-error`} className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
