import { Source, ConfigLoader, GenericDevice, InitObject, Parameters } from 'domoja-core';
import * as assert from 'assert';
import * as request from 'request';

var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 2 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});


//import * as cache from "./cache");
import { CronJob } from 'cron';


// URL de la page du site EDF
var tempoURLCouleurDuJour = "https://www.api-couleur-tempo.fr/api/jourTempo/"

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

	constructor(path: string, initObject: InitObject) {
		super(path, initObject);
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
		return new tempo(path, initObject);
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

		this.getTempoForDay(todayString, "couleurDuJour", err => {
			if (err) return callback(err);
			this.getTempoForDay(todayString, "couleurDeDemain", err => {
				callback(err);
			});
		});
	}

	private getTempoForDay(date: string, couleurDuJour: "couleurDuJour" | "couleurDeDemain", callback: (err: Error) => void) {
		let self = this;

		this.request = request.get(tempoURLCouleurDuJour + date, {
			headers: {
				'Accept': 'application/json'
			}
		}, function (err, response, bodyString) {

			//returns a JSON object similar to:
			// codeJour	integer
			// Code couleur du tarif Tempo applicable: 0: tarif inconnu (pas encore communiqué par RTE) 1: tarif bleu 2: tarif blanc 3: tarif rouge
			let obj: {
				"dateJour": string,
				"codeJour": 0 | 1 | 2 | 3;
			} | {
				"type": string,
				"title": string,
				"detail": string;
			};
			let codeJour: undefined | 0 | 1 | 2 | 3 = undefined;
			try {
				obj = JSON.parse(bodyString);
				if ('codeJour' in obj) {
					if (obj.codeJour != undefined) codeJour = obj.codeJour;
				} else if (obj.title == "An error occurred" && obj.detail == "Not Found") codeJour = 0; // indeterminé
			} catch (e) {
				logger.error(e);
			}
			let now = new Date;
			self.updateAttribute('lastUpdateDate', 'state', now.toString());
			if (codeJour != undefined) {
				switch (codeJour) {
					case 1:
						self.updateAttribute(couleurDuJour, 'state', "Bleu", now);
						break;
					case 2:
						self.updateAttribute(couleurDuJour, 'state', "Blanc", now);
						break;
					case 3:
						self.updateAttribute(couleurDuJour, 'state', "Rouge", now);
						break;
					case 0:
						self.updateAttribute(couleurDuJour, 'state', "Indéterminé", now);
						break;
					default:
						self.updateAttribute(couleurDuJour, 'state', "Indéterminé", now);
						logger.error(couleurDuJour + " '" + codeJour + "' non connue.");
				}
				if (couleurDuJour === "couleurDeDemain") this.tomorrowColorUpdated = true;

				callback(null);
			} else {
				callback(new Error("No success from '" + tempoURLCouleurDuJour + date + "': response: '" + bodyString + "'."));
			}
			return;
		});
	}
}
