/*
import rewire = require('rewire');
import * as ToMock from '../core/persistences/persistence'
let RewireToMock = rewire('../core/persistences/persistence')
const persistenceModule: typeof ToMock & typeof RewireToMock = <any>RewireToMock
type persistence = ToMock.persistence;
*/

import * as assert from 'assert';
import { persistence, Strategy } from 'domoja-core/persistence/persistence';
import { mongoDB } from 'domoja-core/persistence/mongodb';


abstract class persistence_helper<T extends persistence> {

  name: string;

  constructor(private ctor: new (deviceName: string, ttl?: number, strategy?: Strategy, keep?: string) => T) {
    this.name = ctor.name
  }

  createInstance(deviceId: string, ttl?: number, strategy?: Strategy, keep?: string): T {
    return new this.ctor(deviceId, ttl, strategy, keep);
  }

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
};


const persistenceConfigs: persistence_helper<persistence>[] = [
  new mongoDB_helper(),
];

/*
 * id:TTL:raw|aggregate:KEEP    
 * TTL: 0=default, 1h
 * KEEP: raw duration (default: 1 year), aggregation duration (default: 5 years)
 * 
 * mongo:temperature_piscine:0:aggregate:3 months, 5 years
 * mongo:piscine_ON_OFF:0:raw
 * mongo:hosts_connected_semeria:0:raw:5 years
 * mongo:sunset:1200:raw
 * mongo:sensors-state:0:raw:1 month
 */

