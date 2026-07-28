import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "chip";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function Button({ variant = "primary", fullWidth = false, className, type = "button", ...rest }: ButtonProps) {
  const classes = [styles.base, styles[variant], fullWidth ? styles.fullWidth : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
