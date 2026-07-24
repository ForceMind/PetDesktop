import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function publicError(error: unknown) {
  if (error instanceof AppError) return { message: error.message, code: error.code, status: error.status };
  if (error instanceof ZodError) return { message: "Coco 没听明白这句话，请换个说法。", code: "INVALID_REQUEST", status: 400 };
  if (error instanceof Error && "status" in error && typeof error.status === "number") {
    const status = error.status;
    return {
      message: status === 404 ? "请求的资源不存在。" : "静态资源请求失败。",
      code: status === 404 ? "RESOURCE_NOT_FOUND" : "STATIC_RESOURCE_ERROR",
      status
    };
  }
  console.error(error);
  return { message: "Coco 暂时迷路了，请稍后再试。", code: "INTERNAL_ERROR", status: 500 };
}
