// Vercel serverless entry: every /api/* request is routed here.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApi } from './api.ts';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleApi(req, res);
}
