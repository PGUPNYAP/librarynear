import "server-only";

import { redirect } from "next/navigation";

function withParam(path: string, key: "error" | "notice", message: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("error");
  params.delete("notice");
  params.set(key, message.slice(0, 300));
  return `${base}?${params.toString()}`;
}

export function redirectWithError(path: string, message: string): never {
  redirect(withParam(path, "error", message));
}

export function redirectWithNotice(path: string, message: string): never {
  redirect(withParam(path, "notice", message));
}
