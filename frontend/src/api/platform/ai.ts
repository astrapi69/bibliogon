/**
 * AI API namespace. Extracted from api/platform.ts (#679); spread into
 * the single `api` object via platform.ts -> apiObject.ts.
 */
import { request } from "../http";
import type {
  AiAsyncJobSubmit,
  AiGenerateMarketingRequest,
  AiGenerateResponse,
  AiJobStatus,
  AiReviewEstimate,
  AiReviewSubmitRequest,
  AiTestConnectionResult,
} from "../client";

export const ai = {
  /** Cheap pre-flight estimate for the AI review cost label. */
  estimateReview: (content: string) =>
    request<AiReviewEstimate>("/ai/review/estimate", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  /** Free-form generation used by the editor's AI panel. */
  generate: (prompt: string, system: string, bookId: string) =>
    request<AiGenerateResponse>("/ai/generate", {
      method: "POST",
      body: JSON.stringify({ prompt, system, book_id: bookId }),
    }),

  /** Submit an async chapter review. The caller subscribes to
   *  `/api/ai/jobs/{id}/stream` (SSE) afterwards via the native
   *  EventSource - that lifecycle is not part of the API client. */
  reviewAsync: (request_body: AiReviewSubmitRequest) =>
    request<AiAsyncJobSubmit>("/ai/review/async", {
      method: "POST",
      body: JSON.stringify(request_body),
    }),

  /** Poll the final job result once SSE reports `stream_end`. */
  getJob: (jobId: string) => request<AiJobStatus>(`/ai/jobs/${jobId}`),

  /** Generate marketing copy for a book metadata field. */
  generateMarketing: (request_body: AiGenerateMarketingRequest) =>
    request<AiGenerateResponse>("/ai/generate-marketing", {
      method: "POST",
      body: JSON.stringify(request_body),
    }),

  /** Test the current AI configuration with a minimal request.
   *  Backend GET /api/ai/test-connection returns
   *  {success, error_key, error_detail}. Consumers branch on
   *  success and may map error_key to localized strings. */
  testConnection: () => request<AiTestConnectionResult>("/ai/test-connection"),
};
