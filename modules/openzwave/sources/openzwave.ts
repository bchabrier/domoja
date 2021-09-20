import { Source, message, ConfigLoader, InitObject, Parameters, GenericDevice } from 'domoja-core';
import { Driver, ValueID, ZWaveNode, ValueMetadata } from "zwave-js";
import { createLogMessagePrinter, CommandClasses, allCCs, TranslatedValueID } from "@zwave-js/core";
import * as winston from "winston";
import * as chokidar from 'chokidar';
import * as assert from 'assert'


var logger = require("tracer").colorConsole({
	dateformat: "dd/mm/yyyy HH:MM:ss.l",
	level: 3 //0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});



export class Openzwave extends Source {
	driver: Driver;
	nodes = new Map<string, ZWaveNode>();
	watcher: chokidar.FSWatcher;
	config: {
		nodes: Object[];
	} = { nodes: [] };
	neighbors: { [id: number]: readonly number[] } = {};

	constructor(path: string, driverPort: string, driverLogLevel: string, callback?: (err: Error) => void) {
		super(path);

		this.watcher = chokidar.watch(driverPort, {
			ignoreInitial: true,
			awaitWriteFinish: true,
			ignorePermissionErrors: true
		});


		let attempt = 0;

		let watchTimeout: NodeJS.Timer;
		this.watcher.on('add', (event, path) => {
			this.debugModeLogger.warn(`Device inserted on port ${driverPort}, initializing OpenZWave driver...`);
			attempt = 0;

			if (watchTimeout) {
				clearTimeout(watchTimeout);
			}
			watchTimeout = setTimeout(() => {
				watchTimeout = null;
				startDriver();
			}, 2000);
		});

		const maxAttempts = 3;
		const sleepTime = 15000; //ms
		const startDriver = () => {

			//			const myFormat = winston.format.printf(({ level, message, label, primaryTags, secondaryTags, direction, timestamp }) => {
			//				return `${timestamp} ${level}:\t${label} ${primaryTags||""} ${direction} ${message} ${secondaryTags||""}`;
			//			  });
			const myFormat = winston.format.printf(({ level, message, label, primaryTags, secondaryTags, direction, timestamp }) => {
				return `${timestamp} ${level}:\t${label} ${primaryTags || ""} ${direction} ${message} ${secondaryTags || ""}`;
			});

			let level = !this.debugMode || driverLogLevel === undefined ? "error" : driverLogLevel;

			// Tell the driver which serial port to use
			this.driver = new Driver(driverPort, {
				logConfig: {
					enabled: true,
					level: level,
					//forceConsole: true,
					transports: [
						new winston.transports.Console({
							level: level,
							format: winston.format.combine(
								//myFormat,
								//winston.format.simple(),
								createLogMessagePrinter(false),
							)
						})
					]
				}
			});
			// You must add a handler for the error event before starting the driver
			this.driver.on("error", (e) => {
				// Do something with it
				this.logger.error(`error with port "${driverPort}":`, e);
			});
			// Listen for the driver ready event before doing anything with the driver
			this.driver.once("driver ready", () => {

				this.logger.info(`driver is ready.`);
				attempt = 0;

				/*
				Now the controller interview is complete. This means we know which nodes
				are included in the network, but they might not be ready yet.
				The node interview will continue in the background.
				*/

				const nbNodes = this.driver.controller.nodes.size;
				this.debugModeLogger.info(`${nbNodes} known node${nbNodes > 1 ? "s" : ""} included...`);

				let i = 0;
				this.driver.controller.nodes.forEach((node) => {
					this.debugModeLogger.info(`handling node...`, node);

					this.nodes.set(node.id.toString(), node);

					// e.g. add event handlers to all known nodes
					node.once("ready", async () => {
						i++;
						this.debugModeLogger.info(`node ${node.id} is ready (${i}/${nbNodes})...`, require('util').inspect(node));
						this.debugModeLogger.warn(`id=${node.id}`);
						this.debugModeLogger.warn(`nodeId=${node.nodeId}`);
						this.debugModeLogger.warn(`label=${node.label}`);
						this.debugModeLogger.warn(`description=${node.deviceConfig.description}`);
						this.debugModeLogger.warn(`manufacturer=${node.deviceConfig.manufacturer}`);
						this.debugModeLogger.warn(`${node.deviceConfig.devices.length} devices`);
						node.deviceConfig.devices.forEach((d, i) => {
							this.debugModeLogger.warn(`Device ${i}:`, d);
						});
						this.debugModeLogger.warn(`${node.deviceConfig.endpoints ? node.deviceConfig.endpoints.size : 0} config endpoints`);
						this.debugModeLogger.warn(`${node.getAllEndpoints().length} endpoints`);
						this.debugModeLogger.warn(`${node.getEndpointCount()} endpoints count`);
						this.debugModeLogger.warn(`definedValueIds:`, node.getDefinedValueIDs());
					});
					node.on('value updated', async (node, args) => {
						const deviceId = this.getValueIDIdRaw(node, args.commandClass, args.endpoint, args.propertyKey, args.property)
						this.debugModeLogger.warn(`node "${node.id}": value [${deviceId}]${this.getDevicesAsString(deviceId)} updated from "${args.prevValue}" to "${args.newValue}"`);
						this.refreshConfig();
						let newValue = args.newValue.toString();
						if (node.supportsCC(CommandClasses['Multilevel Switch'])) {
							this.debugModeLogger.warn("multilevel switch value");
							newValue = args.newValue === 99 ? "ON" : args.newValue === 0 ? "OFF" : newValue;
						} else if (node.supportsCC(CommandClasses['Binary Switch'])) {
							this.debugModeLogger.warn("binary switch value");
							newValue = args.newValue ? "ON" : "OFF";
						}
						this.updateAttribute(deviceId, 'state', newValue, new Date);
					});
					node.on('value notification', async (node, args) => {
						const deviceId = this.getValueIDIdRaw(node, args.commandClass, args.endpoint, args.propertyKey, args.property)
						this.debugModeLogger.warn(`node "${node.id}"${this.getDevicesAsString(deviceId)}: value notification for [${deviceId}]${this.getDevicesAsString(deviceId)}: "${args.value}"`);
						this.updateAttribute(deviceId, 'state', args.value.toString(), new Date);
					});
					node.on('value added', async (node, args) => {
						const deviceId = this.getValueIDIdRaw(node, args.commandClass, args.endpoint, args.propertyKey, args.property)
						this.debugModeLogger.warn(`node "${node.id}": value added for [${deviceId}]${this.getDevicesAsString(deviceId)}: "${args.newValue}"`);
						this.refreshConfig();
						this.updateAttribute(deviceId, 'state', args.newValue?.toString(), new Date);
					});
					node.on('value removed', async (node, args) => {
						const deviceId = this.getValueIDIdRaw(node, args.commandClass, args.endpoint, args.propertyKey, args.property)
						this.debugModeLogger.warn(`node "${node.id}": value removed for [${deviceId}]${this.getDevicesAsString(deviceId)}: "${args.prevValue}"`);
						this.refreshConfig();
						this.updateAttribute(deviceId, 'state', undefined, new Date);
					});
					node.on('notification', async (node, ccId, args) => {
						this.debugModeLogger.warn(`node "${node.id}": notification: "${ccId}" "${args}"`);
						//this.updateAttribute(node.id.toString(), 'state', undefined, new Date);
					});
					node.on('statistics updated', async (node, statistics) => {
						//this.debugModeLogger.warn(`node "${node.id}": statistics updated:`, statistics);
					});
					node.on('interview started', async (node) => {
						this.debugModeLogger.warn(`node "${node.id}": interview started`);
						//this.updateAttribute(node.id.toString(), 'state', undefined, new Date);
					});
					node.on('interview completed', async (node) => {
						this.debugModeLogger.warn(`node "${node.id}": interview completed`);
						this.refreshConfig();
						//this.updateAttribute(node.id.toString(), 'state', undefined, new Date);
					});

					this.debugModeLogger.error(`node "${node.id}": getAllAssociationGroups:`, this.driver.controller.getAllAssociationGroups(node.id));
					this.debugModeLogger.error(`node "${node.id}": getAllAssociations:`, this.driver.controller.getAllAssociations(node.id));
					if (false && node.id === 5) {
						this.debugModeLogger.error("Working on associations");
						this.debugModeLogger.error("isAssociationAllowed:", this.driver.controller.isAssociationAllowed({ nodeId: 5 }, 3, { nodeId: 1 }));
						if (this.driver.controller.isAssociationAllowed({ nodeId: 5 }, 3, { nodeId: 1 })) {
							this.debugModeLogger.error("adding association");
							this.driver.controller.addAssociations({ nodeId: 5 }, 3, [{ nodeId: 1 }]);
						}
					}


				});
				this.debugModeLogger.error("ownNodeId:", this.driver.controller.ownNodeId);

				// set controller handlers
				this.driver.controller.on('inclusion started', (secure: boolean) => {
					this.updateAttribute(this.driver.controller.ownNodeId.toString(), 'state', secure ? 'INCLUSION' : 'INCLUSION_NON_SECURE', new Date);
				});
				this.driver.controller.on('exclusion started', () => {
					this.updateAttribute(this.driver.controller.ownNodeId.toString(), 'state', 'EXCLUSION', new Date);
				});
				this.driver.controller.on('inclusion stopped', () => {
					this.updateAttribute(this.driver.controller.ownNodeId.toString(), 'state', 'NO_INCLUSION_EXCLUSION', new Date);
				});
				this.driver.controller.on('exclusion stopped', () => {
					this.updateAttribute(this.driver.controller.ownNodeId.toString(), 'state', 'NO_INCLUSION_EXCLUSION', new Date);
				});
				this.driver.controller.on('inclusion failed', () => {
					this.logger.error('Inclusion failed');
					this.updateAttribute(this.driver.controller.ownNodeId.toString(), 'state', 'NO_INCLUSION_EXCLUSION', new Date);
				});
				this.driver.controller.on('exclusion failed', () => {
					this.logger.error('Exclusion failed');
					this.updateAttribute(this.driver.controller.ownNodeId.toString(), 'state', 'NO_INCLUSION_EXCLUSION', new Date);
				});
				this.driver.controller.on('exclusion failed', () => {
					this.updateAttribute(this.driver.controller.ownNodeId.toString(), 'state', 'NO_INCLUSION_EXCLUSION', new Date);
				});

				this.debugModeLogger.info(`end of driver ready...`);

				/*
							// When a node is marked as ready, it is safe to control it
							const node = this.driver.controller.nodes.get(2);
							node.once("ready", async () => {
								// e.g. perform a BasicCC::Set with target value 50
								await node.commandClasses.Basic.set(50);
							});
							*/
			});
			this.driver.once('all nodes ready', () => {
				this.refreshNeighbors();
				this.debugModeLogger.info(`all nodes are ready.`);
				this.refreshConfig();
			});
			// Start the driver. To await this method, put this line into an async method
			this.driver.start().catch(e => {
				attempt++;
				if (attempt < maxAttempts) {
					this.logger.warn(`(${attempt}/${maxAttempts}) could not start driver:`, e);
					this.logger.warn(`Retrying in ${sleepTime / 1000}s...`);
					setTimeout(startDriver, sleepTime);
				} else {
					this.logger.error(`could not start driver after ${maxAttempts} attempts:`, e);
					callback && callback(e);
				}
			}).then(() => callback && callback(null));
		}
		startDriver();
	}

	getDevicesAsString(deviceId: string): string {
		let devices = this.getDevices('state', deviceId);
		let list = "";
		if (devices) list = devices.map(d => d.path).join(', ');
		if (list !== "") list = " (" + list + ")";
		return list;
	}

	private refreshNeighborsTimeout: NodeJS.Timeout;
	private refreshNeighborsLock = false;
	private refreshNeighborsMaxSeconds = 60;

	refreshNeighbors() {
		if (this.refreshNeighborsLock) {
			this.logger.warn(`Cannot call refreshNeighors more than once every ${this.refreshNeighborsMaxSeconds} seconds.`)
			return;
		}
		this.refreshNeighborsLock = true;
		this.refreshNeighborsTimeout = setTimeout(() => {
			this.refreshNeighborsLock = false;
		}, this.refreshNeighborsMaxSeconds * 1000);

		let queue: Promise<readonly number[]>[] = [];
		this.driver.controller.nodes.forEach(node => {
			queue.push(this.driver.controller.getNodeNeighbors(node.id));
		});
		Promise.all(queue).then(results => {
			let i = 0;
			this.driver.controller.nodes.forEach(node => {
				this.neighbors[node.id] = results[i];
				i++;
			});
		}).finally(() => {
			clearTimeout(this.refreshNeighborsTimeout);
			this.refreshNeighborsTimeout = null;
			this.refreshNeighborsLock = false;
			this.logger.info(`Neighbors:`, this.neighbors);
		});
	}

	getValueIDId(node: ZWaveNode, valueID: ValueID) {
		return this.getValueIDIdRaw(node, valueID.commandClass, valueID.endpoint, valueID.propertyKey, valueID.property);
	}

	getValueIDIdRaw(node: ZWaveNode, commandClass: number, endpoint: number, propertyKey: string | number, property: string | number) {
		return `${node.id}-${commandClass}-${endpoint}-${propertyKey || property}`
	}

	private refreshConfig() {
		this.config = {
			nodes: []
		};
		this.driver.controller.nodes.forEach((node) => {
			const values = node.getDefinedValueIDs();
			const commandClassNames = values.map(v => v.commandClassName).sort().filter((el, i, a) => i === a.indexOf(el));
			let valuesArray: {
				commandClassName: string;
				values: {
					id: string;
					propertyName: string;
					valueMetadata: ValueMetadata;
					valueId: TranslatedValueID;
					value: unknown;
				}[];
			}[] = [];

			commandClassNames.forEach(cn => {
				const valuesForCommandClass = values.filter(v => v.commandClassName === cn).map(v => {
					const valueMetadata = node.getValueMetadata(v);
					return {
						id: this.getValueIDId(node, v),
						propertyName: valueMetadata.label || v.propertyName,
						valueMetadata: valueMetadata,
						valueId: v,
						value: valueMetadata.readable ? node.getValue(v) : undefined,
					}
				});
				valuesArray.push({
					commandClassName: cn,
					values: valuesForCommandClass
				});
			});

			this.config.nodes.push({
				id: node.id,
				manufacturer: node.deviceConfig?.manufacturer,
				product: node.deviceConfig?.description,
				productCode: node.deviceConfig?.label,
				name: node.name,
				location: node.location,
				status: node.status,
				allValues: valuesArray,
				neighbors: this.neighbors[node.id] || []
			});
		});
		const value = JSON.stringify(this.config);
		//this.debugModeLogger.error("config value=", value);
		this.updateAttribute(this.driver.controller.ownNodeId.toString(), 'zwave_config', value, new Date);
	}

	private sendSwitchCommand(address: string, action: boolean, callback: (err: Error) => void): void {
		this.debugModeLogger.error("address =", address, ", action =", action);
		const tab = address.split('-');
		if (tab.length != 4) this.logger.error(`Malformed id [${address}]. Should be [number-number-number|string-number|string].`);

		const id = tab[0];
		const valueId: ValueID = {
			commandClass: parseInt(tab[1]),
			endpoint: parseInt(tab[2]),
			property: tab[3]
		}

		if (valueId.property === 'currentValue') valueId.property = 'targetValue';

		const node = this.nodes.get(id);
		if (!node) {
			return callback(new Error(`Cannot find ZWave node with id "${address}"`));
		}

		let value: unknown;

		if (valueId.commandClass === CommandClasses['Binary Switch']) {
			value = action;
		} else if (valueId.commandClass === CommandClasses['Multilevel Switch']) {
			value = action ? 99 : 0;
		} else {
			this.logger.warn(`Unsupported commandClass "${valueId.commandClass}". Should be ${CommandClasses['Binary Switch']} or ${CommandClasses['Multilevel Switch']}`);
			value = action;
		}

		node.setValue(valueId, value).then(() => {
			callback(null);
		}, e => {
			this.logger.error(e);
			callback(e);
		});
	}

	private checkAddressIsController(address: string) {
		return address === this.driver.controller.ownNodeId.toString();
	}

	private sendControllerConfig(config: string, callback: (err: Error) => void): void {
		this.debugModeLogger.error("Controller config command:", JSON.parse(config).command);
		const command = JSON.parse(config).command;
		const node = this.nodes.get(command.nodeId);
		const commandName = command.command;
		switch (commandName) {
			case "setValue":
				node.setValue(command.valueID, command.value).then((res) => {
					if (!res) this.logger.warn(`Could not set value of node "${command.nodeId}" to "${command.value}"...`);
					this.refreshConfig();
					this.logger.error("getvalue apres refreshconfig =>", node.getValue(command.valueID));
					callback(null);
				}, e => {
					this.logger.error(e);
					callback(e);
				});
				break;
			case "ping":
				node.ping().catch(e => {
					this.logger.error(e);
					callback(e);
				}).then((res) => {
					if (!res) this.logger.warn(`Could not ping node "${command.nodeId}"...`);
					this.refreshConfig();
					callback(null);
				});
				break;
			case "heal":
				this.driver.controller.healNode(parseInt(command.nodeId)).catch(e => {
					this.logger.error(e);
					callback(e);
				}).then((res) => {
					if (!res) this.logger.warn(`Could not heal node "${command.nodeId}"...`);
					this.refreshConfig();
					this.refreshNeighbors();
					callback(null);
				});
				break;
			case "refreshInfo":
				if (parseInt(command.nodeId) === this.driver.controller.ownNodeId) {
					const controllerNode = this.driver.controller.nodes.get(this.driver.controller.ownNodeId)

					this.logger.error("controller endpoint supported cc instances", controllerNode.getAllEndpoints()[0].getSupportedCCInstances());

					this.logger.error('interviewing supported CCinstances:')
					let a = controllerNode.getSupportedCCInstances();
					a.forEach(cc => {
						this.logger.error('interviewing supported CCinstances', cc.ccName)
						cc.interview().then(res => {
							this.logger.error(`interview of supported CCinstance ${cc.ccName}:`, res);
						});
					});


					let b = controllerNode.commandClasses

					allCCs.forEach(cc => {
						if (controllerNode.supportsCC(cc)) {
							this.logger.warn(`Controller supports CC ${cc}, starting interview...`);
							controllerNode.interviewCC(cc).then(res => {
								this.logger.error(`interview of CC ${cc} done:`, res);
							});
							if (controllerNode.supportsCCAPI(cc)) {
								this.logger.warn(`Controller supports CC API ${cc}, starting interview...`);
								controllerNode.interviewCC(cc).then(res => {
									this.logger.error(`interview of CC API ${cc} done:`, res);
								});
							}
						}
					});

				}

				node.refreshInfo().catch(e => {
					this.logger.error(e);
				});
				this.refreshConfig();
				callback(null);
				break;
			case "interviewCC":
				node.interviewCC(parseInt(command.commandClass)).catch(e => {
					this.logger.error(e);
				});
				this.refreshConfig();
				callback(null);
				break;
			default:
				callback(new Error(`Unsupport command "${commandName}" for node ${command.nodeId}`));
				break;
		}
	}

	private sendControllerCommand(command: string, callback: (err: Error) => void): void {

		switch (command) {
			case 'INCLUSION':
				this.startInclusion(callback);
				break;
			case 'INCLUSION_NON_SECURE':
				this.startInclusionNonSecure(callback);
				break;
			case 'EXCLUSION':
				this.startExclusion(callback);
				break;
			case 'NO_INCLUSION_EXCLUSION':
				this.stopInclusionExclusion(callback);
				break;
			default:
				callback(new Error(`Unsupported command "${command}"!`));
		}
	}


	private startInclusion(callback: (err: Error) => void): void {
		this.driver.controller.beginInclusion().catch(callback).then(() => callback(null));
	}

	private startInclusionNonSecure(callback: (err: Error) => void): void {
		this.driver.controller.beginInclusion(true).catch(callback).then(() => callback(null));
	}

	private startExclusion(callback: (err: Error) => void): void {
		this.driver.controller.beginExclusion().catch(callback).then(() => callback(null));
	}

	private stopInclusionExclusion(callback: (err: Error) => void): void {
		this.driver.controller.stopInclusion().catch(callback).then(() => callback(null));
	}

	createInstance(configLoader: ConfigLoader, path: string, initObject: InitObject): Source {
		return new Openzwave(path, initObject.port, initObject.driverLogLevel);
	}

	getParameters(): Parameters {
		return {
			port: 'REQUIRED',
			driverLogLevel: 'OPTIONAL',
		}
	}

	doSetAttribute(id: string, attribute: string, value: string, callback: (err: Error) => void): void {
		this.debugModeLogger.info(`doSetAttribute: ${id}, ${attribute}, ${value}`);
		const allPairs = [
			['zwave_config/<json>', "for controller"],
			['state/ON', "for switches"],
			['state/OFF', "for switches"],
			['inclusion_mode/INCLUSION', "for controller"],
			['inclusion_mode/INCLUSION_NON_SECURE', "for controller"],
			['inclusion_mode/EXCLUSION', "for controller"],
			['inclusion_mode/NO_INCLUSION_EXCLUSION', "for controller"],
		] as const;

		if (attribute === 'zwave_config') {
			if (this.checkAddressIsController(id)) return this.sendControllerConfig(value, callback);
			else return callback(new Error(`Only controller node ${this.driver.controller.ownNodeId} can issue command "${attribute}" (not node ${id})!`))
		}

		type typeofAllPairs = typeof allPairs[number][0];
		let pair = (attribute + '/' + value) as typeofAllPairs;

		// don't use switch() to benefit from type checking
		if (pair === 'state/OFF') return this.sendSwitchCommand(id, false, callback);
		else if (pair === 'state/ON') return this.sendSwitchCommand(id, true, callback);
		else if (pair === 'zwave_config/<json>') return; // handled separately
		else if (
			pair === 'inclusion_mode/INCLUSION' ||
			pair === 'inclusion_mode/INCLUSION_NON_SECURE' ||
			pair === 'inclusion_mode/EXCLUSION' ||
			pair === 'inclusion_mode/NO_INCLUSION_EXCLUSION') {
			if (this.checkAddressIsController(id)) return this.sendControllerCommand(value, callback);
			else return callback(new Error(`Only controller node ${this.driver.controller.ownNodeId} can issue command "${attribute}/${value}"!`))
		} else {
			let check: never = pair;
		}

		let helper = "";
		let prevStr: string | undefined;
		let hasTitle = false;
		allPairs.concat().sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0).forEach(p => {
			if (p[1] !== prevStr) {
				hasTitle = p[1] !== undefined && p[1].length !== 0;
				if (hasTitle) helper += p[1] + ":\n";
				prevStr = p[1];
			}
			if (hasTitle) helper += '\t';
			helper += p[0] + '\n';
		});

		return callback(new Error(`Unsupported attribute/value: ${attribute}/${value}\nSupported attribute/value pairs:\n${helper}`))
	}

	release(): void {
		if (this.refreshNeighborsTimeout) clearTimeout(this.refreshNeighborsTimeout);
		this.driver.destroy();
		this.watcher.close();
		super.release();
	}

	static registerDeviceTypes(): void {
		Source.registerDeviceType(this, 'device', {
			source: 'REQUIRED',
			id: 'REQUIRED',
			camera: 'OPTIONAL' // added for alarm (should be an array)      
		});

		Source.registerDeviceType(this, 'sensor', {
			source: 'REQUIRED',
			id: 'REQUIRED',
			transform: 'OPTIONAL',
			camera: 'OPTIONAL' // added for alarm (should be an array)
		});
	}
}


