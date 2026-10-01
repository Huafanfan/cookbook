import type { WorkshopDraft } from "../../shared/types.js";

/** 工坊可公开的诊断只携带受控文案，不转发提供方正文或磁盘路径。 */
export class WorkshopError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly issues?: string[],
    readonly current?: WorkshopDraft
  ) {
    super(message);
    this.name = "WorkshopError";
  }
}
