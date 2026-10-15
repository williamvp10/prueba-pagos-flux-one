"use client";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;
  return <Button variant="ghost" size="icon" aria-label={`Tema actual: ${theme ?? "sistema"}. Cambiar tema`} onClick={() => setTheme(next)}><Icon className="size-4" aria-hidden="true" /></Button>;
}
