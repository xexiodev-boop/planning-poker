import { t } from "@lingui/core/macro";
import { localizeServerMessage } from "./serverMessages.js";

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error ? localizeServerMessage(data.error) : t`Something went wrong.`);
    error.status = response.status;
    throw error;
  }
  return data;
}
