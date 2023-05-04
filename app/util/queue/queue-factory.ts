import env from '../env';
import { WorkItemUpdateQueueType, Queue } from './queue';
import { SqsQueue } from './sqs-queue';

const queuesByType = {};
const queuesByUrl = {};
const workSchedulerQueue = new SqsQueue(env.workItemSchedulerQueueUrl);

/**
 * This function returns a queue object based on the type of work item update queue requested.
 * The queue objects are created using the SqsQueue class and the URLs for the queues are
 * obtained from the environment variables. If the queue object has already been created, it is
 * returned from the `queues` object.
 * @param type - determines which queue object to return
 * @returns a queue object based on the type of work item update queue specified as the input
 * parameter.
 */
export function getQueueForType(type: WorkItemUpdateQueueType): Queue {
  if (Object.keys(queuesByType).length === 0) {
    queuesByType[WorkItemUpdateQueueType.SMALL_ITEM_UPDATE] = new SqsQueue(env.workItemUpdateQueueUrl);
    queuesByType[WorkItemUpdateQueueType.LARGE_ITEM_UPDATE] = new SqsQueue(env.largeWorkItemUpdateQueueUrl);
  }
  return queuesByType[type];
}

/**
 * Get a queue object based on the URL of the queue requested
 * @param url - the URL of the queue to return
 * @returns a queue object based on the URL specified as the input parameter.
 */
export function getQueueForUrl(url: string): Queue {
  if (!queuesByUrl[url]) {
    queuesByUrl[url] = new SqsQueue(url);
  }

  return queuesByUrl[url];
}

/**
 * Get the queue used for requesting work-items to be scheduled for a service. This
 * queue triggers the scheduler to load `WorkItem`s on a service queue.
 * @returns the queue to use for scheduling work items
 */
export function getWorkSchedulerQueue(): Queue {
  return workSchedulerQueue;
}