import { Source, ConfigLoader, GenericDevice, InitObject, Parameters } from 'domoja-core';
import * as assert from 'assert';
import * as request from 'request';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});


//import * as cache from "./cache");
import { CronJob } from 'cron';


// URL de la page du site EDF
var tempoURLCouleurDuJour = "https://particulier.edf.fr/bin/edf_rc/servlets/ejptemponew?TypeAlerte=TEMPO&Date_a_remonter="

// numéros des scénarios Zibase définissant les couleurs
var Tempo_Bleu = 24;
var Tempo_Blanc = 25;
var Tempo_Rouge = 26;
var Tempo_Demain_Bleu = 27;
var Tempo_Demain_Blanc = 28;
var Tempo_Demain_Rouge = 29;
var Tempo_Demain_Indetermine = 30;

function format(d: Date): string {
	return d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
}


export class tempo extends Source {
	job: any;
	request: request.Request;

	constructor(path: string) {
		super(path);
		let self = this;
		this.job = new CronJob({
			cronTime: '00 01 * * *', // Runs every day at 1:00 AM.
			onTick: function () {
				self.RetryUpdate(function () {
					logger.info("All tempo info updated from CronJob.")
				})
			},
			runOnInit: true
		});
		this.job.start();
	}

	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		return new tempo(path);
	}

	getParameters(): Parameters {
		return {};
	}

	doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
		return callback(new Error('Device "' + id + '" does not support attribute/value "' + attribute + '/' + value + '"'));
	}

	release(): void {
		this.job.stop();
		this.job = null;
		this.request.abort();
		super.release();
	}

	static registerDeviceTypes(): void {
		Source.registerDeviceType(this, 'device', {
			source: 'REQUIRED',
			id: 'REQUIRED'
		});
	}


	RetryUpdate(f: Function) {
		let self = this;
		this.Update(function (err) {
			if (err == null) {
				f();
			} else {
				logger.warn(err);
				var delay = 10;
				logger.warn("Retrying in", delay, "mn");
				setTimeout(function () {
					self.RetryUpdate(f);
				}, delay * 60 * 1000);
			}
		});
	}

	Update(callback: (err: Error) => void) {


		let today = new Date();
		let todayString = format(today);
		let self = this;
		this.request = request.get(tempoURLCouleurDuJour + todayString, function (err, response, bodyString) {

			//returns a JSON object similar to:
			// {"JourJ":{"Tempo":"BLEU"},"JourJ1":{"Tempo":"ND"}}
			let obj: any;
			try {
				obj = JSON.parse(bodyString);
				if (obj.JourJ.Tempo != undefined)
					obj.success = 1;
				else
					obj.success = 0;
			} catch (e) {
				logger.error(e);
				obj = { success: 0 };
			}
			let now = new Date;
			self.updateAttribute('lastUpdateDate', 'state', now.toString());
			if (obj.success == 1) {
				switch (obj.JourJ.Tempo) {
					case "BLEU":
						self.updateAttribute('couleurDuJour', 'state', "Bleu", now);
						break;
					case "BLANC":
						self.updateAttribute('couleurDuJour', 'state', "Blanc", now);
						break;
					case "ROUGE":
						self.updateAttribute('couleurDuJour', 'state', "Rouge", now);
						break;
					case "ND":
						self.updateAttribute('couleurDuJour', 'state', "Indéterminé", now);
						break;
					default:
						self.updateAttribute('couleurDuJour', 'state', "Indéterminé", now);
						logger.error("Couleur du jour '" + obj.JourJ.Tempo + "' non connue.");
				}
				switch (obj.JourJ1.Tempo) {
					case "BLEU":
						self.updateAttribute('couleurDeDemain', 'state', "Bleu", now);
						break;
					case "BLANC":
						self.updateAttribute('couleurDeDemain', 'state', "Blanc", now);
						break;
					case "ROUGE":
						self.updateAttribute('couleurDeDemain', 'state', "Rouge", now);
						break;
					case "ND":
						self.updateAttribute('couleurDeDemain', 'state', "Indéterminé", now);
						break;
					default:
						self.updateAttribute('couleurDeDemain', 'state', "Indéterminé", now);
						logger.error("Couleur de demain '" + obj.JourJ1.Tempo + "' non connue.");
				}
				callback(null);
			} else {
				callback(new Error("No success from '" + tempoURLCouleurDuJour + "': response: '" + bodyString + "'."));
			}
			return;
		});
	};
}
