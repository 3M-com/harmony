// functions used for creating batches of inputs to aggregation steps

import { Logger } from 'winston';
import { v4 as uuid } from 'uuid';
import { Transaction } from '../util/db';
import BatchItem, { getByJobServiceBatch, getCurrentBatchSizeAndCount, getItemUrlsForJobServiceBatch, getMaxSortIndexForJobServiceBatch } from '../models/batch-item';
import { Batch, withHighestBatchIDForJobService } from '../models/batch';
import { createDecrypter, createEncrypter } from './crypto';
import env from './env';
import DataOperation from '../models/data-operation';
import { objectStoreForProtocol } from './object-store';
import axios from 'axios';
import { getCatalogItemUrls, readCatalogItems } from './stac';
import WorkItemUpdate from '../models/work-item-update';
import WorkflowStep, { incrementWorkItemCount } from '../models/workflow-steps';
import { WorkItemStatus } from '../models/work-item-interface';
import WorkItem from '../models/work-item';

/**
 * Get the size in bytes of the object at the given url
 *
 * @param url - the url of the object
 * @param token - the access token for the user's request
 * @param logger - a Logger instance
 * @returns the size of the object in bytes
 */
export async function sizeOfObject(url: string, token: string, logger: Logger): Promise<number> {
  logger.debug(`Reading size of data at ${url}`);
  const parsed = new URL(url);
  const protocol = parsed.protocol.toLowerCase().replace(/:$/, '');
  let result;
  try {
    let res;
    switch (protocol) {
      case 's3':
        const s3 = objectStoreForProtocol('s3');
        res = await s3.headObject(url);
        result = res.ContentLength;
        break;

      default:

        const headers = token ? { authorization: `Bearer ${token}` } : {};
        res = await axios.head(url, { headers: headers });
        result = parseInt(res.headers['content-length']);
        break;
    }
  } catch (e) {
    logger.error(e);
    result = 0;
  }

  logger.debug(`ContentLength: ${result}`);
  return result;
}

/**
 * Read and parse a STAC catalog and return the links to the data items
 *
 * @param s3Url - the s3 url of the catalog
 */
export async function readCatalogLinks(s3Url: string, logger: Logger): Promise<string[]> {
  logger.debug(`Reading STAC catalog ${s3Url}`);
  const items = await readCatalogItems(s3Url);

  return items.map((item) => item.assets.data.href);
}

/**
 * Get the urls of the STAC items contained in the STAC catalogs returned in a work item update
 * @param results - the url(s) of the STAC catalog(s) returned in the work item update
 * @returns
 */
export async function outputStacItemUrls(results: string[]):
Promise<string[]> {
  let urls: string[] = [];
  for (const catalogUrl of results) {
    const stacItemUrls = await getCatalogItemUrls(catalogUrl);

    urls = urls.concat(stacItemUrls);
  }
  return urls;
}

/**
 * Get the sizes of all the data items/granules returned for the WorkItem.
 *
 * @param update - information about the work item update
 * @param operation - the DataOperation for the user's request
 * @param logger - the Logger for the request
 * @returns
 */
export async function resultItemSizes(update: WorkItemUpdate, operation: object, logger: Logger):
Promise<number[]> {
  let outputItemSizes = [];
  if (update.outputItemSizes?.every(s => s > 0)) {
    // if all the granules sizes were provided by the service then just use them, otherwise
    // get the ones that were not provided
    // eslint-disable-next-line prefer-destructuring
    outputItemSizes = update.outputItemSizes;

  } else if (update.results) {
    const encrypter = createEncrypter(env.sharedSecretKey);
    const decrypter = createDecrypter(env.sharedSecretKey);
    const op = new DataOperation(operation, encrypter, decrypter);
    const token = op.unencryptedAccessToken;
    let index = 0;
    for (const catalogUrl of update.results) {
      const links = await exports.readCatalogLinks(catalogUrl, logger);
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      const sizes = await Promise.all(links.map(async (link) => {
        const serviceProvidedSize = update.outputItemSizes?.[index];
        index += 1;
        // use the value provided by the service if available
        if (serviceProvidedSize && serviceProvidedSize > 0) {
          return serviceProvidedSize;
        }

        // try to get the size using a HEAD request
        return exports.sizeOfObject(link, token, logger);
      }));
      outputItemSizes = outputItemSizes.concat(sizes);
    }
  }
  return outputItemSizes;
}

/**
 *
 * @param jobID - the UUID associated with the job
 * @param stepIndex - the index of the step in the workflow
 * @param batchID - The ID of the batch to use when creating the catalog
 * @param sourceCollection - The CMR collection concept ID
 * @param stacItemUrls - links to the STAC item files for the catalog
 * @returns the URL to resulting STAC catalog
 */
