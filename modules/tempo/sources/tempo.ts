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

/**
 * Cette source récupère les informations de couleur de période auprès de l'EDF, pour le jour courant et le lendemain.
 * 
 * Exemple:
 * ```
 * sources:
 *   - tempo: { type: tempo }
 *  
 * devices:
 *   - tempo:
 *   - couleur_du_jour : { type: device, widget: tempo-color, tags: 'tempo', source: tempo, id: couleurDuJour, name: "Couleur du jour" }
 *   - couleur_de_demain : { type: device, widget: tempo-color, tags: 'tempo', source: tempo, id: couleurDeDemain, name: "Couleur de demain" }
 * ```
 */
export class tempo extends Source {
	jobUpdateAllColors: CronJob;
	jobUpdateTomorrowColor: CronJob;
	tomorrowColorUpdated: boolean = false;
	request: request.Request;

	constructor(path: string) {
		super(path);
		let self = this;
		this.jobUpdateAllColors = new CronJob({
			cronTime: '00 01 * * *', // Runs every day at 1:00 AM.
			onTick: function () {
				self.RetryUpdate(function () {
					logger.info("All tempo info updated from CronJob.")
				})
			},
			runOnInit: true
		});
		this.jobUpdateAllColors.start();
		this.jobUpdateTomorrowColor = new CronJob({
			cronTime: '05 * * * *', // Runs every hour + 5 mn.
			onTick: function () {
				if (!self.tomorrowColorUpdated) self.RetryUpdate(function () {
					if (self.tomorrowColorUpdated) logger.info("Tomorrow color info updated from CronJob.")
				})
			},
			runOnInit: false
		});
		this.jobUpdateTomorrowColor.start();
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
		this.jobUpdateAllColors.stop();
		this.jobUpdateAllColors = null;
		this.jobUpdateTomorrowColor.stop();
		this.jobUpdateTomorrowColor = null;
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
		this.request = request.get(tempoURLCouleurDuJour + todayString, {
			headers: {
				'User-Agent': 'Wget/1.18 (linux-gnueabihf)' // for some reason, edf is rejecting request default agent
			}
		}, function (err, response, bodyString) {

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
					case "TEMPO_BLEU":
						self.updateAttribute('couleurDuJour', 'state', "Bleu", now);
						break;
					case "TEMPO_BLANC":
						self.updateAttribute('couleurDuJour', 'state', "Blanc", now);
						break;
					case "TEMPO_ROUGE":
						self.updateAttribute('couleurDuJour', 'state', "Rouge", now);
						break;
					case "ND":
						self.updateAttribute('couleurDuJour', 'state', "Indéterminé", now);
						break;
					default:
						self.updateAttribute('couleurDuJour', 'state', "Indéterminé", now);
						logger.error("Couleur du jour '" + obj.JourJ.Tempo + "' non connue.");
				}
				self.tomorrowColorUpdated = true;
				switch (obj.JourJ1.Tempo) {
					case "TEMPO_BLEU":
						self.updateAttribute('couleurDeDemain', 'state', "Bleu", now);
						break;
					case "TEMPO_BLANC":
						self.updateAttribute('couleurDeDemain', 'state', "Blanc", now);
						break;
					case "TEMPO_ROUGE":
						self.updateAttribute('couleurDeDemain', 'state', "Rouge", now);
						break;
					case "ND":
							self.tomorrowColorUpdated = false;
							self.updateAttribute('couleurDeDemain', 'state', "Indéterminé", now);
						break;
					default:
						self.tomorrowColorUpdated = false;
						self.updateAttribute('couleurDeDemain', 'state', "Indéterminé", now);
						logger.error("Couleur de demain '" + obj.JourJ1.Tempo + "' non connue.");
				}
				callback(null);
			} else {
				callback(new Error("No success from '" + tempoURLCouleurDuJour + todayString + "': response: '" + bodyString + "'."));
			}
			return;
		});
	};
}
