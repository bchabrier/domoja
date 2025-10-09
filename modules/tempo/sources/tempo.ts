import { Source, ConfigLoader, InitObject, Parameters } from 'domoja-core';

//import * as cache from "./cache");
import { Cron } from 'croner';


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
	jobUpdateAllColors: Cron;
	jobUpdateTomorrowColor: Cron;
	tomorrowColorUpdated: boolean = false;
	request: request.Request;
	retryTimeout: NodeJS.Timeout;

	constructor(path: string, initObject: InitObject) {
		super(path, initObject);
		let self = this;
		this.jobUpdateAllColors = new Cron('00 01 * * *', // Runs every day at 1:00 AM.
			{
				unref: true
			},
			function () {
				self.RetryUpdate(function () {
					self.logger.info("All tempo info updated from CronJob.")
				})
			}
		);
		this.jobUpdateAllColors.trigger();
		this.jobUpdateTomorrowColor = new Cron('05 * * * *', // Runs every hour + 5 mn.
			{
				unref: true
			},
			function () {
				if (!self.tomorrowColorUpdated) self.RetryUpdate(function () {
					if (self.tomorrowColorUpdated) self.logger.info("Tomorrow color info updated from CronJob.")
				})
			},
		);
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
		if (this.retryTimeout) clearTimeout(this.retryTimeout);
		this.retryTimeout = null;
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
				self.logger.warn(err);
				var delay = 10;
				self.logger.warn("Retrying in", delay, "mn");
				self.retryTimeout = setTimeout(function () {
					self.RetryUpdate(f);
				}, delay * 60 * 1000).unref();
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
				self.logger.error(e);
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
						self.logger.error(couleurDuJour + " '" + codeJour + "' non connue.");
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
