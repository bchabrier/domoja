import { sensor } from './sensor'
import { Source, ID } from '../sources/source'
import * as zibase from '../sources/zibase'
import * as async from 'async';
const logger = require("tracer").colorConsole({
  dateformat: "dd/mm/yyyy HH:MM:ss.l",
  level: 3
  // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

export class telecommande extends sensor {
  static type = "telecommande";
  id1: ID;
  id2: ID;
  if_undef: (if_undef_callback: (value: 0 | 1) => void) => void;
  constructor(zibase: zibase.Zibase, instanceFullname: string, id_1: ID, id_2: ID, if_undef: (if_undef_callback: (value: 0 | 1) => void) => void) {
    super(zibase, instanceFullname, id_1 + '_' + id_2, id_1 + '_' + id_2)
    this.id1 = id_1;
    this.id2 = id_2;
    this.if_undef = if_undef;
    logger.debug(this);
  }

  getState(next: (err: Error, value: 0 | 1) => void) {
    var zb = <zibase.Zibase>this.source;
    var self = this;
    async.auto({
      infos_id1: function (callback: any) {
        zb.getSensorInfo(self.id1, function (err: Error, infos: {date: Date, v1: string, v2: string}) {
          callback(err, infos)
        });
      },
      infos_id2: function (callback: any) {
        zb.getSensorInfo(self.id2, function (err: Error, infos: {date: Date, v1: string, v2: string}) {
          callback(err, infos)
        })
      }
    }, 2, function (err: Error, results: any) {
      if (err != null) {
        logger.debug("err found", err)
        if (self.if_undef == undefined) {
          logger.debug("with if_undef == undefined")
          next(err, null);
        } else {
          logger.debug("with if_undef defined")
          self.if_undef.call(self, function (value: 0 | 1) {
            next(null, value)
          });
          // next(null, res);
        }
      } else {
        var state: 0 | 1;
        if (results.infos_id1.date > results.infos_id2.date) {
          // id1 est plus r�cent, sa valeur pr�vaut
          state = 1;
        } else {
          state = 0;
        }
        next(null, state)
      }
    });
  }

  set(zbAction: zibase.ZbAction) {
    (<zibase.Zibase>this.source).executeRemote(this.id1 + "_" + this.id2, zbAction);
  };
}