async function createStacCatalogForBatch(
  jobID: string,
  stepIndex: number,
  batchID: number,
  sourceCollection: string,
  stacItemUrls):
  Promise<string> {
  const catalogUrl =
    `s3://${env.artifactBucket}/${jobID}/batches/${stepIndex}/${batchID}/catalog.json`;

  const sourceUrl = `${process.env.CMR_ENDPOINT}/search/concepts/${sourceCollection}`;

  const sourceLink = {
    'rel': 'harmony_source',
    'href': sourceUrl,
  };

  const itemLinks = stacItemUrls.map((url) => {
    return {
      'rel': 'item',
      'href': url,
      'type': 'application/json',
      'title': 'data item',
    };
  });

  const links = [sourceLink, ...itemLinks];

  const catalog = {
    'stac_version': '1.0.0-beta.2',
    'stac_extensions': [],
    'id': uuid(),
    'links': links,
    'description': `CMR collection ${sourceCollection} granules`,
  };

  const s3 = objectStoreForProtocol('s3');
  await s3.upload(JSON.stringify(catalog, null, 2), catalogUrl, null, 'application/json');

  return catalogUrl;
}

/**
 * Create a STAC catalog for a batch then create an aggregating work item to process it
 *
 * @param tx - the database transaction
 * @param workflowStep- the step in the workflow that needs batching
 * @param batch - the Batch to process
 */
async function createCatalogAndWorkItemForBatch(tx: Transaction, workflowStep: WorkflowStep, batch: Batch): Promise<void> {
  const { jobID, serviceID, stepIndex } = workflowStep;
  const batchItemUrls = await getItemUrlsForJobServiceBatch(tx, jobID, serviceID, batch.batchID);
  // create STAC catalog for the batch
  const catalogUrl = await createStacCatalogForBatch(
    jobID,
    stepIndex,
    batch.batchID,
    workflowStep.collectionsForOperation()[0],
    batchItemUrls);

  // create a work item for the batch
  const newWorkItem = new WorkItem({
    jobID,
    serviceID,
    status: WorkItemStatus.READY,
    stacCatalogLocation: catalogUrl,
    workflowStepIndex: workflowStep.stepIndex,
  });

  await newWorkItem.save(tx);
}

/**
 * Generate batches for results returned by a service to be used by a subsequent aggregating step.
 *
 * @param tx - The database transaction
 * @param logger - a Logger instance
 * @param workflowStep - The step in the workflow that needs batching
 * @param stacItemUrls - An array of paths to STAC items
 * @param itemSizes - An array of item sizes
 * @param workItemSortIndex - The sort index of the parent work item (if set)
 * @param allWorkItemsForStepComplete - true if all the work items for the current step are complete
 */
