export interface VKErrorResponse {
  error: {
    error_code: number;
    error_msg: string;
    error_subcode?: number;
  };
}

export function isVKError(error: unknown): error is VKErrorResponse {
  return typeof error === "object" && error !== null && "error" in error;
}

export class VKApiError extends Error {
  error_msg: string;
  error_code: number;
  error_subcode?: number;

  constructor(error: VKErrorResponse) {
    super(error.error.error_msg);
    this.error_msg = error.error.error_msg;
    this.error_code = error.error.error_code;
    this.error_subcode = error.error.error_subcode;
    this.name = "VKApiError";
  }
}
