import { RequestHandler } from 'express';
import HarmonyRequest from '../models/harmony-request';
import { getClientCredentialsToken, getUserIdRequest } from '../util/edl-api';

const BEARER_TOKEN_REGEX = new RegExp('^Bearer ([-a-zA-Z0-9._~+/]+)$', 'i');

/**
 * Builds Express.js middleware for authenticating an EDL token and extracting the username.
 * Only used for routes that require authentication. If no token is passed in then the
 * middleware does nothing and forces the user through the oauth workflow.
 *
 * @param paths - Paths that require authentication
 * @returns Express.js middleware for doing EDL token authentication
 */
export default function buildEdlAuthorizer(paths: Array<string | RegExp> = []): RequestHandler {
  return async function edlTokenAuthorizer(req: HarmonyRequest, res, next): Promise<void> {
    const requiresAuth = paths.some((p) => req.path.match(p));
    if (!requiresAuth) return next();

    const authHeader = req.headers.authorization;
    if (authHeader) {
      const match = authHeader.match(BEARER_TOKEN_REGEX);
      if (match) {
        const { logger } = req.context;
        const userToken = match[1];
        // Generates a new client credentials token for each user request passing in a token
        // We should reuse client credentials if possible (seems like simple-oauth2 lib might)
        try {
          const clientToken = await getClientCredentialsToken(logger);
          // Get the username for the provided token from EDL
          const username = await getUserIdRequest(clientToken, userToken, logger);
          req.user = username;
          req.accessToken = userToken;
          req.authorized = true;
        } catch (e) {
          next(e);
        }
      }
    }
    return next();
  };
}
