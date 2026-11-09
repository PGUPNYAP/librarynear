/** Exams we have landing pages for. Anything else under /[city]/exam/* is a 404. */
export const SUPPORTED_EXAMS = {
  upsc: "UPSC",
  neet: "NEET",
  jee: "JEE",
  ssc: "SSC",
  "bank-po": "Bank PO",
  ca: "CA",
} as const;

export type ExamSlug = keyof typeof SUPPORTED_EXAMS;

export function getExamName(slug: string): string | null {
  const key = slug.toLowerCase() as ExamSlug;
  return SUPPORTED_EXAMS[key] ?? null;
}
