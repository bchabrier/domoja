/*
import rewire = require('rewire');
import * as ToMock from '../core/persistences/persistence'
let RewireToMock = rewire('../core/persistences/persistence')
const persistenceModule: typeof ToMock & typeof RewireToMock = <any>RewireToMock
type persistence = ToMock.persistence;
*/

import * as assert from 'assert';
import { persistence } from 'domoja-core/persistence/persistence';
import { mongoDB } from 'domoja-core/persistence/mongodb';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, rmSync } from 'fs';
import { dirname } from 'path';


abstract class persistence_helper<T extends persistence> {

  name: string;
  private klass: new (deviceName: string, keepString: string) => T;

  constructor(private ctor: new (deviceName: string, keepString?: string) => T) {
    this.klass = ctor;
    this.name = ctor.name
  }

  createInstance(deviceId: string, keepString?: string): T {
    return new this.ctor(deviceId, keepString);
  }

  abstract dumpToFile(filename: string): Promise<void>;
  abstract loadFromFile(filename: string): Promise<void>;

  abstract dropDatabase(): Promise<void>;
}


type MongoClient = Parameters<Parameters<typeof mongoDB["getMongoClient"]>[0]>[1];

class mongoDB_helper extends persistence_helper<mongoDB> {

  constructor() {
    mongoDB.mongoUri = 'mongodb://127.0.0.1:27017/domoja_test_persistence';
    super(mongoDB);
  }


  private getMongoClient(callback: (err: Error | null, client: MongoClient) => void): void {
    const mongoDBGetMongoClient = mongoDB["getMongoClient"];
    mongoDBGetMongoClient(callback);
  }

  dropDatabase(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // create a fake persistence to force the initialization of the mongo client if not already done
      //const persistence = this.createInstance("fake_device_to_prevent_topology_was_destroyed_error");
      this.getMongoClient((err, client) => {
        if (err) return reject(err);

        client.db().dropDatabase((err: Error, result: any) => {
          if (err) return reject(err);
          if (result !== true) return reject(new Error("Cannot drop database"));
          resolve();
        });
      });
    });
  }

  async dumpToFile(filename: string) {
    return await mongoDB.dumpToFile(filename);
  }

  async loadFromFile(filename: string) {
    return await mongoDB.loadFromFile(filename);
  }

};


const persistenceConfigs: persistence_helper<persistence>[] = [
  new mongoDB_helper(),
];

