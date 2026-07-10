import type { NextFunction, Request, Response } from 'express';

type Controller = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function ctrlWrapper(controller: Controller) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await controller(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}