describe('Module persistence', function () {
  this.timeout(10000);

  for (let config of persistenceConfigs) {
    describe('class ' + config.name, function () {

      let persistence: persistence;

      this.beforeEach(async function () {
        await config.dropDatabase();
      });

      describe('#insert', function () {
        it('should insert a new record', async function () {
          persistence = config.createInstance("test_device");
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
          persistence = config.createInstance("test_device");
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

          const results = await persistence.getHistory("none", null, null);
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 2);
          assert.equal(results[0].value, "on");
          assert.equal((results[0].date as Date).getTime(), date1.getTime());
          assert.equal(results[1].value, "off");
          assert.equal((results[1].date as Date).getTime(), date2.getTime());
        });

        it('should get history precisely in range', async function () {
          persistence = config.createInstance("test_device");
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

          const results = await persistence.getHistory("none", new Date(2024, 0, 2, 10, 40, 0, 0), new Date(2024, 0, 3));
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 1);

          const results2 = await persistence.getHistory("none", new Date(2024, 0, 2, 10, 40, 0, 1), new Date(2024, 0, 3));
          assert(results2);
          assert(Array.isArray(results2));
          assert.equal(results2.length, 0);
        });

        let skip = false;
        for (let aggregate of [
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
                date: new Date(2024, 10, 4, 20, 40, 35, 125),
                value: 15
              },  // 4 Nov 2024, 20:40:35.125
              {
                date: new Date(2025, 0, 3, 2, 25, 35, 125),
                value: 20
              },    // 3 Jan 2025, 02:25:35.125
              {
                date: new Date(2025, 0, 5, 2, 25, 35, 125),
                value: 20
              },    // 5 Jan 2025, 02:25:35.125
              {
                date: new Date(2025, 0, 30, 10, 30, 35, 125),
                value: 25
              },  // 30 Jan 2025, 10:30:35.125
            ]
          }] as const) {
          it('should get history aggregated by ' + aggregate.type, async function () {
            if (skip) this.skip();
            //if (aggregate.type === 'minute') skip = true; // skip after this aggregation type

            persistence = config.createInstance("test_device", 0, 'aggregate', '1 year, 500 days');
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

            const results = await persistence.getHistory(aggregate.type, null, null);
            assert(results);
            assert(Array.isArray(results));
            //console.log("Results for aggregate type", aggregate.type, ":");
            //console.log(results, aggregate.results);
            assert.deepEqual(results, aggregate.results, "Results do not match expected aggregated results:"
              + `All dates/values:${JSON.stringify(datevalues, null, 2)}\n`
              + `Results: ${JSON.stringify(results, null, 2)}\n`
              + `Expected: ${JSON.stringify(aggregate.results, null, 2)}`);
          });
        }

      });

      describe('#backup', function () {
        it('should backup state and restore', async function () {
          persistence = config.createInstance("test_device");
          assert(persistence);
          await persistence.backupStateToDB("on");

          const result = await persistence.restoreStateFromDB();
          assert.equal(result.state, "on");
        });
      });

      describe('#cleanOldData', function () {
        for (let strategy of ['raw', 'aggregate'] as Strategy[]) {
          it('should clean old data with strategy ' + strategy, async function () {
            persistence = config.createInstance("test_device", 0, strategy, '1 year');
            assert(persistence);

            const now = new Date();

            const dates = [
              now, // now
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 200), // 200 days ago
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400), // 400 days ago
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 600), // 600 days ago
            ];
            for (let date of dates) {
              const doc = await persistence.insert({
                date: date,
                state: 10
              });
            }

            const resultsBeforeCleanup = await persistence.getHistory("none", null, null);
            assert(resultsBeforeCleanup);
            assert(Array.isArray(resultsBeforeCleanup));
            assert.equal(resultsBeforeCleanup.length, 4, `Number of records before cleanup is not correct:\n`
              + `All dates:${JSON.stringify(dates, null, 2)}\n`
              + `Results before cleanup: ${JSON.stringify(resultsBeforeCleanup, null, 2)}`); // all 4 records should be present


            // clean old data - should remove the 400 and 600 days old records
            //console.log("gethistory before cleanolddata", await persistence.getHistory("none", new Date(now.getTime() - 1000 * 60 * 60 * 24 * 700), now));
            await persistence.cleanOldData();

            const results = await persistence.getHistory("none", null, null);
            assert(results);
            assert(Array.isArray(results));
            assert.equal(results.length, 2, `Number of results is not correct:\n`
              + `All dates:${JSON.stringify(dates, null, 2)}\n`
              + `Records before cleanolddata:${JSON.stringify(resultsBeforeCleanup, null, 2)}\n`
              + `Results: ${JSON.stringify(results, null, 2)}`); // only 2 records should remain 
          });
        }

        it('should clean old data aggregated', async function () {
          persistence = config.createInstance("test_device", 0, 'aggregate', '1 year, 2 years');
          assert(persistence);

          const now = new Date();

          const dates = [
            now, // now
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 200), // 200 days ago
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400), // 400 days ago
            new Date(now.getTime() - 1000 * 60 * 60 * 24 * 600), // 600 days ago
          ];
          for (let date of dates) {
            const doc = await persistence.insert({
              date: date,
              state: 10
            });
          }

          // clean old data - should remove the 400 and 600 days old records
          await persistence.cleanOldData();

          const results = await persistence.getHistory("none", null, null);
          assert(results);
          assert(Array.isArray(results));
          assert.equal(results.length, 2); // only 2 records should remain 
        });

        for (let aggregate of [
          { type: 'year', nb: 1 },
          { type: 'month', nb: 3 },
          { type: 'week', nb: 3 },
          { type: 'day', nb: 3 },
          { type: 'hour', nb: 3 },
          { type: 'minute', nb: 3 },
          { type: 'change', nb: 2 }] as const) {
          it('should clean old data aggregated by ' + aggregate.type, async function () {
            if (aggregate.type === null) this.skip();

            persistence = config.createInstance("test_device", 0, 'aggregate', '1 year, 500 days');
            assert(persistence);

            const now = new Date();

            const dates = [
              now, // now
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 200), // 200 days ago
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400), // 400 days ago
              new Date(now.getTime() - 1000 * 60 * 60 * 24 * 600), // 600 days ago
            ];
            for (let date of dates) {
              const doc = await persistence.insert({
                date: date,
                state: 10
              });
            }

            // clean old data
            //console.log("gethistory before cleanolddata", await persistence.getHistory(aggregate.type, new Date(now.getTime() - 1000 * 60 * 60 * 24 * 700), new Date(now.getTime() + 1));
            await persistence.cleanOldData();

            const results = await persistence.getHistory(aggregate.type, null, null);
            assert(results);
            //console.log("gethistory after cleanolddata", results);
            assert(Array.isArray(results));
            assert.equal(results.length, aggregate.nb); // only the good number of records should remain 
          });
        }
      });

      this.afterEach(async function () {
        assert(persistence);
        await persistence.release();
        await config.dropDatabase();
      });

    });
  }
});