describe('Module persistence', function () {
  this.timeout(10000);

  for (let config of persistenceConfigs) {
    describe('class ' + config.name, function () {

      let persistence: persistence | null;

      this.beforeEach(async function () {
        await config.dropDatabase();
      });

      describe('#insert', function () {
        it('should insert a new record', async function () {
          persistence = config.createInstance("test_device", '{"raw": "1 year"}');
          assert(persistence);
          const doc = await persistence.insert({
            date: new Date(2024, 0, 1, 10, 30, 0, 0), // 1st Jan 2024, 10:30:00.000
            state: "on"
          });
          assert(doc);
        });
      });

      describe('#getHistory', function () {
        it('should get history', async function () {
          persistence = config.createInstance("test_device", '{"raw": "1 year"}');
          assert(persistence);
          let date1 = new Date(2024, 0, 1, 10, 30, 0, 0); // 1st Jan 2024, 10:30:00.000
          let date2 = new Date(2024, 0, 2, 10, 40, 0, 0); // 2nd Jan 2024, 10:40:00.000
          const doc1 = await persistence.insert({
            date: date1,
            state: "on"
          });
          const doc2 = await persistence.insert({
            date: date2,
            state: "off"
          });

          const results = await persistence.getHistory("raw", null, null);
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 2);
          assert.equal(results[0].value, "on");
          assert.equal((results[0].date as Date).getTime(), date1.getTime());
          assert.equal(results[1].value, "off");
          assert.equal((results[1].date as Date).getTime(), date2.getTime());
        });

        async function prepareHistoryForParamTests(config: persistence_helper<persistence>) {
          persistence = config.createInstance("test_device", '{"raw": "1 year"}');
          assert(persistence);
          const dates = [
            new Date(2024, 0, 1, 10, 30, 0, 0), // 1st Jan 2024, 10:30:00.000
            new Date(2024, 0, 2, 10, 40, 0, 0), // 2nd Jan 2024, 10:40:00.000
            new Date(2024, 0, 3, 10, 40, 0, 0), // 3rd Jan 2024, 10:40:00.000
            new Date(2024, 0, 4, 10, 40, 0, 0), // 4 Jan 2024, 10:40:00.000
            new Date(2024, 0, 5, 10, 40, 0, 0), // 5 Jan 2024, 10:40:00.000
            new Date(2024, 0, 10, 10, 40, 0, 0), // 10 Jan 2024, 10:40:00.000
            new Date(2024, 0, 20, 10, 40, 0, 0), // 10 Jan 2024, 10:40:00.000
          ];
          for (let date of dates) {
            const doc = await persistence.insert({
              date: date,
              state: "on"
            });
          }
        }

        it('should get history precisely in range', async function () {

          await prepareHistoryForParamTests(config);
          assert(persistence);
          const results = await persistence.getHistory("raw", new Date(2024, 0, 2, 10, 40, 0, 0), new Date(2024, 0, 10, 10, 40, 0, 0));
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 5);
        });

        it('should get history including to', async function () {

          await prepareHistoryForParamTests(config);
          assert(persistence);
          const results = await persistence.getHistory("raw", new Date(2024, 0, 2, 10, 40, 0, 1), new Date(2024, 0, 10, 10, 40, 0, 0));
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 4);
        });

        it('should get history including from', async function () {

          await prepareHistoryForParamTests(config);
          assert(persistence);
          const results = await persistence.getHistory("raw", new Date(2024, 0, 1, 10, 30, 0, 0), new Date(2024, 0, 20, 10, 40, 0, -1));
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 6);
        });

        it('should get history with from null', async function () {

          await prepareHistoryForParamTests(config);
          assert(persistence);
          const results = await persistence.getHistory("raw", null, new Date(2024, 0, 7, 10, 40, 0, 0));
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 5);
        });

        it('should get history with to null', async function () {

          await prepareHistoryForParamTests(config);
          assert(persistence);
          const results = await persistence.getHistory("raw", new Date(2024, 0, 7, 10, 40, 0, 0), null);
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 2);
        });

        it('should get history with from and to null', async function () {

          await prepareHistoryForParamTests(config);
          assert(persistence);
          const results = await persistence.getHistory("raw", null, null);
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 7);

        });

        let skip = false;
        for (let dataSet of [
          {
            type: 'year', results: [
              {
                date: new Date(2024, 0, 1),
                value: (10 + 15 + 15 + 15) / 4 // average of values in 2024
              },
              {
                date: new Date(2025, 0, 1),
                value: (20 + 20 + 20 + 25) / 4 // average of values in 2025
              }
            ]
          },
          {
            type: 'month', results: [
              { date: new Date(2024, 9, 1), value: 10 },   // 1st Oct 2024
              { date: new Date(2024, 10, 1), value: (15 + 15 + 15) / 3 },  // 1st Nov 2024
              { date: new Date(2025, 0, 1), value: (20 + 20 + 20 + 25) / 4 },    // 1st Jan 2025
            ]
          },
          {
            type: 'week', results: [
              { date: new Date(2024, 8, 30), value: 10 },             // 30 Sep 2024 (week of 30 Sep to 6 Oct)
              { date: new Date(2024, 9, 28), value: (15 + 15) / 2 },  // 28 Oct 2024 (week of 28 Oct to 3 Nov)
              { date: new Date(2024, 10, 4), value: 15 },             // 4 Nov 2024 (week of 4 Nov to 10 Nov)
              { date: new Date(2024, 11, 30), value: (20 + 20) / 2 }, // 30 Dec 2024 (week of 30 Dec to 5 Jan)
              { date: new Date(2025, 0, 27), value: 25 },             // 27 Jan 2025 (week of 27 Jan to 2 Feb)
            ]
          },
          {
            type: 'day', results: [
              { date: new Date(2024, 9, 3), value: 10 },   // 3 Oct 2024
              { date: new Date(2024, 10, 2), value: 15 },  // 2 Nov 2024
              { date: new Date(2024, 10, 3), value: 15 },  // 3 Nov 2024
              { date: new Date(2024, 10, 4), value: 15 },  // 4 Nov 2024
              { date: new Date(2025, 0, 3), value: 20 },    // 3 Jan 2025
              { date: new Date(2025, 0, 4), value: 20 },    // 4 Jan 2025
              { date: new Date(2025, 0, 5), value: 20 },    // 5 Jan 2025
              { date: new Date(2025, 0, 30), value: 25 },  // 30 Jan 2025
            ]
          },
          {
            type: 'hour', results: [
              { date: new Date(2024, 9, 3, 10), value: 10 },   // 3 Oct 2024, 10:00
              { date: new Date(2024, 10, 2, 20), value: 15 },  // 2 Nov 2024, 20:00
              { date: new Date(2024, 10, 3, 20), value: 15 },  // 2 Nov 2024, 20:00
              { date: new Date(2024, 10, 4, 20), value: 15 },  // 2 Nov 2024, 20:00
              { date: new Date(2025, 0, 3, 2), value: 20 },    // 3 Jan 2025, 02:00
              { date: new Date(2025, 0, 4, 2), value: 20 },    // 3 Jan 2025, 02:00
              { date: new Date(2025, 0, 5, 2), value: 20 },    // 3 Jan 2025, 02:00
              { date: new Date(2025, 0, 30, 10), value: 25 },  // 30 Jan 2025, 10:00

            ]
          },
          {
            type: 'minute', results: [
              { date: new Date(2024, 9, 3, 10, 30), value: 10 },   // 3 Oct 2024, 10:30
              { date: new Date(2024, 10, 2, 20, 40), value: 15 },  // 2 Nov 2024, 20:40
              { date: new Date(2024, 10, 3, 20, 40), value: 15 },  // 2 Nov 2024, 20:40
              { date: new Date(2024, 10, 4, 20, 40), value: 15 },  // 2 Nov 2024, 20:40
              { date: new Date(2025, 0, 3, 2, 25), value: 20 },    // 3 Jan 2025, 02:25
              { date: new Date(2025, 0, 4, 2, 25), value: 20 },    // 3 Jan 2025, 02:25
              { date: new Date(2025, 0, 5, 2, 25), value: 20 },    // 3 Jan 2025, 02:25
              { date: new Date(2025, 0, 30, 10, 30), value: 25 },  // 30 Jan 2025, 10:30
            ]
          },
          {
            type: 'change', results: [
              {
                date: new Date(2024, 9, 3, 10, 30, 35, 125),
                value: 10
              },   // 3 Oct 2024, 10:30:35.125
              {
                date: new Date(2024, 10, 2, 20, 40, 35, 125),
                value: 15
              },  // 2 Nov 2024, 20:40:35.125
              {
                date: new Date(2025, 0, 3, 2, 25, 35, 125),
                value: 20
              },    // 3 Jan 2025, 02:25:35.125
              {
                date: new Date(2025, 0, 30, 10, 30, 35, 125),
                value: 25
              },  // 30 Jan 2025, 10:30:35.125
            ]
          }] as const) {
          it('should get history aggregated by ' + dataSet.type, async function () {
            //if (dataSet.type !== 'change') this.skip(); // skip after this aggregation type
            //if (skip) this.skip();

            persistence = config.createInstance("test_device", `{
                "raw": "1 year",
                "change": "500 days",
                "year": "500 days",
                "month": "500 days",
                "week": "500 days",
                "day": "500 days",
                "hour": "500 days",
                "minute": "500 days"
                }`);
            assert(persistence);

            const datevalues = [
              { date: new Date(2024, 9, 3, 10, 30, 35, 125), value: 10 },   // 3 Oct 2024, 10:30:35.125
              { date: new Date(2024, 10, 2, 20, 40, 35, 125), value: 15 },  // 2 Nov 2024, 20:40:35.125
              { date: new Date(2024, 10, 3, 20, 40, 35, 125), value: 15 },  // 3 Nov 2024, 20:40:35.125
              { date: new Date(2024, 10, 4, 20, 40, 35, 125), value: 15 },  // 4 Nov 2024, 20:40:35.125
              { date: new Date(2025, 0, 3, 2, 25, 35, 125), value: 20 },    // 3 Jan 2025, 02:25:35.125
              { date: new Date(2025, 0, 4, 2, 25, 35, 125), value: 20 },    // 4 Jan 2025, 02:25:35.125
              { date: new Date(2025, 0, 5, 2, 25, 35, 125), value: 20 },    // 5 Jan 2025, 02:25:35.125
              { date: new Date(2025, 0, 30, 10, 30, 35, 125), value: 25 },  // 30 Jan 2025, 10:30:35.125
            ];
            for (let date of datevalues) {
              const doc = await persistence.insert({
                date: date.date,
                state: date.value
              });
            }

            const results = await persistence.getHistory(dataSet.type as "change", null, null);
            assert(results);
            assert(Array.isArray(results));
            assert.deepEqual(results, dataSet.results, `Results do not match expected aggregated by "${dataSet.type}" results:\n`
              + `All dates/values:${JSON.stringify(datevalues, null, 2)}\n`);
          });
        }

      });

      describe('#backup/restore', function () {
        it('should backup state and restore', async function () {
          persistence = config.createInstance("test_device", '{"raw": "1 year"}');
          assert(persistence);
          await persistence.backupStateToDB("on");

          const result = await persistence.restoreStateFromDB();
          assert.equal(result.state, "on");
        });
      });

      describe('#cleanOldData', function () {
        it('should clean old data', async function () {
          persistence = config.createInstance("test_device", '{"raw": "1 year"}');
          assert(persistence);

          const now = new Date();

          const dates = [
            now, // now
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 200), // 200 days ago
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400), // 400 days ago
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 600), // 600 days ago
          ].sort((a, b) => a.getTime() - b.getTime());
          for (let date of dates) {
            const doc = await persistence.insert({
              date: date,
              state: 10
            });
          }

          const resultsBeforeCleanup = await persistence.getHistory("raw", null, null);
          assert(resultsBeforeCleanup);
          assert(Array.isArray(resultsBeforeCleanup));
          assert.equal(resultsBeforeCleanup.length, 4, `Number of records before cleanup is not correct:\n`
            + `All dates:${JSON.stringify(dates, null, 2)}\n`
            + `Results before cleanup: ${JSON.stringify(resultsBeforeCleanup, null, 2)}`); // all 4 records should be present


          // clean old data - should remove the 400 and 600 days old records
          //console.log("gethistory before cleanolddata", await persistence.getHistory("none", new Date(now.getTime() - 1000 * 60 * 60 * 24 * 700), now));
          await persistence.cleanOldData();

          const results = await persistence.getHistory("raw", null, null);
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 2, `Number of results is not correct:\n`
            + `All dates:${JSON.stringify(dates, null, 2)}\n`
            + `Records before cleanolddata:${JSON.stringify(resultsBeforeCleanup, null, 2)}\n`
            + `Results: ${JSON.stringify(results, null, 2)}`); // only 2 records should remain 
        });

        it('should clean old data data sets', async function () {
          persistence = config.createInstance("test_device", `{
                "raw": "1 year",
                "change": "500 days",
                "year": "500 days",
                "month": "500 days",
                "week": "500 days",
                "day": "500 days",
                "hour": "500 days",
                "minute": "500 days"
                }`);
          assert(persistence);

          const now = new Date();

          const dates = [
            now, // now
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 200), // 200 days ago
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400), // 400 days ago
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 600), // 600 days ago
          ].sort((a, b) => a.getTime() - b.getTime());
          for (let date of dates) {
            const doc = await persistence.insert({
              date: date,
              state: 10
            });
          }

          // clean old data - should remove the 400 and 600 days old records
          await persistence.cleanOldData();

          const results = await persistence.getHistory("raw", null, null);
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 2); // only 2 records should remain 
        });

        for (let dataSet of [
          { type: 'year', nb: 1 },
          { type: 'month', nb: 3 },
          { type: 'week', nb: 3 },
          { type: 'day', nb: 3 },
          { type: 'hour', nb: 3 },
          { type: 'minute', nb: 3 },
          { type: 'change', nb: 0 }] as const) {
          it('should clean old data data set ' + dataSet.type, async function () {
            if (dataSet.type === null) this.skip();

            persistence = config.createInstance("test_device", `{
                "raw": "1 year",
                "change": "500 days",
                "year": "500 days",
                "month": "500 days",
                "week": "500 days",
                "day": "500 days",
                "hour": "500 days",
                "minute": "500 days"
                }`);
            assert(persistence);

            const now = new Date();

            const dates = [
              now, // now
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 200), // 200 days ago
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400), // 400 days ago
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 600), // 600 days ago
            ].sort((a, b) => a.getTime() - b.getTime());
            for (let date of dates) {
              const doc = await persistence.insert({
                date: date,
                state: 10
              });
            }

            // clean old data
            //console.log("gethistory before cleanolddata", await persistence.getHistory(dataSet.type, new Date(now.getTime() - 1000 * 60 * 60 * 24 * 700), new Date(now.getTime() + 1));
            await persistence.cleanOldData();

            const results = await persistence.getHistory(dataSet.type, null, null);
            assert(results);
            //console.log("gethistory after cleanolddata", results);
            assert(Array.isArray(results));
            assert.equal(results.length, dataSet.nb); // only the good number of records should remain 
          });
        }

        for (let dataSet of [
          { type: 'year', nb: 1 },
          { type: 'month', nb: 3 },
          { type: 'week', nb: 2 },
          { type: 'day', nb: 1 },
          { type: 'hour', nb: 1 },
          { type: 'minute', nb: 1 },
          { type: 'change', nb: 0 }] as const) {
          it('should clean old data aggregated by ' + dataSet.type + " with keep as a JSON string", async function () {
            if (dataSet.type === null) this.skip();

            persistence = config.createInstance("test_device", `{
              "raw": "1 year", 
              "year": "500 days",
              "month": "500 days",
              "week": "300 days",
              "day": "200 days",
              "hour": "200 days",
              "minute": "200 days",
              "change": "600 days"
            }`);
            assert(persistence);

            const now = new Date();

            const dates = [
              now, // now
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 200), // 200 days ago
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400), // 400 days ago
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 600), // 600 days ago
            ].sort((a, b) => a.getTime() - b.getTime());
            for (let date of dates) {
              const doc = await persistence.insert({
                date: date,
                state: 10
              });
            }

            // clean old data
            //console.log("gethistory before cleanolddata", await persistence.getHistory(dataSet.type, new Date(now.getTime() - 1000 * 60 * 60 * 24 * 700), new Date(now.getTime() + 1));
            await persistence.cleanOldData();

            const results = await persistence.getHistory(dataSet.type, null, null);
            assert(results);
            //console.log("gethistory after cleanolddata", results);
            assert(Array.isArray(results));
            assert.equal(results.length, dataSet.nb); // only the good number of records should remain 
          });
        }

        it("should not clean old data if keep string is invalid", async () => {
          persistence = config.createInstance("test_device", `{
              "raw": "1 year", 
              "year": "500 days",
              "month": "500 days",
              "week": "200 days",
              "day": "200 days",
              "hour": "200 days",
              "minute": "200 days",
              "change": "600 days"
            }`);
          assert(persistence);

          const now = new Date();

          const dates = [
            now, // now
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 200), // 200 days ago
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400), // 400 days ago
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 600), // 600 days ago
          ].sort((a, b) => a.getTime() - b.getTime());
          for (let date of dates) {
            const doc = await persistence.insert({
              date: date,
              state: 10
            });
          }

          const resultsMinutes = await persistence.getHistory("minute", null, null);
          assert(resultsMinutes);
          //console.log("gethistory after cleanolddata", results);
          assert(Array.isArray(resultsMinutes));
          assert.equal(resultsMinutes.length, 4); // only the good number of records should remain 

          const resultsWeeks = await persistence.getHistory("week", null, null);
          assert(resultsWeeks);
          //console.log("gethistory after cleanolddata", results);
          assert(Array.isArray(resultsWeeks));
          assert.equal(resultsWeeks.length, 4); // only the good number of records should remain 

          // modify the keep specification for weeks
          persistence.keep['week'] = undefined as any;

          // clean old data
          //console.log("gethistory before cleanolddata", await persistence.getHistory(dataSet.type, new Date(now.getTime() - 1000 * 60 * 60 * 24 * 700), new Date(now.getTime() + 1));
          await persistence.cleanOldData();


          const resultsMinutes2 = await persistence.getHistory("minute", null, null);
          assert(resultsMinutes2);
          //console.log("gethistory after cleanolddata", results);
          assert(Array.isArray(resultsMinutes2));
          assert.equal(resultsMinutes2.length, 1); // only the good number of records should remain 

          const resultsWeeks2 = await persistence.getHistory("week", null, null);
          assert(resultsWeeks2);
          //console.log("gethistory after cleanolddata", results);
          assert(Array.isArray(resultsWeeks2));
          assert.equal(resultsWeeks2.length, 4); // only the good number of records should remain 



        });

      });

      describe("dump and load", function () {

        let persistence1: persistence | null;
        let persistence2: persistence | null;
        let persistence3: persistence | null;

        const date11 = new Date(2025, 9, 10, 10, 30, 50, 119);
        const date12 = new Date(2025, 9, 10, 11, 30, 50, 119);

        const date21 = new Date(2024, 3, 10, 10, 30, 50, 119);
        const date22 = new Date(2024, 4, 10, 12, 30, 50, 119);



        let dumpFilename: string;

        this.beforeEach(async () => {
          if (persistence1) await persistence1.release();
          persistence1 = config.createInstance("test_device1", `{
                "raw": "1 year",
                "change": "1 year"
                }`);

          if (persistence2) await persistence2.release();
          persistence2 = config.createInstance("test_device2", `{
                "raw": "1 year",
                "change": "2 years",
                "year": "2 years",
                "month": "2 years",
                "week": "2 years",
                "day": "2 years",
                "hour": "2 years",
                "minute": "2 years"
                }`);

          if (persistence3) await persistence3.release();
          persistence3 = config.createInstance("test_device3_not_persisted", '{"raw": "1 year"}'); // no inserts for this one


          dumpFilename = mkdtempSync("/tmp/persistencetests_") + "/dumpFile";
        });

        this.afterEach(async () => {
          if (persistence1) await persistence1.release();
          persistence1 = null;
          if (persistence2) await persistence2.release();
          persistence2 = null;
          if (persistence3) await persistence3.release();
          persistence3 = null;
          if (existsSync(dumpFilename)) rmSync(dumpFilename);

          const dirName = dirname(dumpFilename);

          if (existsSync(dumpFilename)) rmSync(dumpFilename);
          if (existsSync(dirName)) rmdirSync(dirName);
        });

        async function prepareDBForDump() {

          assert(persistence1);
          await persistence1.insert({ date: date11, state: "ON" });
          await persistence1.insert({ date: date12, state: "OFF" });
          await persistence1.backupStateToDB("OFF");

          assert(persistence2);
          await persistence2.insert({ date: date21, state: 10 });
          await persistence2.insert({ date: date22, state: 15 });
          await persistence2.backupStateToDB("15");

          assert(persistence3);
          await persistence3.backupStateToDB("state for not persisted device");
        }

        describe('#dumpToFile', function () {

          it('should dump data to a file', async function () {

            await prepareDBForDump();

            await config.dumpToFile(dumpFilename);

            const dump = readFileSync(dumpFilename, { encoding: 'utf-8' });
            //console.log("Dump file content:\n", dump);

            // remove from the diff the dates of Backup states because they are live dates
            const dumpObject = JSON.parse(dump);
            dumpObject["Backup states"].forEach((o: any) => { o.date = "XXX" });

            assert.equal(JSON.stringify(dumpObject, null, 2), `{
  "Backup states": [
    {
      "id": "test_device1",
      "state": "OFF",
      "date": "XXX"
    },
    {
      "id": "test_device2",
      "state": "15",
      "date": "XXX"
    },
    {
      "id": "test_device3_not_persisted",
      "state": "state for not persisted device",
      "date": "XXX"
    }
  ],
  "test_device1": {
    "change": [
      {
        "date": "2025-10-10T08:30:50.119Z",
        "state": "ON"
      },
      {
        "date": "2025-10-10T09:30:50.119Z",
        "state": "OFF"
      }
    ],
    "raw": [
      {
        "date": "2025-10-10T08:30:50.119Z",
        "state": "ON"
      },
      {
        "date": "2025-10-10T09:30:50.119Z",
        "state": "OFF"
      }
    ]
  },
  "test_device2": {
    "year": [
      {
        "date": "2023-12-31T23:00:00.000Z",
        "sum": 25,
        "count": 2
      }
    ],
    "month": [
      {
        "date": "2024-03-31T22:00:00.000Z",
        "sum": 10,
        "count": 1
      },
      {
        "date": "2024-04-30T22:00:00.000Z",
        "sum": 15,
        "count": 1
      }
    ],
    "week": [
      {
        "date": "2024-04-07T22:00:00.000Z",
        "sum": 10,
        "count": 1
      },
      {
        "date": "2024-05-05T22:00:00.000Z",
        "sum": 15,
        "count": 1
      }
    ],
    "day": [
      {
        "date": "2024-04-09T22:00:00.000Z",
        "sum": 10,
        "count": 1
      },
      {
        "date": "2024-05-09T22:00:00.000Z",
        "sum": 15,
        "count": 1
      }
    ],
    "hour": [
      {
        "date": "2024-04-10T08:00:00.000Z",
        "sum": 10,
        "count": 1
      },
      {
        "date": "2024-05-10T10:00:00.000Z",
        "sum": 15,
        "count": 1
      }
    ],
    "minute": [
      {
        "date": "2024-04-10T08:30:00.000Z",
        "sum": 10,
        "count": 1
      },
      {
        "date": "2024-05-10T10:30:00.000Z",
        "sum": 15,
        "count": 1
      }
    ],
    "change": [
      {
        "date": "2024-04-10T08:30:50.119Z",
        "state": 10
      },
      {
        "date": "2024-05-10T10:30:50.119Z",
        "state": 15
      }
    ],
    "raw": [
      {
        "date": "2024-04-10T08:30:50.119Z",
        "state": 10
      },
      {
        "date": "2024-05-10T10:30:50.119Z",
        "state": 15
      }
    ]
  }
}`);

          });

          describe('#loadFromFile', function () {
            it('should load data from a file', async function () {

              await prepareDBForDump();

              await config.dumpToFile(dumpFilename);
              await config.dropDatabase();
              await config.loadFromFile(dumpFilename);

            });

            it('should restore data as it was', async function () {

              await prepareDBForDump();

              await config.dumpToFile(dumpFilename);
              const dump = readFileSync(dumpFilename, { encoding: 'utf-8' });

              await config.dropDatabase();
              await config.loadFromFile(dumpFilename);
              await config.dumpToFile(dumpFilename);
              const dump2 = readFileSync(dumpFilename, { encoding: 'utf-8' });

              // dump and dump2 should be equal
              assert.equal(dump, dump2);


            });

            it('should restore data and history', async function () {

              await prepareDBForDump();

              await config.dumpToFile(dumpFilename);

              //console.log("dump file:", readFileSync(dumpFilename, { encoding: 'utf-8' }));

              assert(persistence1);
              assert(persistence2);
              assert(persistence3);

              const results1 = await persistence1.getHistory("raw", null, null);
              const results2 = await persistence2.getHistory("raw", null, null);
              const results2_by_day = await persistence2.getHistory("day", null, null);
              const results2_by_month = await persistence2.getHistory("month", null, null);
              const results2_by_week = await persistence2.getHistory("week", null, null);
              const results2_by_year = await persistence2.getHistory("year", null, null);
              const results2_by_hour = await persistence2.getHistory("hour", null, null);
              const results2_by_minute = await persistence2.getHistory("minute", null, null);


              await config.dropDatabase();
              await config.loadFromFile(dumpFilename);

              assert.deepEqual(await persistence1.getHistory("raw", null, null), results1, "persistence1.getHistory('raw') does not match the original one");
              assert.deepEqual(await persistence2.getHistory("raw", null, null), results2, "persistence2.getHistory('raw') does not match the original one");
              assert.deepEqual(await persistence2.getHistory("day", null, null), results2_by_day, "persistence2.getHistory('day') does not match the original one");
              assert.deepEqual(await persistence2.getHistory("month", null, null), results2_by_month, "persistence2.getHistory('month') does not match the original one");
              assert.deepEqual(await persistence2.getHistory("week", null, null), results2_by_week, "persistence2.getHistory('week') does not match the original one");
              assert.deepEqual(await persistence2.getHistory("year", null, null), results2_by_year, "persistence2.getHistory('year') does not match the original one");
              assert.deepEqual(await persistence2.getHistory("hour", null, null), results2_by_hour, "persistence2.getHistory('hour') does not match the original one");
              assert.deepEqual(await persistence2.getHistory("minute", null, null), results2_by_minute, "persistence2.getHistory('minute') does not match the original one");

            });

            it.skip('should dump and load the existing DB', async function () {
              this.timeout(2 * 60 * 60 * 1000);
              await config.loadFromFile("dump.json"); // dump.json is a static file in the test directory
              throw new Error("Not implemented yet");
            });

          });
        });
      });


      this.afterEach(async function () {
        if (persistence) await persistence.release();
        persistence = null;
        await config.dropDatabase();
      });

    });
  }
});

