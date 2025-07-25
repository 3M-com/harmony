import { NextFunction, Response } from 'express';

import HarmonyRequest from '../models/harmony-request';
import { getRetryCounts } from '../models/work-item';
import db from '../util/db';
import { RequestValidationError } from '../util/errors';
import { keysToLowerCase } from '../util/object';

const DEFAULT_MINUTES = 60;

/**
 * Express.js handler that returns retry statistics for harmony work items,
 * responding with JSON by default or HTML if requested.
 */
export async function getRetryStatistics(
  req: HarmonyRequest, res: Response, next: NextFunction,
): Promise<void> {
  const keys = keysToLowerCase(req.query);

  let numMinutes: number;

  if (keys.numminutes != null) {
    const parsed = Number(keys.numminutes);
    if (Number.isInteger(parsed)) {
      numMinutes = parsed;
    } else {
      numMinutes = NaN;
    }
  } else {
    numMinutes = DEFAULT_MINUTES;
  }

  req.context.logger.info(`Retry statistics requested by user ${req.user}`);

  try {
    if (isNaN(numMinutes) || numMinutes <= 0) {
      throw (new RequestValidationError('numMinutes must be a positive integer'));
    }
    const rawCounts = await getRetryCounts(db, numMinutes);

    const totalWorkItems = Object.values(rawCounts).reduce((sum, v) => sum + v, 0);
    const totalRetries = Object.entries(rawCounts)
      .reduce((sum, [k, v]) => sum + (Number(k) * v), 0);

    const totalWorkItemExecutions = totalWorkItems + totalRetries;
    const percentRetried = totalWorkItems === 0 ? 0 : totalRetries / totalWorkItemExecutions * 100;
    const percentSuccessful = totalWorkItems === 0 ? 0 : 100.0 - percentRetried;

    const countsObj = rawCounts;
    const countsArray = Object.entries(rawCounts)
      .map(([k, v]) => ({ retryCount: k, count: v }))
      .sort((a, b) => Number(a.retryCount) - Number(b.retryCount));

    const result = {
      numMinutes,
      counts: countsObj,
      totalWorkItems,
      totalRetries,
      totalWorkItemExecutions,
      percentSuccessful: `${percentSuccessful.toFixed(2)}%`,
      percentRetried: `${percentRetried.toFixed(2)}%`,
    };

    // Detect if client wants HTML explicitly - by default we will return JSON
    const acceptsHtml = req.accepts(['json', 'html']) === 'html';

    if (acceptsHtml) {
      res.render('retry-stats', {
        numMinutes,
        counts: countsArray,
        totalWorkItems,
        totalRetries,
        totalWorkItemExecutions,
        percentSuccessful: `${percentSuccessful.toFixed(2)}%`,
        percentRetried: `${percentRetried.toFixed(2)}%`,
      });
    } else {
      res.json(result);
    }

  } catch (e) {
    req.context.logger.error(e);
    next(e);
  }
}

