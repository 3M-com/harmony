import { expect } from 'chai';
import { getWorkItemById } from '../../app/models/work-item';
import db from '../../app/util/db';
import { Job, JobStatus } from '../../app/models/job';
import { hookRedirect } from '../helpers/hooks';
import { hookRangesetRequest } from '../helpers/ogc-api-coverages';
import hookServersStartStop from '../helpers/servers';
import { fakeServiceStacOutput, getWorkForService, updateWorkItem } from '../helpers/work-items';
import { getStacLocation, WorkItemStatus } from '../../app/models/work-item-interface';
import { truncateAll } from '../helpers/db';
import env from '../../app/util/env';
import { resetQueues } from '../helpers/queue';

const reprojectQuery = {
  maxResults: 1,
  outputCrs: 'EPSG:4326',
  interpolation: 'near',
  scaleExtent: '0,2500000.3,1500000,3300000',
  scaleSize: '1.1,2',
  ignoreErrors: true,
  forceAsync: true,
};

describe('Work item failure retries', function () {
  const collection = 'C1233800302-EEDTEST';
  let retryLimit: number;
  hookServersStartStop();

  before(async function () {
    retryLimit = env.workItemRetryLimit;
    env.workItemRetryLimit = 2;
  });

  after(async function () {
    env.workItemRetryLimit = retryLimit;
  });

  describe('When making a request', async function () {
    before(async function () {
      await truncateAll();
      resetQueues();
    });

    after(async function () {
      resetQueues();
      await truncateAll();
    });

    describe('And a work-item fails the first time', async function () {
      hookRangesetRequest('1.0.0', collection, 'all', { query: { ...reprojectQuery, ...{ maxResults: 1 } } });
      hookRedirect('joe');
      before(async function () {
        const res = await getWorkForService(this.backend, 'harmonyservices/query-cmr:stable');
        const { workItem } = JSON.parse(res.text);

        workItem.status = WorkItemStatus.FAILED;
        workItem.results = [];

        await updateWorkItem(this.backend, workItem);

        this.workItem = await getWorkItemById(db, workItem.id);
      });
      it('Leaves the job in the running state', async function () {
        const { job } = await Job.byJobID(db, this.workItem.jobID);
        expect(job.status).to.equal(JobStatus.RUNNING);
      });
      it('Changes the work-item status to ready', async function () {
        expect(this.workItem.status).to.equal(WorkItemStatus.READY);
      });
      describe('and then the work-item succeeds', async function () {
        before(async function () {
          const res = await getWorkForService(this.backend, 'harmonyservices/query-cmr:stable');
          const { workItem } = JSON.parse(res.text);

          workItem.status = WorkItemStatus.SUCCESSFUL;
          workItem.results = [getStacLocation(workItem, 'catalog.json')];
          workItem.outputItemSizes = [1];

          await fakeServiceStacOutput(workItem.jobID, workItem.id, 1);
          await updateWorkItem(this.backend, workItem);

          this.workItem = await getWorkItemById(db, workItem.id);
        });
        it('changes the work-item status to successful', async function () {
          expect(this.workItem.status).to.equal(WorkItemStatus.SUCCESSFUL);
        });
      });
    });

    describe('And a work-item fails two times', async function () {
      hookRangesetRequest('1.0.0', collection, 'all', { query: { ...reprojectQuery, ...{ maxResults: 1 } } });
      hookRedirect('joe');
      before(async function () {
        const res = await getWorkForService(this.backend, 'harmonyservices/query-cmr:stable');
        const { workItem } = JSON.parse(res.text);

        workItem.status = WorkItemStatus.FAILED;
        workItem.results = [];

        await updateWorkItem(this.backend, workItem);

        this.workItem = await getWorkItemById(db, workItem.id);
      });
      it('Leaves the job in the running state', async function () {
        const { job } = await Job.byJobID(db, this.workItem.jobID);
        expect(job.status).to.equal(JobStatus.RUNNING);
      });
      it('Changes the work-item status to ready', async function () {
        expect(this.workItem.status).to.equal(WorkItemStatus.READY);
      });
      describe('and then the work-item fails a second time', async function () {
        before(async function () {
          const res = await getWorkForService(this.backend, 'harmonyservices/query-cmr:stable');
          const { workItem } = JSON.parse(res.text);

          workItem.status = WorkItemStatus.FAILED;
          workItem.results = [];

          await updateWorkItem(this.backend, workItem);

          this.workItem = await getWorkItemById(db, workItem.id);
        });
        it('Leaves the job in the running state', async function () {
          const { job } = await Job.byJobID(db, this.workItem.jobID);
          expect(job.status).to.equal(JobStatus.RUNNING);
        });
        it('Changes the work-item status to ready', async function () {
          expect(this.workItem.status).to.equal(WorkItemStatus.READY);
        });
      });
      describe('and then the work-item succeeds', async function () {
        before(async function () {
          const res = await getWorkForService(this.backend, 'harmonyservices/query-cmr:stable');
          const { workItem } = JSON.parse(res.text);

          workItem.status = WorkItemStatus.SUCCESSFUL;
          workItem.results = [getStacLocation(workItem, 'catalog.json')];
          workItem.outputItemSizes = [1];

          await fakeServiceStacOutput(workItem.jobID, workItem.id, 1);
          await updateWorkItem(this.backend, workItem);

          this.workItem = await getWorkItemById(db, workItem.id);
        });
        it('changes the work-item status to successful', async function () {
          expect(this.workItem.status).to.equal(WorkItemStatus.SUCCESSFUL);
        });
      });
    });

    describe('And a work-item fails three times', async function () {
      hookRangesetRequest('1.0.0', collection, 'all', { query: { ...reprojectQuery, ...{ maxResults: 1 } } });
      hookRedirect('joe');
      before(async function () {
        const res = await getWorkForService(this.backend, 'harmonyservices/query-cmr:stable');
        const { workItem } = JSON.parse(res.text);

        workItem.status = WorkItemStatus.FAILED;
        workItem.results = [];

        await updateWorkItem(this.backend, workItem);

        this.workItem = await getWorkItemById(db, workItem.id);
      });
      it('Leaves the job in the running state', async function () {
        const { job } = await Job.byJobID(db, this.workItem.jobID);
        expect(job.status).to.equal(JobStatus.RUNNING);
      });
      it('Changes the work-item status to ready', async function () {
        expect(this.workItem.status).to.equal(WorkItemStatus.READY);
      });
      describe('and then the work-item fails a second time', async function () {
        before(async function () {
          const res = await getWorkForService(this.backend, 'harmonyservices/query-cmr:stable');
          const { workItem } = JSON.parse(res.text);

          workItem.status = WorkItemStatus.FAILED;
          workItem.results = [];

          await updateWorkItem(this.backend, workItem);

          this.workItem = await getWorkItemById(db, workItem.id);
        });
        it('Leaves the job in the running state', async function () {
          const { job } = await Job.byJobID(db, this.workItem.jobID);
          expect(job.status).to.equal(JobStatus.RUNNING);
        });
        it('Changes the work-item status to ready', async function () {
          expect(this.workItem.status).to.equal(WorkItemStatus.READY);
        });
      });
      describe('and then the work-item fails a third time', async function () {
        before(async function () {
          const res = await getWorkForService(this.backend, 'harmonyservices/query-cmr:stable');
          const { workItem } = JSON.parse(res.text);

          workItem.status = WorkItemStatus.FAILED;
          workItem.results = [];

          await updateWorkItem(this.backend, workItem);

          this.workItem = await getWorkItemById(db, workItem.id);
        });
        it('Changes the job status to failed', async function () {
          const { job } = await Job.byJobID(db, this.workItem.jobID);
          expect(job.status).to.equal(JobStatus.FAILED);
        });
        it('changes the work-item status to failed', async function () {
          expect(this.workItem.status).to.equal(WorkItemStatus.FAILED);
        });
      });
    });

    describe('And a work-item fails with no retry error', async function () {
      hookRangesetRequest('1.0.0', collection, 'all', { query: { ...reprojectQuery, ...{ maxResults: 1 } } });
      hookRedirect('joe');
      before(async function () {
        const res = await getWorkForService(this.backend, 'harmonyservices/query-cmr:stable');
        const { workItem } = JSON.parse(res.text);

        workItem.status = WorkItemStatus.FAILED;
        workItem.message = 'The service returns noretry error';
        workItem.message_category = 'noretry';
        workItem.results = [];

        await updateWorkItem(this.backend, workItem);

        this.workItem = await getWorkItemById(db, workItem.id);
      });

      it('Changes the work-item status to failed immediately without retries', async function () {
        expect(this.workItem.status).to.equal(WorkItemStatus.FAILED);
        expect(this.workItem.retryCount).to.equal(0);
      });
      it('changes the work-item status to failed', async function () {
        const { job } = await Job.byJobID(db, this.workItem.jobID);
        expect(job.status).to.equal(JobStatus.FAILED);
      });
    });
  });
});
