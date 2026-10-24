import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4 does not forward async rejections. Catch them or the process dies. */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
