export type SchoolClass = {
  id: string;
  name: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
};
export type Hold = {
  holdId: string;
  classId: string;
  className: string;
  studentId?: string;
  status: "HELD" | "CONFIRMED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
};

declare global {
  interface Window {
    __CONFIG__?: { apiUrl?: string };
  }
}

export const apiUrl = (
  window.__CONFIG__?.apiUrl ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:8080"
).replace(/\/$/, "");

export async function api<T>(
  path: string,
  options: RequestInit = {},
  student?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(student ? { "X-Student-Id": student } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error(
      "We couldn’t connect to the admissions service. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "Something went wrong. Please try again.");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