export async function handleBatching(
  tx: Transaction,
  logger: Logger,
  workflowStep: WorkflowStep,
  stacItemUrls: string[],
  itemSizes: number[],
  workItemSortIndex: number,
  allWorkItemsForStepComplete: boolean)
  : Promise<void> {
  const { jobID, serviceID, stepIndex } = workflowStep;
  let { maxBatchInputs, maxBatchSizeInBytes } = workflowStep;
  maxBatchInputs = maxBatchInputs || env.maxBatchInputs;
  maxBatchSizeInBytes = maxBatchSizeInBytes || env.maxBatchSizeInBytes;

  // compute the starting sortIndex to assign to the first new batch item
  let startIndex = workItemSortIndex;
  if (!startIndex && (startIndex != 0)) {
    startIndex = await getMaxSortIndexForJobServiceBatch(
      tx,
      jobID,
      serviceID,
    );
    if (startIndex == null) {
      startIndex = 0;
    } else {
      startIndex += 1;
    }
  }

  let indexIncrement = 0;
  // create new batch items for the STAC items in the results. This looping is only useful for
  // query-cmr (currently)
  for (const url of stacItemUrls) {
    const sortIndex = startIndex + indexIncrement;
    const batchItem = new BatchItem({
      jobID,
      serviceID,
      stacItemUrl: url,
      itemSize: itemSizes[indexIncrement],
      sortIndex,
    });
    indexIncrement += 1;
    await batchItem.save(tx);
  }

  // assign batch items to batches
  // we lock the rows that we select here from `batch_items` to prevent multiple threads from
  // attempting to create new rows in the `batches` table for the same batch
  const batchItems = await getByJobServiceBatch(tx, jobID, serviceID, null, true);
  let index = 0;
  let nextSortIndex: number;
  let currentBatch = await withHighestBatchIDForJobService(tx, jobID, serviceID);
  let currentBatchSize = 0;
  let currentBatchCount = 0;
  if (currentBatch) {
    const { sum, count } = await getCurrentBatchSizeAndCount(tx, jobID, serviceID, currentBatch.batchID);
    currentBatchSize = sum;
    currentBatchCount = count;
  }

  while (index < batchItems.length) {
    if (currentBatch) {
      // figure out what the next sort index in the batch should be
      nextSortIndex = 0;
      const batchItem = batchItems[index];
      // if there are already items in this batch use (highest sort index in the batch) + 1
      const maxSortIndex = await getMaxSortIndexForJobServiceBatch(
        tx,
        jobID,
        serviceID,
        currentBatch.batchID);
      if (maxSortIndex == null) {
        // the batch has no items in it, try to get the max sort index from the previous batch
        // (if there was one)
        if (currentBatch.batchID > 0) {
          const prevMaxSortIndex = await getMaxSortIndexForJobServiceBatch(
            tx,
            jobID,
            serviceID,
            currentBatch.batchID - 1,
          );
          if (prevMaxSortIndex == null) {
            const errMsg = `Could not find next sort index for batch ${currentBatch.batchID}`;
            logger.error(errMsg);
            throw new Error(errMsg);
          } else {
            nextSortIndex = prevMaxSortIndex + 1;
          }
        } else {
          // this is the first batch and it is empty so the next sort index should be 0
          nextSortIndex = 0;
        }
      } else {
        nextSortIndex = maxSortIndex + 1;
      }

      if (batchItem.sortIndex === nextSortIndex) {
        if (currentBatchSize + batchItem.itemSize <= maxBatchSizeInBytes
          && currentBatchCount + 1 <= maxBatchInputs) {
          // add the batch item to the batch
          batchItem.batchID = currentBatch.batchID;
          await batchItem.save(tx);
          currentBatchSize += batchItem.itemSize;
          currentBatchCount += 1;
          index += 1;
          // check to see if the batch is full
          if (currentBatchCount === maxBatchInputs || currentBatchSize === maxBatchSizeInBytes) {
            // create STAC catalog and next work item for the current batch
            await createCatalogAndWorkItemForBatch(tx, workflowStep, currentBatch);
            currentBatch.isProcessed = true;
            // create a new batch
            const newBatch = new Batch({
              jobID,
              serviceID,
              batchID: currentBatch.batchID + 1,
            });
            await newBatch.save(tx);

            // make the new batch the current batch
            currentBatch = newBatch;
            currentBatchCount = 0;
            currentBatchSize = 0;
            await incrementWorkItemCount(tx, jobID, stepIndex);
          }
        } else {
          if (currentBatchSize + batchItem.itemSize > maxBatchSizeInBytes) {
            logger.info(`Batch is complete because next item exceeded batch file size limits: ${currentBatchSize + batchItem.itemSize} is greater than ${maxBatchSizeInBytes}`);
          } else if (currentBatchCount + 1 > maxBatchInputs) {
            logger.info(`Batch is complete because we cannot add another input item - max items is ${maxBatchInputs} and currentBatchCount is ${currentBatchCount}`);
          } else {
            logger.error(`Batch construction is broken: current batch size: ${currentBatchSize}, item size: ${batchItem.itemSize}, max size: ${maxBatchSizeInBytes}, current batch count: ${currentBatchCount}, max inputs: ${maxBatchInputs}`);
          }
          // create STAC catalog and next work item for the current batch
          await createCatalogAndWorkItemForBatch(tx, workflowStep, currentBatch);
          currentBatch.isProcessed = true;

          // create a new batch
          const newBatch = new Batch({
            jobID,
            serviceID,
            batchID: currentBatch.batchID + 1,
          });
          await newBatch.save(tx);
          batchItem.batchID = newBatch.batchID;
          await batchItem.save(tx);
          // make the new batch the current batch
          currentBatch = newBatch;
          currentBatchCount = 1;
          currentBatchSize = batchItem.itemSize;
          await incrementWorkItemCount(tx, jobID, stepIndex);
          index += 1;
        }
      } else {
        break;
      }
    } else {
      // no current batch so create a new one
      const newBatch = new Batch({
        jobID,
        serviceID,
        batchID: 0,
      });
      await newBatch.save(tx);
      currentBatch = newBatch;
      currentBatchCount = 0;
      currentBatchSize = 0;
      nextSortIndex = 0;
    }
  }

  // if this is the last work item for the step just before aggregation, save the catalog
  // and create a new aggregating work item unless we already did above due to the batch
  // being full
  if (allWorkItemsForStepComplete && !currentBatch.isProcessed) {
    await createCatalogAndWorkItemForBatch(tx, workflowStep, currentBatch);
  }
}